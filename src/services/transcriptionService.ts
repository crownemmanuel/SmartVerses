/**
 * Transcription Service
 *
 * Provides live transcription capabilities using AssemblyAI Universal Streaming (v3) API.
 * Uses raw WebSocket connection and Web Audio API for audio capture.
 *
 * This service handles:
 * - Audio capture from microphone using Web Audio API (ScriptProcessor)
 * - Real-time transcription via AssemblyAI WebSocket (v3)
 * - Interim and final transcript handling via Turn events
 *
 * Migration to v3 (January 2026):
 * - Endpoint changed from /v2/realtime/ws to streaming.assemblyai.com/v3/ws
 * - Message types changed: PartialTranscript/FinalTranscript -> Turn with end_of_turn flag
 * - Field names changed: text -> transcript
 */

import { getAssemblyAITemporaryToken } from "./assemblyaiTokenService";
import { invoke } from "@tauri-apps/api/core";
import {
  TranscriptionEngine,
  TranscriptionCallbacks,
  TranscriptionSegment,
  SmartVersesSettings,
  SMART_VERSES_SETTINGS_KEY,
  DEFAULT_SMART_VERSES_SETTINGS,
} from "../types/smartVerses";
import RecordRTC, { StereoAudioRecorder } from "recordrtc";
import {
  isNativeWhisperModelDownloaded,
  resolveNativeWhisperModelPath,
} from "./nativeWhisperModelService";

type NativeAudioInputDevice = {
  id: string;
  name: string;
  is_default: boolean;
};

const isMacOS = (): boolean =>
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent || "");

// =============================================================================
// STORAGE FUNCTIONS
// =============================================================================

/**
 * Load SmartVerses settings from localStorage
 */
export function loadSmartVersesSettings(): SmartVersesSettings {
  try {
    const stored = localStorage.getItem(SMART_VERSES_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SMART_VERSES_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (err) {
    console.error("Failed to load SmartVerses settings:", err);
  }
  return { ...DEFAULT_SMART_VERSES_SETTINGS };
}

/**
 * Save SmartVerses settings to localStorage
 */
export function saveSmartVersesSettings(settings: SmartVersesSettings): void {
  try {
    localStorage.setItem(SMART_VERSES_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save SmartVerses settings:", err);
  }
}

// =============================================================================
// ABSTRACT TRANSCRIPTION SERVICE
// =============================================================================

/**
 * Abstract transcription service interface
 */
export interface ITranscriptionService {
  engine: TranscriptionEngine;
  isRecording: boolean;
  startTranscription(): Promise<void>;
  stopTranscription(): Promise<void>;
  getMicrophoneDevices(): Promise<MediaDeviceInfo[]>;
  setMicrophone(deviceId: string): void;
  setAudioCaptureMode?(mode: "webrtc" | "native"): void;
  setNativeMicrophoneDeviceId?(deviceId: string | null): void;
  destroy?(): void; // Optional cleanup method to terminate workers and release resources
}

// =============================================================================
// ASSEMBLYAI TRANSCRIPTION SERVICE (Universal Streaming v3)
// =============================================================================

/**
 * AssemblyAI Universal Streaming (v3) Transcription Service
 *
 * Uses raw WebSocket connection to AssemblyAI's v3 streaming endpoint.
 * Audio is captured from the microphone at 16kHz sample rate and sent to AssemblyAI.
 *
 * v3 API changes from v2:
 * - Endpoint: wss://streaming.assemblyai.com/v3/ws (was /v2/realtime/ws)
 * - Messages: Turn events with end_of_turn flag (was PartialTranscript/FinalTranscript)
 * - Fields: transcript (was text)
 */
export class AssemblyAITranscriptionService implements ITranscriptionService {
  readonly engine: TranscriptionEngine = "assemblyai";

  private apiKey: string = "";
  private websocket: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private selectedMicId: string = "";
  private audioCaptureMode: "webrtc" | "native" = "webrtc";
  private selectedNativeDeviceId: string | null = null;
  private nativeUnlisten: null | (() => void) = null;
  private callbacks: TranscriptionCallbacks = {};
  private _isRecording: boolean = false;
  private segmentCounter: number = 0;
  private currentTurnOrder: number = 0;
  private finalizedTurnOrder: number | null = null;
  private readonly formatTurns: boolean = true;

  private emitAudioLevel(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.callbacks.onAudioLevel?.(clamped);
  }

  private computeRmsFromFloat32(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sumSquares += s * s;
    }
    return Math.sqrt(sumSquares / samples.length);
  }

  private computeRmsFromInt16(samples: Int16Array): number {
    if (samples.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] / 32768;
      sumSquares += s * s;
    }
    return Math.sqrt(sumSquares / samples.length);
  }

  // v3 WebSocket endpoint
  private static readonly V3_STREAMING_ENDPOINT = "wss://streaming.assemblyai.com/v3/ws";

  constructor(apiKey: string, callbacks: TranscriptionCallbacks = {}) {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Update the API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Update callbacks
   */
  setCallbacks(callbacks: TranscriptionCallbacks): void {
    this.callbacks = callbacks;
  }

  setAudioCaptureMode(mode: "webrtc" | "native"): void {
    this.audioCaptureMode = mode;
  }

  setNativeMicrophoneDeviceId(deviceId: string | null): void {
    this.selectedNativeDeviceId = deviceId;
  }

  async getNativeMicrophoneDevices(): Promise<NativeAudioInputDevice[]> {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
    } catch {
      return [];
    }
  }

  /**
   * Get available microphone devices
   */
  async getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
    try {
      // Request permission first to get full device list with labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Immediately stop the stream to release the microphone
      stream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput"
      );

      console.log(
        `Found ${audioInputs.length} audio input devices:`,
        audioInputs.map((d) => d.label || d.deviceId)
      );
      return audioInputs;
    } catch (error) {
      console.error("Error getting microphone devices:", error);
      return [];
    }
  }

  /**
   * Set the selected microphone device
   */
  setMicrophone(deviceId: string): void {
    this.selectedMicId = deviceId;
  }

  /**
   * Get a temporary token from AssemblyAI (v3)
   */
  private async getTemporaryToken(): Promise<string> {
    try {
      console.log("🔑 Requesting temporary token from AssemblyAI (v3)...");
      // v3 tokens have max 600 seconds (10 minutes)
      const token = await getAssemblyAITemporaryToken(this.apiKey, 600);
      console.log("✅ Token received successfully");
      return token;
    } catch (error) {
      console.error("Error getting AssemblyAI token:", error);
      throw error;
    }
  }

  /**
   * Clean up existing connections and recorder
   */
  private async cleanup(): Promise<void> {
    // Clean up all audio resources (native and WebRTC)
    await this.cleanupAudioResources();

    // Clean up existing WebSocket
    if (this.websocket) {
      console.log("⚠️ Existing WebSocket found, cleaning up...");
      try {
        this.websocket.close();
      } catch (error) {
        console.error("Error closing existing WebSocket:", error);
      }
      this.websocket = null;
    }
  }

  private async stopNativeAudioCapture(): Promise<void> {
    if (!this.nativeUnlisten) return;

    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("stop_native_audio_stream");
    } catch {
      // ignore
    }

    try {
      this.nativeUnlisten();
    } catch {
      // ignore
    }
    this.nativeUnlisten = null;
  }

  /**
   * Clean up all audio resources (both native and WebRTC)
   * This should be called whenever the connection closes unexpectedly
   * to prevent resource leaks (microphone stays active, AudioContext keeps running, etc.)
   */
  private async cleanupAudioResources(): Promise<void> {
    // Stop native audio capture (if used)
    await this.stopNativeAudioCapture();

    // Stop Web Audio processing (WebRTC mode)
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    // Stop all media stream tracks (releases microphone)
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
      this.mediaStream = null;
    }
  }

  /**
   * Send audio data to v3 WebSocket
   */
  private sendAudio(audioData: ArrayBuffer | Int16Array | Uint8Array): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

    const buffer =
      audioData instanceof ArrayBuffer
        ? audioData
        : audioData.buffer.slice(
            audioData.byteOffset,
            audioData.byteOffset + audioData.byteLength
          );

    // v3 expects raw PCM bytes as binary WebSocket messages
    this.websocket.send(buffer);
  }

  /**
   * Handle v3 WebSocket messages
   */
  private handleV3Message(data: {
    type: string;
    id?: string;
    expires_at?: number;
    transcript?: string;
    end_of_turn?: boolean;
    turn_is_formatted?: boolean;
    turn_order?: number;
    utterance?: string;
    audio_duration_seconds?: number;
    session_duration_seconds?: number;
    error?: string;
  }): void {
    switch (data.type) {
      case "Begin":
        console.log(`✅ AssemblyAI v3 session started: ${data.id}`);
        break;

      case "Turn": {
        const transcript = data.transcript || "";
        const endOfTurn = data.end_of_turn === true;
        const formatted = data.turn_is_formatted === true;
        const turnOrder = data.turn_order || 0;

        // Track current turn order
        if (turnOrder !== this.currentTurnOrder) {
          this.currentTurnOrder = turnOrder;
          this.finalizedTurnOrder = null;
        }

        const shouldFinalize =
          transcript &&
          (formatted || (!this.formatTurns && endOfTurn)) &&
          this.finalizedTurnOrder !== turnOrder;

        if (shouldFinalize) {
          this.finalizedTurnOrder = turnOrder;
          console.log("📝 Final transcript:", transcript);

          const segment: TranscriptionSegment = {
            id: `segment-${++this.segmentCounter}`,
            text: transcript,
            timestamp: Date.now(),
            isFinal: true,
          };

          this.callbacks.onFinalTranscript?.(transcript, segment);
        } else if (transcript) {
          // Interim transcript
          this.callbacks.onInterimTranscript?.(transcript);
        }
        break;
      }

      case "Termination":
        console.log(
          `🔌 Session terminated. Audio: ${data.audio_duration_seconds}s, Session: ${data.session_duration_seconds}s`
        );
        break;

      case "Error":
        console.error("❌ AssemblyAI error:", data.error);
        this.callbacks.onError?.(new Error(data.error || "AssemblyAI error"));
        // Stop transcription on server errors (authentication failure, rate limit, etc.)
        // to clean up resources and release the microphone
        this.stopTranscription().catch((err) => {
          console.error("Error stopping transcription after server error:", err);
        });
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  /**
   * Start live transcription using v3 Universal Streaming
   * 
   * Returns a Promise that resolves when the WebSocket is connected and audio capture has started.
   * Rejects if connection fails or audio capture cannot be started.
   */
  async startTranscription(): Promise<void> {
    if (this._isRecording) {
      console.warn("Transcription already in progress");
      return;
    }

    if (!this.apiKey) {
      throw new Error("AssemblyAI API key not configured");
    }

    this.callbacks.onStatusChange?.("connecting");

    // Create a Promise that resolves when connection is established and audio capture starts
    return new Promise<void>(async (resolve, reject) => {
      try {
        // Clean up any existing connections
        await this.cleanup();

        console.log("🎬 Connecting to AssemblyAI Universal Streaming (v3)...");

        // Get temporary token
        const token = await this.getTemporaryToken();

        // Build v3 WebSocket URL with query parameters
        const wsUrl = new URL(AssemblyAITranscriptionService.V3_STREAMING_ENDPOINT);
        wsUrl.searchParams.set("sample_rate", "16000");
        wsUrl.searchParams.set("token", token);
        // format_turns=true gives us formatted text (punctuation, casing) on end_of_turn
        wsUrl.searchParams.set("format_turns", this.formatTurns ? "true" : "false");
        wsUrl.searchParams.set("encoding", "pcm_s16le");

        // Create WebSocket connection
        this.websocket = new WebSocket(wsUrl.toString());

        // Track if we've resolved/rejected to prevent multiple calls
        let isResolved = false;

        // Handle WebSocket events
        this.websocket.onopen = async () => {
          console.log("✅ WebSocket connected to v3 endpoint");

          // Start audio capture after connection is established
          try {
            await this.startAudioCapture();
            this._isRecording = true;
            this.callbacks.onStatusChange?.("recording");
            console.log("✅ AssemblyAI v3 transcription started successfully");
            
            // Resolve the Promise now that everything is ready
            if (!isResolved) {
              isResolved = true;
              resolve();
            }
          } catch (error) {
            console.error("Failed to start audio capture:", error);
            this._isRecording = false;
            this.callbacks.onStatusChange?.("error");
            this.callbacks.onError?.(error as Error);
            await this.cleanup();
            
            // Reject the Promise if audio capture fails
            if (!isResolved) {
              isResolved = true;
              reject(error);
            }
          }
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleV3Message(data);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        this.websocket.onerror = (event) => {
          console.error("❌ WebSocket error:", event);
          const error = new Error("WebSocket connection error");
          this.callbacks.onError?.(error);
          
          // Reject the Promise if connection fails
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        };

        this.websocket.onclose = (event) => {
          console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`);
          this._isRecording = false;
          
          // Clean up all audio resources to prevent leaks when connection drops unexpectedly
          // This ensures microphone is released, AudioContext is closed, and ScriptProcessor stops
          this.cleanupAudioResources().catch((err) => {
            console.error("Error cleaning up audio resources on WebSocket close:", err);
          });
          
          this.callbacks.onConnectionClose?.(event.code, event.reason);
          this.callbacks.onStatusChange?.("idle");
          
          // Reject if closed before connection was established and audio capture started
          // (i.e., before the Promise was resolved)
          if (!isResolved) {
            isResolved = true;
            reject(new Error(`WebSocket closed before connection established: ${event.code} ${event.reason || ""}`));
          }
        };
      } catch (error) {
        console.error("Failed to start transcription:", error);
        this._isRecording = false;
        this.callbacks.onStatusChange?.("error");
        this.callbacks.onError?.(error as Error);
        await this.cleanup();
        reject(error);
      }
    });
  }

  /**
   * Start audio capture (called after WebSocket is connected)
   */
  private async startAudioCapture(): Promise<void> {
    if (this.audioCaptureMode === "native") {
      console.log("🎛️ Using native audio capture (cpal) via Tauri backend...");

      // Subscribe to native PCM chunks
      const events = await import("@tauri-apps/api/event");
      const core = await import("@tauri-apps/api/core");

      const base64ToUint8Array = (b64: string): Uint8Array => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      };

      const unlisten = await events.listen<{ data_b64: string }>(
        "native_audio_chunk",
        (evt) => {
          if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;
          try {
            const bytes = base64ToUint8Array(evt.payload.data_b64);
            if (bytes.byteLength >= 2) {
              const sampleCount = Math.floor(bytes.byteLength / 2);
              const int16 = new Int16Array(
                bytes.buffer,
                bytes.byteOffset,
                sampleCount
              );
              this.emitAudioLevel(this.computeRmsFromInt16(int16));
            }
            this.sendAudio(bytes);
          } catch {
            // keep going; transient decode errors shouldn't kill transcription
          }
        }
      );

      this.nativeUnlisten = unlisten;

      await core.invoke("start_native_audio_stream", {
        deviceId: this.selectedNativeDeviceId ?? undefined,
      });

      console.log("🎙️ Native recording started");
    } else {
      // Get microphone access and start recording (WebRTC/WebView)
      const constraints: MediaStreamConstraints = {
        audio: this.selectedMicId
          ? {
              deviceId: { exact: this.selectedMicId },
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            }
          : {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
      };

      console.log("🎤 Requesting microphone access...");
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Microphone access granted");

      // Use Web Audio API to get raw PCM frames
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        this.emitAudioLevel(this.computeRmsFromFloat32(inputData));
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        this.sendAudio(pcm16);
      };

      this.mediaStreamSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log("🎙️ Recording started (PCM16 streaming)");
    }
  }

  /**
   * Stop transcription
   */
  async stopTranscription(): Promise<void> {
    console.log("🛑 Stopping transcription...");
    this._isRecording = false;

    // Clean up all audio resources (native and WebRTC)
    await this.cleanupAudioResources();

    // Close WebSocket connection
    if (this.websocket) {
      console.log("🔌 Closing WebSocket...");
      try {
        // Send terminate message before closing (optional but cleaner)
        if (this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ type: "Terminate" }));
        }
        this.websocket.close();
        console.log("✅ WebSocket closed");
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
      this.websocket = null;
    }

    // Reset state
    this.currentTurnOrder = 0;
    this.finalizedTurnOrder = null;
    this.emitAudioLevel(0);
    this.callbacks.onStatusChange?.("idle");
    console.log("✅ Transcription stopped successfully");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopTranscription();
  }
}

// =============================================================================
// GROQ TRANSCRIPTION SERVICE
// =============================================================================

/**
 * Groq Whisper Transcription Service
 *
 * Uses Groq's high-speed Whisper API for near real-time transcription.
 * Since Groq doesn't support WebSocket streaming, we record audio in small chunks (e.g. 3s),
 * send them to the REST API, and stream the results.
 */
export class GroqTranscriptionService implements ITranscriptionService {
  readonly engine: TranscriptionEngine = "groq";

  private apiKey: string = "";
  private model: string = "whisper-large-v3";
  private recorder: RecordRTC | null = null;
  private mediaStream: MediaStream | null = null;
  private selectedMicId: string = "";
  private audioCaptureMode: "webrtc" | "native" = "webrtc";
  private selectedNativeDeviceId: string | null = null;
  private nativeUnlisten: null | (() => void) = null;
  private callbacks: TranscriptionCallbacks = {};
  private _isRecording: boolean = false;
  private segmentCounter: number = 0;
  private chunkInterval: NodeJS.Timeout | null = null;
  private nativeBuffer: Float32Array = new Float32Array(0);
  private readonly SAMPLE_RATE = 16000;
  private readonly CHUNK_DURATION_MS = 3000; // 3 seconds chunks
  
  // Sequence tracking for ensuring ordered transcript delivery
  private chunkSequence: number = 0; // Increments when chunks are captured
  private nextExpectedSequence: number = 0; // Next sequence number we expect to receive
  private pendingResponses: Map<number, { text: string; timestamp: number }> = new Map(); // Buffer for out-of-order responses

  constructor(
    apiKey: string,
    model: string,
    callbacks: TranscriptionCallbacks = {}
  ) {
    this.apiKey = apiKey;
    this.model = model || "whisper-large-v3";
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  setModel(model: string): void {
    this.model = model;
  }

  setCallbacks(callbacks: TranscriptionCallbacks): void {
    this.callbacks = callbacks;
  }

  setAudioCaptureMode(mode: "webrtc" | "native"): void {
    this.audioCaptureMode = mode;
  }

  setNativeMicrophoneDeviceId(deviceId: string | null): void {
    this.selectedNativeDeviceId = deviceId;
  }

  async getNativeMicrophoneDevices(): Promise<NativeAudioInputDevice[]> {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
    } catch {
      return [];
    }
  }

  async getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error getting microphone devices:", error);
      return [];
    }
  }

  setMicrophone(deviceId: string): void {
    this.selectedMicId = deviceId;
  }

  private async cleanup(): Promise<void> {
    await this.stopNativeAudioCapture();

    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.recorder) {
      this.recorder.destroy();
      this.recorder = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.nativeBuffer = new Float32Array(0);
  }

  private async stopNativeAudioCapture(): Promise<void> {
    if (!this.nativeUnlisten) return;
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("stop_native_audio_stream");
    } catch {}
    try {
      this.nativeUnlisten();
    } catch {}
    this.nativeUnlisten = null;
  }

  async startTranscription(): Promise<void> {
    if (this._isRecording) return;
    if (!this.apiKey) throw new Error("Groq API key not configured");

    this.callbacks.onStatusChange?.("connecting");

    try {
      await this.cleanup();

      // Reset sequence tracking for a new transcription session
      this.chunkSequence = 0;
      this.nextExpectedSequence = 0;
      this.pendingResponses.clear();

      if (this.audioCaptureMode === "native") {
        await this.startNativeCapture();
      } else {
        await this.startWebRTCCapture();
      }

      this._isRecording = true;
      this.callbacks.onStatusChange?.("recording");
      console.log("✅ Groq transcription started");

      // Start processing loop
      this.chunkInterval = setInterval(() => {
        this.processAudioChunk();
      }, this.CHUNK_DURATION_MS);
    } catch (error) {
      console.error("Failed to start transcription:", error);
      this._isRecording = false;
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(error as Error);
      await this.cleanup();
      throw error;
    }
  }

  private async startWebRTCCapture() {
    const constraints: MediaStreamConstraints = {
      audio: this.selectedMicId
        ? { deviceId: { exact: this.selectedMicId } }
        : true,
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // We use StereoAudioRecorder to get WAV blobs directly if possible, 
    // but RecordRTC's internal loop is better managed manually for chunking.
    // Actually, for Groq we need a file (Blob). 
    // We will restart the recorder every chunk interval to get a clean blob.
    this.recorder = new RecordRTC(this.mediaStream, {
      type: "audio",
      mimeType: "audio/wav",
      recorderType: StereoAudioRecorder,
      numberOfAudioChannels: 1,
      desiredSampRate: 16000,
    });

    this.recorder.startRecording();
  }

  private async startNativeCapture() {
    console.log("🎛️ Using native audio capture for Groq...");
    const events = await import("@tauri-apps/api/event");
    const core = await import("@tauri-apps/api/core");

    const base64ToFloat32Array = (b64: string): Float32Array => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // Convert PCM 16-bit (bytes) to Float32 (-1.0 to 1.0)
      const int16View = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        float32[i] = int16View[i] / 32768.0;
      }
      return float32;
    };

    const unlisten = await events.listen<{ data_b64: string }>(
      "native_audio_chunk",
      (evt) => {
        try {
          const newSamples = base64ToFloat32Array(evt.payload.data_b64);
          // Append to buffer
          const tmp = new Float32Array(this.nativeBuffer.length + newSamples.length);
          tmp.set(this.nativeBuffer);
          tmp.set(newSamples, this.nativeBuffer.length);
          this.nativeBuffer = tmp;
        } catch (e) {
          console.error("Error processing native audio chunk:", e);
        }
      }
    );

    this.nativeUnlisten = unlisten;
    await core.invoke("start_native_audio_stream", {
      deviceId: this.selectedNativeDeviceId ?? undefined,
    });
  }

  private async processAudioChunk() {
    if (!this._isRecording) return;

    let audioBlob: Blob | null = null;

    if (this.audioCaptureMode === "native") {
      // Process native buffer
      if (this.nativeBuffer.length === 0) return;
      
      // Create WAV from buffer
      audioBlob = createWavFile(this.nativeBuffer, this.SAMPLE_RATE);
      
      // Clear buffer (keep overlap if needed? for now clear all)
      this.nativeBuffer = new Float32Array(0);
    } else {
      // Process WebRTC recorder
      if (!this.recorder) return;

      // Stop and get blob
      await new Promise<void>((resolve) => {
        this.recorder?.stopRecording(() => {
          audioBlob = this.recorder?.getBlob() || null;
          resolve();
        });
      });

      // Restart recording immediately
      if (this._isRecording && this.mediaStream?.active) {
        this.recorder.destroy();
        this.recorder = new RecordRTC(this.mediaStream, {
          type: "audio",
          mimeType: "audio/wav",
          recorderType: StereoAudioRecorder,
          numberOfAudioChannels: 1,
          desiredSampRate: 16000,
        });
        this.recorder.startRecording();
      }
    }

    if (audioBlob && audioBlob.size > 0) {
      // Assign sequence number and capture timestamp when chunk is captured
      // This ensures chronological ordering regardless of network latency
      const sequence = this.chunkSequence++;
      const captureTimestamp = Date.now();
      this.sendToGroq(audioBlob, sequence, captureTimestamp);
    }
  }

  private async sendToGroq(blob: Blob, sequence: number, captureTimestamp: number) {
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.wav");
      formData.append("model", this.model);
      // Optional: prompt to provide context from previous segments?
      // formData.append("prompt", "previous transcript context..."); 

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Groq API error:", errText);
        // Skip this sequence and continue processing
        this.nextExpectedSequence = Math.max(this.nextExpectedSequence, sequence + 1);
        this.processBufferedResponses();
        return;
      }

      const data = await response.json();
      const text = data.text?.trim();

      if (text) {
        console.log(`📝 Groq Transcript [seq ${sequence}]:`, text);
        // Store response with its sequence number
        this.pendingResponses.set(sequence, { text, timestamp: captureTimestamp });
        // Process responses in order
        this.processBufferedResponses();
      } else {
        // Empty response, skip this sequence
        this.nextExpectedSequence = Math.max(this.nextExpectedSequence, sequence + 1);
        this.processBufferedResponses();
      }
    } catch (error) {
      console.error("Error sending audio to Groq:", error);
      // Skip this sequence and continue processing
      this.nextExpectedSequence = Math.max(this.nextExpectedSequence, sequence + 1);
      this.processBufferedResponses();
    }
  }

  /**
   * Process buffered responses in order, delivering transcripts sequentially
   * even if API responses arrive out of order due to network latency.
   */
  private processBufferedResponses() {
    // Process responses in sequence order
    while (this.pendingResponses.has(this.nextExpectedSequence)) {
      const response = this.pendingResponses.get(this.nextExpectedSequence)!;
      this.pendingResponses.delete(this.nextExpectedSequence);

      const segment: TranscriptionSegment = {
        id: `segment-${++this.segmentCounter}`,
        text: response.text,
        timestamp: response.timestamp, // Use capture timestamp, not response timestamp
        isFinal: true,
      };
      
      console.log(`✅ Delivering transcript [seq ${this.nextExpectedSequence}]:`, response.text);
      this.callbacks.onFinalTranscript?.(response.text, segment);
      
      this.nextExpectedSequence++;
    }
  }

  async stopTranscription(): Promise<void> {
    console.log("🛑 Stopping Groq transcription...");
    this._isRecording = false;
    
    // Process any remaining buffered responses before stopping
    this.processBufferedResponses();
    
    // Clear pending responses
    this.pendingResponses.clear();
    
    await this.cleanup();
    this.callbacks.onStatusChange?.("idle");
  }
}

/**
 * Helper to create a WAV file from Float32Array samples
 */
function createWavFile(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 for Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// =============================================================================
// MAC NATIVE WHISPER TRANSCRIPTION SERVICE (Metal)
// =============================================================================

type NativeAsrSegment = {
  start_ms: number;
  end_ms: number;
  text: string;
};

type NativeAsrResult = {
  full_text: string;
  new_segments: NativeAsrSegment[];
};

/**
 * Mac Native Whisper Transcription Service
 *
 * Uses whisper-rs via Tauri backend with Metal acceleration.
 */
export class MacNativeWhisperTranscriptionService implements ITranscriptionService {
  readonly engine: TranscriptionEngine = "offline-whisper-native";

  private callbacks: TranscriptionCallbacks = {};
  private _isRecording: boolean = false;
  private audioCaptureMode: "webrtc" | "native" = "webrtc";
  private selectedMicId: string = "";
  private selectedNativeDeviceId: string | null = null;
  private nativeUnlisten: null | (() => void) = null;

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPolling: boolean = false;
  private lastInterimText: string = "";
  private segmentCounter: number = 0;
  private lastFinalText: string = "";
  private lastFinalEndMs: number = 0;

  private modelFileName: string;
  private language: string;

  constructor(
    modelFileName: string,
    language: string = "en",
    callbacks: TranscriptionCallbacks = {}
  ) {
    this.modelFileName = modelFileName;
    this.language = language;
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  setCallbacks(callbacks: TranscriptionCallbacks): void {
    this.callbacks = callbacks;
  }

  setModelFileName(fileName: string): void {
    this.modelFileName = fileName;
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setAudioCaptureMode(mode: "webrtc" | "native"): void {
    this.audioCaptureMode = mode;
  }

  setNativeMicrophoneDeviceId(deviceId: string | null): void {
    this.selectedNativeDeviceId = deviceId;
  }

  async getNativeMicrophoneDevices(): Promise<NativeAudioInputDevice[]> {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
    } catch {
      return [];
    }
  }

  async getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error getting microphone devices:", error);
      return [];
    }
  }

  setMicrophone(deviceId: string): void {
    this.selectedMicId = deviceId;
  }

  private emitAudioLevel(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.callbacks.onAudioLevel?.(clamped);
  }

  private computeRmsFromFloat32(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sumSquares += s * s;
    }
    return Math.sqrt(sumSquares / samples.length);
  }

  private computeRmsFromInt16(samples: Int16Array): number {
    if (samples.length === 0) return 0;
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] / 32768;
      sumSquares += s * s;
    }
    return Math.sqrt(sumSquares / samples.length);
  }

  private normalizeOverlapText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractNewNativeText(newText: string): string {
    if (!this.lastFinalText) {
      return newText;
    }

    const lastTrimmed = this.lastFinalText.trim();
    const newTrimmed = newText.trim();

    if (!lastTrimmed || !newTrimmed) {
      return newText;
    }

    const lastNormalized = this.normalizeOverlapText(lastTrimmed);
    const newNormalized = this.normalizeOverlapText(newTrimmed);

    if (!lastNormalized || !newNormalized) {
      return newText;
    }

    const lastWords = lastNormalized.split(/\s+/);
    const newWords = newNormalized.split(/\s+/);

    let maxOverlapWords = 0;
    const minOverlapWords = 2;

    for (let i = Math.min(lastWords.length, newWords.length); i >= minOverlapWords; i--) {
      const lastSuffix = lastWords.slice(-i).join(" ");
      const newPrefix = newWords.slice(0, i).join(" ");
      if (lastSuffix === newPrefix) {
        maxOverlapWords = i;
        break;
      }
    }

    if (maxOverlapWords > 0) {
      const originalWords = newTrimmed.split(/\s+/);
      const remainingWords = originalWords.slice(maxOverlapWords);
      return remainingWords.join(" ").trim();
    }

    let maxOverlapLength = 0;
    const minOverlapLength = 20;

    for (let i = Math.min(lastNormalized.length, newNormalized.length); i >= minOverlapLength; i--) {
      const lastSuffix = lastNormalized.slice(-i);
      const newPrefix = newNormalized.slice(0, i);
      if (lastSuffix === newPrefix) {
        maxOverlapLength = i;
        break;
      }
    }

    if (maxOverlapLength > 0) {
      const words = newTrimmed.split(/\s+/);
      let charCount = 0;
      let wordIndex = 0;

      for (let i = 0; i < words.length; i++) {
        const normalizedWord = this.normalizeOverlapText(words[i]);
        const wordLength = normalizedWord.length + 1; // +1 for space
        if (charCount + wordLength > maxOverlapLength) {
          wordIndex = i;
          break;
        }
        charCount += wordLength;
      }

      const remainingWords = words.slice(wordIndex);
      return remainingWords.join(" ").trim();
    }

    return newText;
  }

  private async cleanupAudioResources(): Promise<void> {
    await this.stopNativeAudioCapture();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
      this.mediaStream = null;
    }
  }

  private async stopNativeAudioCapture(): Promise<void> {
    if (!this.nativeUnlisten) return;
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("stop_native_audio_stream");
    } catch {
      // ignore
    }
    try {
      this.nativeUnlisten();
    } catch {
      // ignore
    }
    this.nativeUnlisten = null;
  }

  private async startAudioCapture(): Promise<void> {
    if (this.audioCaptureMode === "native") {
      const events = await import("@tauri-apps/api/event");
      const core = await import("@tauri-apps/api/core");

      const base64ToInt16Array = (b64: string): Int16Array => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Int16Array(bytes.buffer);
      };

      this.nativeUnlisten = await events.listen<{ data_b64: string }>(
        "native_audio_chunk",
        (evt) => {
          try {
            const int16 = base64ToInt16Array(evt.payload.data_b64);
            this.emitAudioLevel(this.computeRmsFromInt16(int16));
            void this.pushAudio(int16).catch(() => {
              // ignore
            });
          } catch {
            // ignore
          }
        }
      );

      await core.invoke("start_native_audio_stream", {
        deviceId: this.selectedNativeDeviceId ?? undefined,
      });
    } else {
      const constraints: MediaStreamConstraints = {
        audio: this.selectedMicId
          ? {
              deviceId: { exact: this.selectedMicId },
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            }
          : {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
            },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        this.emitAudioLevel(this.computeRmsFromFloat32(inputData));
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        void this.pushAudio(pcm16).catch(() => {
          // ignore
        });
      };

      this.mediaStreamSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    }
  }

  private async pushAudio(pcm16: Int16Array): Promise<void> {
    const payload = Array.from(pcm16);
    await invoke("asr_push_audio", { pcmChunk: payload });
  }

  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      this.pollOnce().catch(() => {
        // ignore
      });
    }, 250);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const result = await invoke<NativeAsrResult>("asr_poll");
      if (!result) return;

      if (result.full_text && result.full_text !== this.lastInterimText) {
        this.lastInterimText = result.full_text;
        this.callbacks.onInterimTranscript?.(result.full_text);
      }

      if (Array.isArray(result.new_segments) && result.new_segments.length > 0) {
        for (const segment of result.new_segments) {
          const text = segment.text?.trim();
          if (!text) continue;
          const startMs = typeof segment.start_ms === "number" ? segment.start_ms : 0;
          const endMs = typeof segment.end_ms === "number" ? segment.end_ms : 0;

          let emitText = text;
          if (this.lastFinalText && startMs < this.lastFinalEndMs) {
            emitText = this.extractNewNativeText(text);
          }

          if (!emitText.trim()) {
            this.lastFinalText = text;
            this.lastFinalEndMs = Math.max(this.lastFinalEndMs, endMs);
            continue;
          }

          const transcriptionSegment: TranscriptionSegment = {
            id: `segment-${++this.segmentCounter}`,
            text: emitText,
            timestamp: Date.now(),
            isFinal: true,
          };
          this.callbacks.onFinalTranscript?.(emitText, transcriptionSegment);
          this.lastFinalText = text;
          this.lastFinalEndMs = Math.max(this.lastFinalEndMs, endMs);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async startTranscription(): Promise<void> {
    if (this._isRecording) return;
    if (!isMacOS()) {
      throw new Error("Mac native Whisper is only available on macOS");
    }

    this.callbacks.onStatusChange?.("connecting");
    this.lastInterimText = "";
    this.lastFinalText = "";
    this.lastFinalEndMs = 0;

    const modelFileName = this.modelFileName || "ggml-small.en-q5_1.bin";
    const isDownloaded = await isNativeWhisperModelDownloaded(modelFileName);
    if (!isDownloaded) {
      throw new Error("Selected native Whisper model is not downloaded");
    }

    const modelPath = await resolveNativeWhisperModelPath(modelFileName);

    try {
      await invoke("asr_init", {
        modelPath,
        language: this.language || "en",
        windowMs: 6000,
        stepMs: 500,
      });

      await this.startAudioCapture();

      this._isRecording = true;
      this.startPolling();
      this.callbacks.onStatusChange?.("recording");
    } catch (error) {
      this._isRecording = false;
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(error as Error);
      await this.cleanupAudioResources();
      throw error;
    }
  }

  async stopTranscription(): Promise<void> {
    this._isRecording = false;
    this.stopPolling();
    await this.cleanupAudioResources();
    try {
      await invoke("asr_reset");
    } catch {
      // ignore
    }
    this.emitAudioLevel(0);
    this.callbacks.onStatusChange?.("idle");
  }

  destroy(): void {
    this.stopTranscription();
  }
}

// =============================================================================
// OFFLINE WHISPER TRANSCRIPTION SERVICE
// =============================================================================

const WHISPER_SAMPLING_RATE = 16000;
const MAX_AUDIO_LENGTH = 30; // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH;

/**
 * Offline Whisper Transcription Service
 *
 * Uses @huggingface/transformers with a Web Worker for offline transcription.
 * Processes audio in chunks and sends to the worker for inference.
 */
export class OfflineWhisperTranscriptionService implements ITranscriptionService {
  readonly engine: TranscriptionEngine = "offline-whisper";

  private worker: Worker | null = null;
  private modelId: string;
  private language: string;
  private callbacks: TranscriptionCallbacks = {};
  private _isRecording: boolean = false;
  private isModelReady: boolean = false;
  private segmentCounter: number = 0;

  // Audio capture
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private selectedMicId: string = "";
  private audioCaptureMode: "webrtc" | "native" = "webrtc";
  private selectedNativeDeviceId: string | null = null;
  private nativeUnlisten: null | (() => void) = null;
  private nativeBuffer: Float32Array = new Float32Array(0);
  private rollingAudioBuffer: Float32Array = new Float32Array(0);
  private hasPendingAudio: boolean = false;
  private isProcessing: boolean = false;
  private decodeQueue: Promise<void> = Promise.resolve();
  private recorderRequestTimeout: ReturnType<typeof setTimeout> | null = null;
  private accumulatedInterimText: string = ""; // Track accumulated interim text for current session
  private lastProcessedBufferLength: number = 0; // Track how much audio was in the buffer when we last processed it
  private lastTranscriptionText: string = ""; // Track last transcription to detect and remove overlap
  private readonly CONTEXT_OVERLAP_SAMPLES = WHISPER_SAMPLING_RATE * 3; // Keep last 3 seconds (in samples) for context
  
  // Model loading progress tracking
  private loadingStage: string = "";
  private loadingStageProgress: number = 0; // Progress within current stage (0-100)
  private currentStageIndex: number = -1; // Which stage we're in (0-3)
  private readonly LOADING_STAGES = [
    "Loading tokenizer...",
    "Loading processor...",
    "Loading model...",
    "Warming up model...",
  ];

  constructor(
    modelId: string,
    language: string = "en",
    callbacks: TranscriptionCallbacks = {}
  ) {
    this.modelId = modelId || "onnx-community/whisper-base";
    this.language = language;
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  setModelId(modelId: string): void {
    this.modelId = modelId;
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setCallbacks(callbacks: TranscriptionCallbacks): void {
    this.callbacks = callbacks;
  }

  private emitLoadingProgress(): void {
    if (!this.loadingStage || this.currentStageIndex === -1) {
      return;
    }

    // Calculate overall progress:
    // Each stage is worth 25% (0-3 stages = 0%, 25%, 50%, 75%)
    // Plus the progress within the current stage (0-25%)
    const stageBaseProgress = this.currentStageIndex * 25;
    const stageProgress = (this.loadingStageProgress / 100) * 25;
    const overallProgress = Math.min(100, stageBaseProgress + stageProgress);

    this.callbacks.onModelLoadingProgress?.({
      stage: this.loadingStage,
      progress: overallProgress,
    });
  }

  setAudioCaptureMode(mode: "webrtc" | "native"): void {
    this.audioCaptureMode = mode;
  }

  setNativeMicrophoneDeviceId(deviceId: string | null): void {
    this.selectedNativeDeviceId = deviceId;
  }

  async getNativeMicrophoneDevices(): Promise<NativeAudioInputDevice[]> {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
    } catch {
      return [];
    }
  }

  async getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error getting microphone devices:", error);
      return [];
    }
  }

  setMicrophone(deviceId: string): void {
    this.selectedMicId = deviceId;
  }

  private initWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(
      new URL("../workers/whisperWorker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.addEventListener("message", (event) => {
      const { type, message, text, output, file, progress } = event.data;

      switch (type) {
        case "loading":
          console.log("📦 Whisper:", message);
          this.callbacks.onStatusChange?.("connecting");
          
          // Track loading stage - match by checking if message contains stage keywords
          if (message.includes("tokenizer")) {
            this.currentStageIndex = 0;
            this.loadingStage = this.LOADING_STAGES[0];
            this.loadingStageProgress = 0;
            this.emitLoadingProgress();
          } else if (message.includes("processor")) {
            this.currentStageIndex = 1;
            this.loadingStage = this.LOADING_STAGES[1];
            this.loadingStageProgress = 0;
            this.emitLoadingProgress();
          } else if (message.includes("Loading model")) {
            this.currentStageIndex = 2;
            this.loadingStage = this.LOADING_STAGES[2];
            this.loadingStageProgress = 0;
            this.emitLoadingProgress();
          } else if (message.includes("Warming up")) {
            this.currentStageIndex = 3;
            this.loadingStage = this.LOADING_STAGES[3];
            this.loadingStageProgress = 0;
            this.emitLoadingProgress();
          }
          break;

        case "info":
          console.log("ℹ️ Whisper:", message);
          break;

        case "progress":
          console.log(`📥 ${file}: ${progress?.toFixed(1)}%`);
          // Update progress within current stage
          if (typeof progress === "number" && !isNaN(progress)) {
            this.loadingStageProgress = Math.min(100, Math.max(0, progress));
            this.emitLoadingProgress();
          }
          break;

        case "ready":
          console.log("✅ Whisper model ready");
          this.isModelReady = true;
          // Set progress to 100%
          this.loadingStageProgress = 100;
          this.emitLoadingProgress();
          // Clear loading state after a brief delay
          setTimeout(() => {
            this.loadingStage = "";
            this.currentStageIndex = -1;
            this.loadingStageProgress = 0;
          }, 500);
          
          if (this._isRecording) {
            this.callbacks.onStatusChange?.("recording");
            if (this.audioCaptureMode === "webrtc") {
              this.requestRecorderData(0);
              this.maybeProcessWebRTCAudio();
            } else {
              this.maybeProcessNativeAudio();
            }
          }
          break;

        case "start":
          console.log("🎙️ Whisper processing...");
          this.isProcessing = true;
          // Reset accumulated text for new transcription chunk
          this.accumulatedInterimText = "";
          if (this.audioCaptureMode === "webrtc") {
            this.requestRecorderData(0);
          }
          break;

        case "update":
          // Streaming update - output now contains only the new chunk
          if (output) {
            // Accumulate the new chunk
            this.accumulatedInterimText += (this.accumulatedInterimText ? " " : "") + output;
            // Send the full accumulated text to maintain compatibility
            this.callbacks.onInterimTranscript?.(this.accumulatedInterimText);
          }
          break;

        case "complete":
          this.isProcessing = false;
          if (text) {
            // Extract only the new portion, removing overlap from context audio
            const newText = this.extractNewTranscriptionText(text);
            
            // Only report if there's actually new text (not just overlap)
            if (newText.trim()) {
              console.log("📝 Whisper transcript (new portion):", newText);
              const segment: TranscriptionSegment = {
                id: `segment-${++this.segmentCounter}`,
                text: newText,
                timestamp: Date.now(),
                isFinal: true,
              };
              // Clear accumulated interim text when final transcript arrives
              this.accumulatedInterimText = "";
              this.callbacks.onFinalTranscript?.(newText, segment);
              
              // Update last transcription text for next overlap detection
              this.lastTranscriptionText = text;
            } else {
              console.log("📝 Whisper transcript (overlap only, skipping)");
            }
            
            // Clear processed audio from buffer, keeping only context overlap
            // This prevents re-transcribing the same audio in the next segment
            this.clearProcessedAudio();
          }
          if (this.audioCaptureMode === "webrtc") {
            this.maybeProcessWebRTCAudio();
          } else {
            this.maybeProcessNativeAudio();
          }
          break;

        case "error":
          console.error("❌ Whisper error:", message);
          this.isProcessing = false;
          this.callbacks.onError?.(new Error(message));
          break;
      }
    });

    this.worker.addEventListener("error", (error) => {
      console.error("Worker error:", error);
      this.callbacks.onError?.(new Error(error.message));
    });
  }

  private async cleanup(): Promise<void> {
    await this.stopNativeAudioCapture();

    if (this.recorderRequestTimeout) {
      clearTimeout(this.recorderRequestTimeout);
      this.recorderRequestTimeout = null;
    }

    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.nativeBuffer = new Float32Array(0);
    this.rollingAudioBuffer = new Float32Array(0);
    this.hasPendingAudio = false;
    this.isProcessing = false;
    this.decodeQueue = Promise.resolve();
    this.accumulatedInterimText = "";
    this.lastProcessedBufferLength = 0;
    this.lastTranscriptionText = ""; // Reset transcription tracking
  }

  private async stopNativeAudioCapture(): Promise<void> {
    if (!this.nativeUnlisten) return;
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("stop_native_audio_stream");
    } catch {}
    try {
      this.nativeUnlisten();
    } catch {}
    this.nativeUnlisten = null;
  }

  async startTranscription(): Promise<void> {
    if (this._isRecording) return;

    this.callbacks.onStatusChange?.("connecting");

    try {
      await this.cleanup();

      // Initialize worker and load model
      this.initWorker();
      this.worker!.postMessage({
        type: "load",
        data: { modelId: this.modelId },
      });

      // Set up audio capture
      if (this.audioCaptureMode === "native") {
        await this.startNativeCapture();
      } else {
        await this.startWebRTCCapture();
      }

      this._isRecording = true;
      console.log("✅ Offline Whisper transcription started");

    } catch (error) {
      console.error("Failed to start offline Whisper transcription:", error);
      this._isRecording = false;
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(error as Error);
      await this.cleanup();
      throw error;
    }
  }

  private async startWebRTCCapture(): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: this.selectedMicId
        ? { deviceId: { exact: this.selectedMicId } }
        : true,
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.audioContext = new AudioContext({
      sampleRate: WHISPER_SAMPLING_RATE,
    });

    this.mediaRecorder = new MediaRecorder(this.mediaStream);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.enqueueWebRTCAudioChunk(e.data);
      } else {
        this.requestRecorderData(25);
      }
    };

    this.mediaRecorder.start();
    this.requestRecorderData(0);
  }

  private requestRecorderData(delayMs: number): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") return;
    if (this.recorderRequestTimeout) return;
    this.recorderRequestTimeout = setTimeout(() => {
      this.recorderRequestTimeout = null;
      try {
        this.mediaRecorder?.requestData();
      } catch {
        // Ignore transient request errors when recorder stops.
      }
    }, delayMs);
  }

  private enqueueWebRTCAudioChunk(blob: Blob): void {
    this.decodeQueue = this.decodeQueue.then(async () => {
      if (!this.audioContext || !this._isRecording) return;
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const decoded = await this.audioContext.decodeAudioData(arrayBuffer);
        this.appendToRollingBuffer(decoded.getChannelData(0));
        this.hasPendingAudio = true;
        this.maybeProcessWebRTCAudio();
      } catch (error) {
        console.error("Error decoding Whisper audio chunk:", error);
      }
    });
  }

  private appendToRollingBuffer(samples: Float32Array): void {
    if (samples.length === 0) return;
    const combined = new Float32Array(this.rollingAudioBuffer.length + samples.length);
    combined.set(this.rollingAudioBuffer);
    combined.set(samples, this.rollingAudioBuffer.length);
    this.rollingAudioBuffer =
      combined.length > MAX_SAMPLES ? combined.slice(-MAX_SAMPLES) : combined;
  }

  /**
   * Extract only the new portion of transcription, removing overlap from context.
   * Finds the longest common suffix/prefix match between last and new transcription,
   * then returns only the new portion.
   * 
   * Uses word-based matching to handle cases where transcription might vary slightly
   * at character level but match at word level.
   */
  private extractNewTranscriptionText(newText: string): string {
    if (!this.lastTranscriptionText) {
      // First transcription, return it all
      return newText;
    }

    const lastTrimmed = this.lastTranscriptionText.trim();
    const newTrimmed = newText.trim();

    if (!lastTrimmed || !newTrimmed) {
      return newText;
    }

    // Normalize for comparison (lowercase, normalize whitespace)
    const lastNormalized = lastTrimmed.toLowerCase().replace(/\s+/g, ' ');
    const newNormalized = newTrimmed.toLowerCase().replace(/\s+/g, ' ');

    // Try word-based matching first (more reliable)
    const lastWords = lastNormalized.split(/\s+/);
    const newWords = newNormalized.split(/\s+/);
    
    // Find the longest suffix of last transcription that matches a prefix of new transcription
    let maxOverlapWords = 0;
    const minOverlapWords = 2; // Minimum words to consider as overlap (avoid false matches)

    // Check all possible suffix lengths of last transcription
    for (let i = Math.min(lastWords.length, newWords.length); i >= minOverlapWords; i--) {
      const lastSuffix = lastWords.slice(-i).join(' ');
      const newPrefix = newWords.slice(0, i).join(' ');
      
      if (lastSuffix === newPrefix) {
        maxOverlapWords = i;
        break;
      }
    }

    if (maxOverlapWords > 0) {
      // Extract only the new portion (everything after the overlapping words)
      // Map back to original case by finding the position in the original text
      const originalWords = newTrimmed.split(/\s+/);
      const remainingWords = originalWords.slice(maxOverlapWords);
      const result = remainingWords.join(' ').trim();
      
      console.log(`✂️ Removed ${maxOverlapWords} word overlap from transcription`);
      return result;
    }

    // Fallback to character-based matching if word matching fails
    let maxOverlapLength = 0;
    const minOverlapLength = 20; // Minimum characters to consider as overlap

    // Check all possible suffix lengths of last transcription
    for (let i = Math.min(lastNormalized.length, newNormalized.length); i >= minOverlapLength; i--) {
      const lastSuffix = lastNormalized.slice(-i);
      const newPrefix = newNormalized.slice(0, i);
      
      if (lastSuffix === newPrefix) {
        maxOverlapLength = i;
        break;
      }
    }

    if (maxOverlapLength > 0) {
      // Extract only the new portion (everything after the overlap)
      // Try to align at word boundary
      const words = newTrimmed.split(/\s+/);
      let charCount = 0;
      let wordIndex = 0;
      
      // Find which word the overlap ends at
      for (let i = 0; i < words.length; i++) {
        const wordLength = words[i].toLowerCase().replace(/\s+/g, ' ').length + 1; // +1 for space
        if (charCount + wordLength > maxOverlapLength) {
          wordIndex = i;
          break;
        }
        charCount += wordLength;
      }
      
      const result = words.slice(wordIndex).join(' ').trim();
      console.log(`✂️ Removed ${maxOverlapLength} character overlap from transcription`);
      return result;
    }

    // No overlap found, return the full new text
    return newText;
  }

  /**
   * Clear processed audio from the buffer, keeping only a small context overlap.
   * This prevents re-transcribing the same audio in subsequent segments.
   */
  private clearProcessedAudio(): void {
    if (this.rollingAudioBuffer.length === 0) return;
    
    // Calculate how much audio to keep for context
    // We want to keep the last CONTEXT_OVERLAP_SECONDS of audio
    const samplesToKeep = Math.min(
      this.CONTEXT_OVERLAP_SAMPLES,
      this.rollingAudioBuffer.length
    );
    
    // Keep only the last N seconds for context
    this.rollingAudioBuffer = this.rollingAudioBuffer.slice(-samplesToKeep);
    // Set the processed length to the size of the remaining buffer
    // This way we know the entire remaining buffer is context, not new audio
    this.lastProcessedBufferLength = this.rollingAudioBuffer.length;
    
    console.log(`🧹 Cleared processed audio, kept ${samplesToKeep} samples (${(samplesToKeep / WHISPER_SAMPLING_RATE).toFixed(1)}s) for context`);
  }

  private maybeProcessWebRTCAudio(): void {
    if (this.audioCaptureMode !== "webrtc") return;
    if (!this._isRecording || !this.isModelReady || this.isProcessing) return;
    if (!this.hasPendingAudio || this.rollingAudioBuffer.length === 0) return;

    // Only process if we have new audio beyond what we've already processed
    // We need at least a few seconds of new audio to make it worth processing
    const MIN_NEW_AUDIO_SECONDS = 2;
    const MIN_NEW_AUDIO_SAMPLES = WHISPER_SAMPLING_RATE * MIN_NEW_AUDIO_SECONDS;
    
    const newAudioLength = this.rollingAudioBuffer.length - this.lastProcessedBufferLength;
    
    if (newAudioLength < MIN_NEW_AUDIO_SAMPLES) {
      // Not enough new audio yet, wait for more
      return;
    }

    this.hasPendingAudio = false;
    this.isProcessing = true;
    this.lastProcessedBufferLength = this.rollingAudioBuffer.length;
    
    this.worker?.postMessage({
      type: "transcribe",
      data: { audio: this.rollingAudioBuffer, language: this.language },
    });
  }

  private async startNativeCapture(): Promise<void> {
    console.log("🎛️ Using native audio capture for offline Whisper...");
    const events = await import("@tauri-apps/api/event");
    const core = await import("@tauri-apps/api/core");

    const base64ToFloat32Array = (b64: string): Float32Array => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const int16View = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        float32[i] = int16View[i] / 32768.0;
      }
      return float32;
    };

    const unlisten = await events.listen<{ data_b64: string }>(
      "native_audio_chunk",
      (evt) => {
        try {
          const newSamples = base64ToFloat32Array(evt.payload.data_b64);
          const tmp = new Float32Array(this.nativeBuffer.length + newSamples.length);
          tmp.set(this.nativeBuffer);
          tmp.set(newSamples, this.nativeBuffer.length);
          this.nativeBuffer = tmp;
          this.hasPendingAudio = true;
          this.maybeProcessNativeAudio();
        } catch (e) {
          console.error("Error processing native audio chunk:", e);
        }
      }
    );

    this.nativeUnlisten = unlisten;
    await core.invoke("start_native_audio_stream", {
      deviceId: this.selectedNativeDeviceId ?? undefined,
    });
  }

  private maybeProcessNativeAudio(): void {
    if (this.audioCaptureMode !== "native") return;
    if (!this._isRecording || !this.isModelReady || this.isProcessing) return;
    if (!this.hasPendingAudio || this.nativeBuffer.length === 0) return;

    this.appendToRollingBuffer(this.nativeBuffer);
    this.nativeBuffer = new Float32Array(0);
    
    // Only process if we have new audio beyond what we've already processed
    const MIN_NEW_AUDIO_SECONDS = 2;
    const MIN_NEW_AUDIO_SAMPLES = WHISPER_SAMPLING_RATE * MIN_NEW_AUDIO_SECONDS;
    
    const newAudioLength = this.rollingAudioBuffer.length - this.lastProcessedBufferLength;
    
    if (newAudioLength < MIN_NEW_AUDIO_SAMPLES) {
      // Not enough new audio yet, wait for more
      this.hasPendingAudio = true; // Keep flag set so we check again when more audio arrives
      return;
    }

    this.hasPendingAudio = false;
    this.isProcessing = true;
    this.lastProcessedBufferLength = this.rollingAudioBuffer.length;

    this.worker?.postMessage({
      type: "transcribe",
      data: { audio: this.rollingAudioBuffer, language: this.language },
    });
  }

  async stopTranscription(): Promise<void> {
    console.log("🛑 Stopping offline Whisper transcription...");
    this._isRecording = false;
    await this.cleanup();
    this.callbacks.onStatusChange?.("idle");
  }

  destroy(): void {
    this.stopTranscription();
    if (this.worker) {
      this.worker.postMessage({ type: "unload" });
      this.worker.terminate();
      this.worker = null;
    }
    this.isModelReady = false;
  }
}

// =============================================================================
// OFFLINE MOONSHINE TRANSCRIPTION SERVICE
// =============================================================================

/**
 * Offline Moonshine Transcription Service
 *
 * Uses @huggingface/transformers with a Web Worker for offline transcription.
 * Includes Voice Activity Detection (VAD) for automatic speech segmentation.
 */
export class OfflineMoonshineTranscriptionService implements ITranscriptionService {
  readonly engine: TranscriptionEngine = "offline-moonshine";

  private worker: Worker | null = null;
  private modelId: string;
  private callbacks: TranscriptionCallbacks = {};
  private _isRecording: boolean = false;
  private isModelReady: boolean = false;
  private segmentCounter: number = 0;

  // Audio capture
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private selectedMicId: string = "";
  private audioCaptureMode: "webrtc" | "native" = "webrtc";
  private selectedNativeDeviceId: string | null = null;
  private nativeUnlisten: null | (() => void) = null;
  
  private readonly SAMPLE_RATE = 16000;

  constructor(
    modelId: string,
    callbacks: TranscriptionCallbacks = {}
  ) {
    this.modelId = modelId || "onnx-community/moonshine-base-ONNX";
    this.callbacks = callbacks;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  setModelId(modelId: string): void {
    this.modelId = modelId;
  }

  setCallbacks(callbacks: TranscriptionCallbacks): void {
    this.callbacks = callbacks;
  }

  setAudioCaptureMode(mode: "webrtc" | "native"): void {
    this.audioCaptureMode = mode;
  }

  setNativeMicrophoneDeviceId(deviceId: string | null): void {
    this.selectedNativeDeviceId = deviceId;
  }

  async getNativeMicrophoneDevices(): Promise<NativeAudioInputDevice[]> {
    try {
      const mod = await import("@tauri-apps/api/core");
      return await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
    } catch {
      return [];
    }
  }

  async getMicrophoneDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error getting microphone devices:", error);
      return [];
    }
  }

  setMicrophone(deviceId: string): void {
    this.selectedMicId = deviceId;
  }

  private initWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(
      new URL("../workers/moonshineWorker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.addEventListener("message", (event) => {
      const { type, message, text } = event.data;
      const eventStatus = event.data.status as string | undefined;

      switch (type) {
        case "loading":
          console.log("📦 Moonshine:", message);
          this.callbacks.onStatusChange?.("connecting");
          break;

        case "info":
          console.log("ℹ️ Moonshine:", message);
          break;

        case "progress":
          const { file, progress } = event.data;
          console.log(`📥 ${file}: ${progress?.toFixed(1)}%`);
          break;

        case "ready":
          console.log("✅ Moonshine model ready");
          this.isModelReady = true;
          if (this._isRecording) {
            this.callbacks.onStatusChange?.("recording");
          }
          break;

        case "status":
          if (eventStatus === "recording_start") {
            console.log("🎙️ Speech detected");
          } else if (eventStatus === "recording_end") {
            console.log("⏸️ Speech ended, transcribing...");
          }
          break;

        case "output":
        case "complete":
          const transcriptText = text || message;
          if (transcriptText) {
            console.log("📝 Moonshine transcript:", transcriptText);
            const segment: TranscriptionSegment = {
              id: `segment-${++this.segmentCounter}`,
              text: transcriptText,
              timestamp: Date.now(),
              isFinal: true,
            };
            this.callbacks.onFinalTranscript?.(transcriptText, segment);
          }
          break;

        case "error":
          console.error("❌ Moonshine error:", message);
          this.callbacks.onError?.(new Error(message));
          break;
      }
    });

    this.worker.addEventListener("error", (error) => {
      console.error("Worker error:", error);
      this.callbacks.onError?.(new Error(error.message));
    });
  }

  private async cleanup(): Promise<void> {
    await this.stopNativeAudioCapture();

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  private async stopNativeAudioCapture(): Promise<void> {
    if (!this.nativeUnlisten) return;
    try {
      const core = await import("@tauri-apps/api/core");
      await core.invoke("stop_native_audio_stream");
    } catch {}
    try {
      this.nativeUnlisten();
    } catch {}
    this.nativeUnlisten = null;
  }

  async startTranscription(): Promise<void> {
    if (this._isRecording) return;

    this.callbacks.onStatusChange?.("connecting");

    try {
      await this.cleanup();

      // Initialize worker and load model
      this.initWorker();
      this.worker!.postMessage({
        type: "load",
        data: { modelId: this.modelId },
      });

      // Set up audio capture
      if (this.audioCaptureMode === "native") {
        await this.startNativeCapture();
      } else {
        await this.startWebRTCCapture();
      }

      this._isRecording = true;
      console.log("✅ Offline Moonshine transcription started");

    } catch (error) {
      console.error("Failed to start offline Moonshine transcription:", error);
      this._isRecording = false;
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(error as Error);
      await this.cleanup();
      throw error;
    }
  }

  private async startWebRTCCapture(): Promise<void> {
    const constraints: MediaStreamConstraints = {
      audio: this.selectedMicId
        ? {
            deviceId: { exact: this.selectedMicId },
            channelCount: 1,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true,
            sampleRate: this.SAMPLE_RATE,
          }
        : {
            channelCount: 1,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true,
            sampleRate: this.SAMPLE_RATE,
          },
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    this.audioContext = new AudioContext({
      sampleRate: this.SAMPLE_RATE,
      latencyHint: "interactive",
    });

    // Create source node
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Load and connect audio worklet for VAD processing
    // We need to create a simple processor that buffers audio and sends to worker
    await this.audioContext.audioWorklet.addModule(
      this.createVADProcessorBlob()
    );

    this.workletNode = new AudioWorkletNode(this.audioContext, "vad-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });

    this.sourceNode.connect(this.workletNode);

    this.workletNode.port.onmessage = (event) => {
      const { buffer } = event.data;
      if (this.worker && this._isRecording && this.isModelReady) {
        this.worker.postMessage({ type: "buffer", data: { buffer } });
      }
    };
  }

  private createVADProcessorBlob(): string {
    const processorCode = `
      const MIN_CHUNK_SIZE = 512;
      let globalPointer = 0;
      let globalBuffer = new Float32Array(MIN_CHUNK_SIZE);

      class VADProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const buffer = inputs[0][0];
          if (!buffer) return true;

          if (buffer.length > MIN_CHUNK_SIZE) {
            this.port.postMessage({ buffer: new Float32Array(buffer) });
          } else {
            const remaining = MIN_CHUNK_SIZE - globalPointer;
            if (buffer.length >= remaining) {
              globalBuffer.set(buffer.subarray(0, remaining), globalPointer);
              this.port.postMessage({ buffer: new Float32Array(globalBuffer) });
              globalBuffer.fill(0);
              globalBuffer.set(buffer.subarray(remaining), 0);
              globalPointer = buffer.length - remaining;
            } else {
              globalBuffer.set(buffer, globalPointer);
              globalPointer += buffer.length;
            }
          }

          return true;
        }
      }

      registerProcessor("vad-processor", VADProcessor);
    `;

    const blob = new Blob([processorCode], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  private async startNativeCapture(): Promise<void> {
    console.log("🎛️ Using native audio capture for offline Moonshine...");
    const events = await import("@tauri-apps/api/event");
    const core = await import("@tauri-apps/api/core");

    const base64ToFloat32Array = (b64: string): Float32Array => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const int16View = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16View.length);
      for (let i = 0; i < int16View.length; i++) {
        float32[i] = int16View[i] / 32768.0;
      }
      return float32;
    };

    const unlisten = await events.listen<{ data_b64: string }>(
      "native_audio_chunk",
      (evt) => {
        if (!this.worker || !this._isRecording || !this.isModelReady) return;
        try {
          const buffer = base64ToFloat32Array(evt.payload.data_b64);
          this.worker.postMessage({ type: "buffer", data: { buffer } });
        } catch (e) {
          console.error("Error processing native audio chunk:", e);
        }
      }
    );

    this.nativeUnlisten = unlisten;
    await core.invoke("start_native_audio_stream", {
      deviceId: this.selectedNativeDeviceId ?? undefined,
    });
  }

  async stopTranscription(): Promise<void> {
    console.log("🛑 Stopping offline Moonshine transcription...");
    this._isRecording = false;
    
    // Tell worker to reset VAD state
    if (this.worker) {
      this.worker.postMessage({ type: "reset" });
    }
    
    await this.cleanup();
    this.callbacks.onStatusChange?.("idle");
  }

  destroy(): void {
    this.stopTranscription();
    if (this.worker) {
      this.worker.postMessage({ type: "unload" });
      this.worker.terminate();
      this.worker = null;
    }
    this.isModelReady = false;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a transcription service instance based on the configured engine
 */
export function createTranscriptionService(
  settings: SmartVersesSettings,
  callbacks: TranscriptionCallbacks
): ITranscriptionService {
  switch (settings.transcriptionEngine) {
    case "assemblyai":
      return new AssemblyAITranscriptionService(
        settings.assemblyAIApiKey || "",
        callbacks
      );
    case "groq":
      return new GroqTranscriptionService(
        settings.groqApiKey || "",
        settings.groqModel || "whisper-large-v3",
        callbacks
      );
    case "offline-whisper":
      return new OfflineWhisperTranscriptionService(
        settings.offlineWhisperModel || "onnx-community/whisper-base",
        settings.offlineLanguage || "en",
        callbacks
      );
    case "offline-whisper-native":
      return new MacNativeWhisperTranscriptionService(
        settings.offlineWhisperNativeModel || "ggml-small.en-q5_1.bin",
        settings.offlineLanguage || "en",
        callbacks
      );
    case "offline-moonshine":
      return new OfflineMoonshineTranscriptionService(
        settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX",
        callbacks
      );
    // Future engines can be added here
    // case 'elevenlabs':
    //   return new ElevenLabsTranscriptionService(settings, callbacks);
    default:
      return new AssemblyAITranscriptionService(
        settings.assemblyAIApiKey || "",
        callbacks
      );
  }
}

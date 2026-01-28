/**
 * Recorder Service
 * 
 * Handles video and audio recording functionality using the MediaRecorder API.
 * Manages device enumeration, recording state, and file saving via Tauri.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  RecorderSettings,
  DEFAULT_RECORDER_SETTINGS,
  RECORDER_SETTINGS_KEY,
  EnabledFeatures,
  DEFAULT_ENABLED_FEATURES,
  ENABLED_FEATURES_KEY,
  MediaDeviceOption,
  VideoResolution,
  VIDEO_RESOLUTION_CONFIG,
  VideoFormat,
  VideoAudioCodec,
  AudioBitrate,
  AUDIO_BITRATE_CONFIG,
  RecordingResult,
} from "../types/recorder";

// ============================================================================
// Settings Management
// ============================================================================

function getDefaultVideoAudioCodec(): VideoAudioCodec {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) {
      return "aac";
    }
  }
  return "aac";
}

function normalizeRecorderSettings(settings: RecorderSettings): RecorderSettings {
  const next = { ...settings };
  if (typeof next.selectedVideoAudioDeviceId === "undefined") {
    next.selectedVideoAudioDeviceId = next.selectedAudioDeviceId ?? null;
  }
  if (typeof next.videoAudioDelayMs !== "number" || Number.isNaN(next.videoAudioDelayMs)) {
    next.videoAudioDelayMs = 0;
  }
  if (next.videoAudioDelayMs < 0) {
    next.videoAudioDelayMs = 0;
  }
  if (next.videoAudioDelayMs > 2000) {
    next.videoAudioDelayMs = 2000;
  }
  if (!next.videoAudioCodec) {
    next.videoAudioCodec = getDefaultVideoAudioCodec();
  }
  if (next.videoFormat === "webm" && next.videoAudioCodec !== "opus") {
    next.videoAudioCodec = "opus";
  }
  if (next.videoFormat === "mp4" && next.videoAudioCodec !== "aac") {
    next.videoAudioCodec = "aac";
  }
  return next;
}

export function loadRecorderSettings(): RecorderSettings {
  try {
    const stored = localStorage.getItem(RECORDER_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return normalizeRecorderSettings({ ...DEFAULT_RECORDER_SETTINGS, ...parsed });
    }
  } catch (err) {
    console.error("Failed to load recorder settings:", err);
  }
  return normalizeRecorderSettings({ ...DEFAULT_RECORDER_SETTINGS });
}

export function saveRecorderSettings(settings: RecorderSettings): void {
  try {
    const normalized = normalizeRecorderSettings(settings);
    localStorage.setItem(RECORDER_SETTINGS_KEY, JSON.stringify(normalized));
    // Notify any open pages (e.g. RecorderPage) to refresh settings immediately
    window.dispatchEvent(new CustomEvent("recorder-settings-updated", { detail: normalized }));
  } catch (err) {
    console.error("Failed to save recorder settings:", err);
  }
}

// ============================================================================
// Feature Flags Management
// ============================================================================

export function loadEnabledFeatures(): EnabledFeatures {
  try {
    const stored = localStorage.getItem(ENABLED_FEATURES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_ENABLED_FEATURES, ...parsed };
    }
  } catch (err) {
    console.error("Failed to load enabled features:", err);
  }
  return { ...DEFAULT_ENABLED_FEATURES };
}

export function saveEnabledFeatures(features: EnabledFeatures): void {
  try {
    localStorage.setItem(ENABLED_FEATURES_KEY, JSON.stringify(features));
    // Dispatch event so App.tsx can update navigation
    window.dispatchEvent(new CustomEvent("features-updated", { detail: features }));
  } catch (err) {
    console.error("Failed to save enabled features:", err);
  }
}

// ============================================================================
// Device Enumeration
// ============================================================================

export async function getVideoDevices(): Promise<MediaDeviceOption[]> {
  try {
    // Request permission first to get full device labels
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
        kind: "videoinput" as const,
        isDefault: index === 0,
      }));
  } catch (err) {
    console.error("Failed to enumerate video devices:", err);
    return [];
  }
}

// WebRTC audio devices (fallback)
export async function getAudioDevices(): Promise<MediaDeviceOption[]> {
  try {
    // Request permission first to get full device labels
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${index + 1}`,
        kind: "audioinput" as const,
        isDefault: index === 0,
      }));
  } catch (err) {
    console.error("Failed to enumerate audio devices:", err);
    return [];
  }
}

// Native audio device type from Tauri backend
export interface NativeAudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

// Get native audio devices (high quality, system-level access)
export async function getNativeAudioDevices(): Promise<NativeAudioDevice[]> {
  try {
    const devices = await invoke<NativeAudioDevice[]>("list_native_audio_input_devices");
    return devices || [];
  } catch (err) {
    console.error("Failed to get native audio devices:", err);
    return [];
  }
}

// ============================================================================
// Native Audio Recording (High Quality via Rust/cpal)
// ============================================================================

export interface NativeRecordingInfo {
  file_path: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
}

export async function startNativeAudioRecording(
  deviceId: string | null,
  filePath: string,
  sampleRate?: number,
  warmupMs?: number
): Promise<void> {
  await invoke("start_native_audio_recording", {
    deviceId,
    filePath,
    sampleRate: sampleRate || 48000,
    warmupMs: warmupMs ?? 800,
  });
}

export async function stopNativeAudioRecording(): Promise<NativeRecordingInfo> {
  return await invoke<NativeRecordingInfo>("stop_native_audio_recording");
}

export async function isNativeAudioRecording(): Promise<boolean> {
  return await invoke<boolean>("is_audio_recording");
}

export async function getNativeAudioRecordingDuration(): Promise<number> {
  return await invoke<number>("get_audio_recording_duration");
}

// ============================================================================
// Streaming Video Recording (Production-Grade - No Memory Accumulation)
// ============================================================================
//
// These functions enable streaming video recording where chunks are written
// directly to disk as they arrive from MediaRecorder, preventing memory
// accumulation that causes "Out of Memory" crashes during long recordings.
//
// Usage:
// 1. Call startStreamingVideoRecording() to initialize the file
// 2. In MediaRecorder.ondataavailable, call appendVideoChunk() for each chunk
// 3. Call finalizeStreamingVideoRecording() when done
//
// Memory usage: O(1) constant, regardless of recording length

export interface VideoRecordingInfo {
  file_path: string;
  duration_seconds: number;
  bytes_written: number;
}

/**
 * Start a streaming video recording session.
 * Creates/truncates the video file and prepares for chunk streaming.
 * @param filePath Full path to save the video file (e.g., ~/Documents/video.webm)
 * @returns The normalized file path where the video will be saved
 */
export async function startStreamingVideoRecording(filePath: string): Promise<string> {
  return await invoke<string>("start_streaming_video_recording", { filePath });
}

/**
 * Append a video chunk to the streaming recording.
 * Call this for each MediaRecorder ondataavailable event.
 * The chunk is written directly to disk - no memory accumulation.
 * @param chunkBase64 Base64-encoded video chunk data
 * @returns Total bytes written so far
 */
export async function appendVideoChunk(chunkBase64: string): Promise<number> {
  return await invoke<number>("append_video_chunk", { chunkBase64 });
}

/**
 * Finalize the streaming video recording.
 * Closes the file and syncs data to disk.
 * @returns Recording info including file path, duration, and bytes written
 */
export async function finalizeStreamingVideoRecording(): Promise<VideoRecordingInfo> {
  return await invoke<VideoRecordingInfo>("finalize_streaming_video_recording");
}

/**
 * Check if a streaming video recording is currently active.
 */
export async function isVideoStreamingRecording(): Promise<boolean> {
  return await invoke<boolean>("is_video_streaming_recording");
}

/**
 * Get current recording statistics without stopping.
 */
export async function getVideoRecordingStats(): Promise<VideoRecordingInfo> {
  return await invoke<VideoRecordingInfo>("get_video_recording_stats");
}

/**
 * Abort the streaming recording and delete the incomplete file.
 * Use this when recording fails or is cancelled.
 */
export async function abortStreamingVideoRecording(): Promise<void> {
  return await invoke<void>("abort_streaming_video_recording");
}

/**
 * Generate full file path for streaming video recording.
 */
export function generateStreamingVideoFilePath(
  settings: RecorderSettings,
  sessionName?: string
): string {
  const filename = generateFilename("video", settings, sessionName);
  let basePath = settings.outputBasePath.trim();
  if (!basePath.endsWith("/")) {
    basePath += "/";
  }
  return `${basePath}video/${filename}`;
}

/**
 * Convert a Blob chunk to base64 string for streaming to Rust backend.
 * This is used to convert MediaRecorder chunks for the append_video_chunk command.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Extract base64 part after "data:...;base64,"
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// Streaming Web Audio Recording (Crash-Safe MP3 Recording)
// ============================================================================
//
// For MP3 recording, we stream raw WebM/Opus chunks to disk as they arrive
// (crash-safe), then after recording stops, we convert to MP3.
//
// Flow:
// 1. MediaRecorder produces WebM/Opus chunks
// 2. Each chunk is streamed to a temp .webm file on disk (crash-safe)
// 3. On stop, read the .webm file, decode, encode to MP3, save final .mp3
// 4. Delete the temp .webm file
//
// If app crashes: The .webm file contains all audio up to that point.
// It can be recovered or converted manually using FFmpeg.

export interface WebAudioRecordingInfo {
  file_path: string;
  duration_seconds: number;
  bytes_written: number;
}

/**
 * Start streaming web audio recording.
 * The file will contain raw MediaRecorder output (typically WebM/Opus).
 */
export async function startStreamingWebAudioRecording(filePath: string): Promise<string> {
  return await invoke<string>("start_streaming_web_audio_recording", { filePath });
}

/**
 * Append an audio chunk to the streaming recording.
 */
export async function appendWebAudioChunk(chunkBase64: string): Promise<number> {
  return await invoke<number>("append_web_audio_chunk", { chunkBase64 });
}

/**
 * Finalize the streaming web audio recording.
 */
export async function finalizeStreamingWebAudioRecording(): Promise<WebAudioRecordingInfo> {
  return await invoke<WebAudioRecordingInfo>("finalize_streaming_web_audio_recording");
}

/**
 * Check if web audio streaming recording is active.
 */
export async function isWebAudioStreamingRecording(): Promise<boolean> {
  return await invoke<boolean>("is_web_audio_streaming_recording");
}

/**
 * Get current web audio recording stats.
 */
export async function getWebAudioRecordingStats(): Promise<WebAudioRecordingInfo> {
  return await invoke<WebAudioRecordingInfo>("get_web_audio_recording_stats");
}

/**
 * Abort streaming web audio recording and delete temp file.
 */
export async function abortStreamingWebAudioRecording(): Promise<void> {
  return await invoke<void>("abort_streaming_web_audio_recording");
}

/**
 * Read a file as base64 (used to read streamed WebM for MP3 conversion).
 */
export async function readFileAsBase64(filePath: string): Promise<string> {
  return await invoke<string>("read_file_as_base64", { filePath });
}

/**
 * Delete a file (used to clean up temp WebM files after MP3 conversion).
 */
export async function deleteFile(filePath: string): Promise<void> {
  return await invoke<void>("delete_file", { filePath });
}

/**
 * Generate temp file path for streaming web audio (before MP3 conversion).
 * Uses .webm extension since that's what MediaRecorder produces.
 */
export function generateStreamingWebAudioTempPath(
  settings: RecorderSettings,
  sessionName?: string
): string {
  // Generate filename but with .webm extension for temp streaming
  const baseFilename = generateFilename("audio", settings, sessionName, "webm");
  let basePath = settings.outputBasePath.trim();
  if (!basePath.endsWith("/")) {
    basePath += "/";
  }
  // Put temp files in a .temp subfolder
  return `${basePath}audio/.temp/${baseFilename}`;
}

/**
 * Generate final MP3 file path.
 */
export function generateFinalMp3Path(
  settings: RecorderSettings,
  sessionName?: string
): string {
  const filename = generateFilename("audio", settings, sessionName, "mp3");
  let basePath = settings.outputBasePath.trim();
  if (!basePath.endsWith("/")) {
    basePath += "/";
  }
  return `${basePath}audio/${filename}`;
}

/**
 * Convert base64 to Blob.
 */
export function base64ToBlob(base64: string, mimeType: string = "audio/webm"): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// Generate full file path for native audio recording
export function generateNativeAudioFilePath(
  settings: RecorderSettings,
  sessionName?: string
): string {
  const filename = generateFilename("audio", settings, sessionName);
  let basePath = settings.outputBasePath.trim();
  if (!basePath.endsWith("/")) {
    basePath += "/";
  }
  return `${basePath}audio/${filename}`;
}

// ============================================================================
// Filename Generation
// ============================================================================

export function generateFilename(
  type: "video" | "audio",
  settings: RecorderSettings,
  sessionName?: string,
  extensionOverride?: string
): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);

  let baseName: string;

  switch (settings.namingPattern) {
    case "session_timestamp":
      if (sessionName && settings.includeSessionName) {
        // Sanitize session name for filename
        const sanitized = sessionName
          .replace(/[^a-zA-Z0-9\s-]/g, "")
          .replace(/\s+/g, "_")
          .toLowerCase();
        baseName = `${sanitized}_${timestamp}`;
      } else {
        baseName = `recording_${timestamp}`;
      }
      break;
    case "custom_timestamp":
      baseName = `${settings.customPrefix}_${timestamp}`;
      break;
    case "timestamp":
    default:
      baseName = `recording_${timestamp}`;
      break;
  }

  const extension = extensionOverride || (type === "video" ? settings.videoFormat : settings.audioFormat);
  return `${baseName}.${extension}`;
}

// ============================================================================
// File Saving
// ============================================================================

export async function saveRecordingToFile(
  blob: Blob,
  type: "video" | "audio",
  settings: RecorderSettings,
  sessionName?: string,
  extensionOverride?: string
): Promise<RecordingResult> {
  try {
    const filename = generateFilename(type, settings, sessionName, extensionOverride);
    const subFolder = type === "video" ? "video" : "audio";
    
    // Normalize base path
    let basePath = settings.outputBasePath.trim();
    if (!basePath.endsWith("/")) {
      basePath += "/";
    }
    
    const fullPath = `${basePath}${subFolder}/${filename}`;
    const { homeDir } = await import("@tauri-apps/api/path");
    let normalizedPath = fullPath;
    if (normalizedPath.startsWith("~/") || normalizedPath === "~") {
      const home = await homeDir();
      if (normalizedPath === "~") {
        normalizedPath = home;
      } else {
        normalizedPath = home + normalizedPath.slice(1);
      }
    }

    // Convert blob to base64
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const base64 = btoa(
      uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Write file using Tauri
    await invoke("write_binary_to_file", {
      filePath: normalizedPath,
      dataBase64: base64,
    });

    return {
      success: true,
      filePath: normalizedPath,
      fileName: filename,
      fileSize: blob.size,
    };
  } catch (err) {
    console.error("Failed to save recording:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// Media Stream Helpers
// ============================================================================

export async function getVideoStream(
  deviceId: string | null,
  resolution: VideoResolution,
  audioDeviceId?: string | null,
  includeAudio: boolean = true
): Promise<MediaStream> {
  const config = VIDEO_RESOLUTION_CONFIG[resolution];
  
  const constraints: MediaStreamConstraints = {
    video: {
      width: { ideal: config.width },
      height: { ideal: config.height },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
    audio: includeAudio
      ? {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      : false, // Include raw audio in video recording
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
}

export async function getAudioOnlyStream(
  deviceId: string | null
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
}

// ============================================================================
// MediaRecorder Factory
// ============================================================================

export interface VideoRecorderConfig {
  recorder: MediaRecorder;
  mimeType: string;
  fileExtension: VideoFormat;
}

function getVideoExtensionFromMimeType(
  mimeType: string | undefined,
  fallback: VideoFormat
): VideoFormat {
  if (!mimeType) return fallback;
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  return fallback;
}

export function createVideoRecorder(
  stream: MediaStream,
  format: "mp4" | "webm",
  audioCodec: VideoAudioCodec
): VideoRecorderConfig {
  // Determine the best supported MIME type
  const mp4AacMimeTypes = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
  ];
  const webmOpusMimeTypes = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  if (format === "mp4" && audioCodec !== "aac") {
    console.warn("MP4 recordings use AAC audio; switching codec to AAC.");
  }
  if (format === "webm" && audioCodec !== "opus") {
    console.warn("WebM recordings use Opus audio; switching codec to Opus.");
  }

  const mimeTypes =
    format === "mp4"
      ? mp4AacMimeTypes
      : webmOpusMimeTypes;

  let selectedMimeType = "";
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      selectedMimeType = mimeType;
      break;
    }
  }

  if (!selectedMimeType) {
    // Fallback to browser default
    const fallbackRecorder = new MediaRecorder(stream);
    return {
      recorder: fallbackRecorder,
      mimeType: fallbackRecorder.mimeType || "",
      fileExtension: getVideoExtensionFromMimeType(fallbackRecorder.mimeType, format),
    };
  }

  return {
    recorder: new MediaRecorder(stream, { mimeType: selectedMimeType }),
    mimeType: selectedMimeType,
    fileExtension: getVideoExtensionFromMimeType(selectedMimeType, format),
  };
}

export function createAudioRecorder(
  stream: MediaStream,
  format: "mp3" | "wav",
  bitrate: AudioBitrate
): MediaRecorder {
  // Note: Browser MediaRecorder typically outputs webm/opus or ogg/opus
  // We'll handle format conversion on save or accept the browser's format
  const audioBps = AUDIO_BITRATE_CONFIG[bitrate];
  
  const mimeTypes = format === "wav"
    ? ["audio/wav", "audio/webm;codecs=pcm", "audio/webm", "audio/ogg"]
    : ["audio/mpeg", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];

  let selectedMimeType = "";
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      selectedMimeType = mimeType;
      break;
    }
  }

  const options: MediaRecorderOptions = {
    audioBitsPerSecond: audioBps,
  };

  if (selectedMimeType) {
    options.mimeType = selectedMimeType;
  }

  return new MediaRecorder(stream, options);
}

// ============================================================================
// Audio Level Analysis
// ============================================================================

export function createAudioAnalyzer(stream: MediaStream): {
  analyser: AnalyserNode;
  getAudioLevels: () => number[];
  cleanup: () => void;
} {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.8;
  
  source.connect(analyser);
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const getAudioLevels = (): number[] => {
    analyser.getByteFrequencyData(dataArray);
    // Return normalized values (0-1)
    return Array.from(dataArray).map((v) => v / 255);
  };

  const cleanup = () => {
    source.disconnect();
    audioContext.close();
  };

  return { analyser, getAudioLevels, cleanup };
}

// ============================================================================
// Time Formatting
// ============================================================================

export function formatRecordingTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hrs.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// Output Folder Operations
// ============================================================================

export async function openOutputFolder(basePath: string, type?: "video" | "audio"): Promise<void> {
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    const { homeDir } = await import("@tauri-apps/api/path");
    let path = basePath.trim();
    
    // Expand ~ to home directory
    if (path.startsWith("~/")) {
      const home = await homeDir();
      path = home + path.slice(2);
    }
    
    if (!path.endsWith("/")) {
      path += "/";
    }
    if (type) {
      path += type + "/";
    }
    await invoke("ensure_output_folder", { path });
    await openPath(path);
  } catch (err) {
    console.error("Failed to open output folder:", err);
  }
}

/**
 * Moonshine Transcription Web Worker with Voice Activity Detection (VAD)
 *
 * Handles offline Moonshine model inference in a separate thread.
 * Uses @huggingface/transformers for model loading and inference.
 * Includes Silero VAD for detecting speech segments.
 */

import { AutoModel, Tensor, pipeline, Pipeline } from '@huggingface/transformers';
import { configureTransformersEnv } from '../utils/transformersEnv';

configureTransformersEnv();

// Constants for audio processing
const SAMPLE_RATE = 16000;
const SAMPLE_RATE_MS = SAMPLE_RATE / 1000;

// VAD thresholds
const SPEECH_THRESHOLD = 0.3;
const EXIT_THRESHOLD = 0.1;

// Timing constants
const MIN_SILENCE_DURATION_MS = 400;
const MIN_SILENCE_DURATION_SAMPLES = MIN_SILENCE_DURATION_MS * SAMPLE_RATE_MS;
const SPEECH_PAD_MS = 80;
const SPEECH_PAD_SAMPLES = SPEECH_PAD_MS * SAMPLE_RATE_MS;
const MIN_SPEECH_DURATION_SAMPLES = 250 * SAMPLE_RATE_MS;
const MAX_BUFFER_DURATION = 30;
const NEW_BUFFER_SIZE = 512;
const MAX_NUM_PREV_BUFFERS = Math.ceil(SPEECH_PAD_SAMPLES / NEW_BUFFER_SIZE);

// Model state
let sileroVad: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
let transcriber: Pipeline | null = null;
let isLoaded = false;
let currentModelId: string = '';

// VAD state
let state: Tensor = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
const sr = new Tensor('int64', [BigInt(SAMPLE_RATE)], []);
let pendingVadBuffer = new Float32Array(0);

// Audio buffering
const BUFFER = new Float32Array(MAX_BUFFER_DURATION * SAMPLE_RATE);
let bufferPointer = 0;
let isRecording = false;
let postSpeechSamples = 0;
let prevBuffers: Float32Array[] = [];

// Inference chain for sequential processing
let inferenceChain = Promise.resolve();

/**
 * Check if WebGPU is available
 */
async function supportsWebGPU(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Load the Moonshine model and Silero VAD
 */
async function loadModel(modelId: string): Promise<void> {
  if (isLoaded && currentModelId === modelId) {
    self.postMessage({ type: 'ready' });
    return;
  }

  self.postMessage({
    type: 'loading',
    message: 'Loading Moonshine models...',
  });

  try {
    const hasWebGPU = await supportsWebGPU();
    const device = hasWebGPU ? 'webgpu' : 'wasm';

    self.postMessage({
      type: 'info',
      message: `Using device: ${device}`,
    });

    // Progress callback
    const progressCallback = (progress: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
      if (progress.status === 'initiate') {
        self.postMessage({
          type: 'progress',
          status: 'initiate',
          file: progress.file,
        });
      } else if (progress.status === 'progress') {
        self.postMessage({
          type: 'progress',
          status: 'progress',
          file: progress.file,
          progress: progress.progress,
          loaded: progress.loaded,
          total: progress.total,
        });
      } else if (progress.status === 'done') {
        self.postMessage({
          type: 'progress',
          status: 'done',
          file: progress.file,
        });
      }
    };

    // Load Silero VAD
    self.postMessage({ type: 'loading', message: 'Loading Voice Activity Detection...' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sileroVad = await (AutoModel as any).from_pretrained('onnx-community/silero-vad', {
      config: { model_type: 'custom' },
      dtype: 'fp32',
      progress_callback: progressCallback,
    });

    // Load Moonshine ASR model
    self.postMessage({ type: 'loading', message: 'Loading Moonshine transcriber...' });
    const dtypeConfig = device === 'webgpu'
      ? { encoder_model: 'fp32' as const, decoder_model_merged: 'q4' as const }
      : { encoder_model: 'fp32' as const, decoder_model_merged: 'q8' as const };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcriber = await (pipeline as any)('automatic-speech-recognition', modelId, {
      device: device as 'webgpu' | 'wasm',
      dtype: dtypeConfig,
      progress_callback: progressCallback,
    });

    // Warm up the model
    self.postMessage({ type: 'loading', message: 'Warming up model...' });
    if (transcriber) {
      await transcriber(new Float32Array(SAMPLE_RATE));
    }

    currentModelId = modelId;
    isLoaded = true;

    // Reset state
    state = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
    BUFFER.fill(0);
    bufferPointer = 0;
    isRecording = false;
    postSpeechSamples = 0;
    prevBuffers = [];
    pendingVadBuffer = new Float32Array(0);

    self.postMessage({ type: 'ready' });
    self.postMessage({
      type: 'status',
      status: 'ready',
      message: 'Ready!',
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({
      type: 'error',
      message: `Failed to load model: ${errorMessage}`,
    });
    throw error;
  }
}

/**
 * Perform Voice Activity Detection on audio buffer
 */
async function vad(buffer: Float32Array): Promise<boolean> {
  if (!sileroVad) return false;

  const input = new Tensor('float32', buffer, [1, buffer.length]);

  const result = await (inferenceChain = inferenceChain.then(() =>
    sileroVad!({ input, sr, state })
  )) as { stateN: Tensor; output: { data: Float32Array } };

  state = result.stateN;
  const isSpeech = result.output.data[0];

  return (
    isSpeech > SPEECH_THRESHOLD ||
    (isRecording && isSpeech >= EXIT_THRESHOLD)
  );
}

/**
 * Transcribe audio buffer
 */
async function transcribe(buffer: Float32Array, data: { start: number; end: number; duration: number }): Promise<void> {
  if (!transcriber) return;

  try {
    const result = await (inferenceChain = inferenceChain.then(() =>
      transcriber!(buffer)
    )) as { text: string };

    self.postMessage({
      type: 'output',
      buffer,
      message: result.text,
      text: result.text,
      ...data,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({
      type: 'error',
      message: `Transcription failed: ${errorMessage}`,
    });
  }
}

/**
 * Reset audio buffer state
 */
function reset(offset = 0): void {
  self.postMessage({
    type: 'status',
    status: 'recording_end',
    message: 'Transcribing...',
    duration: 'until_next',
  });
  BUFFER.fill(0, offset);
  bufferPointer = offset;
  isRecording = false;
  postSpeechSamples = 0;
  pendingVadBuffer = new Float32Array(0);
}

/**
 * Dispatch audio for transcription and reset buffer
 */
function dispatchForTranscriptionAndResetAudioBuffer(overflow?: Float32Array): void {
  const now = Date.now();
  const end = now - ((postSpeechSamples + SPEECH_PAD_SAMPLES) / SAMPLE_RATE) * 1000;
  const start = end - (bufferPointer / SAMPLE_RATE) * 1000;
  const duration = end - start;
  const overflowLength = overflow?.length ?? 0;

  // Get buffer with padding
  const buffer = BUFFER.slice(0, bufferPointer + SPEECH_PAD_SAMPLES);

  // Add previous buffers for context
  const prevLength = prevBuffers.reduce((acc, b) => acc + b.length, 0);
  const paddedBuffer = new Float32Array(prevLength + buffer.length);
  let offset = 0;
  for (const prev of prevBuffers) {
    paddedBuffer.set(prev, offset);
    offset += prev.length;
  }
  paddedBuffer.set(buffer, offset);

  transcribe(paddedBuffer, { start, end, duration });

  // Set overflow and reset
  if (overflow) {
    BUFFER.set(overflow, 0);
  }
  reset(overflowLength);
}

/**
 * Process incoming audio buffer
 */
function splitVadBuffer(buffer: Float32Array): Float32Array[] {
  if (buffer.length === 0) return [];
  if (pendingVadBuffer.length === 0 && buffer.length === NEW_BUFFER_SIZE) {
    return [buffer];
  }

  const combined = new Float32Array(pendingVadBuffer.length + buffer.length);
  if (pendingVadBuffer.length > 0) {
    combined.set(pendingVadBuffer, 0);
  }
  combined.set(buffer, pendingVadBuffer.length);

  const chunks: Float32Array[] = [];
  let offset = 0;
  while (offset + NEW_BUFFER_SIZE <= combined.length) {
    chunks.push(combined.subarray(offset, offset + NEW_BUFFER_SIZE));
    offset += NEW_BUFFER_SIZE;
  }

  pendingVadBuffer = combined.subarray(offset);
  return chunks;
}

async function processAudioChunk(buffer: Float32Array): Promise<void> {
  if (!isLoaded || !sileroVad || !transcriber) {
    return;
  }

  const wasRecording = isRecording;
  let isSpeech = false;
  try {
    isSpeech = await vad(buffer);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({
      type: 'error',
      message: `VAD failed: ${errorMessage}`,
    });
    reset();
    return;
  }

  if (!wasRecording && !isSpeech) {
    // Not recording and not speech - add to previous buffers FIFO
    if (prevBuffers.length >= MAX_NUM_PREV_BUFFERS) {
      prevBuffers.shift();
    }
    prevBuffers.push(buffer);
    return;
  }

  const remaining = BUFFER.length - bufferPointer;
  if (buffer.length >= remaining) {
    // Buffer full - transcribe
    BUFFER.set(buffer.subarray(0, remaining), bufferPointer);
    bufferPointer += remaining;

    const overflow = buffer.subarray(remaining);
    dispatchForTranscriptionAndResetAudioBuffer(overflow);
    return;
  } else {
    // Add to buffer
    BUFFER.set(buffer, bufferPointer);
    bufferPointer += buffer.length;
  }

  if (isSpeech) {
    if (!isRecording) {
      self.postMessage({
        type: 'status',
        status: 'recording_start',
        message: 'Listening...',
        duration: 'until_next',
      });
    }
    isRecording = true;
    postSpeechSamples = 0;
    return;
  }

  postSpeechSamples += buffer.length;

  // Check if silence is long enough to end recording
  if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
    return;
  }

  if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
    // Too short - discard
    reset();
    return;
  }

  dispatchForTranscriptionAndResetAudioBuffer();
}

async function processAudioBuffer(buffer: Float32Array): Promise<void> {
  if (!isLoaded || !sileroVad || !transcriber) {
    return;
  }

  const chunks = splitVadBuffer(buffer);
  for (const chunk of chunks) {
    await processAudioChunk(chunk);
  }
}

/**
 * Transcribe audio directly (without VAD, for chunked input)
 */
async function transcribeDirect(audio: Float32Array): Promise<void> {
  if (!isLoaded || !transcriber) {
    self.postMessage({
      type: 'error',
      message: 'Model not loaded. Please load the model first.',
    });
    return;
  }

  self.postMessage({ type: 'start' });

  try {
    const result = await transcriber(audio) as { text: string };
    
    self.postMessage({
      type: 'complete',
      text: result.text,
      output: result.text,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({
      type: 'error',
      message: `Transcription failed: ${errorMessage}`,
    });
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'load':
      await loadModel(data.modelId);
      break;

    case 'buffer':
      // Process audio buffer with VAD
      await processAudioBuffer(data.buffer);
      break;

    case 'transcribe':
      // Direct transcription without VAD
      await transcribeDirect(data.audio);
      break;

    case 'reset':
      // Reset VAD state
      state = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
      BUFFER.fill(0);
      bufferPointer = 0;
      isRecording = false;
      postSpeechSamples = 0;
      prevBuffers = [];
      pendingVadBuffer = new Float32Array(0);
      self.postMessage({ type: 'reset_complete' });
      break;

    case 'unload':
      sileroVad = null;
      transcriber = null;
      isLoaded = false;
      currentModelId = '';
      pendingVadBuffer = new Float32Array(0);
      self.postMessage({ type: 'unloaded' });
      break;
  }
});

// Export for TypeScript
export {};

/**
 * Whisper Transcription Web Worker
 *
 * Handles offline Whisper model inference in a separate thread.
 * Uses @huggingface/transformers for model loading and inference.
 */

import {
  AutoTokenizer,
  AutoProcessor,
  WhisperForConditionalGeneration,
  TextStreamer,
  full,
  PreTrainedTokenizer,
  Processor,
} from '@huggingface/transformers';
import { configureTransformersEnv } from '../utils/transformersEnv';

const MAX_NEW_TOKENS = 64;

configureTransformersEnv();

// Model state
let tokenizer: PreTrainedTokenizer | null = null;
let processor: Processor | null = null;
let model: WhisperForConditionalGeneration | null = null;
let isLoaded = false;
let isProcessing = false;

// Current model ID
let currentModelId: string = '';

// Track last output for incremental updates
let lastOutput: string = '';

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
 * Load the Whisper model
 */
async function loadModel(modelId: string): Promise<void> {
  if (isLoaded && currentModelId === modelId) {
    self.postMessage({ type: 'ready' });
    return;
  }

  self.postMessage({
    type: 'loading',
    message: 'Loading Whisper model...',
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

    // Load tokenizer
    self.postMessage({ type: 'loading', message: 'Loading tokenizer...' });
    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: progressCallback,
    });

    // Load processor
    self.postMessage({ type: 'loading', message: 'Loading processor...' });
    processor = await AutoProcessor.from_pretrained(modelId, {
      progress_callback: progressCallback,
    });

    // Load model
    self.postMessage({ type: 'loading', message: 'Loading model...' });
    model = await WhisperForConditionalGeneration.from_pretrained(modelId, {
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: device === 'webgpu' ? 'q4' : 'q8',
      },
      device: device as 'webgpu' | 'wasm',
      progress_callback: progressCallback,
    }) as WhisperForConditionalGeneration;

    // Warm up the model
    self.postMessage({ type: 'loading', message: 'Warming up model...' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (model as any).generate({
      input_features: full([1, 80, 3000], 0.0),
      max_new_tokens: 1,
    });

    currentModelId = modelId;
    isLoaded = true;
    self.postMessage({ type: 'ready' });

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
 * Transcribe audio data
 */
async function transcribe(audio: Float32Array, language: string = 'en'): Promise<void> {
  if (!isLoaded || !tokenizer || !processor || !model) {
    self.postMessage({
      type: 'error',
      message: 'Model not loaded. Please load the model first.',
    });
    return;
  }

  if (isProcessing) {
    console.warn('Already processing, skipping...');
    return;
  }

  isProcessing = true;
  self.postMessage({ type: 'start' });

  try {
    // Reset last output for this transcription session
    lastOutput = '';
    
    let startTime: number | null = null;
    let numTokens = 0;
    let tps = 0;

    const tokenCallbackFunction = () => {
      if (startTime === null) {
        startTime = performance.now();
      }
      numTokens++;
      if (numTokens > 1) {
        tps = (numTokens / (performance.now() - startTime)) * 1000;
      }
    };

    const callbackFunction = (output: string) => {
      // Extract only the new portion by comparing with last output
      const newText = output.startsWith(lastOutput) 
        ? output.slice(lastOutput.length).trim()
        : output.trim();
      
      // Only send update if there's new text
      if (newText) {
        lastOutput = output;
        self.postMessage({
          type: 'update',
          output: newText, // Send only the new chunk
          tps,
          numTokens,
        });
      }
    };

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: callbackFunction,
      token_callback_function: tokenCallbackFunction,
    });

    const inputs = await processor(audio);

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: MAX_NEW_TOKENS,
      language,
      streamer,
    });

    const decoded = tokenizer.batch_decode(outputs as unknown as number[][], {
      skip_special_tokens: true,
    });

    const finalText = Array.isArray(decoded) ? decoded.join(' ').trim() : String(decoded).trim();
    
    // Extract any remaining text that wasn't sent in updates
    const remainingText = finalText.startsWith(lastOutput)
      ? finalText.slice(lastOutput.length).trim()
      : finalText.trim();
    
    // Reset last output for next transcription
    lastOutput = '';

    self.postMessage({
      type: 'complete',
      output: decoded,
      text: finalText,
      remainingText: remainingText || undefined, // Send any remaining text if there's a gap
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    lastOutput = ''; // Reset on error
    self.postMessage({
      type: 'error',
      message: `Transcription failed: ${errorMessage}`,
    });
  } finally {
    isProcessing = false;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'load':
      await loadModel(data.modelId);
      break;

    case 'transcribe':
      await transcribe(data.audio, data.language || 'en');
      break;

    case 'unload':
      tokenizer = null;
      processor = null;
      model = null;
      isLoaded = false;
      currentModelId = '';
      self.postMessage({ type: 'unloaded' });
      break;
  }
});

// Export for TypeScript
export {};

/**
 * Offline Model Management Service
 *
 * Handles downloading, caching, and managing offline transcription models
 * using @huggingface/transformers library.
 *
 * Models are cached in the browser's Cache Storage / IndexedDB automatically
 * by the transformers.js library.
 */

import { OfflineModelInfo, AVAILABLE_OFFLINE_MODELS } from '../types/smartVerses';

// Storage key for tracking downloaded models
const DOWNLOADED_MODELS_KEY = 'proassist-offline-models-downloaded';

// Event types for model management
export interface ModelDownloadProgress {
  modelId: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}

export interface ModelDownloadCallbacks {
  onProgress?: (progress: ModelDownloadProgress) => void;
  onFileStart?: (file: string) => void;
  onFileDone?: (file: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Check if WebGPU is available in the current environment
 */
export async function supportsWebGPU(): Promise<boolean> {
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
 * Get the list of downloaded model IDs from localStorage
 */
export function getDownloadedModelIds(): string[] {
  try {
    const stored = localStorage.getItem(DOWNLOADED_MODELS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('Failed to read downloaded models:', err);
  }
  return [];
}

/**
 * Mark a model as downloaded in localStorage
 */
export function markModelAsDownloaded(modelId: string): void {
  try {
    const downloaded = getDownloadedModelIds();
    if (!downloaded.includes(modelId)) {
      downloaded.push(modelId);
      localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify(downloaded));
    }
  } catch (err) {
    console.error('Failed to mark model as downloaded:', err);
  }
}

/**
 * Remove a model from the downloaded list
 */
export function markModelAsRemoved(modelId: string): void {
  try {
    const downloaded = getDownloadedModelIds();
    const filtered = downloaded.filter(id => id !== modelId);
    localStorage.setItem(DOWNLOADED_MODELS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to mark model as removed:', err);
  }
}

/**
 * Check if a specific model is downloaded
 */
export function isModelDownloaded(modelId: string): boolean {
  return getDownloadedModelIds().includes(modelId);
}

/**
 * Get all available models with their download status
 */
export function getAvailableModels(): OfflineModelInfo[] {
  const downloaded = getDownloadedModelIds();
  return AVAILABLE_OFFLINE_MODELS.map(model => ({
    ...model,
    isDownloaded: downloaded.includes(model.modelId),
  }));
}

/**
 * Get downloaded models of a specific type
 */
export function getDownloadedModelsByType(type: 'whisper' | 'moonshine'): OfflineModelInfo[] {
  return getAvailableModels().filter(m => m.type === type && m.isDownloaded);
}

/**
 * Download a model (preload it into cache)
 * This triggers the transformers.js to download and cache the model files
 */
export async function downloadModel(
  modelId: string,
  callbacks: ModelDownloadCallbacks = {}
): Promise<void> {
  const model = AVAILABLE_OFFLINE_MODELS.find(m => m.modelId === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  console.log(`📥 Starting download of model: ${modelId}`);

  try {
    // Dynamic import to avoid loading transformers.js until needed
    const [
      { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, AutoModel, pipeline },
      { configureTransformersEnv },
    ] = await Promise.all([
      import('@huggingface/transformers'),
      import('../utils/transformersEnv'),
    ]);

    configureTransformersEnv();

    // Determine device based on WebGPU support
    const hasWebGPU = await supportsWebGPU();
    const device = hasWebGPU ? 'webgpu' : 'wasm';
    console.log(`🔧 Using device: ${device}`);

    // Progress callback adapter for transformers.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progressCallback = (progressData: any) => {
      if (progressData.status === 'initiate' && progressData.file) {
        callbacks.onFileStart?.(progressData.file);
      } else if (progressData.status === 'progress' && progressData.progress !== undefined) {
        callbacks.onProgress?.({
          modelId,
          file: progressData.file || '',
          progress: progressData.progress,
          loaded: progressData.loaded || 0,
          total: progressData.total || 0,
        });
      } else if (progressData.status === 'done' && progressData.file) {
        callbacks.onFileDone?.(progressData.file);
      }
    };

    if (model.type === 'whisper') {
      // For Whisper models, we need tokenizer, processor, and model
      console.log('📦 Loading Whisper tokenizer...');
      await AutoTokenizer.from_pretrained(modelId, {
        progress_callback: progressCallback,
      });

      console.log('📦 Loading Whisper processor...');
      await AutoProcessor.from_pretrained(modelId, {
        progress_callback: progressCallback,
      });

      console.log('📦 Loading Whisper model...');
      await WhisperForConditionalGeneration.from_pretrained(modelId, {
        dtype: {
          encoder_model: 'fp32' as const,
          decoder_model_merged: device === 'webgpu' ? 'q4' as const : 'q8' as const,
        },
        device: device as 'webgpu' | 'wasm',
        progress_callback: progressCallback,
      });
    } else if (model.type === 'moonshine') {
      // For Moonshine, we use the ASR pipeline which handles all components
      console.log('📦 Loading Moonshine model via pipeline...');
      
      // First load the VAD model (Silero VAD)
      console.log('📦 Loading Silero VAD...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (AutoModel as any).from_pretrained('onnx-community/silero-vad', {
        config: { model_type: 'custom' },
        dtype: 'fp32',
        progress_callback: progressCallback,
      });

      // Then load the Moonshine model
      const dtypeConfig = device === 'webgpu' 
        ? { encoder_model: 'fp32' as const, decoder_model_merged: 'q4' as const }
        : { encoder_model: 'fp32' as const, decoder_model_merged: 'q8' as const };

      await pipeline('automatic-speech-recognition', modelId, {
        device: device as 'webgpu' | 'wasm',
        dtype: dtypeConfig,
        progress_callback: progressCallback,
      });
    }

    // Mark as downloaded
    markModelAsDownloaded(modelId);
    console.log(`✅ Model ${modelId} downloaded successfully`);
    callbacks.onComplete?.();

  } catch (error) {
    console.error(`❌ Failed to download model ${modelId}:`, error);
    callbacks.onError?.(error as Error);
    throw error;
  }
}

/**
 * Delete a model from cache
 * Note: transformers.js caches models in Cache Storage/IndexedDB
 * This attempts to clear them but may not fully remove all files
 */
export async function deleteModel(modelId: string): Promise<void> {
  console.log(`🗑️ Attempting to delete model: ${modelId}`);
  
  try {
    // Try to clear from Cache Storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        // transformers.js uses cache names containing 'transformers'
        if (cacheName.includes('transformers') || cacheName.includes('huggingface')) {
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          for (const request of keys) {
            if (request.url.includes(modelId.replace('/', '%2F')) || request.url.includes(modelId)) {
              await cache.delete(request);
              console.log(`Deleted cache entry: ${request.url}`);
            }
          }
        }
      }
    }

    // Try to clear from IndexedDB
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name && (db.name.includes('transformers') || db.name.includes('huggingface'))) {
        // We can't selectively delete from IndexedDB without opening the database
        // Just log for now
        console.log(`Found IndexedDB database: ${db.name}`);
      }
    }

    // Remove from our tracking
    markModelAsRemoved(modelId);
    console.log(`✅ Model ${modelId} removed from tracking`);

  } catch (error) {
    console.error(`❌ Failed to delete model ${modelId}:`, error);
    throw error;
  }
}

/**
 * Get estimated storage used by offline models
 */
export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    }
  } catch (error) {
    console.error('Failed to get storage estimate:', error);
  }
  return null;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

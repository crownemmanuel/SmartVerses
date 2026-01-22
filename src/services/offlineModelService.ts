/**
 * Offline Model Management Service
 *
 * Handles downloading, caching, and managing offline transcription models.
 * 
 * For LLM models: Uses ONNX Runtime in Rust backend (no browser-based loading)
 * For Whisper/Moonshine: Uses @huggingface/transformers library in browser
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
  const model = AVAILABLE_OFFLINE_MODELS.find(
    (m) => m.id === modelId || m.modelPath === modelId
  );
  if (model) {
    return getDownloadedModelIds().includes(model.id);
  }
  return getDownloadedModelIds().includes(modelId);
}

/**
 * Get all available models with their download status
 */
export function getAvailableModels(): OfflineModelInfo[] {
  const downloaded = getDownloadedModelIds();
  return AVAILABLE_OFFLINE_MODELS.map(model => ({
    ...model,
    isDownloaded: downloaded.includes(model.id),
  }));
}

/**
 * Get downloaded models of a specific type
 */
export function getDownloadedModelsByType(type: 'whisper' | 'moonshine' | 'llm'): OfflineModelInfo[] {
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
  const model = AVAILABLE_OFFLINE_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  console.log(`📥 Starting download of model: ${modelId}`);

  try {
    // For LLM models, they use ONNX Runtime in Rust backend
    if (model.type === 'llm') {
      console.log(`[Download] LLM model detected, using filesystem download`);
      if (!model.modelUrl || !model.modelPath) {
        throw new Error("Missing model URL/path for LLM download");
      }

      const fs = await import("@tauri-apps/plugin-fs");
      const pathApi = await import("@tauri-apps/api/path");
      const baseDir = await pathApi.appDataDir();

      const resolveStoragePath = async (relativePath: string) =>
        pathApi.join(baseDir, "offline-models", relativePath);

      const ensureDir = async (relativePath: string) => {
        const parts = relativePath.split("/").slice(0, -1);
        if (parts.length === 0) return;
        const dirPath = await pathApi.join(baseDir, "offline-models", parts.join("/"));
        try {
          // Try to create directory - mkdir with recursive will succeed even if it exists
          await fs.mkdir(dirPath, { recursive: true });
        } catch (err: any) {
          console.error("Failed to ensure directory:", dirPath, err);
          // Check if directory actually exists (might have been created by another process)
          try {
            await fs.stat(dirPath);
            // Directory exists, we're good
            return;
          } catch (statErr) {
            // Directory doesn't exist and creation failed
            const errorMsg = err?.message || String(err);
            if (!errorMsg.includes('already exists') && !errorMsg.includes('exists') && !errorMsg.includes('EEXIST')) {
              throw new Error(`Failed to create directory ${dirPath}: ${errorMsg}`);
            }
          }
        }
      };

      const downloadFile = async (url: string, relativePath: string) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
        }

        const fileName = url.split("/").pop()?.split("?")[0] || "download.bin";
        callbacks.onFileStart?.(fileName);

        const total = Number(response.headers.get("content-length")) || 0;
        const reader = response.body?.getReader();
        const targetPath = await resolveStoragePath(relativePath);

        await ensureDir(relativePath);
        // No need to create empty file - writeFile will create it

        let loaded = 0;
        if (!reader) {
          const buffer = new Uint8Array(await response.arrayBuffer());
          loaded = buffer.length;
          try {
            await fs.writeFile(targetPath, buffer);
          } catch (writeErr: any) {
            console.error("Failed to write file:", targetPath, writeErr);
            throw new Error(`Failed to write file ${targetPath}: ${writeErr?.message || writeErr}`);
          }
          callbacks.onProgress?.({
            modelId,
            file: fileName,
            progress: total ? (loaded / total) * 100 : 100,
            loaded,
            total,
          });
        } else {
          // For streaming, collect all chunks first, then write once
          // This is more efficient than read-append-write cycles
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              loaded += value.length;
              callbacks.onProgress?.({
                modelId,
                file: fileName,
                progress: total ? (loaded / total) * 100 : 0,
                loaded,
                total,
              });
            }
          }
          // Combine all chunks and write once
          if (chunks.length > 0) {
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }
            try {
              await fs.writeFile(targetPath, combined);
            } catch (writeErr: any) {
              console.error("Failed to write file:", targetPath, writeErr);
              throw new Error(`Failed to write file ${targetPath}: ${writeErr?.message || writeErr}`);
            }
          }
        }

        callbacks.onFileDone?.(fileName);
      };

      console.log(`[Download] Starting download of model file: ${model.modelUrl}`);
      console.log(`[Download] Starting download of model file: ${model.modelUrl}`);
      await downloadFile(model.modelUrl, model.modelPath);
      
      if (model.tokenizerUrl && model.tokenizerPath) {
        console.log(`[Download] Starting download of tokenizer file: ${model.tokenizerUrl}`);
        try {
          await downloadFile(model.tokenizerUrl, model.tokenizerPath);
          console.log(`[Download] Tokenizer downloaded successfully`);
        } catch (tokenizerErr) {
          console.error(`[Download] Failed to download tokenizer:`, tokenizerErr);
          // Continue - tokenizer is optional, but warn the user
          callbacks.onError?.(new Error(`Model downloaded but tokenizer failed: ${tokenizerErr instanceof Error ? tokenizerErr.message : String(tokenizerErr)}. The model may not work without a valid tokenizer.`));
        }
      }

      console.log(`[Download] Model download completed successfully`);
      markModelAsDownloaded(modelId);
      callbacks.onComplete?.();
      return;
    }

    // Dynamic import to avoid loading transformers.js until needed (only for Whisper/Moonshine)
    const { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, AutoModel, pipeline } = await import('@huggingface/transformers');

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
      // Use modelPath which contains the HuggingFace model ID for Whisper/Moonshine
      const modelPath = model.modelPath;
      console.log('📦 Loading Whisper tokenizer...');
      await AutoTokenizer.from_pretrained(modelPath, {
        progress_callback: progressCallback,
      });

      console.log('📦 Loading Whisper processor...');
      await AutoProcessor.from_pretrained(modelPath, {
        progress_callback: progressCallback,
      });

      console.log('📦 Loading Whisper model...');
      await WhisperForConditionalGeneration.from_pretrained(modelPath, {
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

      // Use modelPath which contains the HuggingFace model ID for Whisper/Moonshine
      const modelPath = model.modelPath;
      await pipeline('automatic-speech-recognition', modelPath, {
        device: device as 'webgpu' | 'wasm',
        dtype: dtypeConfig,
        progress_callback: progressCallback,
      });
    } else if (model.type === 'llm') {
      // LLM models are handled by the Rust backend using ONNX Runtime
      // We just need to download the ONNX model files to local storage
      console.log('📦 LLM models use ONNX Runtime in Rust backend');
      console.log('📦 Model will be loaded via Tauri commands (llm_load_model)');
      console.log('📦 For now, mark model as available - actual download should be handled separately');
      
      // Note: ONNX model download should be implemented separately
      // For now, we'll just mark it as downloaded if the model path exists
      // The actual ONNX model files should be downloaded via a Tauri command
      // or through a separate download mechanism
    }

    // Mark as downloaded
    markModelAsDownloaded(modelId);
    console.log(`✅ Model ${modelId} downloaded successfully`);
    callbacks.onComplete?.();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorObj = error instanceof Error ? error : new Error(errorMessage);
    console.error(`❌ Failed to download model ${modelId}:`, error);
    console.error(`❌ Error details:`, {
      message: errorMessage,
      stack: errorObj.stack,
      name: errorObj.name,
    });
    callbacks.onError?.(errorObj);
    throw errorObj;
  }
}

/**
 * Delete a model from cache
 * Note: 
 * - For Whisper/Moonshine: transformers.js caches models in Cache Storage/IndexedDB
 * - For LLM: Models are stored in filesystem (managed by Rust backend)
 */
export async function deleteModel(modelId: string): Promise<void> {
  console.log(`🗑️ Attempting to delete model: ${modelId}`);
  
  const model = AVAILABLE_OFFLINE_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  try {
    // For LLM models, they're managed by Rust backend
    if (model.type === 'llm') {
      const fs = await import("@tauri-apps/plugin-fs");
      const pathApi = await import("@tauri-apps/api/path");
      const baseDir = await pathApi.appDataDir();

      const resolveStoragePath = async (relativePath: string) =>
        pathApi.join(baseDir, "offline-models", relativePath);

      const removeFileSafe = async (relativePath?: string) => {
        if (!relativePath) return;
        const targetPath = await resolveStoragePath(relativePath);
        try {
          await fs.remove(targetPath);
        } catch (err) {
          console.warn("Failed to remove file:", targetPath, err);
        }
      };

      await removeFileSafe(model.modelPath);
      await removeFileSafe(model.tokenizerPath);

      // Remove from our tracking
      markModelAsRemoved(modelId);
      console.log(`✅ Model ${modelId} removed from tracking`);
      return;
    }

    // For Whisper/Moonshine, clear from browser cache
    // Use modelPath which contains the HuggingFace model ID
    const modelPath = model.modelPath;
    // Try to clear from Cache Storage
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        // transformers.js uses cache names containing 'transformers'
        if (cacheName.includes('transformers') || cacheName.includes('huggingface')) {
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          for (const request of keys) {
            if (request.url.includes(modelPath.replace('/', '%2F')) || request.url.includes(modelPath)) {
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

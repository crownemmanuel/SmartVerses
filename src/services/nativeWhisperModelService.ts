import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

export type NativeWhisperModelTier = "small" | "medium" | "large";

export interface NativeWhisperModelInfo {
  id: string;
  name: string;
  tier: NativeWhisperModelTier;
  fileName: string;
  size: string;
  description: string;
  url: string;
  language: "en";
}

export const NATIVE_WHISPER_MODELS: NativeWhisperModelInfo[] = [
  {
    id: "whisper-native-small",
    name: "Whisper Small",
    tier: "small",
    fileName: "ggml-small.en-q5_1.bin",
    size: "~190MB",
    description: "Fast, English-only, good for real-time use.",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin",
    language: "en",
  },
  {
    id: "whisper-native-medium",
    name: "Whisper Medium",
    tier: "medium",
    fileName: "ggml-medium.en-q5_0.bin",
    size: "~500MB",
    description: "Better accuracy, still usable live.",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en-q5_0.bin",
    language: "en",
  },
  {
    id: "whisper-native-large",
    name: "Whisper Large v2",
    tier: "large",
    fileName: "ggml-large-v2-q5_0.bin",
    size: "~1.0GB",
    description: "Highest accuracy, largest download.",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v2-q5_0.bin",
    language: "en",
  },
];

export interface NativeWhisperDownloadProgress {
  file_name: string;
  downloaded: number;
  total?: number;
  progress?: number;
}

export interface NativeWhisperDownloadCallbacks {
  onProgress?: (progress: NativeWhisperDownloadProgress) => void;
  onComplete?: (path: string) => void;
  onError?: (error: Error) => void;
}

const DOWNLOAD_EVENT = "native_whisper_model_download_progress";

export async function resolveNativeWhisperModelPath(
  fileName: string
): Promise<string> {
  const base = await appDataDir();
  return await join(base, "models", "whisper", fileName);
}

export async function isNativeWhisperModelDownloaded(
  fileName: string
): Promise<boolean> {
  try {
    return await invoke<boolean>("native_whisper_model_exists", { fileName });
  } catch {
    return false;
  }
}

export async function downloadNativeWhisperModel(
  model: NativeWhisperModelInfo,
  callbacks: NativeWhisperDownloadCallbacks = {}
): Promise<string> {
  const { listen } = await import("@tauri-apps/api/event");
  let unlisten: null | (() => void) = null;

  try {
    unlisten = await listen<NativeWhisperDownloadProgress>(DOWNLOAD_EVENT, (evt) => {
      if (evt.payload.file_name !== model.fileName) return;
      callbacks.onProgress?.(evt.payload);
    });

    const path = await invoke<string>("download_native_whisper_model", {
      url: model.url,
      fileName: model.fileName,
    });

    callbacks.onComplete?.(path);
    return path;
  } catch (error) {
    callbacks.onError?.(error as Error);
    throw error;
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

export async function deleteNativeWhisperModel(
  fileName: string
): Promise<void> {
  const fs = await import("@tauri-apps/plugin-fs");
  const path = await resolveNativeWhisperModelPath(fileName);
  if (await fs.exists(path)) {
    await fs.remove(path);
  }
}

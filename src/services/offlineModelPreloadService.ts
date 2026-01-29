import {
  AVAILABLE_OFFLINE_MODELS,
  OfflineModelInfo,
} from "../types/smartVerses";
import {
  downloadModel,
  isModelDownloaded,
  ModelDownloadCallbacks,
  ModelDownloadProgress,
} from "./offlineModelService";

export type OfflineModelPreloadSource = "settings" | "startup" | "manual";
export type OfflineModelPreloadPhase = "starting" | "downloading" | "ready" | "error";

export type OfflineModelPreloadStatus = {
  modelId: string;
  modelName: string;
  modelType: OfflineModelInfo["type"];
  phase: OfflineModelPreloadPhase;
  progress: number;
  file?: string;
  error?: string;
  source: OfflineModelPreloadSource;
};

type OfflineModelListener = (status: OfflineModelPreloadStatus | null) => void;

type InFlightDownload = {
  promise: Promise<void>;
  callbacks: Set<ModelDownloadCallbacks>;
  lastProgress?: ModelDownloadProgress;
  currentFile?: string;
  modelInfo: OfflineModelInfo;
  source: OfflineModelPreloadSource;
};

const listeners = new Set<OfflineModelListener>();
const inFlight = new Map<string, InFlightDownload>();
let currentStatus: OfflineModelPreloadStatus | null = null;

function emitStatus(status: OfflineModelPreloadStatus | null): void {
  currentStatus = status;
  listeners.forEach((listener) => listener(status));
}

function clampProgress(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function buildStatus(
  modelInfo: OfflineModelInfo,
  source: OfflineModelPreloadSource,
  phase: OfflineModelPreloadPhase,
  progress: number,
  file?: string,
  error?: string
): OfflineModelPreloadStatus {
  return {
    modelId: modelInfo.modelId,
    modelName: modelInfo.name,
    modelType: modelInfo.type,
    phase,
    progress: clampProgress(progress),
    file,
    error,
    source,
  };
}

export function subscribeOfflineModelPreload(
  listener: OfflineModelListener
): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export function getOfflineModelPreloadStatus(): OfflineModelPreloadStatus | null {
  return currentStatus;
}

export async function preloadOfflineModel(params: {
  modelId: string;
  source: OfflineModelPreloadSource;
  callbacks?: ModelDownloadCallbacks;
  force?: boolean;
}): Promise<void> {
  const { modelId, source, callbacks, force = false } = params;
  const modelInfo = AVAILABLE_OFFLINE_MODELS.find((model) => model.modelId === modelId);
  if (!modelInfo) {
    throw new Error(`Unknown offline model: ${modelId}`);
  }

  const existing = inFlight.get(modelId);
  if (existing) {
    if (callbacks) {
      existing.callbacks.add(callbacks);
      if (existing.currentFile) {
        callbacks.onFileStart?.(existing.currentFile);
      }
      if (existing.lastProgress) {
        callbacks.onProgress?.(existing.lastProgress);
      }
    }
    return existing.promise;
  }

  if (!force && isModelDownloaded(modelId)) {
    emitStatus(buildStatus(modelInfo, source, "ready", 100));
    callbacks?.onComplete?.();
    return;
  }

  emitStatus(buildStatus(modelInfo, source, "starting", 0));

  const callbackSet = new Set<ModelDownloadCallbacks>();
  if (callbacks) {
    callbackSet.add(callbacks);
  }

  const inFlightDownload: InFlightDownload = {
    promise: Promise.resolve(),
    callbacks: callbackSet,
    modelInfo,
    source,
  };

  const downloadPromise = downloadModel(modelId, {
    onFileStart: (file) => {
      inFlightDownload.currentFile = file;
      emitStatus(buildStatus(modelInfo, source, "downloading", 0, file));
      callbackSet.forEach((cb) => cb.onFileStart?.(file));
    },
    onProgress: (progress) => {
      inFlightDownload.lastProgress = progress;
      const pct = clampProgress(progress.progress);
      const file = progress.file || inFlightDownload.currentFile;
      if (progress.file) {
        inFlightDownload.currentFile = progress.file;
      }
      emitStatus(buildStatus(modelInfo, source, "downloading", pct, file));
      callbackSet.forEach((cb) => cb.onProgress?.(progress));
    },
    onFileDone: (file) => {
      callbackSet.forEach((cb) => cb.onFileDone?.(file));
    },
    onComplete: () => {
      emitStatus(buildStatus(modelInfo, source, "ready", 100, inFlightDownload.currentFile));
      callbackSet.forEach((cb) => cb.onComplete?.());
    },
    onError: (error) => {
      emitStatus(
        buildStatus(
          modelInfo,
          source,
          "error",
          inFlightDownload.lastProgress?.progress ?? 0,
          inFlightDownload.currentFile,
          error.message
        )
      );
      callbackSet.forEach((cb) => cb.onError?.(error));
    },
  });

  inFlightDownload.promise = downloadPromise;
  inFlight.set(modelId, inFlightDownload);

  try {
    await downloadPromise;
  } finally {
    inFlight.delete(modelId);
  }
}

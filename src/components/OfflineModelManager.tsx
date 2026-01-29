/**
 * Offline Model Manager Modal
 *
 * Allows users to download, manage, and delete offline transcription models
 * for Whisper and Moonshine.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  FaDownload,
  FaTrash,
  FaCheck,
  FaSpinner,
  FaTimes,
  FaMicrochip,
  FaCloud,
  FaDatabase,
} from "react-icons/fa";
import {
  OfflineModelInfo,
  AVAILABLE_OFFLINE_MODELS,
} from "../types/smartVerses";
import {
  getDownloadedModelIds,
  deleteModel,
  supportsWebGPU,
  getStorageEstimate,
  formatBytes,
  ModelDownloadProgress,
} from "../services/offlineModelService";
import { preloadOfflineModel } from "../services/offlineModelPreloadService";
import {
  NATIVE_WHISPER_MODELS,
  NativeWhisperModelInfo,
  downloadNativeWhisperModel,
  deleteNativeWhisperModel,
  isNativeWhisperModelDownloaded,
} from "../services/nativeWhisperModelService";
import { isDevModeEnabled } from "../utils/devFlags";

interface OfflineModelManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onModelDownloaded?: (modelId: string) => void;
  onModelDeleted?: (modelId: string) => void;
}

type ManagedModel = {
  id: string;
  name: string;
  size: string;
  description: string;
  isDownloaded: boolean;
};

type NativeModelWithStatus = NativeWhisperModelInfo & {
  isDownloaded: boolean;
};

const OfflineModelManager: React.FC<OfflineModelManagerProps> = ({
  isOpen,
  onClose,
  onModelDownloaded,
  onModelDeleted,
}) => {
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const isDevMode = isDevModeEnabled();
  const [models, setModels] = useState<OfflineModelInfo[]>([]);
  const [nativeModels, setNativeModels] = useState<NativeModelWithStatus[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());
  const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
  const [currentFile, setCurrentFile] = useState<Record<string, string>>({});
  const [nativeDownloadProgress, setNativeDownloadProgress] = useState<
    Record<string, number>
  >({});
  const [nativeDownloadingModels, setNativeDownloadingModels] = useState<Set<string>>(
    new Set()
  );
  const [nativeDeletingModels, setNativeDeletingModels] = useState<Set<string>>(new Set());
  const [nativeCurrentFile, setNativeCurrentFile] = useState<Record<string, string>>(
    {}
  );
  const [hasWebGPU, setHasWebGPU] = useState<boolean | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ used: number; quota: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshModels = useCallback(() => {
    const downloaded = getDownloadedModelIds();
    const availableModels =
      isMac && !isDevMode
        ? AVAILABLE_OFFLINE_MODELS.filter((model) => model.type !== "whisper")
        : AVAILABLE_OFFLINE_MODELS;
    setModels(
      availableModels.map((model) => ({
        ...model,
        isDownloaded: downloaded.includes(model.modelId),
      }))
    );
  }, [isMac, isDevMode]);

  const refreshNativeModels = useCallback(async () => {
    if (!isMac) {
      if (isDevMode) {
        setNativeModels(
          NATIVE_WHISPER_MODELS.map((model) => ({
            ...model,
            isDownloaded: false,
          }))
        );
      } else {
        setNativeModels([]);
      }
      return;
    }

    try {
      const entries = await Promise.all(
        NATIVE_WHISPER_MODELS.map(async (model) => ({
          ...model,
          isDownloaded: await isNativeWhisperModelDownloaded(model.fileName),
        }))
      );
      setNativeModels(entries);
    } catch (err) {
      console.error("Failed to refresh native Whisper models:", err);
    }
  }, [isMac, isDevMode]);

  // Load models and check WebGPU support
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      refreshModels();
      await refreshNativeModels();

      const webgpuSupport = await supportsWebGPU();
      setHasWebGPU(webgpuSupport);

      const storage = await getStorageEstimate();
      setStorageInfo(storage);
    };

    loadData();
  }, [isOpen, refreshModels, refreshNativeModels]);

  // Handle model download
  const handleDownload = useCallback(
    async (model: OfflineModelInfo) => {
      if (downloadingModels.has(model.modelId)) return;

      setError(null);
      setDownloadingModels((prev) => new Set(prev).add(model.modelId));
      setDownloadProgress((prev) => ({ ...prev, [model.modelId]: 0 }));

      try {
        await preloadOfflineModel({
          modelId: model.modelId,
          source: "manual",
          callbacks: {
            onProgress: (progress: ModelDownloadProgress) => {
              setDownloadProgress((prev) => ({
                ...prev,
                [model.modelId]: progress.progress,
              }));
            },
            onFileStart: (file: string) => {
              setCurrentFile((prev) => ({ ...prev, [model.modelId]: file }));
            },
            onFileDone: (file: string) => {
              console.log(`Downloaded: ${file}`);
            },
            onComplete: () => {
              refreshModels();
              onModelDownloaded?.(model.modelId);

              // Update storage info
              getStorageEstimate().then(setStorageInfo);
            },
            onError: (err: Error) => {
              setError(`Failed to download ${model.name}: ${err.message}`);
            },
          },
        });
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[model.modelId];
          return next;
        });
        setCurrentFile((prev) => {
          const next = { ...prev };
          delete next[model.modelId];
          return next;
        });
      }
    },
    [downloadingModels, refreshModels, onModelDownloaded]
  );

  const handleNativeDownload = useCallback(
    async (model: NativeModelWithStatus) => {
      if (nativeDownloadingModels.has(model.fileName)) return;

      setError(null);
      setNativeDownloadingModels((prev) => new Set(prev).add(model.fileName));
      setNativeDownloadProgress((prev) => ({ ...prev, [model.fileName]: 0 }));
      setNativeCurrentFile((prev) => ({ ...prev, [model.fileName]: model.fileName }));

      try {
        await downloadNativeWhisperModel(model, {
          onProgress: (progress) => {
            const percent =
              typeof progress.progress === "number"
                ? progress.progress
                : progress.total
                ? (progress.downloaded / progress.total) * 100
                : 0;
            const clamped = Math.max(0, Math.min(100, percent));
            setNativeDownloadProgress((prev) => ({
              ...prev,
              [model.fileName]: clamped,
            }));
            setNativeCurrentFile((prev) => ({
              ...prev,
              [model.fileName]: progress.file_name || model.fileName,
            }));
          },
          onComplete: () => {
            refreshNativeModels();
            onModelDownloaded?.(model.fileName);
          },
          onError: (err: Error) => {
            setError(`Failed to download ${model.name}: ${err.message}`);
          },
        });
      } catch (err) {
        console.error("Native download error:", err);
      } finally {
        setNativeDownloadingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.fileName);
          return next;
        });
        setNativeDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[model.fileName];
          return next;
        });
        setNativeCurrentFile((prev) => {
          const next = { ...prev };
          delete next[model.fileName];
          return next;
        });
      }
    },
    [nativeDownloadingModels, refreshNativeModels, onModelDownloaded]
  );

  // Handle model deletion
  const handleDelete = useCallback(
    async (model: OfflineModelInfo) => {
      if (
        !confirm(
          `Are you sure you want to delete "${model.name}"? This will remove the cached model files.`
        )
      ) {
        return;
      }

      setError(null);
      setDeletingModels((prev) => new Set(prev).add(model.modelId));

      try {
        await deleteModel(model.modelId);
        refreshModels();
        onModelDeleted?.(model.modelId);

        // Update storage info
        const storage = await getStorageEstimate();
        setStorageInfo(storage);
      } catch (err) {
        setError(
          `Failed to delete ${model.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      } finally {
        setDeletingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.modelId);
          return next;
        });
      }
    },
    [refreshModels, onModelDeleted]
  );

  const handleNativeDelete = useCallback(
    async (model: NativeModelWithStatus) => {
      if (
        !confirm(
          `Are you sure you want to delete "${model.name}"? This will remove the downloaded model file.`
        )
      ) {
        return;
      }

      setError(null);
      setNativeDeletingModels((prev) => new Set(prev).add(model.fileName));

      try {
        await deleteNativeWhisperModel(model.fileName);
        refreshNativeModels();
        onModelDeleted?.(model.fileName);
      } catch (err) {
        setError(
          `Failed to delete ${model.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      } finally {
        setNativeDeletingModels((prev) => {
          const next = new Set(prev);
          next.delete(model.fileName);
          return next;
        });
      }
    },
    [refreshNativeModels, onModelDeleted]
  );

  if (!isOpen) return null;

  const whisperModels = models.filter((m) => m.type === "whisper");
  const moonshineModels = models.filter((m) => m.type === "moonshine");
  const showNativeWhisperModels = isMac || isDevMode;
  const showOfflineWhisperModels = !isMac || isDevMode;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
          width: "90%",
          maxWidth: "700px",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-4)",
            borderBottom: "1px solid var(--app-border-color)",
            backgroundColor: "var(--app-header-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <FaDatabase />
            <h2 style={{ margin: 0 }}>Manage Offline Models</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "var(--spacing-2)",
              color: "var(--app-text-color)",
            }}
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "var(--spacing-4)",
          }}
        >
          {/* System Info */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--spacing-3)",
              marginBottom: "var(--spacing-4)",
            }}
          >
            {/* WebGPU Support */}
            <div
              style={{
                padding: "var(--spacing-3)",
                backgroundColor: "var(--app-header-bg)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaMicrochip />
                <span style={{ fontWeight: 600 }}>WebGPU Support</span>
              </div>
              <div
                style={{
                  color:
                    hasWebGPU === null
                      ? "var(--app-text-color-secondary)"
                      : hasWebGPU
                      ? "var(--success)"
                      : "var(--warning)",
                  fontSize: "0.9em",
                }}
              >
                {hasWebGPU === null
                  ? "Checking..."
                  : hasWebGPU
                  ? "Available (faster inference)"
                  : "Not available (using WASM fallback)"}
              </div>
            </div>

            {/* Storage Info */}
            <div
              style={{
                padding: "var(--spacing-3)",
                backgroundColor: "var(--app-header-bg)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaCloud />
                <span style={{ fontWeight: 600 }}>Cache Storage</span>
              </div>
              <div
                style={{
                  color: "var(--app-text-color-secondary)",
                  fontSize: "0.9em",
                }}
              >
                {storageInfo
                  ? `${formatBytes(storageInfo.used)} used of ${formatBytes(
                      storageInfo.quota
                    )}`
                  : "Checking..."}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "var(--spacing-3)",
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                borderRadius: "8px",
                marginBottom: "var(--spacing-4)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Whisper Models */}
          <div style={{ marginBottom: "var(--spacing-6)" }}>
            <h3
              style={{
                margin: "0 0 var(--spacing-3) 0",
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
              }}
            >
              <span>Whisper Models</span>
              <span
                style={{
                  fontSize: "0.75em",
                  color: "var(--app-text-color-secondary)",
                  fontWeight: "normal",
                }}
              >
                {isMac ? "(Native Whisper - macOS)" : "(OpenAI Whisper - multilingual)"}
              </span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
              {showNativeWhisperModels &&
                nativeModels.map((model) => (
                  <ModelCard
                    key={`native-${model.id}`}
                    model={model}
                    isDownloading={nativeDownloadingModels.has(model.fileName)}
                    isDeleting={nativeDeletingModels.has(model.fileName)}
                    progress={nativeDownloadProgress[model.fileName]}
                    currentFile={nativeCurrentFile[model.fileName]}
                    onDownload={() => handleNativeDownload(model)}
                    onDelete={() => handleNativeDelete(model)}
                    isActionDisabled={!isMac}
                    disabledLabel="Mac only"
                  />
                ))}
              {showOfflineWhisperModels &&
                whisperModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    isDownloading={downloadingModels.has(model.modelId)}
                    isDeleting={deletingModels.has(model.modelId)}
                    progress={downloadProgress[model.modelId]}
                    currentFile={currentFile[model.modelId]}
                    onDownload={() => handleDownload(model)}
                    onDelete={() => handleDelete(model)}
                  />
                ))}
            </div>
          </div>

          {/* Moonshine Models */}
          <div>
            <h3
              style={{
                margin: "0 0 var(--spacing-3) 0",
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
              }}
            >
              <span>Moonshine Models</span>
              <span
                style={{
                  fontSize: "0.75em",
                  color: "var(--app-text-color-secondary)",
                  fontWeight: "normal",
                }}
              >
                (Optimized for real-time)
              </span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
              {moonshineModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isDownloading={downloadingModels.has(model.modelId)}
                  isDeleting={deletingModels.has(model.modelId)}
                  progress={downloadProgress[model.modelId]}
                  currentFile={currentFile[model.modelId]}
                  onDownload={() => handleDownload(model)}
                  onDelete={() => handleDelete(model)}
                />
              ))}
            </div>
          </div>

          {/* Note */}
          <div
            style={{
              marginTop: "var(--spacing-4)",
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-header-bg)",
              borderRadius: "8px",
              fontSize: "0.85em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            <strong>Note:</strong> Downloaded models are cached on your computer
            and will persist across sessions. Models run entirely offline after
            download - no internet connection required for transcription.
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MODEL CARD COMPONENT
// =============================================================================

interface ModelCardProps {
  model: ManagedModel;
  isDownloading: boolean;
  isDeleting: boolean;
  isActionDisabled?: boolean;
  disabledLabel?: string;
  progress?: number;
  currentFile?: string;
  onDownload: () => void;
  onDelete: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isDownloading,
  isDeleting,
  isActionDisabled = false,
  disabledLabel = "Unavailable",
  progress,
  currentFile,
  onDownload,
  onDelete,
}) => {
  return (
    <div
      style={{
        padding: "var(--spacing-3)",
        backgroundColor: "var(--app-header-bg)",
        borderRadius: "8px",
        border: `1px solid ${
          model.isDownloaded ? "var(--success)" : "var(--app-border-color)"
        }`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--spacing-3)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
              marginBottom: "var(--spacing-1)",
            }}
          >
            <span style={{ fontWeight: 600 }}>{model.name}</span>
            <span
              style={{
                fontSize: "0.75em",
                color: "var(--app-text-color-secondary)",
                backgroundColor: "var(--app-bg-color)",
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              {model.size}
            </span>
            {model.isDownloaded && !isDeleting && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75em",
                  color: "var(--success)",
                }}
              >
                <FaCheck size={10} />
                Downloaded
              </span>
            )}
            {isDeleting && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.75em",
                  color: "var(--warning)",
                }}
              >
                <FaSpinner size={10} style={{ animation: "spin 1s linear infinite" }} />
                Removing...
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "0.85em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            {model.description}
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          {isDeleting ? (
            <button
              className="secondary btn-sm"
              disabled
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--warning)",
              }}
            >
              <FaSpinner size={12} style={{ animation: "spin 1s linear infinite" }} />
              Removing...
            </button>
          ) : isActionDisabled ? (
            <button
              className="secondary btn-sm"
              disabled
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <FaTimes size={12} />
              {disabledLabel}
            </button>
          ) : model.isDownloaded ? (
            <button
              onClick={onDelete}
              className="secondary btn-sm"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                color: "var(--error)",
              }}
            >
              <FaTrash size={12} />
              Delete
            </button>
          ) : (
            <button
              onClick={onDownload}
              className="primary btn-sm"
              disabled={isDownloading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {isDownloading ? (
                <>
                  <FaSpinner
                    size={12}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                  Downloading...
                </>
              ) : (
                <>
                  <FaDownload size={12} />
                  Download
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isDownloading && progress !== undefined && (
        <div style={{ marginTop: "var(--spacing-2)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.75em",
              color: "var(--app-text-color-secondary)",
              marginBottom: "4px",
            }}
          >
            <span>{currentFile || "Preparing..."}</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div
            style={{
              height: "6px",
              backgroundColor: "var(--app-bg-color)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                backgroundColor: "var(--app-primary-color)",
                borderRadius: "3px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineModelManager;

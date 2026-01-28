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

interface OfflineModelManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onModelDownloaded?: (modelId: string) => void;
  onModelDeleted?: (modelId: string) => void;
}

const OfflineModelManager: React.FC<OfflineModelManagerProps> = ({
  isOpen,
  onClose,
  onModelDownloaded,
  onModelDeleted,
}) => {
  const [models, setModels] = useState<OfflineModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());
  const [currentFile, setCurrentFile] = useState<Record<string, string>>({});
  const [hasWebGPU, setHasWebGPU] = useState<boolean | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ used: number; quota: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load models and check WebGPU support
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      const downloaded = getDownloadedModelIds();
      const modelsWithStatus = AVAILABLE_OFFLINE_MODELS.map((model) => ({
        ...model,
        isDownloaded: downloaded.includes(model.modelId),
      }));
      setModels(modelsWithStatus);

      const webgpuSupport = await supportsWebGPU();
      setHasWebGPU(webgpuSupport);

      const storage = await getStorageEstimate();
      setStorageInfo(storage);
    };

    loadData();
  }, [isOpen]);

  // Refresh models list
  const refreshModels = useCallback(() => {
    const downloaded = getDownloadedModelIds();
    setModels(
      AVAILABLE_OFFLINE_MODELS.map((model) => ({
        ...model,
        isDownloaded: downloaded.includes(model.modelId),
      }))
    );
  }, []);

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
      }
    },
    [refreshModels, onModelDeleted]
  );

  if (!isOpen) return null;

  const whisperModels = models.filter((m) => m.type === "whisper");
  const moonshineModels = models.filter((m) => m.type === "moonshine");

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
                (OpenAI Whisper - multilingual)
              </span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
              {whisperModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isDownloading={downloadingModels.has(model.modelId)}
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
  model: OfflineModelInfo;
  isDownloading: boolean;
  progress?: number;
  currentFile?: string;
  onDownload: () => void;
  onDelete: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isDownloading,
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
            {model.isDownloaded && (
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
          {model.isDownloaded ? (
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

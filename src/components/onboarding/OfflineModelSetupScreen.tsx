/**
 * Screen 6: Offline Model Download
 */

import React, { useState, useEffect } from "react";
import { FaDownload, FaCheck } from "react-icons/fa";
import {
  AVAILABLE_OFFLINE_MODELS,
  OfflineModelInfo,
} from "../../types/smartVerses";
import {
  getDownloadedModelIds,
} from "../../services/offlineModelService";
import {
  NATIVE_WHISPER_MODELS,
  NativeWhisperDownloadProgress,
  downloadNativeWhisperModel,
  isNativeWhisperModelDownloaded,
} from "../../services/nativeWhisperModelService";
import {
  preloadOfflineModel,
  subscribeOfflineModelPreload,
  OfflineModelPreloadStatus,
} from "../../services/offlineModelPreloadService";
import {
  saveSmartVersesSettings,
  loadSmartVersesSettings,
} from "../../services/transcriptionService";
import "./onboarding.css";

interface OfflineModelSetupScreenProps {
  modelType: "whisper" | "moonshine";
  whisperBackend?: "web" | "native";
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const OfflineModelSetupScreen: React.FC<OfflineModelSetupScreenProps> = ({
  modelType,
  whisperBackend = "web",
  onNext,
  onBack,
  onSkip,
}) => {
  const [selectedModel, setSelectedModel] = useState<OfflineModelInfo | null>(
    null
  );
  const [downloadedIds, setDownloadedIds] = useState<string[]>(() =>
    getDownloadedModelIds()
  );
  const [downloadStatus, setDownloadStatus] =
    useState<OfflineModelPreloadStatus | null>(null);
  const [nativeDownloaded, setNativeDownloaded] = useState<Record<string, boolean>>({});
  const [nativeDownload, setNativeDownload] =
    useState<NativeWhisperDownloadProgress | null>(null);
  const [nativeDownloading, setNativeDownloading] = useState(false);
  const [nativeDownloadError, setNativeDownloadError] = useState<string | null>(
    null
  );

  const isNativeWhisper = modelType === "whisper" && whisperBackend === "native";

  const models = isNativeWhisper
    ? NATIVE_WHISPER_MODELS.map((model) => ({
        id: model.id,
        name: model.name,
        type: "whisper" as const,
        modelId: model.fileName,
        size: model.size,
        description: model.description,
        isDownloaded: false,
        supportsWebGPU: false,
        supportsWASM: false,
      }))
    : AVAILABLE_OFFLINE_MODELS.filter((m) => m.type === modelType);

  // Set default selected model
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      const recommended = models.find((m) =>
        m.modelId.includes(modelType === "whisper" ? "whisper-base" : "moonshine-base")
      );
      setSelectedModel(recommended || models[0]);
    }
  }, [models, selectedModel, modelType]);

  // Subscribe to download status
  useEffect(() => {
    const unsubscribe = subscribeOfflineModelPreload(setDownloadStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isNativeWhisper) return;

    const refreshNativeDownloads = async () => {
      try {
        const entries = await Promise.all(
          NATIVE_WHISPER_MODELS.map(async (model) => ({
            fileName: model.fileName,
            downloaded: await isNativeWhisperModelDownloaded(model.fileName),
          }))
        );
        const next: Record<string, boolean> = {};
        entries.forEach((entry) => {
          next[entry.fileName] = entry.downloaded;
        });
        setNativeDownloaded(next);
      } catch {
        // ignore
      }
    };

    refreshNativeDownloads();
  }, [isNativeWhisper]);

  const handleDownload = async () => {
    if (!selectedModel) return;

    try {
      if (isNativeWhisper) {
        const nativeModel = NATIVE_WHISPER_MODELS.find(
          (m) => m.fileName === selectedModel.modelId
        );
        if (!nativeModel) return;

        setNativeDownloadError(null);
        setNativeDownloading(true);
        setNativeDownload(null);

        await downloadNativeWhisperModel(nativeModel, {
          onProgress: (progress) => {
            setNativeDownload(progress);
          },
          onComplete: () => {
            setNativeDownloaded((prev) => ({
              ...prev,
              [nativeModel.fileName]: true,
            }));
            const settings = loadSmartVersesSettings();
            settings.offlineWhisperNativeModel = nativeModel.fileName;
            settings.transcriptionEngine = "offline-whisper-native";
            settings.offlineLanguage = "en";
            saveSmartVersesSettings(settings);
          },
          onError: (error) => {
            setNativeDownloadError(error.message);
          },
        });
      } else {
        await preloadOfflineModel({
          modelId: selectedModel.modelId,
          source: "manual",
          force: true,
          callbacks: {
            onComplete: () => {
              setDownloadedIds(getDownloadedModelIds());
              // Save to settings
              const settings = loadSmartVersesSettings();
              if (modelType === "whisper") {
                settings.offlineWhisperModel = selectedModel.modelId;
                settings.transcriptionEngine = "offline-whisper";
              } else {
                settings.offlineMoonshineModel = selectedModel.modelId;
                settings.transcriptionEngine = "offline-moonshine";
              }
              saveSmartVersesSettings(settings);
            },
            onError: (error) => {
              console.error("Failed to download model:", error);
            },
          },
        });
      }
    } catch (error) {
      console.error("Failed to start download:", error);
    } finally {
      if (isNativeWhisper) {
        setNativeDownloading(false);
      }
    }
  };

  const isDownloading = isNativeWhisper
    ? nativeDownloading
    : downloadStatus &&
      downloadStatus.modelId === selectedModel?.modelId &&
      downloadStatus.phase !== "ready" &&
      downloadStatus.phase !== "error";

  const isDownloaded = isNativeWhisper
    ? !!(selectedModel && nativeDownloaded[selectedModel.modelId])
    : selectedModel
    ? downloadedIds.includes(selectedModel.modelId)
    : false;

  const canProceed = isDownloaded || isDownloading;

  const isModelDownloaded = (modelId: string): boolean => {
    return isNativeWhisper
      ? !!nativeDownloaded[modelId]
      : downloadedIds.includes(modelId);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">
          <img
            src={`/assets/onboarding/${modelType}.jpg`}
            alt={modelType === "whisper" ? "Whisper" : "Moonshine"}
            className="onboarding-title-icon"
          />
          Download {modelType === "whisper" ? "Whisper" : "Moonshine"} Model
        </h1>
        <p className="onboarding-body">
          Select a model to download for offline transcription. The model will
          run entirely on your device.
        </p>

        {/* Model Selection */}
        <div className="onboarding-cards">
          {models.map((model) => (
            <div
              key={model.id}
              className={`onboarding-card ${
                selectedModel?.id === model.id ? "selected" : ""
              }`}
              onClick={() => setSelectedModel(model)}
            >
              <img
                src={`/assets/onboarding/${modelType}.jpg`}
                alt={modelType === "whisper" ? "Whisper" : "Moonshine"}
                className="onboarding-card-icon"
              />
              <h3 className="onboarding-card-title">
                {model.name}
                {isModelDownloaded(model.modelId) && (
                  <FaCheck
                    style={{ marginLeft: "8px", color: "var(--success)" }}
                  />
                )}
              </h3>
              <p className="onboarding-card-text">
                Size: {model.size}
                {model.description && ` • ${model.description}`}
              </p>
            </div>
          ))}
        </div>

        {/* Download Status */}
        {isDownloading && downloadStatus && !isNativeWhisper && (
          <div className="onboarding-message onboarding-message-info">
            <div style={{ marginBottom: "8px" }}>
              <strong>Downloading {downloadStatus.modelName}...</strong>
            </div>
            {downloadStatus.file && (
              <div style={{ fontSize: "0.85rem", marginBottom: "8px" }}>
                {downloadStatus.file}
              </div>
            )}
            <div
              style={{
                height: "6px",
                background: "var(--surface-3)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, downloadStatus?.progress || 0))}%`,
                  background: "var(--app-primary-color)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{
                marginTop: "4px",
                fontSize: "0.85rem",
                textAlign: "right",
              }}
            >
              {Math.max(0, Math.min(100, downloadStatus?.progress || 0)).toFixed(1)}%
            </div>
          </div>
        )}

        {isNativeWhisper && isDownloading && nativeDownload && (
          <div className="onboarding-message onboarding-message-info">
            <div style={{ marginBottom: "8px" }}>
              <strong>Downloading native model...</strong>
            </div>
            <div
              style={{
                height: "6px",
                background: "var(--surface-3)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, nativeDownload.progress || 0))}%`,
                  background: "var(--app-primary-color)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{
                marginTop: "4px",
                fontSize: "0.85rem",
                textAlign: "right",
              }}
            >
              {Math.max(0, Math.min(100, nativeDownload.progress || 0)).toFixed(1)}%
            </div>
          </div>
        )}

        {downloadStatus && downloadStatus.phase === "error" && !isNativeWhisper && (
          <div className="onboarding-message onboarding-message-error">
            Failed to download model: {downloadStatus.error || "Unknown error"}
          </div>
        )}

        {nativeDownloadError && isNativeWhisper && (
          <div className="onboarding-message onboarding-message-error">
            Failed to download model: {nativeDownloadError}
          </div>
        )}

        {isDownloaded && !isDownloading && (
          <div className="onboarding-message onboarding-message-success">
            <FaCheck style={{ marginRight: "8px" }} />
            Model downloaded and ready to use
          </div>
        )}

        {!isDownloaded && !isDownloading && selectedModel && (
          <button
            onClick={handleDownload}
            className="onboarding-button onboarding-button-primary"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <FaDownload />
            Download {selectedModel.name}
          </button>
        )}

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
            disabled={!canProceed}
            className="onboarding-button onboarding-button-primary"
          >
            Next
          </button>
          <button
            onClick={onBack}
            className="onboarding-button onboarding-button-secondary"
          >
            Back
          </button>
          <button
            onClick={onSkip}
            className="onboarding-button onboarding-button-tertiary"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineModelSetupScreen;

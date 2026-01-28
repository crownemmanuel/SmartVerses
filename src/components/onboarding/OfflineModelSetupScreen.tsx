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
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const OfflineModelSetupScreen: React.FC<OfflineModelSetupScreenProps> = ({
  modelType,
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

  const models = AVAILABLE_OFFLINE_MODELS.filter((m) => m.type === modelType);

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

  const handleDownload = async () => {
    if (!selectedModel) return;

    try {
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
    } catch (error) {
      console.error("Failed to start download:", error);
    }
  };

  const isDownloading =
    downloadStatus &&
    downloadStatus.modelId === selectedModel?.modelId &&
    downloadStatus.phase !== "ready" &&
    downloadStatus.phase !== "error";

  const isDownloaded = selectedModel
    ? downloadedIds.includes(selectedModel.modelId)
    : false;

  const canProceed = isDownloaded || isDownloading;

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
                {downloadedIds.includes(model.modelId) && (
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
        {isDownloading && downloadStatus && (
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

        {downloadStatus && downloadStatus.phase === "error" && (
          <div className="onboarding-message onboarding-message-error">
            Failed to download model: {downloadStatus.error || "Unknown error"}
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

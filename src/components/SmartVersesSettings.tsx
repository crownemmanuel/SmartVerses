/**
 * SmartVerses Settings Component
 *
 * Settings panel for configuring SmartVerses features:
 * - Transcription engine (AssemblyAI)
 * - AI settings (paraphrase detection, etc.)
 * - Display settings (colors)
 * - ProPresenter integration
 * - Output settings
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  FaMicrophone,
  FaRobot,
  FaPalette,
  FaFileExport,
  FaKey,
  FaSpinner,
  FaDesktop,
  FaCheck,
  FaTimes,
  FaDatabase,
} from "react-icons/fa";
import {
  SmartVersesSettings as SmartVersesSettingsType,
  DEFAULT_SMART_VERSES_SETTINGS,
  TranscriptionEngine,
  AudioCaptureMode,
  AVAILABLE_OFFLINE_MODELS,
} from "../types/smartVerses";
import OfflineModelManager from "./OfflineModelManager";
import { getDownloadedModelIds, isModelDownloaded } from "../services/offlineModelService";
import {
  OfflineModelPreloadStatus,
  preloadOfflineModel,
  subscribeOfflineModelPreload,
} from "../services/offlineModelPreloadService";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../services/transcriptionService";
import { getAssemblyAITemporaryToken } from "../services/assemblyaiTokenService";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterConnection } from "../types/propresenter";
import { getAppSettings } from "../utils/aiConfig";
import {
  fetchOpenAIModels,
  fetchGeminiModels,
  fetchGroqModels,
} from "../services/aiService";
import { formatGroqModelLabel } from "../utils/groqModelLimits";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import "../App.css";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const SmartVersesSettings: React.FC = () => {
  const [settings, setSettings] = useState<SmartVersesSettingsType>(
    DEFAULT_SMART_VERSES_SETTINGS
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [nativeDevices, setNativeDevices] = useState<
    { id: number; name: string; is_default: boolean }[]
  >([]);
  const [nativeDevicesError, setNativeDevicesError] = useState<string | null>(
    null
  );

  // Bible Search AI model state
  const [bibleSearchModels, setBibleSearchModels] = useState<string[]>([]);
  const [bibleSearchModelsLoading, setBibleSearchModelsLoading] =
    useState(false);

  // Offline model manager state
  const [showModelManager, setShowModelManager] = useState(false);
  const [downloadedModelIds, setDownloadedModelIds] = useState<string[]>([]);
  const [offlineModelLoad, setOfflineModelLoad] =
    useState<OfflineModelPreloadStatus | null>(null);


  // ProPresenter activation state
  const [enabledConnections, setEnabledConnections] = useState<
    ProPresenterConnection[]
  >([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [isLoadingSlide, setIsLoadingSlide] = useState(false);
  const [slideLoadError, setSlideLoadError] = useState<string | null>(null);
  const [slideLoadSuccess, setSlideLoadSuccess] = useState(false);
  const [activationClicks, setActivationClicks] = useState<number>(1);
  const [takeOffClicks, setTakeOffClicks] = useState<number>(0);
  const [clearTextFileOnTakeOff, setClearTextFileOnTakeOff] =
    useState<boolean>(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const savedSettings = loadSmartVersesSettings();
    setSettings(savedSettings);
    loadMicrophones();
    if ((savedSettings.audioCaptureMode || "webrtc") === "native") {
      loadNativeDevices();
    }
    
    // Load downloaded offline models
    setDownloadedModelIds(getDownloadedModelIds());

    // Load ProPresenter connections
    const connections = getEnabledConnections();
    setEnabledConnections(connections);
    if (connections.length > 0) {
      setSelectedConnectionId(
        savedSettings.selectedProPresenterConnectionId || connections[0].id
      );
    }

    // Load ProPresenter activation settings
    if (savedSettings.proPresenterActivation) {
      setActivationClicks(
        savedSettings.proPresenterActivation.activationClicks ?? 1
      );
      setTakeOffClicks(savedSettings.proPresenterActivation.takeOffClicks ?? 0);
      setClearTextFileOnTakeOff(
        savedSettings.proPresenterActivation.clearTextFileOnTakeOff !== false
      );
    }
    setSettingsLoaded(true);

    // Listen for device changes (when mics are plugged/unplugged)
    const handleDeviceChange = () => {
      console.log("Audio devices changed, refreshing list...");
      loadMicrophones();
    };
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOfflineModelPreload(setOfflineModelLoad);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;

    const isOfflineWhisper = settings.transcriptionEngine === "offline-whisper";
    const isOfflineMoonshine =
      settings.transcriptionEngine === "offline-moonshine";
    const modelId = isOfflineWhisper
      ? settings.offlineWhisperModel || "onnx-community/whisper-base"
      : isOfflineMoonshine
      ? settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX"
      : null;

    if (!modelId) return;
    if (isModelDownloaded(modelId)) return;

    preloadOfflineModel({
      modelId,
      source: "settings",
      callbacks: {
        onComplete: () => setDownloadedModelIds(getDownloadedModelIds()),
        onError: () => setDownloadedModelIds(getDownloadedModelIds()),
      },
    }).catch((error) => {
      console.warn("Failed to preload offline model:", error);
    });
  }, [
    settingsLoaded,
    settings.transcriptionEngine,
    settings.offlineWhisperModel,
    settings.offlineMoonshineModel,
  ]);

  // Auto-save settings on change (debounced), after initial load.
  useDebouncedEffect(
    () => {
      try {
        const settingsToSave: SmartVersesSettingsType = {
          ...settings,
          selectedProPresenterConnectionId: selectedConnectionId,
          proPresenterActivation: settings.proPresenterActivation
            ? {
                ...settings.proPresenterActivation,
                activationClicks,
                takeOffClicks,
                clearTextFileOnTakeOff,
              }
            : undefined,
        };

        saveSmartVersesSettings(settingsToSave);
        // Dispatch custom event so other components can react immediately
        window.dispatchEvent(
          new CustomEvent("smartverses-settings-changed", {
            detail: settingsToSave,
          })
        );
        setSaveMessage("All changes saved");
        setTimeout(() => setSaveMessage(null), 2000);
      } catch (error) {
        console.error("Failed to save settings:", error);
        setSaveMessage("Failed to save settings");
      }
    },
    [
      settings,
      selectedConnectionId,
      activationClicks,
      takeOffClicks,
      clearTextFileOnTakeOff,
      settingsLoaded,
    ],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );

  // Get available providers based on API keys
  const getAvailableProviders = useCallback(() => {
    const appSettings = getAppSettings();
    const available: Array<{ value: string; label: string }> = [];

    if (appSettings.openAIConfig?.apiKey) {
      available.push({ value: "openai", label: "OpenAI" });
    }
    if (appSettings.geminiConfig?.apiKey) {
      available.push({ value: "gemini", label: "Google Gemini" });
    }
    if (appSettings.groqConfig?.apiKey) {
      available.push({ value: "groq", label: "Groq (Recommended - Super Fast)" });
    }

    return available;
  }, []);

  // Check if current provider still has API key, reset if not
  useEffect(() => {
    if (settings.bibleSearchProvider) {
      const appSettings = getAppSettings();
      let hasApiKey = false;

      switch (settings.bibleSearchProvider) {
        case "openai":
          hasApiKey = !!appSettings.openAIConfig?.apiKey;
          break;
        case "gemini":
          hasApiKey = !!appSettings.geminiConfig?.apiKey;
          break;
        case "groq":
          hasApiKey = !!appSettings.groqConfig?.apiKey;
          break;
      }

      if (!hasApiKey) {
        setSettings((prev) => ({
          ...prev,
          bibleSearchProvider: undefined,
          bibleSearchModel: "",
        }));
      }
    }
  }, [settings.bibleSearchProvider]);

  // Default models for each provider (shown when API key is not set)
  const DEFAULT_MODELS: Record<string, string[]> = {
    openai: [
      "gpt-4o",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
    ],
    gemini: [
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-pro",
    ],
    groq: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "llama-3.1-70b-versatile",
      "mixtral-8x7b-32768",
    ],
  };

  // Load models when provider changes
  const loadBibleSearchModels = useCallback(async (provider: string) => {
    if (!provider) {
      setBibleSearchModels([]);
      return;
    }

    const appSettings = getAppSettings();
    setBibleSearchModelsLoading(true);
    setBibleSearchModels([]);

    try {
      let models: string[] = [];
      switch (provider) {
        case "openai":
          if (appSettings.openAIConfig?.apiKey) {
            models = await fetchOpenAIModels(appSettings.openAIConfig.apiKey);
          } else {
            // Show default models when no API key
            models = DEFAULT_MODELS.openai;
          }
          break;
        case "gemini":
          if (appSettings.geminiConfig?.apiKey) {
            models = await fetchGeminiModels(appSettings.geminiConfig.apiKey);
          } else {
            // Show default models when no API key
            models = DEFAULT_MODELS.gemini;
          }
          break;
        case "groq":
          if (appSettings.groqConfig?.apiKey) {
            models = await fetchGroqModels(appSettings.groqConfig.apiKey);
          } else {
            // Show default models when no API key
            models = DEFAULT_MODELS.groq;
          }
          break;
      }
      
      // Ensure the currently selected model is included in the list
      if (settings.bibleSearchModel && !models.includes(settings.bibleSearchModel)) {
        models.unshift(settings.bibleSearchModel);
      }
      
      setBibleSearchModels(models);
    } catch (error) {
      console.error("Failed to load models:", error);
      // Fallback to default models on error
      let fallbackModels = DEFAULT_MODELS[provider] || [];
      // Ensure the currently selected model is included
      if (settings.bibleSearchModel && !fallbackModels.includes(settings.bibleSearchModel)) {
        fallbackModels.unshift(settings.bibleSearchModel);
      }
      setBibleSearchModels(fallbackModels);
    } finally {
      setBibleSearchModelsLoading(false);
    }
  }, [settings.bibleSearchModel]);

  // Load models when provider changes
  useEffect(() => {
    if (settings.bibleSearchProvider) {
      loadBibleSearchModels(settings.bibleSearchProvider);
    }
  }, [settings.bibleSearchProvider, loadBibleSearchModels]);

  const formatBibleSearchModelLabel = useCallback(
    (modelId: string) => {
      if (settings.bibleSearchProvider !== "groq") {
        return modelId;
      }
      const baseLabel = formatGroqModelLabel(modelId);
      if (modelId === "llama-3.1-8b-instant") {
        return `${baseLabel} - Recommended`;
      }
      return baseLabel;
    },
    [settings.bibleSearchProvider]
  );

  // Load available microphones
  const loadMicrophones = async () => {
    try {
      // Request permission first - this is required to get full device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Immediately stop the stream to release the microphone
      stream.getTracks().forEach((track) => track.stop());

      // Now enumerate all devices - we'll have full labels after permission grant
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");

      console.log(
        `Found ${mics.length} audio input devices:`,
        mics.map((m) => m.label || m.deviceId)
      );
      setAvailableMics(mics);
    } catch (error) {
      console.error("Failed to load microphones:", error);

      // Even if permission fails, try to enumerate devices (might get limited list)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter((d) => d.kind === "audioinput");
        setAvailableMics(mics);
      } catch {
        // Ignore secondary error
      }
    }
  };

  const loadNativeDevices = async () => {
    try {
      setNativeDevicesError(null);
      const mod = await import("@tauri-apps/api/core");
      const devices = await mod.invoke<
        { id: number; name: string; is_default: boolean }[]
      >("list_native_audio_input_devices");
      setNativeDevices(devices || []);
    } catch (err) {
      setNativeDevices([]);
      setNativeDevicesError(
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : JSON.stringify(err)
      );
    }
  };

  // Handle settings change
  const handleChange = (key: keyof SmartVersesSettingsType, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveMessage(null);
  };

  // Handle Get Slide from ProPresenter
  const handleGetSlide = async () => {
    setIsLoadingSlide(true);
    setSlideLoadError(null);
    setSlideLoadSuccess(false);

    if (enabledConnections.length === 0) {
      setSlideLoadError(
        "No enabled ProPresenter connections found. Please enable at least one connection in Settings > ProPresenter."
      );
      setIsLoadingSlide(false);
      return;
    }

    // Find the selected connection
    const connection =
      enabledConnections.find((c) => c.id === selectedConnectionId) ||
      enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        const newActivation = {
          presentationUuid:
            slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName:
            slideIndexData.presentation_index.presentation_id.name,
          activationClicks: activationClicks,
          takeOffClicks: takeOffClicks,
          clearTextFileOnTakeOff: clearTextFileOnTakeOff,
        };
        setSettings((prev) => ({
          ...prev,
          proPresenterActivation: newActivation,
          selectedProPresenterConnectionId: selectedConnectionId,
        }));
        setSlideLoadSuccess(true);
        setIsLoadingSlide(false);
        return;
      } else {
        setSlideLoadError(
          "No active presentation found. Make sure a slide is live in ProPresenter."
        );
      }
    } catch (err) {
      setSlideLoadError(
        err instanceof Error ? err.message : "Failed to get slide index"
      );
    }

    setIsLoadingSlide(false);
  };

  // Handle removing ProPresenter configuration
  const handleRemoveProPresenterConfig = () => {
    setSettings((prev) => ({
      ...prev,
      proPresenterActivation: undefined,
    }));
    setSlideLoadSuccess(false);
    setSlideLoadError(null);
  };

  // Test AssemblyAI API key
  const testAssemblyAIKey = async () => {
    if (!settings.assemblyAIApiKey) {
      alert("Please enter an API key first");
      return;
    }

    try {
      await getAssemblyAITemporaryToken(settings.assemblyAIApiKey, 60);
      {
        alert("✅ AssemblyAI API key is valid!");
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : JSON.stringify(err);
      alert(`❌ Failed to validate API key.\n\n${msg}`);
    }
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  const sectionStyle: React.CSSProperties = {
    marginBottom: "var(--spacing-6)",
    padding: "var(--spacing-4)",
    backgroundColor: "var(--app-header-bg)",
    borderRadius: "12px",
    border: "1px solid var(--app-border-color)",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    marginBottom: "var(--spacing-4)",
    paddingBottom: "var(--spacing-3)",
    borderBottom: "1px solid var(--app-border-color)",
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: "var(--spacing-4)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "var(--spacing-2)",
    fontWeight: 500,
    fontSize: "0.9rem",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "var(--spacing-3)",
    borderRadius: "8px",
    border: "1px solid var(--app-border-color)",
    backgroundColor: "var(--app-input-bg-color)",
    color: "var(--app-input-text-color)",
    fontSize: "1rem",
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    cursor: "pointer",
    marginBottom: "var(--spacing-2)",
  };

  const helpTextStyle: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "var(--app-text-color-secondary)",
    marginTop: "var(--spacing-1)",
  };

  const selectedWhisperModelId =
    settings.offlineWhisperModel || "onnx-community/whisper-base";
  const selectedMoonshineModelId =
    settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX";

  const whisperLoadStatus =
    offlineModelLoad?.modelId === selectedWhisperModelId
      ? offlineModelLoad
      : null;
  const moonshineLoadStatus =
    offlineModelLoad?.modelId === selectedMoonshineModelId
      ? offlineModelLoad
      : null;

  const isWhisperDownloading =
    !!whisperLoadStatus &&
    whisperLoadStatus.phase !== "ready" &&
    whisperLoadStatus.phase !== "error";
  const isMoonshineDownloading =
    !!moonshineLoadStatus &&
    moonshineLoadStatus.phase !== "ready" &&
    moonshineLoadStatus.phase !== "error";

  const renderOfflineLoadStatus = (status: OfflineModelPreloadStatus | null) => {
    if (!status || status.phase === "ready") return null;

    const progress = Math.max(0, Math.min(100, status.progress || 0));
    const statusLabel =
      status.phase === "error"
        ? "Offline model failed to load"
        : `Loading ${status.modelName}...`;

    return (
      <div
        style={{
          marginTop: "var(--spacing-2)",
          padding: "var(--spacing-2)",
          borderRadius: "8px",
          border: "1px solid var(--app-border-color)",
          backgroundColor: "var(--app-input-bg-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.8rem",
            color: "var(--app-text-color-secondary)",
            marginBottom: "4px",
          }}
        >
          <span>{statusLabel}</span>
          {status.phase !== "error" && <span>{progress.toFixed(1)}%</span>}
        </div>
        {status.file && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--app-text-color-secondary)",
              marginBottom: "6px",
            }}
          >
            {status.file}
          </div>
        )}
        <div
          style={{
            height: "6px",
            backgroundColor: "var(--app-bg-color)",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              backgroundColor:
                status.phase === "error"
                  ? "var(--danger)"
                  : "var(--app-primary-color)",
              borderRadius: "4px",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        {status.phase === "error" && (
          <p style={{ ...helpTextStyle, color: "var(--danger)" }}>
            {status.error || "Failed to load offline model. Please try again."}
          </p>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>SmartVerses Settings</h2>
      <p
        style={{
          marginBottom: "var(--spacing-6)",
          color: "var(--app-text-color-secondary)",
        }}
      >
        Configure SmartVerses smart Bible lookup and live transcription
        features.
      </p>

      {/* Transcription Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaMicrophone />
          <h3 style={{ margin: 0 }}>Transcription Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Transcription Engine</label>
          <select
            value={settings.transcriptionEngine}
            onChange={(e) =>
              handleChange(
                "transcriptionEngine",
                e.target.value as TranscriptionEngine
              )
            }
            style={inputStyle}
          >
            <optgroup label="Cloud-based (requires API key)">
              <option value="assemblyai">AssemblyAI (Recommended)</option>
              <option value="groq">Groq Whisper (Experimental)</option>
            </optgroup>
            <optgroup label="Offline (runs locally)">
              <option value="offline-moonshine">Moonshine Offline (More Stable)</option>
              <option value="offline-whisper">Whisper Offline (Experimental)</option>
            </optgroup>
            <optgroup label="Coming Soon">
              <option value="elevenlabs" disabled>
                ElevenLabs
              </option>
              <option value="whisper" disabled>
                OpenAI Whisper API
              </option>
            </optgroup>
          </select>
          <p style={helpTextStyle}>
            {settings.transcriptionEngine === "assemblyai"
              ? "AssemblyAI provides high-accuracy real-time transcription."
              : settings.transcriptionEngine === "groq"
              ? "Groq provides ultra-fast transcription using Whisper models. (Experimental)"
              : settings.transcriptionEngine === "offline-whisper"
              ? "Whisper Offline runs entirely on your device - no internet required after model download. (Experimental)"
              : settings.transcriptionEngine === "offline-moonshine"
              ? "Moonshine is optimized for real-time transcription with Voice Activity Detection (VAD). More stable than Whisper for offline use."
              : "Select a transcription engine."}
          </p>
        </div>

        {/* Offline Model Settings */}
        {(settings.transcriptionEngine === "offline-whisper" ||
          settings.transcriptionEngine === "offline-moonshine") && (
          <div
            style={{
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-bg-color)",
              borderRadius: "8px",
              marginBottom: "var(--spacing-4)",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--spacing-3)",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.95rem" }}>
                Offline Model Settings
              </h4>
              <button
                onClick={() => setShowModelManager(true)}
                className="secondary btn-sm"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <FaDatabase size={12} />
                Manage Models
              </button>
            </div>

            {settings.transcriptionEngine === "offline-whisper" && (
              <>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Whisper Model</label>
                  <select
                    value={settings.offlineWhisperModel || "onnx-community/whisper-base"}
                    onChange={(e) =>
                      handleChange("offlineWhisperModel", e.target.value)
                    }
                    style={inputStyle}
                  >
                    {AVAILABLE_OFFLINE_MODELS.filter((m) => m.type === "whisper").map(
                      (model) => {
                        const isDownloaded = downloadedModelIds.includes(model.modelId);
                        const isRecommended =
                          model.modelId === "onnx-community/whisper-base";
                        return (
                          <option key={model.id} value={model.modelId}>
                            {model.name}
                            {isRecommended ? " (Recommended)" : ""} ({model.size})
                            {isDownloaded ? " ✓" : " - Not Downloaded"}
                          </option>
                        );
                      }
                    )}
                  </select>
                  {!downloadedModelIds.includes(selectedWhisperModelId) &&
                    !isWhisperDownloading && (
                    <p
                      style={{
                        ...helpTextStyle,
                        color: "var(--warning)",
                        marginTop: "var(--spacing-2)",
                      }}
                    >
                      Selected model is not downloaded. Click "Manage Models" to
                      download it first.
                    </p>
                  )}
                  {renderOfflineLoadStatus(whisperLoadStatus)}
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Language</label>
                  <select
                    value={settings.offlineLanguage || "en"}
                    onChange={(e) =>
                      handleChange("offlineLanguage", e.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="pl">Polish</option>
                    <option value="ru">Russian</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                  </select>
                  <p style={helpTextStyle}>
                    Language for transcription. The ".en" models only support English.
                  </p>
                </div>
              </>
            )}

            {settings.transcriptionEngine === "offline-moonshine" && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Moonshine Model</label>
                <select
                  value={
                    settings.offlineMoonshineModel ||
                    "onnx-community/moonshine-base-ONNX"
                  }
                  onChange={(e) =>
                    handleChange("offlineMoonshineModel", e.target.value)
                  }
                  style={inputStyle}
                >
                  {AVAILABLE_OFFLINE_MODELS.filter((m) => m.type === "moonshine").map(
                    (model) => {
                      const isDownloaded = downloadedModelIds.includes(model.modelId);
                      return (
                        <option key={model.id} value={model.modelId}>
                          {model.name} ({model.size})
                          {isDownloaded ? " ✓" : " - Not Downloaded"}
                        </option>
                      );
                    }
                  )}
                </select>
                {!downloadedModelIds.includes(selectedMoonshineModelId) &&
                  !isMoonshineDownloading && (
                  <p
                    style={{
                      ...helpTextStyle,
                      color: "var(--warning)",
                      marginTop: "var(--spacing-2)",
                    }}
                  >
                    Selected model is not downloaded. Click "Manage Models" to
                    download it first.
                  </p>
                )}
                {renderOfflineLoadStatus(moonshineLoadStatus)}
                <p style={helpTextStyle}>
                  Moonshine models include built-in Voice Activity Detection (VAD)
                  for automatic speech segmentation.
                </p>
              </div>
            )}
          </div>
        )}

        {settings.transcriptionEngine === "assemblyai" && (
          <div style={fieldStyle}>
            <label style={labelStyle}>AssemblyAI API Key</label>
            <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
              <input
                type="password"
                value={settings.assemblyAIApiKey || ""}
                onChange={(e) =>
                  handleChange("assemblyAIApiKey", e.target.value)
                }
                placeholder="Enter your AssemblyAI API key"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={testAssemblyAIKey}
                className="secondary"
                style={{ whiteSpace: "nowrap" }}
              >
                <FaKey style={{ marginRight: "4px" }} />
                Test
              </button>
            </div>
            <p style={helpTextStyle}>
              Get your API key from{" "}
              <a
                href="https://www.assemblyai.com/dashboard/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--app-primary-color)" }}
              >
                assemblyai.com/dashboard/api-keys
              </a>
            </p>
          </div>
        )}

        {settings.transcriptionEngine === "groq" && (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>Groq API Key</label>
              <input
                type="password"
                value={settings.groqApiKey || ""}
                onChange={(e) => handleChange("groqApiKey", e.target.value)}
                placeholder="Enter your Groq API key"
                style={inputStyle}
              />
              <p style={helpTextStyle}>
                Get your API key from{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--app-primary-color)" }}
                >
                  console.groq.com
                </a>
              </p>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Groq Model</label>
              <select
                value={settings.groqModel || "whisper-large-v3"}
                onChange={(e) => handleChange("groqModel", e.target.value)}
                style={inputStyle}
              >
                <option value="whisper-large-v3">
                  whisper-large-v3 (Best Accuracy)
                </option>
                <option value="whisper-large-v3-turbo">
                  whisper-large-v3-turbo (Fastest)
                </option>
                <option value="distil-whisper-large-v3-en">
                  distil-whisper-large-v3-en (English Only)
                </option>
              </select>
            </div>
          </>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>Audio Capture</label>
          <select
            value={(settings.audioCaptureMode || "webrtc") as AudioCaptureMode}
            onChange={(e) => {
              const mode = e.target.value as AudioCaptureMode;
              handleChange("audioCaptureMode", mode);
              if (mode === "native") {
                loadNativeDevices();
              }
            }}
            style={inputStyle}
            disabled={settings.remoteTranscriptionEnabled}
          >
            <option value="webrtc">WebView (WebRTC) — simplest</option>
            <option value="native">
              Native (CoreAudio/WASAPI) — more devices
            </option>
          </select>
          <p style={helpTextStyle}>
            Native capture helps when macOS WKWebView doesn't expose some
            virtual devices (Teams/Zoom/etc).
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.remoteTranscriptionEnabled || false}
              onChange={(e) =>
                handleChange("remoteTranscriptionEnabled", e.target.checked)
              }
            />
            Use remote transcription source
          </label>
          <p style={helpTextStyle}>
            Connect to another ProAssist instance that is already capturing
            audio and streaming transcriptions. This will disable local mic
            capture.
          </p>
          {settings.remoteTranscriptionEnabled && (
            <div
              style={{
                display: "grid",
                gap: "var(--spacing-2)",
                marginTop: "var(--spacing-2)",
              }}
            >
              <input
                type="text"
                value={settings.remoteTranscriptionHost || ""}
                onChange={(e) =>
                  handleChange("remoteTranscriptionHost", e.target.value)
                }
                placeholder="Remote host (e.g. 192.168.1.42)"
                style={inputStyle}
              />
              <input
                type="number"
                value={settings.remoteTranscriptionPort || 9876}
                onChange={(e) =>
                  handleChange(
                    "remoteTranscriptionPort",
                    parseInt(e.target.value || "9876", 10)
                  )
                }
                placeholder="Port"
                style={inputStyle}
              />
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Microphone</label>
          {(settings.audioCaptureMode || "webrtc") === "native" ? (
            <>
              <select
                value={settings.selectedNativeMicrophoneId || ""}
                onChange={(e) =>
                  handleChange(
                    "selectedNativeMicrophoneId",
                    e.target.value || undefined
                  )
                }
                style={inputStyle}
                disabled={
                  settings.runTranscriptionInBrowser ||
                  settings.remoteTranscriptionEnabled
                }
              >
                <option value="">System Default</option>
                {nativeDevices.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                    {d.is_default ? " (Default)" : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={loadNativeDevices}
                className="secondary btn-sm"
                style={{ marginTop: "var(--spacing-2)" }}
                type="button"
                disabled={
                  settings.runTranscriptionInBrowser ||
                  settings.remoteTranscriptionEnabled
                }
              >
                Refresh Native Devices
              </button>
              {nativeDevicesError && (
                <p style={{ ...helpTextStyle, color: "var(--error)" }}>
                  Failed to load native devices: {nativeDevicesError}
                </p>
              )}
            </>
          ) : (
            <>
              <select
                value={settings.selectedMicrophoneId || ""}
                onChange={(e) =>
                  handleChange("selectedMicrophoneId", e.target.value)
                }
                style={inputStyle}
                disabled={
                  settings.runTranscriptionInBrowser ||
                  settings.remoteTranscriptionEnabled
                }
              >
                <option value="">Default Microphone</option>
                {availableMics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <button
                onClick={loadMicrophones}
                className="secondary btn-sm"
                style={{ marginTop: "var(--spacing-2)" }}
                type="button"
                disabled={
                  settings.runTranscriptionInBrowser ||
                  settings.remoteTranscriptionEnabled
                }
              >
                Refresh Devices
              </button>
            </>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.runTranscriptionInBrowser || false}
              onChange={(e) =>
                handleChange("runTranscriptionInBrowser", e.target.checked)
              }
            />
            Run transcription in browser
          </label>
          <p style={helpTextStyle}>
            If your microphone isn't showing up in the list above, enable this
            option. When you start transcription, it will open in your default
            browser (Chrome/Firefox) which has full access to all audio devices.
            Transcriptions will stream back to the app automatically.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Transcription time limit (minutes)</label>
          <input
            type="number"
            min={1}
            value={settings.transcriptionTimeLimitMinutes ?? 120}
            onChange={(e) =>
              handleChange(
                "transcriptionTimeLimitMinutes",
                Math.max(1, parseInt(e.target.value, 10) || 120)
              )
            }
            style={inputStyle}
          />
          <p style={helpTextStyle}>
            Show a continuation prompt at this limit (default 120 minutes). If
            no response in 1 minute, transcription auto-stops.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.streamTranscriptionsToWebSocket}
              onChange={(e) =>
                handleChange(
                  "streamTranscriptionsToWebSocket",
                  e.target.checked
                )
              }
            />
            Stream transcription output to WebSocket
          </label>
          <p style={helpTextStyle}>
            Rebroadcast transcript chunks (and any extracted key points /
            scripture refs) to the Live Slides WebSocket so other pages (like
            the Notepad) can consume them in real-time.
          </p>
        </div>
      </div>

      {/* AI Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaRobot />
          <h3 style={{ margin: 0 }}>AI Settings</h3>
        </div>

        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-bg-color)",
            borderRadius: "8px",
            marginBottom: "var(--spacing-4)",
          }}
        >
          <h4 style={{ margin: "0 0 var(--spacing-3) 0", fontSize: "0.95rem" }}>
            Bible Search AI
          </h4>
          <p style={{ ...helpTextStyle, marginBottom: "var(--spacing-3)" }}>
            When enabled, AI will search for Bible verses when direct reference
            parsing fails. Configure the provider and model below. API keys are
            configured in Settings → AI Configuration.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--spacing-3)",
            }}
          >
            <div style={fieldStyle}>
              <label style={labelStyle}>Provider</label>
              <select
                value={settings.bibleSearchProvider || ""}
                onChange={(e) => {
                  handleChange(
                    "bibleSearchProvider",
                    e.target.value || undefined
                  );
                  handleChange("bibleSearchModel", ""); // Reset model when provider changes
                }}
                style={inputStyle}
              >
                <option value="">Select Provider</option>
                {getAvailableProviders().map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Model</label>
              <div style={{ position: "relative" }}>
                <select
                  value={settings.bibleSearchModel || ""}
                  onChange={(e) =>
                    handleChange("bibleSearchModel", e.target.value)
                  }
                  disabled={
                    !settings.bibleSearchProvider || bibleSearchModelsLoading
                  }
                  style={inputStyle}
                >
                  <option value="">
                    {bibleSearchModelsLoading
                      ? "Loading models..."
                      : "Select Model"}
                  </option>
                  {bibleSearchModels.map((model) => (
                    <option key={model} value={model}>
                      {formatBibleSearchModelLabel(model)}
                    </option>
                  ))}
                </select>
                {bibleSearchModelsLoading && (
                  <FaSpinner
                    style={{
                      position: "absolute",
                      right: "40px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {!settings.bibleSearchProvider && (
            <p
              style={{
                ...helpTextStyle,
                color: "var(--warning)",
                marginTop: "var(--spacing-2)",
              }}
            >
              Select a provider and model to enable AI Bible search.
            </p>
          )}
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.enableParaphraseDetection}
              onChange={(e) =>
                handleChange("enableParaphraseDetection", e.target.checked)
              }
            />
            Enable Paraphrase Detection (Transcription)
          </label>
          <p style={helpTextStyle}>
            Detect when speakers paraphrase Bible verses without quoting them
            directly.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.enableKeyPointExtraction}
              onChange={(e) =>
                handleChange("enableKeyPointExtraction", e.target.checked)
              }
            />
            Enable Key Point Extraction
          </label>
          <p style={helpTextStyle}>
            Extract quotable key points from sermons (requires AI).
          </p>
        </div>

        {settings.enableKeyPointExtraction && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Key Point Extraction Instructions</label>
            <textarea
              value={settings.keyPointExtractionInstructions || ""}
              onChange={(e) =>
                handleChange("keyPointExtractionInstructions", e.target.value)
              }
              placeholder="Optional: Customize how key points should be extracted for your church/pastor..."
              style={{
                ...inputStyle,
                minHeight: "110px",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <p style={helpTextStyle}>
              These instructions are added to the AI prompt when key point
              extraction is enabled. Leave blank to use the default behavior.
            </p>
          </div>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>Paraphrase Confidence Threshold</label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-3)",
            }}
          >
            <input
              type="range"
              min="0.3"
              max="0.9"
              step="0.1"
              value={settings.paraphraseConfidenceThreshold}
              onChange={(e) =>
                handleChange(
                  "paraphraseConfidenceThreshold",
                  parseFloat(e.target.value)
                )
              }
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: "50px", textAlign: "right" }}>
              {Math.round(settings.paraphraseConfidenceThreshold * 100)}%
            </span>
          </div>
          <p style={helpTextStyle}>
            Only show paraphrased verses with confidence above this threshold.
          </p>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Minimum Words for AI Analysis</label>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.aiMinWordCount}
            onChange={(e) =>
              handleChange(
                "aiMinWordCount",
                Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1))
              )
            }
            style={inputStyle}
          />
          <p style={helpTextStyle}>
            Skip AI requests for short phrases like "thank you".
          </p>
        </div>
      </div>

      {/* Display Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaPalette />
          <h3 style={{ margin: 0 }}>Display Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.autoAddDetectedToHistory}
              onChange={(e) =>
                handleChange("autoAddDetectedToHistory", e.target.checked)
              }
            />
            Add Detected Verses to Search History
          </label>
          <p style={helpTextStyle}>
            Automatically add verses detected from transcription to the chat
            panel.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-4)",
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Direct Reference Color</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
              }}
            >
              <input
                type="color"
                value={settings.directReferenceColor}
                onChange={(e) =>
                  handleChange("directReferenceColor", e.target.value)
                }
                style={{
                  width: "50px",
                  height: "36px",
                  border: "none",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={settings.directReferenceColor}
                onChange={(e) =>
                  handleChange("directReferenceColor", e.target.value)
                }
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Paraphrase Reference Color</label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
              }}
            >
              <input
                type="color"
                value={settings.paraphraseReferenceColor}
                onChange={(e) =>
                  handleChange("paraphraseReferenceColor", e.target.value)
                }
                style={{
                  width: "50px",
                  height: "36px",
                  border: "none",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={settings.paraphraseReferenceColor}
                onChange={(e) =>
                  handleChange("paraphraseReferenceColor", e.target.value)
                }
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ProPresenter Activation */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaDesktop />
          <h3 style={{ margin: 0 }}>ProPresenter Activation</h3>
        </div>

        <p
          style={{
            marginBottom: "var(--spacing-4)",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Optionally trigger a ProPresenter presentation when a verse goes live
          or when cleared. This is useful for showing a graphic overlay when
          verses are being displayed.
        </p>

        <div style={fieldStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={settings.autoTriggerOnDetection}
              onChange={(e) =>
                handleChange("autoTriggerOnDetection", e.target.checked)
              }
            />
            Auto-Trigger on Detection
          </label>
          <p style={helpTextStyle}>
            Automatically go live when a Bible verse is detected in
            transcription.
          </p>
        </div>

        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p
            style={{
              margin: "0 0 12px 0",
              color: "var(--app-text-color)",
              fontSize: "0.9em",
            }}
          >
            <strong>Instructions:</strong> Go to ProPresenter and put the slide
            you want to trigger live, then click "Get Slide".
          </p>

          {slideLoadError && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                borderRadius: "6px",
                color: "#ef4444",
                fontSize: "0.9em",
              }}
            >
              {slideLoadError}
            </div>
          )}

          {slideLoadSuccess && settings.proPresenterActivation && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "6px",
                color: "#22c55e",
                fontSize: "0.9em",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <FaCheck />
                <div>
                  <div style={{ fontWeight: 600 }}>Slide captured!</div>
                  <div
                    style={{
                      fontSize: "0.85em",
                      marginTop: "4px",
                      opacity: 0.9,
                    }}
                  >
                    Presentation:{" "}
                    {settings.proPresenterActivation.presentationName ||
                      settings.proPresenterActivation.presentationUuid}
                    <br />
                    Slide Index: {settings.proPresenterActivation.slideIndex}
                  </div>
                </div>
              </div>
            </div>
          )}

          {settings.proPresenterActivation && !slideLoadSuccess && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "var(--app-header-bg)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "6px",
                fontSize: "0.9em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                Current Configuration:
              </div>
              <div>
                Presentation:{" "}
                {settings.proPresenterActivation.presentationName ||
                  settings.proPresenterActivation.presentationUuid}
                <br />
                Slide Index: {settings.proPresenterActivation.slideIndex}
              </div>
            </div>
          )}

          {/* Animation Trigger Settings */}
          {settings.proPresenterActivation && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "var(--app-header-bg)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "0.85em",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "var(--app-text-color)",
                }}
              >
                Animation Trigger Settings:
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "0.8em",
                      display: "block",
                      marginBottom: "4px",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Go Live Clicks:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={activationClicks}
                    onChange={(e) =>
                      setActivationClicks(
                        Math.max(1, parseInt(e.target.value) || 1)
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      fontSize: "0.85em",
                      backgroundColor: "var(--app-input-bg-color)",
                      color: "var(--app-input-text-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "4px",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "0.8em",
                      display: "block",
                      marginBottom: "4px",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Clear/Off Live Clicks:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={takeOffClicks}
                    onChange={(e) =>
                      setTakeOffClicks(
                        Math.max(0, parseInt(e.target.value) || 0)
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      fontSize: "0.85em",
                      backgroundColor: "var(--app-input-bg-color)",
                      color: "var(--app-input-text-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  fontSize: "0.75em",
                  color: "var(--app-text-color-secondary)",
                  marginTop: "6px",
                }}
              >
                Use multiple clicks to trigger ProPresenter animations. "Go Live
                Clicks" triggers when a verse is set live. "Clear/Off Live
                Clicks" triggers when clearing the live verse.
              </div>

              {/* Clear Text File on Take Off Option */}
              <div
                style={{
                  marginTop: "var(--spacing-3)",
                  paddingTop: "var(--spacing-3)",
                  borderTop: "1px solid var(--app-border-color)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-2)",
                  }}
                >
                  <input
                    type="checkbox"
                    id="clearTextFileOnTakeOff"
                    checked={clearTextFileOnTakeOff}
                    onChange={(e) =>
                      setClearTextFileOnTakeOff(e.target.checked)
                    }
                    style={{ width: "auto", margin: 0 }}
                  />
                  <label
                    htmlFor="clearTextFileOnTakeOff"
                    style={{
                      margin: 0,
                      cursor: "pointer",
                      fontWeight: 500,
                      fontSize: "0.9em",
                    }}
                  >
                    Clear text file when taking off live
                  </label>
                </div>
                <div
                  style={{
                    fontSize: "0.75em",
                    color: "var(--app-text-color-secondary)",
                    marginTop: "4px",
                    marginLeft: "24px",
                  }}
                >
                  If unchecked, the text file will remain unchanged when
                  clearing a live verse. Only the ProPresenter slide will be
                  triggered.
                </div>
              </div>
            </div>
          )}

          {/* ProPresenter Connection Selector */}
          {enabledConnections.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--app-text-color-secondary)",
                  fontWeight: 600,
                }}
              >
                Get slide from:
              </label>
              {enabledConnections.length === 1 ? (
                <div
                  style={{
                    padding: "6px 8px",
                    fontSize: "0.9em",
                    backgroundColor: "var(--app-input-bg-color)",
                    color: "var(--app-input-text-color)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "4px",
                  }}
                >
                  {enabledConnections[0].name} ({enabledConnections[0].apiUrl})
                </div>
              ) : (
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: "0.9em",
                    backgroundColor: "var(--app-input-bg-color)",
                    color: "var(--app-input-text-color)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "4px",
                  }}
                >
                  {enabledConnections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.apiUrl})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {enabledConnections.length === 0 && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "var(--app-header-bg)",
                borderRadius: "6px",
                fontSize: "0.85rem",
              }}
            >
              <p
                style={{ margin: 0, color: "var(--app-text-color-secondary)" }}
              >
                No ProPresenter connections enabled. Configure in Settings →
                ProPresenter.
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleGetSlide}
              disabled={isLoadingSlide || enabledConnections.length === 0}
              className="secondary"
              style={{ minWidth: "140px" }}
            >
              {isLoadingSlide ? (
                <>
                  <FaSpinner
                    style={{
                      animation: "spin 1s linear infinite",
                      marginRight: "6px",
                    }}
                  />
                  Reading...
                </>
              ) : (
                <>
                  <FaDesktop style={{ marginRight: "6px" }} />
                  Get Slide
                </>
              )}
            </button>
            {settings.proPresenterActivation && (
              <button
                onClick={handleRemoveProPresenterConfig}
                className="secondary"
              >
                <FaTimes style={{ marginRight: "6px" }} />
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Output Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaFileExport />
          <h3 style={{ margin: 0 }}>Output Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Output Path</label>
          <input
            type="text"
            value={settings.bibleOutputPath || ""}
            onChange={(e) => handleChange("bibleOutputPath", e.target.value)}
            placeholder="/path/to/output/folder"
            style={inputStyle}
          />
          <p style={helpTextStyle}>
            Directory where verse text files will be saved.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--spacing-4)",
          }}
        >
          <div style={fieldStyle}>
            <label style={labelStyle}>Verse Text Filename</label>
            <input
              type="text"
              value={settings.bibleTextFileName || ""}
              onChange={(e) =>
                handleChange("bibleTextFileName", e.target.value)
              }
              placeholder="verse_text.txt"
              style={inputStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Reference Filename</label>
            <input
              type="text"
              value={settings.bibleReferenceFileName || ""}
              onChange={(e) =>
                handleChange("bibleReferenceFileName", e.target.value)
              }
              placeholder="verse_reference.txt"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Auto-save status */}
      <div
        style={{
          padding: "var(--spacing-3)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        {saveMessage && (
          <span
            style={{
              color: saveMessage.toLowerCase().includes("saved")
                ? "var(--success)"
                : "var(--error)",
              fontSize: "0.9em",
            }}
          >
            {saveMessage}
          </span>
        )}
      </div>

      {/* Offline Model Manager Modal */}
      <OfflineModelManager
        isOpen={showModelManager}
        onClose={() => setShowModelManager(false)}
        onModelDownloaded={() => {
          // Refresh downloaded models list
          setDownloadedModelIds(getDownloadedModelIds());
        }}
        onModelDeleted={() => {
          // Refresh downloaded models list
          setDownloadedModelIds(getDownloadedModelIds());
        }}
      />
    </div>
  );
};

export default SmartVersesSettings;

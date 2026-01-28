import React, { useEffect, useCallback, useRef, useState } from "react";
import { AppSettings, AIProvider, AIProviderType, AIModelSetting } from "../types";
import { getAppSettings, saveAppSettings } from "../utils/aiConfig";
import { fetchOpenAIModels, fetchGeminiModels, fetchGroqModels } from "../services/aiService";
import { formatGroqModelLabel } from "../utils/groqModelLimits";
import { FaSpinner, FaChevronDown, FaChevronUp, FaPlus, FaTrash, FaMagic, FaDownload } from "react-icons/fa";
import {
  ProPresenterAITemplate,
  ProPresenterAITemplateUseCase,
} from "../types/globalChat";
import {
  loadProPresenterAITemplates,
  saveProPresenterAITemplates,
  USE_CASE_LABELS,
} from "../utils/proPresenterAITemplates";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterConnection } from "../types/propresenter";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";

interface AISettingsFormProps {
  // Props if any, e.g., onSettingsChange callback if SettingsPage needs to react
}

const AISettingsForm: React.FC<AISettingsFormProps> = () => {
  const [appSettings, setAppSettings] = useState<AppSettings>(getAppSettings());
  const [openAIKeyInput, setOpenAIKeyInput] = useState(
    appSettings.openAIConfig?.apiKey || ""
  );
  const [geminiKeyInput, setGeminiKeyInput] = useState(
    appSettings.geminiConfig?.apiKey || ""
  );
  const [groqKeyInput, setGroqKeyInput] = useState(
    appSettings.groqConfig?.apiKey || ""
  );

  // Default provider model settings
  const [defaultProviderModel, setDefaultProviderModel] = useState(
    appSettings.defaultAIModel || ""
  );
  const [defaultProviderModels, setDefaultProviderModels] = useState<string[]>([]);
  const [defaultProviderModelsLoading, setDefaultProviderModelsLoading] = useState(false);

  // Spell check model settings
  const [spellCheckProvider, setSpellCheckProvider] = useState<AIProviderType | "">(
    appSettings.spellCheckModel?.provider || ""
  );
  const [spellCheckModel, setSpellCheckModel] = useState(
    appSettings.spellCheckModel?.model || ""
  );
  const [spellCheckModels, setSpellCheckModels] = useState<string[]>([]);
  const [spellCheckModelsLoading, setSpellCheckModelsLoading] = useState(false);

  // Timer AI assistant model settings
  const [timerAssistantProvider, setTimerAssistantProvider] = useState<AIProviderType | "">(
    appSettings.timerAssistantModel?.provider || ""
  );
  const [timerAssistantModel, setTimerAssistantModel] = useState(
    appSettings.timerAssistantModel?.model || ""
  );
  const [timerAssistantModels, setTimerAssistantModels] = useState<string[]>([]);
  const [timerAssistantModelsLoading, setTimerAssistantModelsLoading] = useState(false);

  // Global AI Assistant model settings
  const [globalAssistantProvider, setGlobalAssistantProvider] = useState<AIProviderType | "">(
    appSettings.globalAssistantModel?.provider || ""
  );
  const [globalAssistantModel, setGlobalAssistantModel] = useState(
    appSettings.globalAssistantModel?.model || ""
  );
  const [globalAssistantModels, setGlobalAssistantModels] = useState<string[]>([]);
  const [globalAssistantModelsLoading, setGlobalAssistantModelsLoading] = useState(false);

  // ProPresenter AI Templates
  const [ppAITemplates, setPPAITemplates] = useState<ProPresenterAITemplate[]>([]);
  const [ppAITemplatesExpanded, setPPAITemplatesExpanded] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProPresenterAITemplate | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [fetchingFromPP, setFetchingFromPP] = useState(false);

  // ProPresenter connection selection
  const [enabledConnections, setEnabledConnections] = useState<ProPresenterConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const originalTemplateRef = useRef<ProPresenterAITemplate | null>(null);

  useEffect(() => {
    // Update local state if settings are changed elsewhere (e.g. theme toggle)
    const settings = getAppSettings();
    setAppSettings(settings);
    setSpellCheckProvider(settings.spellCheckModel?.provider || "");
    setSpellCheckModel(settings.spellCheckModel?.model || "");
    setTimerAssistantProvider(settings.timerAssistantModel?.provider || "");
    setTimerAssistantModel(settings.timerAssistantModel?.model || "");
    setGlobalAssistantProvider(settings.globalAssistantModel?.provider || "");
    setGlobalAssistantModel(settings.globalAssistantModel?.model || "");
    setDefaultProviderModel(settings.defaultAIModel || "");
    
    // Load ProPresenter AI Templates
    setPPAITemplates(loadProPresenterAITemplates());

    // Load ProPresenter connections
    const connections = getEnabledConnections();
    setEnabledConnections(connections);
    if (connections.length > 0) {
      setSelectedConnectionId(connections[0].id);
    }
    setSettingsLoaded(true);
  }, []); // Re-evaluate if a dependency on global changes is needed

  // Auto-save AI provider settings (debounced) after initial load.
  useDebouncedEffect(
    () => {
      const spellCheckSetting: AIModelSetting | undefined =
        spellCheckProvider && spellCheckModel
          ? { provider: spellCheckProvider as AIProviderType, model: spellCheckModel }
          : undefined;

      const timerAssistantSetting: AIModelSetting | undefined =
        timerAssistantProvider && timerAssistantModel
          ? { provider: timerAssistantProvider as AIProviderType, model: timerAssistantModel }
          : undefined;

      const globalAssistantSetting: AIModelSetting | undefined =
        globalAssistantProvider && globalAssistantModel
          ? { provider: globalAssistantProvider as AIProviderType, model: globalAssistantModel }
          : undefined;

      // Merge against latest stored settings to avoid clobbering fields changed elsewhere.
      const base = getAppSettings();
      const newSettings: AppSettings = {
        ...base,
        ...appSettings,
        openAIConfig: openAIKeyInput ? { apiKey: openAIKeyInput } : undefined,
        geminiConfig: geminiKeyInput ? { apiKey: geminiKeyInput } : undefined,
        groqConfig: groqKeyInput ? { apiKey: groqKeyInput } : undefined,
        defaultAIProvider: appSettings.defaultAIProvider || undefined,
        defaultAIModel: appSettings.defaultAIProvider
          ? defaultProviderModel || undefined
          : undefined,
        spellCheckModel: spellCheckSetting,
        timerAssistantModel: timerAssistantSetting,
        globalAssistantModel: globalAssistantSetting,
      };

      try {
        saveAppSettings(newSettings);
        setAppSettings(newSettings);
        setSaveStatus("All changes saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSaveStatus(`Failed to save: ${msg}`);
      }
    },
    [
      openAIKeyInput,
      geminiKeyInput,
      groqKeyInput,
      appSettings.defaultAIProvider,
      defaultProviderModel,
      spellCheckProvider,
      spellCheckModel,
      timerAssistantProvider,
      timerAssistantModel,
      globalAssistantProvider,
      globalAssistantModel,
      settingsLoaded,
    ],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );

  // Fetch models when default provider changes
  useEffect(() => {
    (async () => {
      const provider = appSettings.defaultAIProvider;
      if (!provider) {
        setDefaultProviderModels([]);
        setDefaultProviderModel("");
        return;
      }

      setDefaultProviderModelsLoading(true);
      try {
        if (provider === "openai" && openAIKeyInput) {
          const models = await fetchOpenAIModels(openAIKeyInput);
          setDefaultProviderModels(models);
          if (models.length > 0 && !models.includes(defaultProviderModel)) {
            setDefaultProviderModel(models[0]);
          }
        } else if (provider === "gemini" && geminiKeyInput) {
          const models = await fetchGeminiModels(geminiKeyInput);
          setDefaultProviderModels(models);
          if (models.length > 0 && !models.includes(defaultProviderModel)) {
            setDefaultProviderModel(models[0]);
          }
        } else if (provider === "groq" && groqKeyInput) {
          const models = await fetchGroqModels(groqKeyInput);
          setDefaultProviderModels(models);
          if (models.length > 0 && !models.includes(defaultProviderModel)) {
            setDefaultProviderModel(models[0]);
          }
        } else {
          setDefaultProviderModels([]);
        }
      } catch {
        setDefaultProviderModels([]);
      } finally {
        setDefaultProviderModelsLoading(false);
      }
    })();
  }, [
    appSettings.defaultAIProvider,
    openAIKeyInput,
    geminiKeyInput,
    groqKeyInput,
  ]);

  // Fetch models when spell check provider changes
  useEffect(() => {
    (async () => {
      if (!spellCheckProvider) {
        setSpellCheckModels([]);
        return;
      }
      
      setSpellCheckModelsLoading(true);
      try {
        if (spellCheckProvider === "openai" && openAIKeyInput) {
          const models = await fetchOpenAIModels(openAIKeyInput);
          setSpellCheckModels(models);
          // If current model not in list, select first
          if (models.length > 0 && !models.includes(spellCheckModel)) {
            setSpellCheckModel(models[0]);
          }
        } else if (spellCheckProvider === "gemini" && geminiKeyInput) {
          const models = await fetchGeminiModels(geminiKeyInput);
          setSpellCheckModels(models);
          if (models.length > 0 && !models.includes(spellCheckModel)) {
            setSpellCheckModel(models[0]);
          }
        } else if (spellCheckProvider === "groq" && groqKeyInput) {
          const models = await fetchGroqModels(groqKeyInput);
          setSpellCheckModels(models);
          if (models.length > 0 && !models.includes(spellCheckModel)) {
            setSpellCheckModel(models[0]);
          }
        } else {
          setSpellCheckModels([]);
        }
      } catch {
        setSpellCheckModels([]);
      } finally {
        setSpellCheckModelsLoading(false);
      }
    })();
  }, [spellCheckProvider, openAIKeyInput, geminiKeyInput, groqKeyInput]);

  // Fetch models when timer assistant provider changes
  useEffect(() => {
    (async () => {
      if (!timerAssistantProvider) {
        setTimerAssistantModels([]);
        return;
      }
      
      setTimerAssistantModelsLoading(true);
      try {
        if (timerAssistantProvider === "openai" && openAIKeyInput) {
          const models = await fetchOpenAIModels(openAIKeyInput);
          setTimerAssistantModels(models);
          if (models.length > 0 && !models.includes(timerAssistantModel)) {
            setTimerAssistantModel(models[0]);
          }
        } else if (timerAssistantProvider === "gemini" && geminiKeyInput) {
          const models = await fetchGeminiModels(geminiKeyInput);
          setTimerAssistantModels(models);
          if (models.length > 0 && !models.includes(timerAssistantModel)) {
            setTimerAssistantModel(models[0]);
          }
        } else if (timerAssistantProvider === "groq" && groqKeyInput) {
          const models = await fetchGroqModels(groqKeyInput);
          setTimerAssistantModels(models);
          if (models.length > 0 && !models.includes(timerAssistantModel)) {
            setTimerAssistantModel(models[0]);
          }
        } else {
          setTimerAssistantModels([]);
        }
      } catch {
        setTimerAssistantModels([]);
      } finally {
        setTimerAssistantModelsLoading(false);
      }
    })();
  }, [timerAssistantProvider, openAIKeyInput, geminiKeyInput, groqKeyInput]);

  // Fetch models when global assistant provider changes
  useEffect(() => {
    (async () => {
      if (!globalAssistantProvider) {
        setGlobalAssistantModels([]);
        return;
      }
      
      setGlobalAssistantModelsLoading(true);
      try {
        if (globalAssistantProvider === "openai" && openAIKeyInput) {
          const models = await fetchOpenAIModels(openAIKeyInput);
          setGlobalAssistantModels(models);
          if (models.length > 0 && !models.includes(globalAssistantModel)) {
            setGlobalAssistantModel(models[0]);
          }
        } else if (globalAssistantProvider === "gemini" && geminiKeyInput) {
          const models = await fetchGeminiModels(geminiKeyInput);
          setGlobalAssistantModels(models);
          if (models.length > 0 && !models.includes(globalAssistantModel)) {
            setGlobalAssistantModel(models[0]);
          }
        } else if (globalAssistantProvider === "groq" && groqKeyInput) {
          const models = await fetchGroqModels(groqKeyInput);
          setGlobalAssistantModels(models);
          if (models.length > 0 && !models.includes(globalAssistantModel)) {
            setGlobalAssistantModel(models[0]);
          }
        } else {
          setGlobalAssistantModels([]);
        }
      } catch {
        setGlobalAssistantModels([]);
      } finally {
        setGlobalAssistantModelsLoading(false);
      }
    })();
  }, [globalAssistantProvider, openAIKeyInput, geminiKeyInput, groqKeyInput]);

  const handleDefaultProviderChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const provider = event.target.value as AIProvider;
    const newSettings: AppSettings = {
      ...appSettings,
      defaultAIProvider: provider,
    };
    setAppSettings(newSettings);
    setDefaultProviderModel("");
    setDefaultProviderModels([]);
  };

  const handleSpellCheckProviderChange = (provider: AIProviderType | "") => {
    setSpellCheckProvider(provider);
    // Model will be fetched and set by the useEffect
    if (!provider) {
      setSpellCheckModel("");
      setSpellCheckModels([]);
    }
  };

  const handleTimerAssistantProviderChange = (provider: AIProviderType | "") => {
    setTimerAssistantProvider(provider);
    // Model will be fetched and set by the useEffect
    if (!provider) {
      setTimerAssistantModel("");
      setTimerAssistantModels([]);
    }
  };

  const handleGlobalAssistantProviderChange = (provider: AIProviderType | "") => {
    setGlobalAssistantProvider(provider);
    // Model will be fetched and set by the useEffect
    if (!provider) {
      setGlobalAssistantModel("");
      setGlobalAssistantModels([]);
    }
  };

  // ProPresenter AI Templates handlers
  const handleAddTemplate = () => {
    const newTemplate: ProPresenterAITemplate = {
      id: `pp-ai-tpl-${Date.now()}`,
      name: "",
      description: "",
      useCase: "custom",
      maxLines: 3,
      outputPath: "",
      outputFileNamePrefix: "",
      presentationUuid: "",
      slideIndex: 0,
      activationClicks: 1,
    };
    setEditingTemplate(newTemplate);
    setIsAddingTemplate(true);
    originalTemplateRef.current = null;
  };

  const isValidPpTemplateDraft = (t: ProPresenterAITemplate | null) => {
    return !!(
      t &&
      t.name &&
      t.outputPath &&
      t.outputFileNamePrefix &&
      t.presentationUuid
    );
  };

  // Auto-save ProPresenter AI template draft on change (debounced).
  useDebouncedEffect(
    () => {
      if (!editingTemplate) return;
      if (!isValidPpTemplateDraft(editingTemplate)) {
        setSaveStatus("Fill required ProPresenter AI template fields to save");
        return;
      }

      setPPAITemplates((prev) => {
        const exists = prev.some((t) => t.id === editingTemplate.id);
        const updatedTemplates = exists
          ? prev.map((t) => (t.id === editingTemplate.id ? editingTemplate : t))
          : [...prev, editingTemplate];

        saveProPresenterAITemplates(updatedTemplates);
        console.log(
          "[AISettings] Auto-saved template:",
          editingTemplate.name,
          "Total:",
          updatedTemplates.length
        );
        return updatedTemplates;
      });

      setSaveStatus("All changes saved");
      setTimeout(() => setSaveStatus(null), 2000);
    },
    [editingTemplate, settingsLoaded],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );

  const handleDoneTemplate = () => {
    if (isAddingTemplate && !isValidPpTemplateDraft(editingTemplate)) {
      setSaveStatus("Fill required ProPresenter AI template fields to save");
      return;
    }
    setEditingTemplate(null);
    setIsAddingTemplate(false);
    originalTemplateRef.current = null;
  };

  const handleDiscardTemplate = () => {
    if (!editingTemplate) {
      setEditingTemplate(null);
      setIsAddingTemplate(false);
      originalTemplateRef.current = null;
      return;
    }

    if (originalTemplateRef.current) {
      const reverted = ppAITemplates.map((t) =>
        t.id === originalTemplateRef.current!.id ? originalTemplateRef.current! : t
      );
      setPPAITemplates(reverted);
      saveProPresenterAITemplates(reverted);
    } else {
      // new draft (best-effort remove if it got auto-saved)
      const filtered = ppAITemplates.filter((t) => t.id !== editingTemplate.id);
      setPPAITemplates(filtered);
      saveProPresenterAITemplates(filtered);
    }

    setEditingTemplate(null);
    setIsAddingTemplate(false);
    originalTemplateRef.current = null;
    setSaveStatus(null);
  };

  const handleDeleteTemplate = (id: string) => {
    if (window.confirm("Delete this ProPresenter AI template?")) {
      const updatedTemplates = ppAITemplates.filter(t => t.id !== id);
      setPPAITemplates(updatedTemplates);
      // Immediately save to localStorage
      saveProPresenterAITemplates(updatedTemplates);
      console.log("[AISettings] Deleted template. Remaining:", updatedTemplates.length);
    }
  };

  // Get template info from ProPresenter (similar to ProPresenter Activation)
  const handleGetFromProPresenter = useCallback(async () => {
    if (enabledConnections.length === 0) {
      alert("No ProPresenter connections enabled");
      return;
    }

    // Find the selected connection
    const conn = enabledConnections.find(c => c.id === selectedConnectionId) || enabledConnections[0];

    setFetchingFromPP(true);
    try {
      const result = await getCurrentSlideIndex(conn);
      
      if (result && result.presentation_index?.presentation_id?.uuid && typeof result.presentation_index?.index === "number") {
        setEditingTemplate(prev => prev ? {
          ...prev,
          presentationUuid: result.presentation_index.presentation_id.uuid,
          slideIndex: result.presentation_index.index,
        } : null);
        alert(`Got presentation: ${result.presentation_index?.presentation_id?.name || "Unknown"}\nSlide index: ${result.presentation_index.index}`);
      } else {
        alert("Could not get current slide info from ProPresenter. Make sure a presentation is active.");
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Failed to get from ProPresenter"}`);
    } finally {
      setFetchingFromPP(false);
    }
  }, [enabledConnections, selectedConnectionId]);

  return (
    <div className="settings-form-section">
      <h3>AI Provider Configuration</h3>
      <div className="form-group">
        <label htmlFor="groq-key">Groq API Key (Recommended - Super Fast):</label>
        <input
          type="password" // Keep API keys masked
          id="groq-key"
          value={groqKeyInput}
          onChange={(e) => setGroqKeyInput(e.target.value)}
          placeholder="Enter your Groq API Key"
        />
        <div
          style={{
            marginTop: "6px",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Get your Free Groq API Key:{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer noopener"
          >
            https://console.groq.com/keys
          </a>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="openai-key">OpenAI API Key:</label>
        <input
          type="password" // Keep API keys masked
          id="openai-key"
          value={openAIKeyInput}
          onChange={(e) => setOpenAIKeyInput(e.target.value)}
          placeholder="Enter your OpenAI API Key"
        />
        <div
          style={{
            marginTop: "6px",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Get your OpenAI key:{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer noopener"
          >
            https://platform.openai.com/api-keys
          </a>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="gemini-key">Gemini API Key:</label>
        <input
          type="password" // Keep API keys masked
          id="gemini-key"
          value={geminiKeyInput}
          onChange={(e) => setGeminiKeyInput(e.target.value)}
          placeholder="Enter your Gemini API Key"
        />
        <div
          style={{
            marginTop: "6px",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Get your Gemini key:{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer noopener"
          >
            https://aistudio.google.com/apikey
          </a>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="default-ai-provider">Default AI Provider:</label>
        <select
          id="default-ai-provider"
          value={appSettings.defaultAIProvider || ""}
          onChange={handleDefaultProviderChange}
        >
          <option value="">None</option>
          <option value="openai" disabled={!openAIKeyInput}>
            OpenAI
          </option>
          <option value="gemini" disabled={!geminiKeyInput}>
            Gemini
          </option>
          <option value="groq" disabled={!groqKeyInput}>
            Groq (Recommended - Super Fast)
          </option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="default-ai-model">Default AI Model:</label>
        <div style={{ position: "relative" }}>
          <select
            id="default-ai-model"
            value={defaultProviderModel}
            onChange={(e) => setDefaultProviderModel(e.target.value)}
            disabled={!appSettings.defaultAIProvider || defaultProviderModelsLoading}
          >
            {!appSettings.defaultAIProvider && (
              <option value="">Select provider first</option>
            )}
            {defaultProviderModelsLoading && <option value="">Loading models...</option>}
            {!defaultProviderModelsLoading &&
              appSettings.defaultAIProvider &&
              defaultProviderModels.length === 0 && (
                <option value="">No models found</option>
              )}
            {defaultProviderModels.map((model) => (
              <option key={model} value={model}>
                {appSettings.defaultAIProvider === "groq"
                  ? formatGroqModelLabel(model)
                  : model}
              </option>
            ))}
          </select>
          {defaultProviderModelsLoading && (
            <FaSpinner
              style={{
                position: "absolute",
                right: "30px",
                top: "50%",
                transform: "translateY(-50%)",
                animation: "spin 1s linear infinite",
                color: "#a855f7",
              }}
            />
          )}
        </div>
      </div>

      {/* AI Model Settings Section */}
      <div
        style={{
          marginTop: "24px",
          paddingTop: "20px",
          borderTop: "1px solid var(--app-border-color)",
        }}
      >
        <h4 style={{ marginBottom: "16px", color: "var(--app-text-color)" }}>
          AI Model Settings
        </h4>
        <p
          style={{
            fontSize: "0.85em",
            color: "var(--app-text-color-secondary)",
            marginBottom: "16px",
          }}
        >
          Configure which AI model to use for specific features. If not set, the default provider will be used.
        </p>

        {/* Spell Check Model */}
        <div
          style={{
            backgroundColor: "var(--app-header-bg)",
            padding: "14px",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#22c55e" }}>✓</span> Spell Check / Proofread
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "140px" }}>
              <label
                htmlFor="spell-check-provider"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Provider:
              </label>
              <select
                id="spell-check-provider"
                value={spellCheckProvider}
                onChange={(e) => handleSpellCheckProviderChange(e.target.value as AIProviderType | "")}
                style={{ width: "100%" }}
              >
                <option value="">Use Default</option>
                <option value="openai" disabled={!openAIKeyInput}>
                  OpenAI
                </option>
                <option value="gemini" disabled={!geminiKeyInput}>
                  Gemini
                </option>
                <option value="groq" disabled={!groqKeyInput}>
                  Groq
                </option>
              </select>
            </div>
            <div style={{ flex: "2", minWidth: "200px" }}>
              <label
                htmlFor="spell-check-model"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Model:
              </label>
              <div style={{ position: "relative" }}>
                <select
                  id="spell-check-model"
                  value={spellCheckModel}
                  onChange={(e) => setSpellCheckModel(e.target.value)}
                  disabled={!spellCheckProvider || spellCheckModelsLoading}
                  style={{ width: "100%" }}
                >
                  {!spellCheckProvider && <option value="">Select provider first</option>}
                  {spellCheckModelsLoading && <option value="">Loading models...</option>}
                  {!spellCheckModelsLoading && spellCheckProvider && spellCheckModels.length === 0 && (
                    <option value="">No models found</option>
                  )}
                  {spellCheckModels.map((model) => (
                    <option key={model} value={model}>
                      {spellCheckProvider === "groq" ? formatGroqModelLabel(model) : model}
                    </option>
                  ))}
                </select>
                {spellCheckModelsLoading && (
                  <FaSpinner
                    style={{
                      position: "absolute",
                      right: "30px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      animation: "spin 1s linear infinite",
                      color: "#a855f7",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Timer Image Upload AI Processor */}
        <div
          style={{
            backgroundColor: "var(--app-header-bg)",
            padding: "14px",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#3b82f6" }}>⏱</span> Timer Image Upload AI Processor
          </div>
          <p
            style={{
              fontSize: "0.8em",
              color: "var(--app-text-color-secondary)",
              marginBottom: "12px",
            }}
          >
            Used when uploading schedule images via "Load Schedule → From Image (AI)" on the Timer page.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "140px" }}>
              <label
                htmlFor="timer-assistant-provider"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Provider:
              </label>
              <select
                id="timer-assistant-provider"
                value={timerAssistantProvider}
                onChange={(e) => handleTimerAssistantProviderChange(e.target.value as AIProviderType | "")}
                style={{ width: "100%" }}
              >
                <option value="">Use Default</option>
                <option value="openai" disabled={!openAIKeyInput}>
                  OpenAI
                </option>
                <option value="gemini" disabled={!geminiKeyInput}>
                  Gemini
                </option>
                <option value="groq" disabled={!groqKeyInput}>
                  Groq
                </option>
              </select>
            </div>
            <div style={{ flex: "2", minWidth: "200px" }}>
              <label
                htmlFor="timer-assistant-model"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Model:
              </label>
              <div style={{ position: "relative" }}>
                <select
                  id="timer-assistant-model"
                  value={timerAssistantModel}
                  onChange={(e) => setTimerAssistantModel(e.target.value)}
                  disabled={!timerAssistantProvider || timerAssistantModelsLoading}
                  style={{ width: "100%" }}
                >
                  {!timerAssistantProvider && <option value="">Select provider first</option>}
                  {timerAssistantModelsLoading && <option value="">Loading models...</option>}
                  {!timerAssistantModelsLoading && timerAssistantProvider && timerAssistantModels.length === 0 && (
                    <option value="">No models found</option>
                  )}
                  {timerAssistantModels.map((model) => (
                    <option key={model} value={model}>
                      {timerAssistantProvider === "groq" ? formatGroqModelLabel(model) : model}
                    </option>
                  ))}
                </select>
                {timerAssistantModelsLoading && (
                  <FaSpinner
                    style={{
                      position: "absolute",
                      right: "30px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      animation: "spin 1s linear infinite",
                      color: "#a855f7",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          {/* Vision model recommendation note */}
          <p
            style={{
              fontSize: "0.75em",
              color: "var(--app-text-color-secondary)",
              marginTop: "10px",
              marginBottom: "0",
              fontStyle: "italic",
            }}
          >
            💡 <strong>Tip:</strong>{" "}
            {timerAssistantProvider === "groq" ? (
              <>For image/schedule parsing, use vision models like <strong>Llama 4 Scout</strong> or <strong>Llama 4 Maverick</strong>. RPD (free request per day) (TPD free token per day)</>
            ) : timerAssistantProvider === "gemini" ? (
              <>For image/schedule parsing, use vision models like <strong>Gemini 1.5 Flash</strong>, <strong>Gemini 1.5 Pro</strong>, or <strong>Gemini 2.0 Flash</strong>.</>
            ) : timerAssistantProvider === "openai" ? (
              <>For image/schedule parsing, use vision models like <strong>GPT-4o</strong>, <strong>GPT-4o mini</strong>, or <strong>GPT-4 Turbo</strong>.</>
            ) : (
              <>Select a provider and choose a vision-capable model for best results with image/schedule parsing.</>
            )}
          </p>
        </div>

        {/* Global AI Assistant Model */}
        <div
          style={{
            backgroundColor: "var(--app-header-bg)",
            padding: "14px",
            borderRadius: "8px",
            marginBottom: "12px",
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FaMagic style={{ color: "#a855f7" }} /> Global AI Assistant
          </div>
          <p
            style={{
              fontSize: "0.8em",
              color: "var(--app-text-color-secondary)",
              marginBottom: "12px",
            }}
          >
            The floating AI assistant that can create slides, control timers, and interact with ProPresenter.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "140px" }}>
              <label
                htmlFor="global-assistant-provider"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Provider:
              </label>
              <select
                id="global-assistant-provider"
                value={globalAssistantProvider}
                onChange={(e) => handleGlobalAssistantProviderChange(e.target.value as AIProviderType | "")}
                style={{ width: "100%" }}
              >
                <option value="">Use Default</option>
                <option value="openai" disabled={!openAIKeyInput}>
                  OpenAI
                </option>
                <option value="gemini" disabled={!geminiKeyInput}>
                  Gemini
                </option>
                <option value="groq" disabled={!groqKeyInput}>
                  Groq
                </option>
              </select>
            </div>
            <div style={{ flex: "2", minWidth: "200px" }}>
              <label
                htmlFor="global-assistant-model"
                style={{ fontSize: "0.85em", display: "block", marginBottom: "4px" }}
              >
                Model:
              </label>
              <div style={{ position: "relative" }}>
                <select
                  id="global-assistant-model"
                  value={globalAssistantModel}
                  onChange={(e) => setGlobalAssistantModel(e.target.value)}
                  disabled={!globalAssistantProvider || globalAssistantModelsLoading}
                  style={{ width: "100%" }}
                >
                  {!globalAssistantProvider && <option value="">Select provider first</option>}
                  {globalAssistantModelsLoading && <option value="">Loading models...</option>}
                  {!globalAssistantModelsLoading && globalAssistantProvider && globalAssistantModels.length === 0 && (
                    <option value="">No models found</option>
                  )}
                  {globalAssistantModels.map((model) => (
                    <option key={model} value={model}>
                      {globalAssistantProvider === "groq" ? formatGroqModelLabel(model) : model}
                    </option>
                  ))}
                </select>
                {globalAssistantModelsLoading && (
                  <FaSpinner
                    style={{
                      position: "absolute",
                      right: "30px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      animation: "spin 1s linear infinite",
                      color: "#a855f7",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Collapsible ProPresenter AI Templates */}
          <div style={{ marginTop: "16px", borderTop: "1px solid var(--app-border-color)", paddingTop: "12px" }}>
            <button
              onClick={() => setPPAITemplatesExpanded(!ppAITemplatesExpanded)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "none",
                border: "none",
                color: "var(--app-text-color)",
                cursor: "pointer",
                padding: "4px 0",
                width: "100%",
                textAlign: "left",
              }}
            >
              {ppAITemplatesExpanded ? <FaChevronUp /> : <FaChevronDown />}
              <span style={{ fontWeight: 500 }}>ProPresenter AI Templates</span>
              <span style={{ fontSize: "0.8em", color: "var(--app-text-color-secondary)", marginLeft: "8px" }}>
                ({ppAITemplates.length})
              </span>
            </button>

            {ppAITemplatesExpanded && (
              <div style={{ marginTop: "12px" }}>
                <p
                  style={{
                    fontSize: "0.8em",
                    color: "var(--app-text-color-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  Templates for the AI to display content directly on ProPresenter. Each writes text to a file and triggers a slide.
                </p>

                {/* Template List */}
                {ppAITemplates.length === 0 && !isAddingTemplate && (
                  <div
                    style={{
                      padding: "16px",
                      border: "1px dashed var(--app-border-color)",
                      borderRadius: "8px",
                      textAlign: "center",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    No templates configured. Add one to enable AI to display directly on ProPresenter.
                  </div>
                )}

                {ppAITemplates.map((template) => (
                  <div
                    key={template.id}
                    style={{
                      padding: "10px",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      borderRadius: "6px",
                      marginBottom: "8px",
                      border: editingTemplate?.id === template.id ? "1px solid #a855f7" : "1px solid transparent",
                    }}
                  >
                    {editingTemplate?.id === template.id && !isAddingTemplate ? (
                      <TemplateEditForm
                        template={editingTemplate}
                        setTemplate={setEditingTemplate}
                        onDone={handleDoneTemplate}
                        onDiscard={handleDiscardTemplate}
                        onGetFromPP={handleGetFromProPresenter}
                        fetchingFromPP={fetchingFromPP}
                        enabledConnections={enabledConnections}
                        selectedConnectionId={selectedConnectionId}
                        onConnectionChange={setSelectedConnectionId}
                      />
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: "8px" }}>
                            {template.name}
                            <span
                              style={{
                                fontSize: "0.7em",
                                padding: "2px 6px",
                                backgroundColor: "rgba(168, 85, 247, 0.2)",
                                color: "#d8b4fe",
                                borderRadius: "4px",
                              }}
                            >
                              {USE_CASE_LABELS[template.useCase]}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.8em", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
                            {template.description}
                          </div>
                          <div style={{ fontSize: "0.75em", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
                            Slide: {template.slideIndex} | Max lines: {template.maxLines}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            onClick={() => {
                              originalTemplateRef.current = template;
                              setEditingTemplate(template);
                              setIsAddingTemplate(false);
                            }}
                            style={{
                              padding: "6px 10px",
                              background: "rgba(255,255,255,0.1)",
                              border: "none",
                              borderRadius: "4px",
                              color: "var(--app-text-color)",
                              cursor: "pointer",
                              fontSize: "0.8em",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(template.id)}
                            style={{
                              padding: "6px",
                              background: "rgba(239, 68, 68, 0.2)",
                              border: "none",
                              borderRadius: "4px",
                              color: "#fca5a5",
                              cursor: "pointer",
                            }}
                          >
                            <FaTrash size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new template form */}
                {isAddingTemplate && editingTemplate && (
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "rgba(168, 85, 247, 0.1)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: "10px" }}>New ProPresenter AI Template</div>
                    <TemplateEditForm
                      template={editingTemplate}
                      setTemplate={setEditingTemplate}
                      onDone={handleDoneTemplate}
                      onDiscard={handleDiscardTemplate}
                      onGetFromPP={handleGetFromProPresenter}
                      fetchingFromPP={fetchingFromPP}
                      enabledConnections={enabledConnections}
                      selectedConnectionId={selectedConnectionId}
                      onConnectionChange={setSelectedConnectionId}
                    />
                  </div>
                )}

                {/* Add button */}
                {!isAddingTemplate && !editingTemplate && (
                  <button
                    onClick={handleAddTemplate}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      backgroundColor: "#a855f7",
                      border: "none",
                      borderRadius: "6px",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.85em",
                      marginTop: "8px",
                    }}
                  >
                    <FaPlus size={12} />
                    Add Template
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {saveStatus && (
        <p style={{ marginTop: "16px", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
          {saveStatus}
        </p>
      )}
      <p
        style={{
          fontSize: "0.8em",
          color: "var(--app-text-color-secondary)",
          marginTop: "10px",
        }}
      >
        Note: API keys are stored locally in your browser's storage.
      </p>

      <style>{`
        @keyframes spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to { transform: translateY(-50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Template Edit Form Component
interface TemplateEditFormProps {
  template: ProPresenterAITemplate;
  setTemplate: React.Dispatch<React.SetStateAction<ProPresenterAITemplate | null>>;
  onDone: () => void;
  onDiscard: () => void;
  onGetFromPP: () => void;
  fetchingFromPP: boolean;
  enabledConnections: ProPresenterConnection[];
  selectedConnectionId: string;
  onConnectionChange: (connectionId: string) => void;
}

const TemplateEditForm: React.FC<TemplateEditFormProps> = ({
  template,
  setTemplate,
  onDone,
  onDiscard,
  onGetFromPP,
  fetchingFromPP,
  enabledConnections,
  selectedConnectionId,
  onConnectionChange,
}) => {
  const useCases: ProPresenterAITemplateUseCase[] = [
    "lower-third",
    "prayer",
    "scripture",
    "announcement",
    "points-3line",
    "points-6line",
    "custom",
  ];

  const updateField = <K extends keyof ProPresenterAITemplate>(
    field: K,
    value: ProPresenterAITemplate[K]
  ) => {
    setTemplate(prev => prev ? { ...prev, [field]: value } : null);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <div>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Name *</label>
          <input
            type="text"
            value={template.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="e.g., Lower Third"
            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Use Case</label>
          <select
            value={template.useCase}
            onChange={(e) => updateField("useCase", e.target.value as ProPresenterAITemplateUseCase)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          >
            {useCases.map(uc => (
              <option key={uc} value={uc}>{USE_CASE_LABELS[uc]}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Description (AI uses this to select the template)</label>
        <input
          type="text"
          value={template.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="e.g., Good for speaker names and titles"
          style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <div>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Max Lines</label>
          <input
            type="number"
            min={1}
            max={10}
            value={template.maxLines}
            onChange={(e) => updateField("maxLines", parseInt(e.target.value) || 3)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Slide Index</label>
          <input
            type="number"
            min={0}
            value={template.slideIndex}
            onChange={(e) => updateField("slideIndex", parseInt(e.target.value) || 0)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          />
        </div>
        <div>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Go Live Clicks</label>
          <input
            type="number"
            min={1}
            max={10}
            value={template.activationClicks || 1}
            onChange={(e) => updateField("activationClicks", parseInt(e.target.value) || 1)}
            style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          />
        </div>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Output Folder Path *</label>
        <input
          type="text"
          value={template.outputPath}
          onChange={(e) => updateField("outputPath", e.target.value)}
          placeholder="/path/to/output/folder/"
          style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
        />
        <p style={{ fontSize: "0.7em", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
          Folder where files are written (e.g., /Users/you/ProPresenter/live/)
        </p>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>File Name Prefix *</label>
        <input
          type="text"
          value={template.outputFileNamePrefix}
          onChange={(e) => updateField("outputFileNamePrefix", e.target.value)}
          placeholder="verse_"
          style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
        />
        <p style={{ fontSize: "0.7em", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
          Creates files like: verse_1.txt, verse_2.txt, etc.
        </p>
      </div>

      {/* ProPresenter Connection Selector */}
      {enabledConnections.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Get slide from:</label>
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
              onChange={(e) => onConnectionChange(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
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

      <div style={{ marginBottom: "10px" }}>
        <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px" }}>Presentation UUID *</label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={template.presentationUuid}
            onChange={(e) => updateField("presentationUuid", e.target.value)}
            placeholder="Get from ProPresenter"
            style={{ flex: 1, padding: "6px 8px", borderRadius: "4px", border: "1px solid var(--app-border-color)", backgroundColor: "var(--app-bg-color)" }}
          />
          <button
            onClick={onGetFromPP}
            disabled={fetchingFromPP || enabledConnections.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              backgroundColor: "#22c55e",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              cursor: fetchingFromPP ? "wait" : "pointer",
              fontSize: "0.8em",
              opacity: fetchingFromPP ? 0.7 : 1,
            }}
          >
            {fetchingFromPP ? <FaSpinner style={{ animation: "spin 1s linear infinite" }} /> : <FaDownload />}
            Get from PP
          </button>
        </div>
        <p style={{ fontSize: "0.7em", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
          Select a slide in ProPresenter, then click "Get from PP" to auto-fill.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
        <button
          onClick={onDiscard}
          style={{
            padding: "6px 14px",
            backgroundColor: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: "4px",
            color: "var(--app-text-color)",
            cursor: "pointer",
            fontSize: "0.85em",
          }}
        >
          Discard
        </button>
        <button
          onClick={onDone}
          style={{
            padding: "6px 14px",
            backgroundColor: "#a855f7",
            border: "none",
            borderRadius: "4px",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.85em",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default AISettingsForm;

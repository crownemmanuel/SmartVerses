import React, { useState, useEffect, useMemo } from "react";
import {
  Template,
  TemplateType,
  LayoutType,
  AIProviderType,
  OpenAIModelType,
  GeminiModelType,
  GroqModelType,
} from "../types";
import "../App.css";
import IconPickerModal from "./IconPickerModal";
import GenerateAIPromptModal from "./GenerateAIPromptModal";
import ActivatePresentationModal from "./ActivatePresentationModal";
import { fetchGeminiModels, fetchOpenAIModels, fetchGroqModels } from "../services/aiService";
import { formatGroqModelLabel } from "../utils/groqModelLimits";
import { getAppSettings } from "../utils/aiConfig";
import {
  DEFAULT_JAVASCRIPT_CODE,
  DEFAULT_REGEX_CODE,
} from "../utils/templateDefaults";
import { FaArrowLeft, FaDesktop, FaChevronDown, FaChevronRight } from "react-icons/fa";
import { loadProPresenterConnections } from "../services/propresenterService";
import { ProPresenterActivationConfig } from "../types/propresenter";

interface SettingsDetailProps {
  template: Template;
  onSave: (template: Template) => void;
  onBack: () => void;
}

const SettingsDetail: React.FC<SettingsDetailProps> = ({
  template,
  onSave,
  onBack,
}) => {
  const [name, setName] = useState(template.name);
  const [icon, setIcon] = useState(template.icon);
  const [color, setColor] = useState(template.color);
  const [type, setType] = useState<TemplateType>(template.type);
  const [logic, setLogic] = useState(template.logic || "line-break");
  const [processingType, setProcessingType] = useState(
    template.processingType || "simple"
  );
  const [simpleStrategy, setSimpleStrategy] = useState("line-break");
  const [simpleValue, setSimpleValue] = useState(50);

  const [availableLayouts, setAvailableLayouts] = useState<LayoutType[]>(
    template.availableLayouts || []
  );
  const [aiPrompt, setAiPrompt] = useState(template.aiPrompt || "");
  const [outputPath, setOutputPath] = useState(template.outputPath || "");
  const [outputFileNamePrefix, setOutputFileNamePrefix] = useState(
    template.outputFileNamePrefix || ""
  );
  const [aiProvider, setAiProvider] = useState<AIProviderType | undefined>(
    template.aiProvider
  );
  const [aiModel, setAiModel] = useState<
    OpenAIModelType | GeminiModelType | GroqModelType | string | undefined
  >(template.aiModel);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isAIPromptModalOpen, setIsAIPromptModalOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  // Scripture output mapping
  const [scriptureReferenceFileIndex, setScriptureReferenceFileIndex] = useState<number | undefined>(
    template.scriptureReferenceFileIndex
  );
  const [scriptureTextFileIndex, setScriptureTextFileIndex] = useState<number | undefined>(
    template.scriptureTextFileIndex
  );
  // ProPresenter activation settings
  const [proPresenterActivation, setProPresenterActivation] = useState<ProPresenterActivationConfig | undefined>(
    template.proPresenterActivation
  );
  const [proPresenterConnectionIds, setProPresenterConnectionIds] = useState<string[]>(
    template.proPresenterConnectionIds || []
  );
  const [proPresenterActivationClicks, setProPresenterActivationClicks] = useState<number>(
    template.proPresenterActivationClicks ?? 1
  );
  const [proPresenterTakeOffClicks, setProPresenterTakeOffClicks] = useState<number>(
    template.proPresenterTakeOffClicks ?? 0
  );
  const [clearTextAfterLive, setClearTextAfterLive] = useState<boolean>(
    template.clearTextAfterLive ?? false
  );
  const [clearTextDelay, setClearTextDelay] = useState<number>(
    template.clearTextDelay ?? 0
  );
  const [autoLoadBibleVerses, setAutoLoadBibleVerses] = useState<boolean>(
    template.autoLoadBibleVerses ?? false
  );
  const [isActivatePresentationModalOpen, setIsActivatePresentationModalOpen] = useState(false);
  const [proPresenterConnections] = useState(() => loadProPresenterConnections());
  
  // Collapsible section states - collapsed by default to keep UI clean
  const [isScriptureSettingsCollapsed, setIsScriptureSettingsCollapsed] = useState(true);
  const [isProPresenterCollapsed, setIsProPresenterCollapsed] = useState(true);

  const appSettings = useMemo(() => getAppSettings(), []);
  const hasOpenAI = !!appSettings.openAIConfig?.apiKey;
  const hasGemini = !!appSettings.geminiConfig?.apiKey;
  const hasGroq = !!appSettings.groqConfig?.apiKey;

  const allLayoutTypes: LayoutType[] = [
    "one-line",
    "two-line",
    "three-line",
    "four-line",
    "five-line",
    "six-line",
  ];

  useEffect(() => {
    if (template) {
      setName(template.name);
      setIcon(template.icon);
      setColor(template.color);
      setType(template.type);
      setLogic(template.logic || "line-break");
      setProcessingType(template.processingType || "simple");

      const logicStr = template.logic || "line-break";
      if (logicStr === "line-break") {
        setSimpleStrategy("line-break");
        setSimpleValue(50);
      } else {
        const match = logicStr.match(/^(word-count|char-count)-(\d+)$/);
        if (match) {
          setSimpleStrategy(match[1]);
          setSimpleValue(parseInt(match[2], 10) || 50);
        } else {
          // Fallback to a valid default to avoid an invalid <select> value
          setSimpleStrategy("line-break");
          setSimpleValue(50);
        }
      }

      setAvailableLayouts(template.availableLayouts || []);
      setAiPrompt(template.aiPrompt || "");
      setOutputPath(template.outputPath || "");
      setOutputFileNamePrefix(template.outputFileNamePrefix || "");
      setAiProvider(template.aiProvider);
      setAiModel(template.aiModel);
      setScriptureReferenceFileIndex(template.scriptureReferenceFileIndex);
      setScriptureTextFileIndex(template.scriptureTextFileIndex);
      setProPresenterActivation(template.proPresenterActivation);
      setProPresenterConnectionIds(template.proPresenterConnectionIds || []);
      setProPresenterActivationClicks(template.proPresenterActivationClicks ?? 1);
      setProPresenterTakeOffClicks(template.proPresenterTakeOffClicks ?? 0);
      setClearTextAfterLive(template.clearTextAfterLive ?? false);
      setClearTextDelay(template.clearTextDelay ?? 0);
      setAutoLoadBibleVerses(template.autoLoadBibleVerses ?? false);
    }
  }, [template]);

  useEffect(() => {
    if (processingType !== "simple") return;

    if (simpleStrategy === "line-break") {
      setLogic("line-break");
    } else {
      setLogic(`${simpleStrategy}-${simpleValue}`);
    }
  }, [simpleStrategy, simpleValue, processingType]);

  // Load available models when provider changes
  useEffect(() => {
    (async () => {
      try {
        if (aiProvider === "openai" && hasOpenAI) {
          const ids = await fetchOpenAIModels(appSettings.openAIConfig!.apiKey);
          setModels(ids);
        } else if (aiProvider === "gemini" && hasGemini) {
          const ids = await fetchGeminiModels(appSettings.geminiConfig!.apiKey);
          setModels(ids);
        } else if (aiProvider === "groq" && hasGroq) {
          const ids = await fetchGroqModels(appSettings.groqConfig!.apiKey);
          setModels(ids);
        } else {
          setModels([]);
        }
      } catch {
        setModels([]);
      }
    })();
  }, [aiProvider, hasOpenAI, hasGemini, hasGroq, appSettings]);

  // Handle processing type change with default code
  const handleProcessingTypeChange = (
    newType: "simple" | "regex" | "javascript" | "ai"
  ) => {
    const previousType = processingType;
    setProcessingType(newType);

    // Only set default code when switching TO JavaScript or Regex from a different type
    // and the current logic is empty or is the default from another type
    if (newType === "javascript" && previousType !== "javascript") {
      // Check if current logic is empty, simple logic, or default regex
      if (
        !logic ||
        logic === "line-break" ||
        logic.match(/^(word-count|char-count)-\d+$/) ||
        logic === DEFAULT_REGEX_CODE
      ) {
        setLogic(DEFAULT_JAVASCRIPT_CODE);
      }
    } else if (newType === "regex" && previousType !== "regex") {
      if (
        !logic ||
        logic === "line-break" ||
        logic.match(/^(word-count|char-count)-\d+$/) ||
        logic === DEFAULT_JAVASCRIPT_CODE
      ) {
        setLogic(DEFAULT_REGEX_CODE);
      }
    } else if (newType === "simple") {
      setLogic("line-break");
    }
  };

  const handleSave = () => {
    if (!name.trim() || !outputPath.trim() || !outputFileNamePrefix.trim()) {
      alert(
        "Template name, output path and output file name prefix are required."
      );
      return;
    }

    let finalLogic = logic;
    if (processingType === "simple") {
      if (simpleStrategy === "line-break") {
        finalLogic = "line-break";
      } else {
        finalLogic = `${simpleStrategy}-${simpleValue}`;
      }
    }

    onSave({
      ...template,
      name,
      icon,
      color,
      type,
      logic: finalLogic,
      processingType,
      availableLayouts,
      // aiPrompt captured from dedicated AI prompt field
      outputPath,
      outputFileNamePrefix,
      aiPrompt: aiPrompt,
      aiProvider: processingType === "ai" ? aiProvider : undefined,
      aiModel: processingType === "ai" ? aiModel : undefined,
      scriptureReferenceFileIndex,
      scriptureTextFileIndex,
      proPresenterActivation,
      proPresenterConnectionIds: proPresenterConnectionIds.length > 0 ? proPresenterConnectionIds : undefined,
      proPresenterActivationClicks: proPresenterActivationClicks > 1 ? proPresenterActivationClicks : undefined,
      proPresenterTakeOffClicks: proPresenterTakeOffClicks !== 0 ? proPresenterTakeOffClicks : undefined, // Save if not default (0)
      clearTextAfterLive: clearTextAfterLive || undefined,
      clearTextDelay: clearTextAfterLive && clearTextDelay > 0 ? clearTextDelay : undefined,
      autoLoadBibleVerses: autoLoadBibleVerses || undefined,
    });
  };

  const toggleLayout = (layout: LayoutType) => {
    setAvailableLayouts((prev) =>
      prev.includes(layout)
        ? prev.filter((l) => l !== layout)
        : [...prev, layout]
    );
  };

  const renderLogicInput = () => {
    switch (processingType) {
      case "regex":
        return (
          <div className="form-group">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <label htmlFor="tpl-logic-regex">Regex Logic</label>
              <button
                type="button"
                onClick={() => setIsAIPromptModalOpen(true)}
                style={{
                  fontSize: "0.8em",
                  padding: "4px 8px",
                  backgroundColor: "var(--app-primary-color)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                🤖 Generate AI Prompt
              </button>
            </div>
            <input
              id="tpl-logic-regex"
              type="text"
              placeholder="/your-regex/flags"
              value={logic}
              onChange={(e) => setLogic(e.target.value)}
            />
            <p className="instruction-text">
              Enter a regular expression to split the text. Example:{" "}
              <code>/\n\s*\n/</code> to split by empty lines. Click "Generate AI
              Prompt" to get help from an AI.
            </p>
          </div>
        );
      case "javascript":
        return (
          <div className="form-group">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <label htmlFor="tpl-logic-js">JavaScript Logic</label>
              <button
                type="button"
                onClick={() => setIsAIPromptModalOpen(true)}
                style={{
                  fontSize: "0.8em",
                  padding: "4px 8px",
                  backgroundColor: "var(--app-primary-color)",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                🤖 Generate AI Prompt
              </button>
            </div>
            <textarea
              id="tpl-logic-js"
              placeholder="return input.split(' ')..."
              value={logic}
              onChange={(e) => setLogic(e.target.value)}
              rows={12}
              style={{ fontFamily: "monospace", fontSize: "0.85em" }}
            />
            <p className="instruction-text">
              Write a JavaScript snippet. The 'input' variable holds the text.
              Return an array of strings or {`{ text, layout }`} objects.
              Multi-layer slides use <code>\n</code> to separate layers. Click
              "Generate AI Prompt" to get help from an AI.
            </p>
          </div>
        );
      case "ai":
        return (
          <div className="form-group">
            <label htmlFor="tpl-logic-ai">AI Prompt</label>
            <textarea
              id="tpl-logic-ai"
              placeholder="Summarize the following text for a presentation..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
            />
            <p className="instruction-text">
              Describe how the AI should process the text. The more detailed
              your instruction, the better the result.
            </p>
          </div>
        );
      case "simple":
      default:
        const handleSimpleTypeChange = (newStrategy: string) => {
          setSimpleStrategy(newStrategy);
          if (newStrategy === "word-count") {
            setSimpleValue(50);
          } else if (newStrategy === "char-count") {
            setSimpleValue(250);
          }
        };

        return (
          <div className="form-group">
            <label>Simple Split</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select
                value={simpleStrategy}
                onChange={(e) => handleSimpleTypeChange(e.target.value)}
                className="select-css"
              >
                <option value="line-break">By Line Break</option>
                <option value="word-count">By Word Count</option>
                <option value="char-count">By Character Count</option>
              </select>
              {simpleStrategy !== "line-break" && (
                <input
                  type="number"
                  value={simpleValue}
                  onChange={(e) =>
                    setSimpleValue(parseInt(e.target.value, 10) || 1)
                  }
                  style={{ width: "80px" }}
                  min="1"
                />
              )}
            </div>
            <p className="instruction-text">
              Choose a simple way to split your text into slides.
            </p>
          </div>
        );
    }
  };

  return (
    <>
      <div className="settings-detail-container">
        <div className="settings-detail-header">
          <button onClick={onBack} className="icon-button">
            <FaArrowLeft />
          </button>
          <h3>Edit Template: {template.name}</h3>
        </div>
        <div className="settings-detail-form">
          <div className="settings-detail-section">
            <h4>Title & Icon</h4>
            <div className="form-group">
              <label htmlFor="template-name">Name:</label>
              <input
                type="text"
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <div className="form-group">
                <label htmlFor="template-icon">Icon:</label>
                <div
                  className="icon-picker-placeholder"
                  onClick={() => setIsIconPickerOpen(true)}
                >
                  {icon && (
                    <span
                      className="template-icon"
                      style={{ backgroundColor: color }}
                    >
                      {icon.slice(0, 2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="template-color">Color:</label>
                <input
                  type="color"
                  id="template-color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="settings-detail-section">
            <h4>Configuration</h4>
            <div className="form-group">
              <label>Processing Type</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    value="simple"
                    checked={processingType === "simple"}
                    onChange={() => handleProcessingTypeChange("simple")}
                  />
                  Simple
                </label>
                <label>
                  <input
                    type="radio"
                    value="regex"
                    checked={processingType === "regex"}
                    onChange={() => handleProcessingTypeChange("regex")}
                  />
                  Regex
                </label>
                <label>
                  <input
                    type="radio"
                    value="javascript"
                    checked={processingType === "javascript"}
                    onChange={() => handleProcessingTypeChange("javascript")}
                  />
                  JavaScript
                </label>
                <label>
                  <input
                    type="radio"
                    value="ai"
                    checked={processingType === "ai"}
                    onChange={() => handleProcessingTypeChange("ai")}
                  />
                  AI
                </label>
              </div>
            </div>
            {renderLogicInput()}
            <div className="form-group">
              <label>Available Layouts:</label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "5px",
                  marginTop: "5px",
                }}
              >
                {allLayoutTypes.map((layout) => (
                  <button
                    key={layout}
                    onClick={() => toggleLayout(layout)}
                    className={
                      availableLayouts.includes(layout)
                        ? "chip-selected"
                        : "chip"
                    }
                    style={{ fontSize: "0.8em", padding: "3px 6px" }}
                  >
                    {layout
                      .replace("-line", "")
                      .replace("-", " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {processingType === "ai" && (
            <div className="settings-detail-section">
              <h4>AI Configuration</h4>
              <div className="form-group">
                <label htmlFor="template-ai-provider">AI Provider:</label>
                <select
                  id="template-ai-provider"
                  value={aiProvider || ""}
                  onChange={(e) => {
                    const newProvider = e.target.value as AIProviderType;
                    setAiProvider(newProvider);
                    setAiModel(undefined);
                  }}
                >
                  <option value="" disabled>
                    Select a provider
                  </option>
                  <option value="openai" disabled={!hasOpenAI}>
                    OpenAI {!hasOpenAI ? "(add API key first)" : ""}
                  </option>
                  <option value="gemini" disabled={!hasGemini}>
                    Google Gemini {!hasGemini ? "(add API key first)" : ""}
                  </option>
                  <option value="groq" disabled={!hasGroq}>
                    Groq {!hasGroq ? "(add API key first)" : ""}
                  </option>
                </select>
              </div>

              {aiProvider && (
                <div className="form-group">
                  <label htmlFor="template-ai-model">AI Model:</label>
                  <select
                    id="template-ai-model"
                    value={aiModel || ""}
                    onChange={(e) =>
                      setAiModel(
                        e.target.value as OpenAIModelType | GeminiModelType | GroqModelType
                      )
                    }
                    disabled={!aiProvider || models.length === 0}
                  >
                    <option value="" disabled>
                      {models.length === 0
                        ? "No models available"
                        : "Select a model"}
                    </option>
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {aiProvider === "groq" ? formatGroqModelLabel(m) : m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="template-output-path">Output Path:</label>
            <input
              type="text"
              id="template-output-path"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="e.g., /Users/youruser/ProPresenterOutput/Sermon"
            />
          </div>
          <div className="form-group">
            <label htmlFor="template-output-prefix">
              Output File Name Prefix:
            </label>
            <input
              type="text"
              id="template-output-prefix"
              value={outputFileNamePrefix}
              onChange={(e) => setOutputFileNamePrefix(e.target.value)}
              placeholder="e.g., SermonNote"
            />
          </div>

          <div className="settings-detail-section collapsible-section">
            <div 
              className="collapsible-header"
              onClick={() => setIsScriptureSettingsCollapsed(!isScriptureSettingsCollapsed)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {isScriptureSettingsCollapsed ? <FaChevronRight size={12} /> : <FaChevronDown size={12} />}
              <h4 style={{ margin: 0 }}>📖 Scripture Settings</h4>
              {(autoLoadBibleVerses || scriptureReferenceFileIndex !== undefined || scriptureTextFileIndex !== undefined) && (
                <span style={{
                  marginLeft: "8px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  backgroundColor: "rgba(34, 197, 94, 0.2)",
                  color: "rgb(34, 197, 94)",
                }}>
                  CONFIGURED
                </span>
              )}
            </div>
            
            {!isScriptureSettingsCollapsed && (
              <div className="collapsible-content" style={{ marginTop: "15px" }}>
                {/* Bible Auto-Loading */}
                <div className="form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={autoLoadBibleVerses}
                      onChange={(e) => setAutoLoadBibleVerses(e.target.checked)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 500 }}>Auto-load Bible verses (KJV) by default</span>
                  </label>
                  <p className="instruction-text" style={{ marginTop: "8px", marginLeft: "28px" }}>
                    When enabled, the "Auto-load Bible verses" option will be pre-checked when importing content using this template.
                    Scripture references (e.g., "John 3:16") will be detected and verses added as slides automatically.
                  </p>
                </div>

                {/* Auto-Scripture Output Mapping */}
                <div style={{ marginTop: "20px", paddingTop: "15px", borderTop: "1px solid var(--app-border-color)" }}>
                  <label style={{ fontWeight: 600, marginBottom: "10px", display: "block" }}>Auto-Scripture Output Mapping</label>
                  <p className="instruction-text" style={{ marginBottom: "15px" }}>
                    Configure which text files receive scripture reference and verse text when going live on auto-generated scripture slides.
                    All other files will be blanked when a scripture slide goes live.
                  </p>
                  <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: "1", minWidth: "150px" }}>
                      <label htmlFor="scripture-reference-index">
                        Reference File Index:
                      </label>
                      <select
                        id="scripture-reference-index"
                        value={scriptureReferenceFileIndex ?? ""}
                        onChange={(e) =>
                          setScriptureReferenceFileIndex(
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                        className="select-css"
                      >
                        <option value="">Not Set</option>
                        <option value="1">File 1 ({outputFileNamePrefix || "prefix"}1.txt)</option>
                        <option value="2">File 2 ({outputFileNamePrefix || "prefix"}2.txt)</option>
                        <option value="3">File 3 ({outputFileNamePrefix || "prefix"}3.txt)</option>
                        <option value="4">File 4 ({outputFileNamePrefix || "prefix"}4.txt)</option>
                        <option value="5">File 5 ({outputFileNamePrefix || "prefix"}5.txt)</option>
                        <option value="6">File 6 ({outputFileNamePrefix || "prefix"}6.txt)</option>
                      </select>
                      <p className="instruction-text">
                        e.g., "John 3:16"
                      </p>
                    </div>
                    <div className="form-group" style={{ flex: "1", minWidth: "150px" }}>
                      <label htmlFor="scripture-text-index">
                        Verse Text File Index:
                      </label>
                      <select
                        id="scripture-text-index"
                        value={scriptureTextFileIndex ?? ""}
                        onChange={(e) =>
                          setScriptureTextFileIndex(
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                        className="select-css"
                      >
                        <option value="">Not Set</option>
                        <option value="1">File 1 ({outputFileNamePrefix || "prefix"}1.txt)</option>
                        <option value="2">File 2 ({outputFileNamePrefix || "prefix"}2.txt)</option>
                        <option value="3">File 3 ({outputFileNamePrefix || "prefix"}3.txt)</option>
                        <option value="4">File 4 ({outputFileNamePrefix || "prefix"}4.txt)</option>
                        <option value="5">File 5 ({outputFileNamePrefix || "prefix"}5.txt)</option>
                        <option value="6">File 6 ({outputFileNamePrefix || "prefix"}6.txt)</option>
                      </select>
                      <p className="instruction-text">
                        e.g., "For God so loved..."
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="settings-detail-section collapsible-section">
            <div 
              className="collapsible-header"
              onClick={() => setIsProPresenterCollapsed(!isProPresenterCollapsed)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {isProPresenterCollapsed ? <FaChevronRight size={12} /> : <FaChevronDown size={12} />}
              <h4 style={{ margin: 0 }}>
                <FaDesktop style={{ marginRight: "8px", verticalAlign: "middle" }} />
                ProPresenter Activation
              </h4>
              {proPresenterActivation && (
                <span style={{
                  marginLeft: "8px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  backgroundColor: "rgba(34, 197, 94, 0.2)",
                  color: "rgb(34, 197, 94)",
                }}>
                  CONFIGURED
                </span>
              )}
            </div>
            
            {!isProPresenterCollapsed && (
              <div className="collapsible-content" style={{ marginTop: "15px" }}>
                <p className="instruction-text" style={{ marginBottom: "15px" }}>
                  Configure which ProPresenter presentation and slide to trigger when slides from this template go live.
                </p>
                
                <div className="form-group">
                  <label>Presentation Activation:</label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setIsActivatePresentationModalOpen(true)}
                      className="secondary"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <FaDesktop />
                      {proPresenterActivation
                        ? `Edit: ${proPresenterActivation.presentationName || proPresenterActivation.presentationUuid} (Slide ${proPresenterActivation.slideIndex})`
                        : "Set ProPresenter Activation"}
                    </button>
                    {proPresenterActivation && (
                      <button
                        type="button"
                        onClick={() => {
                          setProPresenterActivation(undefined);
                          setProPresenterConnectionIds([]);
                        }}
                        className="secondary"
                        style={{ padding: "6px 12px" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {proPresenterActivation && (
                    <div
                      style={{
                        padding: "10px",
                        backgroundColor: "var(--app-header-bg)",
                        border: "1px solid var(--app-border-color)",
                        borderRadius: "6px",
                        fontSize: "0.9em",
                        color: "var(--app-text-color-secondary)",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>Current Configuration:</div>
                      <div>
                        Presentation: {proPresenterActivation.presentationName || proPresenterActivation.presentationUuid}
                        <br />
                        Slide Index: {proPresenterActivation.slideIndex}
                      </div>
                    </div>
                  )}
                </div>

                {proPresenterActivation && (
                  <div className="form-group">
                    <label>ProPresenter Connections:</label>
                    <p className="instruction-text" style={{ marginBottom: "10px" }}>
                      Select which ProPresenter instances to trigger. Leave all unchecked to trigger on all enabled connections.
                    </p>
                    {proPresenterConnections.length === 0 ? (
                      <p style={{ fontSize: "0.85em", color: "var(--app-text-color-secondary)", fontStyle: "italic" }}>
                        No ProPresenter connections configured. Go to Settings → ProPresenter to add connections.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {proPresenterConnections.map((connection) => (
                          <label
                            key={connection.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px",
                              backgroundColor: "var(--app-header-bg)",
                              borderRadius: "4px",
                              border: "1px solid var(--app-border-color)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={proPresenterConnectionIds.includes(connection.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setProPresenterConnectionIds([...proPresenterConnectionIds, connection.id]);
                                } else {
                                  setProPresenterConnectionIds(proPresenterConnectionIds.filter((id) => id !== connection.id));
                                }
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 500 }}>{connection.name}</div>
                              <div style={{ fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
                                {connection.apiUrl}
                                {connection.isEnabled && (
                                  <span style={{ marginLeft: "8px", color: "var(--success)" }}>• Enabled</span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {proPresenterActivation && (
                  <>
                    <div className="form-group" style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid var(--app-border-color)" }}>
                      <label style={{ fontWeight: 600, marginBottom: "10px", display: "block" }}>Animation Triggers:</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                        <div>
                          <label htmlFor="activation-clicks" style={{ fontSize: "0.9em", display: "block", marginBottom: "5px" }}>
                            Go Live Clicks:
                          </label>
                          <input
                            id="activation-clicks"
                            type="number"
                            min="1"
                            value={proPresenterActivationClicks}
                            onChange={(e) => setProPresenterActivationClicks(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ width: "100%", padding: "6px 8px" }}
                          />
                          <p className="instruction-text" style={{ fontSize: "0.8em", marginTop: "4px" }}>
                            Number of trigger calls when going live (for animations)
                          </p>
                        </div>
                        <div>
                          <label htmlFor="takeoff-clicks" style={{ fontSize: "0.9em", display: "block", marginBottom: "5px" }}>
                            Take Off Clicks:
                          </label>
                          <input
                            id="takeoff-clicks"
                            type="number"
                            min="0"
                            value={proPresenterTakeOffClicks}
                            onChange={(e) => setProPresenterTakeOffClicks(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: "100%", padding: "6px 8px" }}
                          />
                          <p className="instruction-text" style={{ fontSize: "0.8em", marginTop: "4px" }}>
                            Number of trigger calls for "Off Live" button (0 = no triggers)
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: "15px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={clearTextAfterLive}
                          onChange={(e) => setClearTextAfterLive(e.target.checked)}
                          style={{ width: "18px", height: "18px", cursor: "pointer" }}
                        />
                        <span style={{ fontWeight: 500 }}>Clear text files after going live</span>
                      </label>
                      {clearTextAfterLive && (
                        <div style={{ marginTop: "10px", marginLeft: "26px" }}>
                          <label htmlFor="clear-text-delay" style={{ fontSize: "0.9em", display: "block", marginBottom: "5px" }}>
                            Delay before clearing (ms):
                          </label>
                          <input
                            id="clear-text-delay"
                            type="number"
                            min="0"
                            step="100"
                            value={clearTextDelay}
                            onChange={(e) => setClearTextDelay(Math.max(0, parseInt(e.target.value) || 0))}
                            style={{ width: "150px", padding: "6px 8px" }}
                            placeholder="0"
                          />
                          <p className="instruction-text" style={{ fontSize: "0.8em", marginTop: "4px" }}>
                            Wait time before clearing files (to allow exit animations)
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            className="primary"
            style={{ marginTop: "15px" }}
          >
            Save Template
          </button>
        </div>
        <IconPickerModal
          isOpen={isIconPickerOpen}
          onClose={() => setIsIconPickerOpen(false)}
          onSelectIcon={(iconName) => setIcon(iconName)}
        />
      </div>

      <GenerateAIPromptModal
        isOpen={isAIPromptModalOpen}
        onClose={() => setIsAIPromptModalOpen(false)}
        processingType={processingType as "javascript" | "regex"}
      />
      <ActivatePresentationModal
        isOpen={isActivatePresentationModalOpen}
        onClose={() => setIsActivatePresentationModalOpen(false)}
        onSave={(config) => {
          setProPresenterActivation(config);
        }}
        currentConfig={proPresenterActivation}
        title="Set ProPresenter Activation for Template"
      />
    </>
  );
};

export default SettingsDetail;

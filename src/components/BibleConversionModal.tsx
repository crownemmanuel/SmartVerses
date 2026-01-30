import React, { useEffect, useMemo, useState } from "react";
import type { BibleTranslationFile } from "../types/bible";
import type { BibleConversionTemplate } from "../types/bibleConversion";
import { getAppSettings } from "../utils/aiConfig";
import {
  buildTranslationId,
  convertSourceToBibleTranslationFile,
  type BibleConversionMetadata,
} from "../utils/bibleConversion";
import {
  saveBibleTranslationToDefaultDir,
  saveBibleTranslationWithDialog,
} from "../utils/bibleTranslationIO";
import {
  addBibleConversionTemplate,
  deleteBibleConversionTemplate,
  loadBibleConversionTemplates,
  updateBibleConversionTemplate,
} from "../utils/bibleConversionTemplates";
import { downloadJSON, readFileAsText } from "../utils/templateIO";
import {
  conversionHelpers,
  generateConversionScript,
  runConversionScript,
} from "../services/bibleConversionAIService";
import "../App.css";

const SAMPLE_SOURCE_JSON = {
  Genesis: {
    "1": {
      "1": "In the beginning God created the heaven and the earth.",
      "2": "And the earth was without form, and void; and darkness was upon the face of the deep.",
    },
    "2": {
      "1": "Thus the heavens and the earth were finished, and all the host of them.",
    },
  },
  Exodus: {
    "1": {
      "1": "Now these are the names of the children of Israel, which came into Egypt.",
    },
  },
};

type BibleConversionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const BibleConversionModal: React.FC<BibleConversionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [sourceJson, setSourceJson] = useState<unknown | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [language, setLanguage] = useState("");
  const [translationId, setTranslationId] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [aliases, setAliases] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [fullNameTouched, setFullNameTouched] = useState(false);

  const [useAI, setUseAI] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiProgress, setAiProgress] = useState<string[]>([]);
  const [aiCode, setAiCode] = useState("");
  const [aiFormat, setAiFormat] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [aiMetadataSuggestion, setAiMetadataSuggestion] = useState<
    Partial<BibleConversionMetadata> | null
  >(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiWorking, setIsAiWorking] = useState(false);

  const [conversionResult, setConversionResult] =
    useState<BibleTranslationFile | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [templates, setTemplates] = useState<BibleConversionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [showCode, setShowCode] = useState(false);

  const fileName = sourceFile?.name || "";
  const canConvertManual = !!sourceJson && !!shortName.trim() && !!fullName.trim();
  const canGenerateAI = !!sourceText && aiAvailable && !isAiWorking;
  const canRunAI = !!aiCode.trim() && !!sourceText && !isAiWorking;

  const metadata: BibleConversionMetadata = useMemo(
    () => ({
      id: translationId.trim(),
      shortName,
      fullName,
      language,
      source: sourceInfo,
      aliases: aliases
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean),
    }),
    [translationId, shortName, fullName, language, sourceInfo, aliases]
  );

  useEffect(() => {
    if (!isOpen) return;
    setSourceFile(null);
    setSourceText("");
    setSourceJson(null);
    setFileError(null);
    setShortName("");
    setFullName("");
    setLanguage("");
    setTranslationId("");
    setSourceInfo("");
    setAliases("");
    setIdTouched(false);
    setFullNameTouched(false);
    setUseAI(false);
    setAiProgress([]);
    setAiCode("");
    setAiFormat(null);
    setAiNotes(null);
    setAiMetadataSuggestion(null);
    setAiError(null);
    setIsAiWorking(false);
    setConversionResult(null);
    setConversionError(null);
    setIsConverting(false);
    setSaveStatus(null);
    setSelectedTemplateId("");
    setTemplateName("");
    setShowCode(false);

    const appSettings = getAppSettings();
    const available =
      !!appSettings.openAIConfig?.apiKey ||
      !!appSettings.geminiConfig?.apiKey ||
      !!appSettings.groqConfig?.apiKey;
    setAiAvailable(available);

    setUseAI(available);
    setTemplates(loadBibleConversionTemplates());
  }, [isOpen]);

  useEffect(() => {
    if (!shortName.trim()) {
      if (!idTouched) setTranslationId("");
      if (!fullNameTouched) setFullName("");
      return;
    }
    if (!idTouched) {
      setTranslationId(buildTranslationId(shortName));
    }
    if (!fullNameTouched && !fullName.trim()) {
      setFullName(shortName);
    }
  }, [shortName, idTouched, fullNameTouched, fullName]);

  useEffect(() => {
    if (!sourceText) {
      setSourceJson(null);
      if (fileError === "Invalid JSON file.") setFileError(null);
      return;
    }
    const parsed = conversionHelpers.parseJsonSafe(sourceText);
    setSourceJson(parsed);
    if (!parsed && !useAI) {
      setFileError("Invalid JSON file.");
    } else if (parsed && fileError === "Invalid JSON file.") {
      setFileError(null);
    }
  }, [sourceText, useAI, fileError]);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    setSourceFile(file);
    setSourceText("");
    setSourceJson(null);
    setFileError(null);
    setConversionResult(null);
    setConversionError(null);
    setAiProgress([]);
    setAiCode("");
    setAiFormat(null);
    setAiNotes(null);
    setAiMetadataSuggestion(null);
    setAiError(null);

    if (!file) return;

    try {
      const text = await readFileAsText(file);
      setSourceText(text);
    } catch (error) {
      console.error("Failed to read file:", error);
      setFileError("Failed to read the selected file.");
    }
  };

  const handleDownloadSample = () => {
    downloadJSON("bible-source-sample.json", SAMPLE_SOURCE_JSON);
  };

  const handleManualConvert = () => {
    if (!sourceJson) {
      setConversionError("Please select a valid JSON file.");
      return;
    }
    setConversionError(null);
    setIsConverting(true);
    try {
      const result = convertSourceToBibleTranslationFile(sourceJson, metadata);
      setConversionResult(result);
      setSaveStatus(null);
    } catch (error) {
      console.error("Conversion failed:", error);
      setConversionError(
        error instanceof Error ? error.message : "Conversion failed."
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!sourceText || !aiAvailable) return;
    setIsAiWorking(true);
    setAiError(null);
    setAiProgress([]);
    setAiCode("");
    setAiFormat(null);
    setAiNotes(null);
    setAiMetadataSuggestion(null);
    setConversionResult(null);
    setConversionError(null);

    try {
      const appSettings = getAppSettings();
      const result = await generateConversionScript(
        sourceText,
        fileName || "uploaded-file",
        appSettings,
        {
          onProgress: (message) =>
            setAiProgress((prev) => [...prev, message]),
        }
      );
      setAiCode(result.code);
      setAiFormat(result.format ?? null);
      setAiNotes(result.notes ?? null);
      if (result.metadata) {
        setAiMetadataSuggestion(result.metadata);
        if (!shortName.trim() && result.metadata.shortName) {
          setShortName(result.metadata.shortName);
        }
        if (!fullName.trim() && result.metadata.fullName) {
          setFullName(result.metadata.fullName);
        }
        if (!language.trim() && result.metadata.language) {
          setLanguage(result.metadata.language);
        }
        if (!sourceInfo.trim() && result.metadata.source) {
          setSourceInfo(result.metadata.source);
        }
        if (!aliases.trim() && result.metadata.aliases?.length) {
          setAliases(result.metadata.aliases.join(", "));
        }
      }
    } catch (error) {
      console.error("AI conversion failed:", error);
      const errorMessage = error instanceof Error ? error.message : "AI conversion failed.";
      const isRateLimit = /429|rate limit|rate_limit/i.test(errorMessage);
      if (isRateLimit) {
        setAiError(
          `${errorMessage} Rate limits are common with some providers. Consider using OpenAI gpt-4o-latest for best results.`
        );
      } else {
        setAiError(errorMessage);
      }
    } finally {
      setIsAiWorking(false);
    }
  };

  const handleRunAI = () => {
    if (!aiCode.trim()) return;
    setAiError(null);
    setConversionError(null);
    setIsConverting(true);
    setAiProgress((prev) => [...prev, "Running conversion code"]);
    try {
      const inputJson = conversionHelpers.parseJsonSafe(sourceText);
      const result = runConversionScript(aiCode, {
        rawText: sourceText,
        fileName: fileName || "uploaded-file",
        json: inputJson ?? undefined,
      });
      if (result.metadata) {
        setAiMetadataSuggestion(result.metadata);
      }
      const finalMetadata = { ...metadata };
      if (!finalMetadata.shortName.trim() && result.metadata?.shortName) {
        finalMetadata.shortName = result.metadata.shortName;
      }
      if (!finalMetadata.fullName.trim() && result.metadata?.fullName) {
        finalMetadata.fullName = result.metadata.fullName;
      }
      if (!finalMetadata.language.trim() && result.metadata?.language) {
        finalMetadata.language = result.metadata.language;
      }
      if (!finalMetadata.source?.trim() && result.metadata?.source) {
        finalMetadata.source = result.metadata.source;
      }
      if (!finalMetadata.aliases?.length && result.metadata?.aliases?.length) {
        finalMetadata.aliases = result.metadata.aliases;
      }
      const finalFile = convertSourceToBibleTranslationFile(
        { books: result.books },
        finalMetadata
      );
      setConversionResult(finalFile);
      setSaveStatus(null);
    } catch (error) {
      console.error("Failed to run conversion script:", error);
      const message = error instanceof Error ? error.message : "Conversion failed.";
      const hint = message.toLowerCase().includes("invalid json")
        ? `${message}. The conversion code expected JSON; try "Analyze with AI" again or ensure the file is a single JSON file.`
        : message;
      setConversionError(hint);
    } finally {
      setIsConverting(false);
    }
  };

  const handleSaveDefault = async () => {
    if (!conversionResult) return;
    setSaveStatus(null);
    const fileBase = conversionResult.id || buildTranslationId(shortName) || "bible";
    const result = await saveBibleTranslationToDefaultDir(conversionResult, fileBase);
    if (result.status === "saved") {
      setSaveStatus(`Saved to ${result.filePath}`);
      onSaved?.();
    } else if (result.status === "fallback") {
      setSaveStatus("Downloaded file (Tauri save unavailable).");
    }
  };

  const handleSaveAs = async () => {
    if (!conversionResult) return;
    setSaveStatus(null);
    const fileBase = conversionResult.id || buildTranslationId(shortName) || "bible";
    const result = await saveBibleTranslationWithDialog(conversionResult, fileBase);
    if (result.status === "saved") {
      setSaveStatus(`Saved to ${result.filePath}`);
      onSaved?.();
    } else if (result.status === "fallback") {
      setSaveStatus("Downloaded file (Tauri save unavailable).");
    }
  };

  const handleTemplateSelect = (value: string) => {
    setSelectedTemplateId(value);
    const template = templates.find((t) => t.id === value);
    if (template) {
      setAiCode(template.code);
      setTemplateName(template.name);
    }
  };

  const handleSaveTemplate = () => {
    if (!aiCode.trim()) {
      setAiError("Generate or paste conversion code before saving.");
      return;
    }
    if (!templateName.trim()) {
      setAiError("Template name is required.");
      return;
    }
    setAiError(null);
    const existing = templates.find((t) => t.id === selectedTemplateId);
    let updatedTemplates: BibleConversionTemplate[] = [];
    if (existing) {
      const updated = {
        ...existing,
        name: templateName.trim(),
        code: aiCode.trim(),
      };
      updateBibleConversionTemplate(updated);
      updatedTemplates = templates.map((t) => (t.id === existing.id ? updated : t));
    } else {
      const created = addBibleConversionTemplate({
        name: templateName.trim(),
        code: aiCode.trim(),
      });
      updatedTemplates = [...templates, created];
      setSelectedTemplateId(created.id);
    }
    setTemplates(updatedTemplates);
  };

  const handleDeleteTemplate = () => {
    if (!selectedTemplateId) return;
    deleteBibleConversionTemplate(selectedTemplateId);
    setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplateId));
    setSelectedTemplateId("");
    setTemplateName("");
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "820px" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Conversion Tool</h2>
        <p style={{ color: "var(--app-text-color-secondary)", fontSize: "0.9em", marginTop: "-8px", marginBottom: "15px" }}>
          This tool tries to convert any JSON Bible format to a format understandable by SmartVerses.
        </p>

        <div className="form-group">
          <label htmlFor="bible-file">Select Bible File</label>
          <input
            id="bible-file"
            type="file"
            accept={useAI ? undefined : ".json,application/json"}
            onChange={handleFileChange}
            disabled={isAiWorking || isConverting}
          />
          {fileName && (
            <p style={{ fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
              Selected: {fileName}
            </p>
          )}
          {fileError && (
            <p style={{ color: "var(--danger)", marginTop: "6px" }}>{fileError}</p>
          )}
        </div>

        <div className="form-group">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              disabled={!aiAvailable}
            />
            Convert with AI
          </label>
          {!aiAvailable && (
            <p style={{ color: "var(--app-text-color-secondary)", marginTop: "6px" }}>
              Configure an AI provider in Settings {"->"} AI Configuration to enable AI conversion.
            </p>
          )}
          {aiAvailable && (
            <p style={{ color: "var(--app-text-color-secondary)", marginTop: "6px" }}>
              Using your default AI provider setting in the AI configuration page.
            </p>
          )}
          {useAI && aiAvailable && (
            <>
              <p style={{ color: "var(--app-text-color-secondary)", marginTop: "6px", fontSize: "0.85em" }}>
                AI will attempt to automatically convert the file. If it doesn't work, uncheck this option and use the manual conversion with the sample JSON format.
              </p>
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(255, 193, 7, 0.15)",
                  border: "1px solid rgba(255, 193, 7, 0.3)",
                  color: "var(--app-text-color)",
                  fontSize: "0.85em",
                }}
              >
                <strong style={{ color: "rgba(255, 193, 7, 1)" }}>Tip:</strong> OpenAI gpt-4o-latest is recommended for best results.
              </div>
            </>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginBottom: "15px",
          }}
        >
          <div className="form-group">
            <label htmlFor="short-name">
              Short Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              id="short-name"
              type="text"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="KJV"
            />
          </div>
          <div className="form-group">
            <label htmlFor="full-name">
              Full Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullNameTouched(true);
                setFullName(e.target.value);
              }}
              placeholder="King James Version"
            />
          </div>
          <div className="form-group">
            <label htmlFor="translation-id">Translation ID</label>
            <input
              id="translation-id"
              type="text"
              value={translationId}
              onChange={(e) => {
                setIdTouched(true);
                setTranslationId(e.target.value);
              }}
              placeholder="kjv"
            />
          </div>
          <div className="form-group">
            <label htmlFor="language">Language</label>
            <input
              id="language"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="en"
            />
          </div>
          <div className="form-group">
            <label htmlFor="source">Source</label>
            <input
              id="source"
              type="text"
              value={sourceInfo}
              onChange={(e) => setSourceInfo(e.target.value)}
              placeholder="Public Domain"
            />
          </div>
          <div className="form-group">
            <label htmlFor="aliases">Aliases (comma-separated)</label>
            <input
              id="aliases"
              type="text"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="KJV, King James"
            />
          </div>
        </div>

        {!useAI && (
          <div
            style={{
              backgroundColor: "var(--app-background-secondary)",
              padding: "12px",
              borderRadius: "6px",
              marginBottom: "15px",
            }}
          >
            <p style={{ margin: 0, color: "var(--app-text-color-secondary)" }}>
              Source JSON should look like a book {"->"} chapter {"->"} verse map
              (string values).
            </p>
            <button
              className="secondary btn-sm"
              style={{ marginTop: "8px" }}
              type="button"
              onClick={handleDownloadSample}
              disabled={isConverting}
            >
              Download sample JSON
            </button>
          </div>
        )}

        {useAI && (
          <div
            style={{
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
              padding: "12px",
              marginBottom: "15px",
            }}
          >
            <h4 style={{ marginTop: 0 }}>AI Conversion</h4>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
              <button
                className="primary"
                type="button"
                onClick={handleGenerateAI}
                disabled={!canGenerateAI}
              >
                {isAiWorking ? "Analyzing..." : "Analyze with AI"}
              </button>
            </div>

            {aiProgress.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <div style={{ marginBottom: "8px" }}>
                  <span style={{ fontSize: "0.85em", fontWeight: 600 }}>Progress:</span>
                </div>
                {aiProgress.map((step, index) => (
                  <div
                    key={`${step}-${index}`}
                    style={{ fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}
                  >
                    - {step}
                  </div>
                ))}
              </div>
            )}

            {aiFormat && (
              <p style={{ marginTop: "10px", fontSize: "0.85em" }}>
                Detected format: {aiFormat}
              </p>
            )}

            {aiNotes && (
              <p style={{ marginTop: "6px", fontSize: "0.85em" }}>{aiNotes}</p>
            )}

            {aiError && (
              <p style={{ color: "var(--danger)", marginTop: "8px" }}>{aiError}</p>
            )}

            {aiCode && (
              <>
                <div style={{ marginTop: "12px" }}>
                  {!showCode ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.9em", color: "var(--app-text-color-secondary)" }}>
                        Conversion code generated
                      </span>
                      <button
                        type="button"
                        className="secondary btn-sm"
                        onClick={() => setShowCode(true)}
                      >
                        View Code
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label htmlFor="ai-code" style={{ margin: 0 }}>Conversion Code</label>
                        <button
                          type="button"
                          className="secondary btn-sm"
                          onClick={() => setShowCode(false)}
                        >
                          Hide Code
                        </button>
                      </div>
                      <textarea
                        id="ai-code"
                        rows={8}
                        value={aiCode}
                        onChange={(e) => setAiCode(e.target.value)}
                        placeholder="AI-generated conversion code appears here."
                        style={{ width: "100%", resize: "vertical" }}
                      />
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                    marginTop: "10px",
                  }}
                >
                  <div>
                    <label htmlFor="template-select">Saved Templates</label>
                    <select
                      id="template-select"
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                    >
                      <option value="">Select template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="template-name">Template Name</label>
                    <input
                      id="template-name"
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="My Bible Format"
                    />
                  </div>
                </div>

                <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                  <button type="button" onClick={handleSaveTemplate}>
                    Save Template
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteTemplate}
                    disabled={!selectedTemplateId}
                  >
                    Delete Template
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
          {!useAI && (
            <button
              className="primary"
              type="button"
              onClick={handleManualConvert}
              disabled={!canConvertManual || isConverting}
            >
              {isConverting ? "Converting..." : "Convert"}
            </button>
          )}
          {useAI && (
            <button
              className="primary"
              type="button"
              onClick={handleRunAI}
              disabled={!canRunAI || isConverting}
            >
              {isConverting ? "Converting..." : "Run Conversion"}
            </button>
          )}
        </div>

        {conversionError && (
          <p style={{ color: "var(--danger)", marginTop: "10px" }}>
            {conversionError}
          </p>
        )}

        {conversionResult && (
          <div
            style={{
              marginTop: "15px",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <strong>Conversion complete.</strong>
            <div style={{ marginTop: "8px", fontSize: "0.85em" }}>
              {Object.keys(conversionResult.books || {}).length} books loaded.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button type="button" onClick={handleSaveDefault}>
                Save to SmartVerses/Bibles
              </button>
              <button type="button" onClick={handleSaveAs}>
                Save As...
              </button>
            </div>
            {saveStatus && (
              <p style={{ marginTop: "8px", fontSize: "0.85em", color: "var(--success)" }}>
                {saveStatus}
              </p>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} disabled={isAiWorking || isConverting}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BibleConversionModal;

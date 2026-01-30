import React, { useState, useEffect, useCallback } from "react";
import { Template, Slide, AppSettings, LayoutType } from "../types";
import { getAppSettings } from "../utils/aiConfig";
import { generateSlidesFromText } from "../services/aiService";
import { formatSlidesForClipboard } from "../utils/slideUtils";
import { BUILTIN_KJV_ID } from "../services/bibleLibraryService";
import { processTextWithBibleReferences } from "../services/bibleService";
import { loadSmartVersesSettings } from "../services/transcriptionService";
import "../App.css"; // Ensure global styles are applied

const MAX_PREVIEW_SLIDES = 10;

// Define a type for the preview slide structure, omitting the id
interface PreviewSlide
  extends Pick<Slide, "text" | "layout" | "isAutoScripture"> {
  order: number; // Order for preview sorting
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    itemName: string,
    templateName: string,
    slides: Pick<Slide, "text" | "layout" | "isAutoScripture">[],
    options?: { liveSlidesSessionId?: string; liveSlidesLinked?: boolean }
  ) => void;
  templates: Template[];
}

const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  templates,
}) => {
  const [itemName, setItemName] = useState("");
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [currentInputText, setCurrentInputText] = useState(""); // Stores the text from paste/upload for processing
  const [pastedText, setPastedText] = useState("");
  const [fileName, setFileName] = useState("");
  const [importMethod, setImportMethod] = useState<"paste" | "upload">("paste");
  const [previewSlides, setPreviewSlides] = useState<PreviewSlide[]>([]);
  const [processedSlidesForImport, setProcessedSlidesForImport] = useState<
    Pick<Slide, "text" | "layout" | "isAutoScripture">[]
  >([]);
  const [autoLoadBibleVerses, setAutoLoadBibleVerses] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Generic loading for AI or file reading
  const [appSettings, setAppSettings] = useState<AppSettings>(getAppSettings());
  const [copyFeedback, setCopyFeedback] = useState<string>(""); // Added state for feedback

  useEffect(() => {
    if (isOpen) {
      setItemName(""); // Start with empty name - user must enter one
      const firstTemplate = templates.length > 0 ? templates[0] : null;
      setSelectedTemplateName(firstTemplate?.name || "");
      setCurrentInputText("");
      setPastedText("");
      setFileName("");
      setImportMethod("paste");
      setPreviewSlides([]);
      setProcessedSlidesForImport([]);
      setIsLoading(false);
      setAppSettings(getAppSettings());
      setCopyFeedback(""); // Reset feedback
      // Set auto-load Bible verses based on template's default setting
      setAutoLoadBibleVerses(firstTemplate?.autoLoadBibleVerses ?? false);
    }
  }, [isOpen, templates]);

  // Update autoLoadBibleVerses when template changes
  useEffect(() => {
    if (isOpen && selectedTemplateName) {
      const template = templates.find((t) => t.name === selectedTemplateName);
      if (template) {
        setAutoLoadBibleVerses(template.autoLoadBibleVerses ?? false);
        // Clear preview when template changes since we need to re-process
        setPreviewSlides([]);
        setProcessedSlidesForImport([]);
      }
    }
  }, [selectedTemplateName]);

  const getSelectedTemplate = useCallback(() => {
    return templates.find((t) => t.name === selectedTemplateName);
  }, [templates, selectedTemplateName]);

  const handleProcessText = async () => {
    if (!currentInputText.trim() || !selectedTemplateName) {
      alert("Please provide text and select a template before processing.");
      return;
    }
    const template = getSelectedTemplate();
    if (!template) {
      alert("Selected template not found.");
      return;
    }

    setIsLoading(true);
    setPreviewSlides([]); // Clear previous preview
    setProcessedSlidesForImport([]); // Clear previous full results
    let generatedSlides: Pick<Slide, "text" | "layout" | "isAutoScripture">[] =
      [];
    try {
      if (template.processingType === "ai" || template.processWithAI) {
        generatedSlides = await generateSlidesFromText(
          currentInputText,
          template,
          appSettings
        );
      } else {
        const logicSlides = parseWithTemplateLogic(currentInputText, template);
        generatedSlides =
          logicSlides && logicSlides.length > 0
            ? logicSlides
            : parseTextBasic(currentInputText, template);
      }

      // If auto-load Bible verses is enabled, process slides for scripture references
      console.log("Auto-load Bible verses checkbox:", autoLoadBibleVerses);
      if (autoLoadBibleVerses) {
        console.log("Processing slides for Bible references...");
        const smartVersesSettings = loadSmartVersesSettings();
        const translationId =
          smartVersesSettings.defaultBibleTranslationId || BUILTIN_KJV_ID;
        generatedSlides = await processTextWithBibleReferences(
          generatedSlides,
          true,
          translationId
        );
        console.log(
          "After Bible processing, slides count:",
          generatedSlides.length
        );
      }

      setPreviewSlides(
        generatedSlides
          .map((s, i) => ({ ...s, order: i }))
          .slice(0, MAX_PREVIEW_SLIDES)
      );
      setProcessedSlidesForImport(generatedSlides); // Store all generated slides for import
      if (generatedSlides.length === 0) {
        alert(
          "Processing complete, but no slides were generated. Check input or template logic."
        );
      }
    } catch (error) {
      console.error("Error during slide generation:", error);
      alert(
        `Processing failed: ${
          error instanceof Error ? error.message : String(error)
        }.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const parseTextBasic = (
    text: string,
    template: Template
  ): Pick<Slide, "text" | "layout">[] => {
    const defaultLayout =
      template.availableLayouts.length > 0
        ? template.availableLayouts[0]
        : "one-line";
    const lines = text.split(/\n\s*\n/);
    return lines
      .map((lineText) => ({
        text: lineText.trim(),
        layout: defaultLayout,
      }))
      .filter((slide) => slide.text.length > 0);
  };

  // Optional logic: regex (/pattern/flags) or JavaScript snippet returning
  // an array of strings or { text, layout } items
  const parseWithTemplateLogic = (text: string, template: Template) => {
    const { logic, processingType, availableLayouts } = template;
    const defaultLayout: LayoutType = availableLayouts.includes("one-line")
      ? "one-line"
      : availableLayouts[0] || "one-line";

    if (!logic) {
      // Default to splitting by paragraphs if no logic is provided
      return text
        .split(/\n\s*\n/)
        .map((s) => ({ text: s.trim(), layout: defaultLayout }))
        .filter((s) => s.text.length > 0);
    }

    try {
      switch (processingType) {
        case "simple":
          let chunks: string[] = [];
          const [strategy, value] = logic.split("-");
          const numValue = parseInt(value, 10);

          if (strategy === "word-count" && !isNaN(numValue)) {
            const words = text.split(/\s+/);
            for (let i = 0; i < words.length; i += numValue) {
              chunks.push(words.slice(i, i + numValue).join(" "));
            }
          } else if (strategy === "char-count" && !isNaN(numValue)) {
            for (let i = 0; i < text.length; i += numValue) {
              chunks.push(text.substring(i, i + numValue));
            }
          } else {
            // line-break
            chunks = text.split(/\n/);
          }

          return chunks
            .map((s) => ({ text: s.trim(), layout: defaultLayout }))
            .filter((s) => s.text.length > 0);

        case "regex":
          const regexMatch = logic.match(/^\/(.*)\/([gimsuy]*)$/);
          if (regexMatch) {
            const pattern = regexMatch[1];
            const flags = regexMatch[2];
            const regex = new RegExp(pattern, flags);

            return text
              .split(regex)
              .map((s) => ({ text: s.trim(), layout: defaultLayout }))
              .filter((s) => s.text.length > 0);
          }
          break; // Fallback to default if regex is invalid

        case "javascript":
          const fn = new Function(
            "input",
            "layouts",
            logic.includes("return")
              ? logic
              : `return (function(){ ${logic} })()`
          ) as (
            input: string,
            layouts: LayoutType[]
          ) => string[] | { text: string; layout?: LayoutType }[];

          const result = fn(text, template.availableLayouts);

          if (Array.isArray(result)) {
            return result
              .map((r) => {
                if (typeof r === "string") {
                  return { text: r.trim(), layout: defaultLayout };
                }
                return {
                  text: (r.text || "").trim(),
                  layout: (r.layout as LayoutType) || defaultLayout,
                };
              })
              .filter((s) => s.text.length > 0);
          }
          break;
      }
    } catch (err) {
      console.error(`Error running ${processingType} logic:`, err);
    }

    // Fallback for errors or unhandled cases
    return text
      .split(/\n\s*\n/)
      .map((s) => ({ text: s.trim(), layout: defaultLayout }))
      .filter((s) => s.text.length > 0);
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setImportMethod("upload");
      setIsLoading(true);
      setPreviewSlides([]);
      setProcessedSlidesForImport([]);
      try {
        const text = await file.text();
        setCurrentInputText(text);
      } catch (error) {
        console.error("Error reading file:", error);
        alert("Failed to read file.");
        setCurrentInputText("");
        setFileName("");
      } finally {
        setIsLoading(false);
      }
    } else {
      setFileName("");
      setCurrentInputText("");
      setPreviewSlides([]);
      setProcessedSlidesForImport([]);
    }
  };

  const handlePasteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPastedText(event.target.value);
    setCurrentInputText(event.target.value);
    setPreviewSlides([]);
    setProcessedSlidesForImport([]);
  };

  const handleSubmit = () => {
    // No longer async, uses already processed slides
    if (!itemName.trim() || !selectedTemplateName) {
      alert("Please provide an item name and select a template.");
      return;
    }
    if (processedSlidesForImport.length === 0) {
      alert(
        "No slides have been processed or generated. Please process the text first."
      );
      return;
    }
    onImport(itemName, selectedTemplateName, processedSlidesForImport);
    onClose();
  };

  const handleCopyToClipboard = async () => {
    if (processedSlidesForImport.length === 0) {
      alert("No processed slides to copy.");
      return;
    }
    const formattedText = formatSlidesForClipboard(processedSlidesForImport);
    try {
      await navigator.clipboard.writeText(formattedText);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000); // Clear feedback after 2s
    } catch (err) {
      console.error("Failed to copy text: ", err);
      setCopyFeedback("Failed to copy.");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  if (!isOpen) return null;

  const selectedTemplateDetails = getSelectedTemplate();
  const canProcess =
    !!currentInputText.trim() && !!selectedTemplateName && !isLoading;
  const canImport =
    !!itemName.trim() && processedSlidesForImport.length > 0 && !isLoading;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Import to Playlist</h2>
        <div className="form-group">
          <label htmlFor="itemName">
            Item Name: <span style={{ color: "#EF4444" }}>*</span>
          </label>
          <input
            type="text"
            id="itemName"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Sunday Service Announcements"
            disabled={isLoading}
            required
          />
          {!itemName.trim() && (
            <span
              style={{
                color: "#EF4444",
                fontSize: "0.85rem",
                marginTop: "4px",
                display: "block",
              }}
            >
              Item name is required
            </span>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="templateSelect">Template:</label>
          <select
            id="templateSelect"
            value={selectedTemplateName}
            onChange={(e) => {
              setSelectedTemplateName(e.target.value);
              setPreviewSlides([]);
              setProcessedSlidesForImport([]);
            }}
            disabled={isLoading || templates.length === 0}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.name}>
                {template.name}
              </option>
            ))}
          </select>
          {(selectedTemplateDetails?.processingType === "ai" ||
            selectedTemplateDetails?.processWithAI) && (
            <span
              style={{
                fontSize: "0.8em",
                marginLeft: "10px",
                color: "var(--app-primary-color)",
              }}
            >
              ✨ AI Powered
            </span>
          )}
        </div>

        <div style={{ display: "flex", marginBottom: "15px" }}>
          <button
            onClick={() => {
              setImportMethod("paste");
              setCurrentInputText(pastedText);
              setFileName("");
              setPreviewSlides([]);
              setProcessedSlidesForImport([]);
            }}
            className={importMethod === "paste" ? "active" : ""}
            style={{ marginRight: "10px" }}
            disabled={isLoading}
          >
            Paste Text
          </button>
          <button
            onClick={() => {
              setImportMethod("upload");
              setCurrentInputText("");
              setPastedText("");
              setPreviewSlides([]);
              setProcessedSlidesForImport([]);
            }}
            className={importMethod === "upload" ? "active" : ""}
            disabled={isLoading}
          >
            Upload .txt File
          </button>
        </div>

        {importMethod === "paste" && (
          <div className="form-group">
            <label htmlFor="pasteText">Paste Text Below:</label>
            <textarea
              id="pasteText"
              rows={6}
              value={pastedText}
              onChange={handlePasteChange}
              placeholder="Paste your content here."
              disabled={isLoading}
            />
          </div>
        )}

        {importMethod === "upload" && (
          <div className="form-group">
            <label htmlFor="fileUpload">Upload .txt File:</label>
            <input
              type="file"
              id="fileUpload"
              accept=".txt"
              onChange={handleFileChange}
              disabled={isLoading}
            />
            {fileName && (
              <p style={{ fontSize: "0.9em", marginTop: "5px" }}>
                Selected: {fileName}
              </p>
            )}
          </div>
        )}

        <div
          className="form-group"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "6px",
            marginBottom: "15px",
          }}
        >
          <input
            type="checkbox"
            id="autoLoadBibleVerses"
            checked={autoLoadBibleVerses}
            onChange={(e) => {
              setAutoLoadBibleVerses(e.target.checked);
              // Clear preview when toggling since we need to re-process
              setPreviewSlides([]);
              setProcessedSlidesForImport([]);
            }}
            disabled={isLoading}
            style={{ width: "auto", margin: 0 }}
          />
          <label
            htmlFor="autoLoadBibleVerses"
            style={{
              margin: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            📖 Auto-load Bible verses (KJV)
            <span
              style={{
                fontSize: "0.8em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              Detects scripture references and adds verses as slides
            </span>
          </label>
        </div>

        <div
          style={{
            marginBottom: "15px",
            borderTop: "1px solid var(--app-border-color)",
            paddingTop: "15px",
          }}
        >
          <button
            onClick={handleProcessText}
            disabled={!canProcess}
            className="primary"
            type="button"
          >
            {isLoading &&
            (selectedTemplateDetails?.processingType === "ai" ||
              selectedTemplateDetails?.processWithAI)
              ? "✨ Processing with AI..."
              : isLoading
              ? "Processing..."
              : "Process Text"}
          </button>
        </div>

        {processedSlidesForImport.length > 0 &&
          (selectedTemplateDetails?.processingType === "ai" ||
            selectedTemplateDetails?.processWithAI) && (
            <p
              style={{
                color: "var(--app-primary-color)",
                textAlign: "center",
                margin: "10px 0",
              }}
            >
              ✨ Processed with AI ✨
            </p>
          )}

        <h4>
          Preview (Up to {MAX_PREVIEW_SLIDES} Slides)
          {isLoading &&
            (selectedTemplateDetails?.processingType === "ai" ||
              selectedTemplateDetails?.processWithAI) &&
            "(✨ AI Processing...)"}
          {isLoading &&
            !(
              selectedTemplateDetails?.processingType === "ai" ||
              selectedTemplateDetails?.processWithAI
            ) &&
            "(Processing...)"}
        </h4>
        <div className="import-preview-area">
          {previewSlides.length > 0 ? (
            previewSlides.map(
              (
                slide,
                index // Use index as key for preview items
              ) => (
                <div
                  key={index}
                  className={`preview-slide-item ${
                    slide.isAutoScripture ? "scripture-slide" : ""
                  }`}
                  style={
                    slide.isAutoScripture
                      ? {
                          borderLeft: "3px solid #ff69b4",
                          paddingLeft: "10px",
                          backgroundColor: "rgba(255, 105, 180, 0.1)",
                        }
                      : undefined
                  }
                >
                  <strong>
                    {slide.isAutoScripture && "📖 "}
                    {slide.layout
                      .replace(/-line$/, "")
                      .replace("-", " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                    :
                  </strong>{" "}
                  {slide.text.length > 70
                    ? slide.text.substring(0, 70) + "..."
                    : slide.text}
                </div>
              )
            )
          ) : (
            <p style={{ color: "var(--app-text-color-secondary)" }}>
              {currentInputText.trim()
                ? "Click 'Process Text' to generate preview."
                : "Provide text via paste or upload."}
            </p>
          )}
        </div>

        {/* Add Copy to Clipboard button and feedback here */}
        {processedSlidesForImport.length > 0 && (
          <div
            style={{
              marginTop: "10px",
              marginBottom: "15px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <button
              onClick={handleCopyToClipboard}
              disabled={isLoading}
              style={{ fontSize: "0.9em", padding: "5px 10px" }}
            >
              Copy All ({processedSlidesForImport.length}) to Clipboard
            </button>
            {copyFeedback && (
              <span
                style={{
                  marginLeft: "10px",
                  fontSize: "0.9em",
                  color: "var(--app-primary-color)",
                }}
              >
                {copyFeedback}
              </span>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="primary"
            disabled={!canImport}
          >
            Import to Playlist ({processedSlidesForImport.length} slides)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;

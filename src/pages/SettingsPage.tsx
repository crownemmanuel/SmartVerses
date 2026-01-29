import React, { useState, useEffect, useRef } from "react";
import SettingsDetail from "../components/SettingsDetail";
import { Template } from "../types";
import AISettingsForm from "../components/AISettingsForm";
import LiveTestimoniesSettings from "../components/LiveTestimoniesSettings";
import LiveSlidesSettings from "../components/LiveSlidesSettings";
import NetworkSettings from "../components/NetworkSettings";
import ProPresenterSettings from "../components/ProPresenterSettings";
import VersionSettings from "../components/VersionSettings";
import SmartVersesSettings from "../components/SmartVersesSettings";
import RecorderSettings from "../components/RecorderSettings";
import FeaturesSettings from "../components/FeaturesSettings";
import MidiSettings from "../components/MidiSettings";
import DisplaySettings from "../components/DisplaySettings";
import {
  FaList,
  FaRobot,
  FaNetworkWired,
  FaClock,
  FaInfoCircle,
  FaBible,
  FaGlobe,
  FaCircle,
  FaToggleOn,
  FaUser,
  FaDesktop,
  FaMicrophone,
} from "react-icons/fa";
import "../App.css"; // Ensure global styles are applied
import {
  exportAllTemplatesToFile,
  parseTemplatesFromJsonFile,
  generateTemplateId,
} from "../utils/templateIO";
import TemplateListView from "../components/TemplateListView";
import ConfirmDialog from "../components/ConfirmDialog";
import { loadEnabledFeatures } from "../services/recorderService";
import type { EnabledFeatures } from "../types/recorder";

type SettingsView = "templates" | "aiConfiguration" | "liveTestimonies" | "liveSlides" | "smartVerses" | "transcription" | "display" | "recorder" | "network" | "proPresenter" | "features" | "midi" | "version";

const SETTINGS_VIEWS: SettingsView[] = [
  "templates",
  "aiConfiguration",
  "liveTestimonies",
  "liveSlides",
  "smartVerses",
  "transcription",
  "display",
  "recorder",
  "network",
  "proPresenter",
  "features",
  "midi",
  "version",
];

const SettingsPage: React.FC = () => {
  const [enabledFeatures, setEnabledFeatures] = useState<EnabledFeatures>(() =>
    loadEnabledFeatures()
  );
  const [templates, setTemplates] = useState<Template[]>(() => {
    try {
      const savedTemplates = localStorage.getItem("proassist-templates");
      return savedTemplates ? JSON.parse(savedTemplates) : [];
    } catch (error) {
      console.error("Failed to parse templates from localStorage:", error);
      return [];
    }
  });
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
    null
  );
  const [currentView, setCurrentView] = useState<SettingsView>(() => {
    try {
      const saved = localStorage.getItem("proassist-settings-current-view");
      if (saved && SETTINGS_VIEWS.includes(saved as SettingsView)) {
        return saved as SettingsView;
      }
    } catch {
      // ignore
    }
    return "templates";
  });

  // Listen for navigation to recorder settings
  useEffect(() => {
    const handleNavigateToSettings = (event: CustomEvent<string>) => {
      const targetView = event.detail as SettingsView;
      if (SETTINGS_VIEWS.includes(targetView)) {
        setCurrentView(targetView);
      }
    };
    window.addEventListener("navigate-to-settings", handleNavigateToSettings as EventListener);
    return () => {
      window.removeEventListener("navigate-to-settings", handleNavigateToSettings as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleFeaturesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EnabledFeatures>).detail;
      setEnabledFeatures(detail || loadEnabledFeatures());
    };
    window.addEventListener("features-updated", handleFeaturesUpdated);
    return () => {
      window.removeEventListener("features-updated", handleFeaturesUpdated);
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    localStorage.setItem("proassist-templates", JSON.stringify(templates));
    // Emit custom event so MainApplicationPage can reload templates immediately
    window.dispatchEvent(new CustomEvent("templates-updated"));
  }, [templates]);

  // Persist current view to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("proassist-settings-current-view", currentView);
    } catch (err) {
      console.error("Failed to save current view:", err);
    }
  }, [currentView]);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId]
    );
  };

  const [toastMessage, setToastMessage] = useState<string>("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">(
    "success"
  );

  const handleSaveTemplate = (updatedTemplate: Template) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t))
    );
    setToastType("success");
    setToastMessage("Template saved");
    setEditingTemplateId(null); // Return to list view
    console.log("Saved template:", updatedTemplate);
  };

  const handleAddTemplate = () => {
    const newTemplate: Template = {
      id: `tpl-${Date.now()}`,
      name: "New Template",
      type: "text",
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
      icon: "file-text",
      processingType: "simple",
      logic: "line-break",
      availableLayouts: ["one-line", "two-line"],
      aiPrompt: "",
      aiProvider: undefined,
      aiModel: undefined,
      outputPath: "~/Documents/SmartVerses/Templates",
      outputFileNamePrefix: "new_template_slide_",
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setEditingTemplateId(newTemplate.id);
    setToastType("success");
    setToastMessage(`Template "${newTemplate.name}" added`);
    console.log("Added template:", newTemplate);
  };

  const handleDeleteTemplate = (idToDelete: string) => {
    setDeletingTemplateId(idToDelete);
  };

  const confirmDeleteTemplate = () => {
    if (!deletingTemplateId) return;
    const deleted = templates.find((t) => t.id === deletingTemplateId);
    setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplateId));
    if (editingTemplateId === deletingTemplateId) {
      setEditingTemplateId(null);
    }
    setSelectedTemplateIds((prev) =>
      prev.filter((id) => id !== deletingTemplateId)
    );
    setToastType("info");
    setToastMessage(`Template ${deleted ? `\"${deleted.name}\" ` : ""}deleted`);
    console.log("Deleted template:", deletingTemplateId);
    setDeletingTemplateId(null);
  };

  const handleClickImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await parseTemplatesFromJsonFile(file);
      setTemplates((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const existingNames = new Set(prev.map((t) => t.name.toLowerCase()));
        const merged: Template[] = [...prev];
        for (const tpl of imported) {
          let newTemplate = { ...tpl } as Template;
          if (!newTemplate.id || existingIds.has(newTemplate.id)) {
            newTemplate.id = generateTemplateId();
          }
          if (existingNames.has(newTemplate.name.toLowerCase())) {
            const base = newTemplate.name.replace(
              / \(Imported(?: \d+)?\)$/i,
              ""
            );
            let candidate = `${base} (Imported)`;
            let counter = 2;
            while (
              merged.some(
                (x) => x.name.toLowerCase() === candidate.toLowerCase()
              )
            ) {
              candidate = `${base} (Imported ${counter})`;
              counter++;
            }
            newTemplate.name = candidate;
          }
          merged.push(newTemplate);
          existingIds.add(newTemplate.id);
          existingNames.add(newTemplate.name.toLowerCase());
        }
        return merged;
      });
      setToastType("success");
      setToastMessage(
        `Imported ${imported.length} template${imported.length > 1 ? "s" : ""}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToastType("error");
      setToastMessage(`Import failed: ${msg}`);
    } finally {
      // reset input so selecting the same file again will trigger onChange
      if (e.target) e.target.value = "";
    }
  };

  const selectedTemplate = templates.find((t) => t.id === editingTemplateId);

  // Style objects using CSS variables (similar to MainApplicationPage)
  const pageLayoutStyle: React.CSSProperties = {
    display: "flex",
    height: "calc(100vh - 51px)", // Assuming nav is 50px + 1px border
    backgroundColor: "var(--app-bg-color)",
  };

  const leftColumnStyle: React.CSSProperties = {
    width: "260px",
    borderRight: "1px solid var(--app-border-color)",
    overflowY: "auto",
    padding: 0,
    backgroundColor: "var(--surface-2)",
    display: "flex",
    flexDirection: "column",
  };

  const rightColumnStyle: React.CSSProperties = {
    flexGrow: 1,
    padding: "var(--spacing-5)",
    overflowY: "auto",
    backgroundColor: "var(--app-bg-color)",
  };

  return (
    <div style={pageLayoutStyle}>
      <div style={leftColumnStyle}>
        <div className="settings-rail-header">Settings</div>
        <div
          className="settings-nav-pane"
          style={{ padding: "var(--spacing-2)" }}
        >
          <button
            onClick={() => setCurrentView("templates")}
            className={currentView === "templates" ? "active" : ""}
          >
            <FaList />
            Manage Templates
          </button>
          <button
            onClick={() => setCurrentView("aiConfiguration")}
            className={currentView === "aiConfiguration" ? "active" : ""}
          >
            <FaRobot />
            AI Configuration
          </button>
          {enabledFeatures.liveTestimonies && (
            <button
              onClick={() => setCurrentView("liveTestimonies")}
              className={currentView === "liveTestimonies" ? "active" : ""}
            >
              <FaUser />
              Live Testimonies
            </button>
          )}
          {enabledFeatures.slides && (
            <button
              onClick={() => setCurrentView("liveSlides")}
              className={currentView === "liveSlides" ? "active" : ""}
            >
              <FaGlobe />
              Live Slides
            </button>
          )}
          {enabledFeatures.smartVerses && (
            <button
              onClick={() => setCurrentView("smartVerses")}
              className={currentView === "smartVerses" ? "active" : ""}
            >
              <FaBible />
              SmartVerses
            </button>
          )}
          {enabledFeatures.smartVerses && (
            <button
              onClick={() => setCurrentView("transcription")}
              className={currentView === "transcription" ? "active" : ""}
            >
              <FaMicrophone />
              Transcription
            </button>
          )}
          <button
            onClick={() => setCurrentView("display")}
            className={currentView === "display" ? "active" : ""}
          >
            <FaDesktop />
            Audience Display
          </button>
          {enabledFeatures.recorder && (
            <button
              onClick={() => setCurrentView("recorder")}
              className={currentView === "recorder" ? "active" : ""}
            >
              <FaCircle />
              Recorder
            </button>
          )}
          <button
            onClick={() => setCurrentView("network")}
            className={currentView === "network" ? "active" : ""}
          >
            <FaNetworkWired />
            Network
          </button>
          <button
            onClick={() => setCurrentView("proPresenter")}
            className={currentView === "proPresenter" ? "active" : ""}
          >
            <FaClock />
            ProPresenter
          </button>
          <button
            onClick={() => setCurrentView("features")}
            className={currentView === "features" ? "active" : ""}
          >
            <FaToggleOn />
            Features
          </button>
          <button
            onClick={() => setCurrentView("version")}
            className={currentView === "version" ? "active" : ""}
          >
            <FaInfoCircle />
            Version
          </button>
        </div>
      </div>
      <div style={rightColumnStyle}>
        {currentView === "templates" && (
          <>
            {selectedTemplate ? (
              <SettingsDetail
                key={selectedTemplate.id}
                template={selectedTemplate}
                onSave={handleSaveTemplate}
                onBack={() => setEditingTemplateId(null)}
              />
            ) : (
              <TemplateListView
                templates={templates}
                selectedTemplates={selectedTemplateIds}
                onSelectTemplate={handleSelectTemplate}
                onEditTemplate={setEditingTemplateId}
                onAddTemplate={handleAddTemplate}
                onImport={handleClickImport}
                onExportAll={async () => {
                  const result = await exportAllTemplatesToFile(templates);
                  if (result.status === "saved") {
                    setToastType("success");
                    setToastMessage("Templates exported");
                  } else if (result.status === "fallback") {
                    setToastType("success");
                    setToastMessage("Templates downloaded");
                  }
                }}
                onExportSelected={async () => {
                  if (selectedTemplateIds.length === 0) return;
                  const toExport = templates.filter((t) =>
                    selectedTemplateIds.includes(t.id)
                  );
                  const result = await exportAllTemplatesToFile(toExport);
                  if (result.status === "saved") {
                    setToastType("success");
                    setToastMessage("Templates exported");
                  } else if (result.status === "fallback") {
                    setToastType("success");
                    setToastMessage("Templates downloaded");
                  }
                }}
                hasSelection={selectedTemplateIds.length > 0}
                onDeleteTemplate={handleDeleteTemplate}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileChange}
              style={{ display: "none" }}
            />
          </>
        )}
        {currentView === "aiConfiguration" && <AISettingsForm />}
        {currentView === "liveTestimonies" && <LiveTestimoniesSettings />}
        {currentView === "liveSlides" && <LiveSlidesSettings />}
        {currentView === "smartVerses" && <SmartVersesSettings mode="smartVerses" />}
        {currentView === "transcription" && <SmartVersesSettings mode="transcription" />}
        {currentView === "display" && <DisplaySettings />}
        {currentView === "recorder" && <RecorderSettings />}
        {currentView === "network" && <NetworkSettings />}
        {currentView === "proPresenter" && <ProPresenterSettings />}
        {currentView === "features" && <FeaturesSettings />}
        {currentView === "midi" && <MidiSettings />}
        {currentView === "version" && <VersionSettings />}
      </div>
      {deletingTemplateId && (
        <ConfirmDialog
          isOpen={!!deletingTemplateId}
          title="Delete Template"
          message={`Are you sure you want to delete the template "${
            templates.find((t) => t.id === deletingTemplateId)?.name
          }"?`}
          onConfirm={confirmDeleteTemplate}
          onCancel={() => setDeletingTemplateId(null)}
        />
      )}
      {toastMessage && (
        <div
          className={`toast toast-${toastType}`}
          onClick={() => setToastMessage("")}
          title="Click to dismiss"
        >
          <span className="toast-text">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;

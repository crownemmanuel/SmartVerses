import React, { useState, useEffect } from "react";
import {
  FaTimes,
  FaSave,
  FaTrash,
  FaEdit,
  FaCopy,
  FaCheck,
  FaFolderOpen,
  FaClock,
} from "react-icons/fa";
import { ScheduleItem } from "../types/propresenter";
import { StageAssistSettings } from "../contexts/StageAssistContext";
import {
  TimerTemplate,
  loadTimerTemplates,
  createTimerTemplate,
  updateTimerTemplate,
  deleteTimerTemplate,
  duplicateTimerTemplate,
  templateNameExists,
} from "../services/timerTemplateService";

interface TimerTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "save" | "load";
  currentSchedule: ScheduleItem[];
  currentSettings: StageAssistSettings;
  onLoad: (schedule: ScheduleItem[], settings?: StageAssistSettings) => void;
  onSave: () => void;
}

const TimerTemplatesModal: React.FC<TimerTemplatesModalProps> = ({
  isOpen,
  onClose,
  mode,
  currentSchedule,
  currentSettings,
  onLoad,
  onSave,
}) => {
  const [templates, setTemplates] = useState<TimerTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [includeSettings, setIncludeSettings] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load templates when modal opens
  useEffect(() => {
    if (isOpen) {
      setTemplates(loadTimerTemplates());
      setNewTemplateName("");
      setNewTemplateDescription("");
      setEditingId(null);
      setError(null);
      setSelectedTemplateId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveNewTemplate = () => {
    const trimmedName = newTemplateName.trim();
    if (!trimmedName) {
      setError("Please enter a template name");
      return;
    }

    if (templateNameExists(trimmedName)) {
      setError("A template with this name already exists");
      return;
    }

    createTimerTemplate(
      trimmedName,
      currentSchedule,
      includeSettings ? currentSettings : undefined,
      newTemplateDescription.trim() || undefined
    );

    setTemplates(loadTimerTemplates());
    setNewTemplateName("");
    setNewTemplateDescription("");
    setError(null);
    onSave();
  };

  const handleUpdateExistingTemplate = (id: string) => {
    updateTimerTemplate(id, {
      schedule: currentSchedule,
      settings: includeSettings ? currentSettings : undefined,
    });
    setTemplates(loadTimerTemplates());
    onSave();
  };

  const handleSaveEdit = () => {
    if (!editingId) return;

    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Template name cannot be empty");
      return;
    }

    if (templateNameExists(trimmedName, editingId)) {
      setError("A template with this name already exists");
      return;
    }

    updateTimerTemplate(editingId, {
      name: trimmedName,
      description: editDescription.trim() || undefined,
    });

    setTemplates(loadTimerTemplates());
    setEditingId(null);
    setError(null);
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteTimerTemplate(id);
      setTemplates(loadTimerTemplates());
      setConfirmDeleteId(null);
      if (selectedTemplateId === id) {
        setSelectedTemplateId(null);
      }
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000); // Reset after 3s
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateTimerTemplate(id);
    setTemplates(loadTimerTemplates());
  };

  const handleLoadTemplate = (template: TimerTemplate) => {
    // Generate new IDs for schedule items to avoid conflicts
    const scheduleWithNewIds = template.schedule.map((item, index) => ({
      ...item,
      id: Date.now() + index,
    }));
    onLoad(scheduleWithNewIds, template.settings);
  };

  const startEditing = (template: TimerTemplate) => {
    setEditingId(template.id);
    setEditName(template.name);
    setEditDescription(template.description || "");
    setError(null);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          borderRadius: "12px",
          padding: "24px",
          width: "600px",
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.3rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            {mode === "save" ? (
              <>
                <FaSave style={{ color: "#3b82f6" }} /> Save Timer Template
              </>
            ) : (
              <>
                <FaFolderOpen style={{ color: "#3b82f6" }} /> Timer Templates
              </>
            )}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "6px",
              color: "var(--app-text-color-secondary)",
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "rgba(220, 38, 38, 0.15)",
              color: "#ef4444",
              borderRadius: "8px",
              marginBottom: "16px",
              fontSize: "0.9rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Save New Template Form (for save mode) */}
        {mode === "save" && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--app-header-bg)",
              borderRadius: "10px",
              marginBottom: "20px",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  marginBottom: "6px",
                }}
              >
                Template Name *
              </label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => {
                  setNewTemplateName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Sunday Morning Service"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--app-border-color)",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  fontSize: "0.95rem",
                }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  marginBottom: "6px",
                }}
              >
                Description (Optional)
              </label>
              <input
                type="text"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Brief description of this template"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--app-border-color)",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  fontSize: "0.95rem",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={includeSettings}
                  onChange={(e) => setIncludeSettings(e.target.checked)}
                  style={{ width: "16px", height: "16px" }}
                />
                Include timer settings (Auto Play, Use Durations, etc.)
              </label>
              <button
                onClick={handleSaveNewTemplate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                <FaSave /> Save as New
              </button>
            </div>
            <div
              style={{
                marginTop: "12px",
                padding: "10px 12px",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                borderRadius: "6px",
                fontSize: "0.85rem",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <FaClock style={{ marginRight: "6px", opacity: 0.7 }} />
              Current schedule has {currentSchedule.length} session
              {currentSchedule.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Templates List */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {mode === "save" && templates.length > 0 && (
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                marginBottom: "12px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              Or update an existing template:
            </div>
          )}

          {templates.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <FaFolderOpen
                style={{
                  fontSize: "2.5rem",
                  opacity: 0.4,
                  marginBottom: "12px",
                }}
              />
              <p style={{ margin: 0, fontSize: "1rem" }}>
                No templates saved yet
              </p>
              {mode === "load" && (
                <p style={{ margin: "8px 0 0", fontSize: "0.9rem", opacity: 0.8 }}>
                  Use "Save Template" to save your current schedule
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    padding: "14px 16px",
                    backgroundColor:
                      selectedTemplateId === template.id
                        ? "rgba(59, 130, 246, 0.15)"
                        : "var(--app-header-bg)",
                    border:
                      selectedTemplateId === template.id
                        ? "1px solid rgba(59, 130, 246, 0.5)"
                        : "1px solid var(--app-border-color)",
                    borderRadius: "10px",
                    cursor: mode === "load" ? "pointer" : "default",
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => {
                    if (mode === "load") {
                      setSelectedTemplateId(
                        selectedTemplateId === template.id ? null : template.id
                      );
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (mode === "load" && selectedTemplateId !== template.id) {
                      e.currentTarget.style.backgroundColor =
                        "rgba(59, 130, 246, 0.08)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (mode === "load" && selectedTemplateId !== template.id) {
                      e.currentTarget.style.backgroundColor =
                        "var(--app-header-bg)";
                    }
                  }}
                >
                  {editingId === template.id ? (
                    // Editing mode
                    <div>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => {
                          setEditName(e.target.value);
                          setError(null);
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--app-border-color)",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                          fontSize: "0.95rem",
                          marginBottom: "8px",
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (optional)"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--app-border-color)",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                          fontSize: "0.9rem",
                          marginBottom: "10px",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                            setError(null);
                          }}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "transparent",
                            color: "var(--app-text-color-secondary)",
                            border: "1px solid var(--app-border-color)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveEdit();
                          }}
                          style={{
                            padding: "6px 14px",
                            backgroundColor: "#22c55e",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <FaCheck /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "1rem",
                              marginBottom: "4px",
                            }}
                          >
                            {template.name}
                          </div>
                          {template.description && (
                            <div
                              style={{
                                fontSize: "0.85rem",
                                color: "var(--app-text-color-secondary)",
                                marginBottom: "6px",
                              }}
                            >
                              {template.description}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--app-text-color-secondary)",
                              display: "flex",
                              gap: "16px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>
                              <FaClock
                                style={{ marginRight: "4px", opacity: 0.7 }}
                              />
                              {template.schedule.length} session
                              {template.schedule.length !== 1 ? "s" : ""}
                            </span>
                            <span style={{ opacity: 0.7 }}>
                              Updated: {formatDate(template.updatedAt)}
                            </span>
                            {template.settings && (
                              <span
                                style={{
                                  color: "#22c55e",
                                  opacity: 0.9,
                                }}
                              >
                                + Settings
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "6px",
                            marginLeft: "12px",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {mode === "save" && (
                            <button
                              onClick={() => handleUpdateExistingTemplate(template.id)}
                              title="Update this template with current schedule"
                              style={{
                                padding: "6px 12px",
                                backgroundColor: "#3b82f6",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <FaSave /> Update
                            </button>
                          )}
                          {mode === "load" && (
                            <button
                              onClick={() => handleLoadTemplate(template)}
                              title="Load this template"
                              style={{
                                padding: "6px 12px",
                                backgroundColor: "#22c55e",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.8rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <FaFolderOpen /> Load
                            </button>
                          )}
                          <button
                            onClick={() => startEditing(template)}
                            title="Edit name/description"
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "var(--app-button-bg-color)",
                              color: "var(--app-button-text-color)",
                              border: "1px solid var(--app-border-color)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDuplicate(template.id)}
                            title="Duplicate template"
                            style={{
                              padding: "6px 10px",
                              backgroundColor: "var(--app-button-bg-color)",
                              color: "var(--app-button-text-color)",
                              border: "1px solid var(--app-border-color)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            <FaCopy />
                          </button>
                          <button
                            onClick={() => handleDelete(template.id)}
                            title={
                              confirmDeleteId === template.id
                                ? "Click again to confirm delete"
                                : "Delete template"
                            }
                            style={{
                              padding: "6px 10px",
                              backgroundColor:
                                confirmDeleteId === template.id
                                  ? "#dc2626"
                                  : "var(--app-button-bg-color)",
                              color:
                                confirmDeleteId === template.id
                                  ? "white"
                                  : "#ef4444",
                              border:
                                confirmDeleteId === template.id
                                  ? "none"
                                  : "1px solid var(--app-border-color)",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--app-border-color)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              backgroundColor: "var(--app-button-bg-color)",
              color: "var(--app-button-text-color)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimerTemplatesModal;

/**
 * Global Templates Settings Component
 * 
 * Allows users to configure reusable ProPresenter activation templates.
 * These can be selected from a dropdown anywhere ProPresenter triggers are used,
 * eliminating the need to repeatedly configure the same presentation/slide.
 */

import React, { useState, useEffect } from "react";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { FaDesktop, FaSpinner } from "react-icons/fa";
import { GlobalTemplate } from "../types/globalChat";
import {
  loadGlobalTemplates,
  saveGlobalTemplates,
} from "../utils/globalTemplates";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterConnection } from "../types/propresenter";

interface GlobalTemplatesSettingsProps {
  onTemplatesChange?: (templates: GlobalTemplate[]) => void;
}

const GlobalTemplatesSettings: React.FC<GlobalTemplatesSettingsProps> = ({
  onTemplatesChange,
}) => {
  const [templates, setTemplates] = useState<GlobalTemplate[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<GlobalTemplate>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [enabledConnections, setEnabledConnections] = useState<ProPresenterConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  // Load templates on mount
  useEffect(() => {
    const loaded = loadGlobalTemplates();
    setTemplates(loaded);
    onTemplatesChange?.(loaded);
    
    // Load enabled connections
    const connections = getEnabledConnections();
    setEnabledConnections(connections);
    if (connections.length > 0) {
      setSelectedConnectionId(connections[0].id);
    }
  }, []);

  // Save templates and notify parent
  const handleSaveTemplates = (newTemplates: GlobalTemplate[]) => {
    setTemplates(newTemplates);
    saveGlobalTemplates(newTemplates);
    onTemplatesChange?.(newTemplates);
  };

  // Start adding a new template
  const startAdding = () => {
    setEditForm({
      name: "",
      description: "",
      presentationUuid: "",
      presentationName: "",
      slideIndex: 0,
      activationClicks: 1,
      takeOffClicks: 0,
    });
    setIsAdding(true);
    setIsEditing(null);
    setStatusMessage(null);
  };

  // Start editing a template
  const startEditing = (template: GlobalTemplate) => {
    setEditForm({ ...template });
    setIsEditing(template.id);
    setIsAdding(false);
    setStatusMessage(null);
  };

  // Get current slide from ProPresenter
  const handleGetSlide = async () => {
    if (enabledConnections.length === 0) {
      setStatusMessage("No enabled ProPresenter connections found.");
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    const connection = enabledConnections.find(c => c.id === selectedConnectionId) || enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        setEditForm(prev => ({
          ...prev,
          presentationUuid: slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName: slideIndexData.presentation_index.presentation_id.name,
        }));
        setStatusMessage("✓ Slide captured successfully!");
      } else {
        setStatusMessage("No active presentation found. Make sure a slide is live in ProPresenter.");
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to get slide");
    }

    setIsLoading(false);
  };

  // Save the current template
  const saveTemplate = () => {
    if (!editForm.name || !editForm.presentationUuid) {
      setStatusMessage("Name and presentation are required");
      return;
    }

    const now = Date.now();
    
    if (isAdding) {
      // Add new template
      const newTemplate: GlobalTemplate = {
        id: `gt-${now}-${Math.random().toString(36).substr(2, 9)}`,
        name: editForm.name!,
        description: editForm.description || "",
        presentationUuid: editForm.presentationUuid!,
        presentationName: editForm.presentationName,
        slideIndex: editForm.slideIndex || 0,
        activationClicks: editForm.activationClicks ?? 1,
        takeOffClicks: editForm.takeOffClicks ?? 0,
        connectionIds: editForm.connectionIds,
        createdAt: now,
        updatedAt: now,
      };
      handleSaveTemplates([...templates, newTemplate]);
    } else if (isEditing) {
      // Update existing template
      const updated = templates.map(t => 
        t.id === isEditing 
          ? {
              ...t,
              name: editForm.name!,
              description: editForm.description || "",
              presentationUuid: editForm.presentationUuid!,
              presentationName: editForm.presentationName,
              slideIndex: editForm.slideIndex || 0,
              activationClicks: editForm.activationClicks ?? 1,
              takeOffClicks: editForm.takeOffClicks ?? 0,
              connectionIds: editForm.connectionIds,
              updatedAt: now,
            }
          : t
      );
      handleSaveTemplates(updated);
    }

    cancelEditing();
    setStatusMessage("Template saved!");
    setTimeout(() => setStatusMessage(null), 2000);
  };

  // Cancel editing/adding
  const cancelEditing = () => {
    setIsEditing(null);
    setIsAdding(false);
    setEditForm({});
    setStatusMessage(null);
  };

  // Delete a template
  const deleteTemplate = (id: string) => {
    if (window.confirm("Are you sure you want to delete this global template?")) {
      handleSaveTemplates(templates.filter(t => t.id !== id));
    }
  };

  return (
    <div>
      {/* Add Template Button */}
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "16px" }}>
        <button
          onClick={startAdding}
          disabled={isAdding || isEditing !== null}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            backgroundColor: isAdding || isEditing !== null ? "rgba(16, 185, 129, 0.5)" : "#10b981",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: isAdding || isEditing !== null ? "not-allowed" : "pointer",
          }}
        >
          <PlusIcon style={{ width: "16px", height: "16px" }} />
          Add Global Template
        </button>
      </div>

      {/* Empty state */}
      {templates.length === 0 && !isAdding && (
        <div style={{
          padding: "24px",
          border: "1px dashed rgba(255, 255, 255, 0.2)",
          borderRadius: "8px",
          textAlign: "center",
          color: "rgba(255, 255, 255, 0.5)",
        }}>
          No global templates configured. Add one to reuse ProPresenter activations across the app.
        </div>
      )}

      {/* Templates list */}
      {templates.map((template) => (
        <div
          key={template.id}
          style={{
            padding: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "10px",
            marginBottom: "12px",
          }}
        >
          {isEditing === template.id ? (
            <TemplateForm
              form={editForm}
              setForm={setEditForm}
              onSave={saveTemplate}
              onCancel={cancelEditing}
              onGetSlide={handleGetSlide}
              isLoading={isLoading}
              statusMessage={statusMessage}
              enabledConnections={enabledConnections}
              selectedConnectionId={selectedConnectionId}
              setSelectedConnectionId={setSelectedConnectionId}
            />
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Header */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  marginBottom: "8px",
                  flexWrap: "wrap",
                }}>
                  <span style={{ 
                    fontWeight: 600, 
                    fontSize: "1rem",
                    color: "var(--app-text-color)",
                  }}>
                    {template.name}
                  </span>
                  {template.activationClicks !== undefined && template.activationClicks > 1 && (
                    <span style={{
                      padding: "3px 8px",
                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                      color: "rgb(147, 197, 253)",
                      fontSize: "0.7rem",
                      fontWeight: 500,
                      borderRadius: "6px",
                    }}>
                      {template.activationClicks}× on live
                    </span>
                  )}
                  {template.takeOffClicks !== undefined && template.takeOffClicks > 0 && (
                    <span style={{
                      padding: "3px 8px",
                      backgroundColor: "rgba(234, 179, 8, 0.15)",
                      color: "rgb(253, 224, 71)",
                      fontSize: "0.7rem",
                      fontWeight: 500,
                      borderRadius: "6px",
                    }}>
                      {template.takeOffClicks}× on off
                    </span>
                  )}
                </div>
                
                {/* Description */}
                {template.description && (
                  <p style={{ 
                    margin: "0 0 12px 0", 
                    color: "rgba(255, 255, 255, 0.6)", 
                    fontSize: "0.875rem",
                    lineHeight: 1.4,
                  }}>
                    {template.description}
                  </p>
                )}
                
                {/* Details */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "6px 12px",
                  fontSize: "0.8rem",
                  color: "rgba(255, 255, 255, 0.5)",
                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                  padding: "10px 12px",
                  borderRadius: "6px",
                }}>
                  <span style={{ fontWeight: 500, color: "rgba(255, 255, 255, 0.7)" }}>Presentation:</span>
                  <span style={{ 
                    fontFamily: "monospace", 
                    fontSize: "0.75rem",
                    wordBreak: "break-all",
                  }}>
                    {template.presentationName || template.presentationUuid}
                  </span>
                  <span style={{ fontWeight: 500, color: "rgba(255, 255, 255, 0.7)" }}>Slide:</span>
                  <span style={{ fontSize: "0.75rem" }}>
                    Index {template.slideIndex}
                  </span>
                </div>
              </div>
              
              {/* Action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "12px" }}>
                <button
                  onClick={() => startEditing(template)}
                  style={{
                    padding: "8px",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    color: "rgba(255, 255, 255, 0.5)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.9)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
                  }}
                  title="Edit template"
                >
                  <PencilIcon style={{ width: "16px", height: "16px" }} />
                </button>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  style={{
                    padding: "8px",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "6px",
                    color: "rgba(255, 255, 255, 0.5)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
                    e.currentTarget.style.color = "rgb(248, 113, 113)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
                  }}
                  title="Delete template"
                >
                  <TrashIcon style={{ width: "16px", height: "16px" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add new template form */}
      {isAdding && (
        <div style={{
          padding: "16px",
          backgroundColor: "rgba(16, 185, 129, 0.05)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "10px",
          marginBottom: "12px",
        }}>
          <h4 style={{ 
            margin: "0 0 16px 0", 
            color: "var(--app-text-color)",
            fontWeight: 600,
          }}>
            New Global Template
          </h4>
          <TemplateForm
            form={editForm}
            setForm={setEditForm}
            onSave={saveTemplate}
            onCancel={cancelEditing}
            onGetSlide={handleGetSlide}
            isLoading={isLoading}
            statusMessage={statusMessage}
            enabledConnections={enabledConnections}
            selectedConnectionId={selectedConnectionId}
            setSelectedConnectionId={setSelectedConnectionId}
            isNew
          />
        </div>
      )}

      {/* Status message */}
      {statusMessage && !isAdding && !isEditing && (
        <div style={{ 
          marginTop: "12px", 
          fontSize: "0.85em", 
          color: statusMessage.startsWith("✓") ? "#22c55e" : "var(--app-text-color-secondary)",
        }}>
          {statusMessage}
        </div>
      )}
    </div>
  );
};

/**
 * Template edit form component
 */
interface TemplateFormProps {
  form: Partial<GlobalTemplate>;
  setForm: React.Dispatch<React.SetStateAction<Partial<GlobalTemplate>>>;
  onSave: () => void;
  onCancel: () => void;
  onGetSlide: () => void;
  isLoading: boolean;
  statusMessage: string | null;
  enabledConnections: ProPresenterConnection[];
  selectedConnectionId: string;
  setSelectedConnectionId: (id: string) => void;
  isNew?: boolean;
}

const TemplateForm: React.FC<TemplateFormProps> = ({
  form,
  setForm,
  onSave,
  onCancel,
  onGetSlide,
  isLoading,
  statusMessage,
  enabledConnections,
  selectedConnectionId,
  setSelectedConnectionId,
  isNew,
}) => {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "6px",
    color: "var(--app-text-color)",
    fontSize: "0.9rem",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: "6px",
    fontWeight: 500,
  };

  return (
    <div>
      {/* Name */}
      <div style={{ marginBottom: "12px" }}>
        <label style={labelStyle}>Template Name *</label>
        <input
          type="text"
          value={form.name || ""}
          onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Main Lower Third"
          style={inputStyle}
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: "12px" }}>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={form.description || ""}
          onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
          placeholder="What is this template used for?"
          style={inputStyle}
        />
      </div>

      {/* Get Slide Section */}
      <div style={{
        padding: "12px",
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        borderRadius: "8px",
        marginBottom: "12px",
      }}>
        <p style={{ 
          margin: "0 0 12px 0", 
          fontSize: "0.85rem", 
          color: "rgba(255, 255, 255, 0.7)",
        }}>
          Go to ProPresenter and put the slide you want to trigger live, then click "Get Slide".
        </p>

        {/* Connection selector */}
        {enabledConnections.length > 1 && (
          <div style={{ marginBottom: "10px" }}>
            <label style={labelStyle}>Get slide from:</label>
            <select
              value={selectedConnectionId}
              onChange={(e) => setSelectedConnectionId(e.target.value)}
              style={{
                ...inputStyle,
                cursor: "pointer",
              }}
            >
              {enabledConnections.map(conn => (
                <option key={conn.id} value={conn.id}>
                  {conn.name} ({conn.apiUrl})
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={onGetSlide}
          disabled={isLoading || enabledConnections.length === 0}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? (
            <>
              <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
              Reading...
            </>
          ) : (
            <>
              <FaDesktop />
              Get Slide
            </>
          )}
        </button>

        {enabledConnections.length === 0 && (
          <p style={{ 
            margin: "10px 0 0 0", 
            fontSize: "0.8rem", 
            color: "#ef4444",
          }}>
            No enabled ProPresenter connections. Enable one in Settings.
          </p>
        )}

        {statusMessage && (
          <p style={{ 
            margin: "10px 0 0 0", 
            fontSize: "0.85rem", 
            color: statusMessage.startsWith("✓") ? "#22c55e" : "#ef4444",
          }}>
            {statusMessage}
          </p>
        )}
      </div>

      {/* Captured slide info */}
      {form.presentationUuid && (
        <div style={{
          padding: "10px 12px",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          border: "1px solid rgba(34, 197, 94, 0.3)",
          borderRadius: "6px",
          marginBottom: "12px",
          fontSize: "0.85rem",
        }}>
          <div style={{ fontWeight: 600, marginBottom: "4px", color: "#22c55e" }}>
            ✓ Slide captured
          </div>
          <div style={{ color: "rgba(255, 255, 255, 0.7)" }}>
            Presentation: {form.presentationName || form.presentationUuid}
          </div>
          <div style={{ color: "rgba(255, 255, 255, 0.7)" }}>
            Slide Index: {form.slideIndex}
          </div>
        </div>
      )}

      {/* Animation clicks */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "1fr 1fr", 
        gap: "12px",
        marginBottom: "16px",
      }}>
        <div>
          <label style={labelStyle}>Go Live Clicks</label>
          <input
            type="number"
            min={1}
            max={10}
            value={form.activationClicks ?? 1}
            onChange={(e) => setForm(prev => ({ ...prev, activationClicks: parseInt(e.target.value) || 1 }))}
            style={inputStyle}
          />
          <p style={{ margin: "4px 0 0 0", fontSize: "0.7rem", color: "rgba(255, 255, 255, 0.4)" }}>
            Triggers for animations
          </p>
        </div>
        <div>
          <label style={labelStyle}>Take Off Clicks</label>
          <input
            type="number"
            min={0}
            max={10}
            value={form.takeOffClicks ?? 0}
            onChange={(e) => setForm(prev => ({ ...prev, takeOffClicks: parseInt(e.target.value) || 0 }))}
            style={inputStyle}
          />
          <p style={{ margin: "4px 0 0 0", fontSize: "0.7rem", color: "rgba(255, 255, 255, 0.4)" }}>
            0 = don't trigger on take off
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          <XMarkIcon style={{ width: "16px", height: "16px" }} />
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!form.name || !form.presentationUuid}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            backgroundColor: !form.name || !form.presentationUuid ? "rgba(16, 185, 129, 0.5)" : "#10b981",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "0.875rem",
            cursor: !form.name || !form.presentationUuid ? "not-allowed" : "pointer",
          }}
        >
          <CheckIcon style={{ width: "16px", height: "16px" }} />
          {isNew ? "Create Template" : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default GlobalTemplatesSettings;

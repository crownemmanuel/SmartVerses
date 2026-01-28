import React, { useState, useEffect } from "react";
import { FaDesktop, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterActivationConfig, ProPresenterConnection } from "../types/propresenter";
import { GlobalTemplate } from "../types/globalChat";
import { loadGlobalTemplates, globalTemplateToActivation } from "../utils/globalTemplates";
import "../App.css";

interface ActivatePresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ProPresenterActivationConfig | undefined) => void;
  currentConfig?: ProPresenterActivationConfig;
  title?: string;
}

const ActivatePresentationModal: React.FC<ActivatePresentationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentConfig,
  title = "Activate Presentation on ProPresenter",
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedConfig, setSavedConfig] = useState<ProPresenterActivationConfig | null>(
    currentConfig || null
  );
  const [activationClicks, setActivationClicks] = useState<number>(
    currentConfig?.activationClicks ?? 1
  );
  const [takeOffClicks, setTakeOffClicks] = useState<number>(
    currentConfig?.takeOffClicks ?? 0
  );

  // ProPresenter connection selection
  const [enabledConnections, setEnabledConnections] = useState<ProPresenterConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  // Global templates
  const [globalTemplates, setGlobalTemplates] = useState<GlobalTemplate[]>([]);
  const [selectedGlobalTemplateId, setSelectedGlobalTemplateId] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState<"global" | "manual">("global");

  // Load enabled connections and global templates when modal opens
  useEffect(() => {
    if (isOpen) {
      const connections = getEnabledConnections();
      setEnabledConnections(connections);
      // Auto-select first connection if available
      if (connections.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(connections[0].id);
      }

      // Load global templates
      const templates = loadGlobalTemplates();
      setGlobalTemplates(templates);
      
      // If global templates exist, default to global mode; otherwise manual
      if (templates.length > 0) {
        setSelectionMode("global");
        // Auto-select first template and set config
        const firstTemplate = templates[0];
        setSelectedGlobalTemplateId(firstTemplate.id);
        // Also set the savedConfig so Save button appears
        const activation = globalTemplateToActivation(firstTemplate);
        setSavedConfig({
          presentationUuid: activation.presentationUuid,
          slideIndex: activation.slideIndex,
          presentationName: activation.presentationName,
          activationClicks: activation.activationClicks,
          takeOffClicks: activation.takeOffClicks,
        });
        setActivationClicks(activation.activationClicks ?? 1);
        setTakeOffClicks(activation.takeOffClicks ?? 0);
      } else {
        setSelectionMode("manual");
      }
    }
  }, [isOpen]);

  // Handle global template selection
  const handleGlobalTemplateSelect = (templateId: string) => {
    setSelectedGlobalTemplateId(templateId);
    const template = globalTemplates.find(t => t.id === templateId);
    if (template) {
      const activation = globalTemplateToActivation(template);
      const config: ProPresenterActivationConfig = {
        presentationUuid: activation.presentationUuid,
        slideIndex: activation.slideIndex,
        presentationName: activation.presentationName,
        activationClicks: activation.activationClicks,
        takeOffClicks: activation.takeOffClicks,
      };
      setSavedConfig(config);
      setActivationClicks(activation.activationClicks ?? 1);
      setTakeOffClicks(activation.takeOffClicks ?? 0);
      setSuccess(true);
      setError(null);
    }
  };

  // Reset savedConfig when currentConfig changes
  useEffect(() => {
    setSavedConfig(currentConfig || null);
    setActivationClicks(currentConfig?.activationClicks ?? 1);
    setTakeOffClicks(currentConfig?.takeOffClicks ?? 0);
    setSuccess(false);
    setError(null);
  }, [currentConfig]);

  const handleGetSlide = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    if (enabledConnections.length === 0) {
      setError("No enabled ProPresenter connections found. Please enable at least one connection in Settings.");
      setIsLoading(false);
      return;
    }

    // Find the selected connection
    const connection = enabledConnections.find(c => c.id === selectedConnectionId) || enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        const config: ProPresenterActivationConfig = {
          presentationUuid: slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName: slideIndexData.presentation_index.presentation_id.name,
          activationClicks: activationClicks !== 1 ? activationClicks : undefined,
          takeOffClicks: takeOffClicks !== 0 ? takeOffClicks : undefined,
        };
        setSavedConfig(config);
        setSuccess(true);
        setIsLoading(false);
        return;
      } else {
        setError("No active presentation found. Make sure a slide is live in ProPresenter.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get slide index");
    }

    setIsLoading(false);
  };

  const handleSave = () => {
    if (savedConfig) {
      // Include animation trigger settings in the saved config
      const configToSave: ProPresenterActivationConfig = {
        ...savedConfig,
        activationClicks: activationClicks !== 1 ? activationClicks : undefined,
        takeOffClicks: takeOffClicks !== 0 ? takeOffClicks : undefined,
      };
      onSave(configToSave);
    } else {
      onSave(undefined);
    }
    onClose();
  };

  const handleRemove = () => {
    onSave(undefined);
    onClose();
  };

  const handleCancel = () => {
    setError(null);
    setSuccess(false);
    setIsLoading(false);
    setSavedConfig(currentConfig || null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "500px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <FaDesktop />
          {title}
        </h2>

        {/* Selection Mode Tabs */}
        {globalTemplates.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "0",
              marginBottom: "16px",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <button
              onClick={() => {
                setSelectionMode("global");
                // Re-apply the selected global template's config
                if (selectedGlobalTemplateId) {
                  const template = globalTemplates.find(t => t.id === selectedGlobalTemplateId);
                  if (template) {
                    const activation = globalTemplateToActivation(template);
                    setSavedConfig({
                      presentationUuid: activation.presentationUuid,
                      slideIndex: activation.slideIndex,
                      presentationName: activation.presentationName,
                      activationClicks: activation.activationClicks,
                      takeOffClicks: activation.takeOffClicks,
                    });
                    setActivationClicks(activation.activationClicks ?? 1);
                    setTakeOffClicks(activation.takeOffClicks ?? 0);
                    setSuccess(true);
                  }
                }
              }}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                backgroundColor: selectionMode === "global" 
                  ? "var(--success)" 
                  : "var(--app-header-bg)",
                color: selectionMode === "global" 
                  ? "white" 
                  : "var(--app-text-color-secondary)",
                cursor: "pointer",
                fontSize: "0.9em",
                fontWeight: selectionMode === "global" ? 600 : 400,
                transition: "all 0.2s",
              }}
            >
              Use Global Template
            </button>
            <button
              onClick={() => {
                setSelectionMode("manual");
                setSuccess(false);
                setSavedConfig(currentConfig || null);
                setActivationClicks(currentConfig?.activationClicks ?? 1);
                setTakeOffClicks(currentConfig?.takeOffClicks ?? 0);
              }}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                borderLeft: "1px solid var(--app-border-color)",
                backgroundColor: selectionMode === "manual" 
                  ? "var(--primary-color)" 
                  : "var(--app-header-bg)",
                color: selectionMode === "manual" 
                  ? "white" 
                  : "var(--app-text-color-secondary)",
                cursor: "pointer",
                fontSize: "0.9em",
                fontWeight: selectionMode === "manual" ? 600 : 400,
                transition: "all 0.2s",
              }}
            >
              Get from ProPresenter
            </button>
          </div>
        )}

        {/* Global Template Selection */}
        {selectionMode === "global" && globalTemplates.length > 0 && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              backgroundColor: "rgba(16, 185, 129, 0.05)",
              borderRadius: "8px",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            <label
              style={{
                fontSize: "0.85em",
                display: "block",
                marginBottom: "8px",
                color: "var(--app-text-color)",
                fontWeight: 600,
              }}
            >
              Select a Global Template:
            </label>
            <select
              value={selectedGlobalTemplateId}
              onChange={(e) => handleGlobalTemplateSelect(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "0.9em",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {globalTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.description ? ` — ${template.description}` : ""}
                </option>
              ))}
            </select>
            {selectedGlobalTemplateId && (
              <div style={{ 
                marginTop: "10px", 
                fontSize: "0.8em", 
                color: "var(--app-text-color-secondary)",
                padding: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.2)",
                borderRadius: "4px",
              }}>
                {(() => {
                  const template = globalTemplates.find(t => t.id === selectedGlobalTemplateId);
                  if (!template) return null;
                  return (
                    <>
                      <div><strong>Presentation:</strong> {template.presentationName || template.presentationUuid}</div>
                      <div><strong>Slide:</strong> {template.slideIndex}</div>
                      {template.activationClicks && template.activationClicks > 1 && (
                        <div><strong>Go Live Clicks:</strong> {template.activationClicks}</div>
                      )}
                      {template.takeOffClicks && template.takeOffClicks > 0 && (
                        <div><strong>Take Off Clicks:</strong> {template.takeOffClicks}</div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Manual Instructions - Only show in manual mode or if no global templates */}
        {(selectionMode === "manual" || globalTemplates.length === 0) && (
          <div
            style={{
              marginBottom: "20px",
              padding: "12px",
              backgroundColor: "var(--app-header-bg)",
              borderRadius: "8px",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <p style={{ margin: "0 0 12px 0", color: "var(--app-text-color)" }}>
              <strong>Instructions:</strong>
            </p>
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>Go to ProPresenter and put the slide you want to activate live</li>
              <li>Click the button below to read the current slide information</li>
              <li>Save the configuration</li>
            </ol>
          </div>
        )}

        {error && (
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
            {error}
          </div>
        )}

        {success && savedConfig && (
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FaCheck />
              <div>
                <div style={{ fontWeight: 600 }}>Slide information captured!</div>
                <div style={{ fontSize: "0.85em", marginTop: "4px", opacity: 0.9 }}>
                  Presentation: {savedConfig.presentationName || savedConfig.presentationUuid}
                  <br />
                  Slide Index: {savedConfig.slideIndex}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentConfig && !success && (
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
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Current Configuration:</div>
            <div>
              Presentation: {currentConfig.presentationName || currentConfig.presentationUuid}
              <br />
              Slide Index: {currentConfig.slideIndex}
            </div>
          </div>
        )}

        {/* Animation Trigger Settings - Compact */}
        {savedConfig && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div style={{ fontSize: "0.85em", fontWeight: 600, marginBottom: "8px", color: "var(--app-text-color)" }}>
              Animation Triggers (optional override):
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px", color: "var(--app-text-color-secondary)" }}>
                  Go Live Clicks:
                </label>
                <input
                  type="number"
                  min="1"
                  value={activationClicks}
                  onChange={(e) => setActivationClicks(Math.max(1, parseInt(e.target.value) || 1))}
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
                <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px", color: "var(--app-text-color-secondary)" }}>
                  Off Live Clicks:
                </label>
                <input
                  type="number"
                  min="0"
                  value={takeOffClicks}
                  onChange={(e) => setTakeOffClicks(Math.max(0, parseInt(e.target.value) || 0))}
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
            <div style={{ fontSize: "0.75em", color: "var(--app-text-color-secondary)", marginTop: "6px" }}>
              Leave default to use template settings. Set to override for this slide only.
            </div>
          </div>
        )}

        {/* ProPresenter Connection Selector - Only in manual mode */}
        {(selectionMode === "manual" || globalTemplates.length === 0) && enabledConnections.length > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
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

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {currentConfig && (
            <button onClick={handleRemove} className="secondary" style={{ marginRight: "auto" }}>
              <FaTimes />
              Remove
            </button>
          )}
          <button onClick={handleCancel} className="secondary">
            <FaTimes />
            Cancel
          </button>
          {/* Get Slide button - only in manual mode */}
          {(selectionMode === "manual" || globalTemplates.length === 0) && (
            <button
              onClick={handleGetSlide}
              disabled={isLoading || enabledConnections.length === 0}
              className="secondary"
              style={{ minWidth: "140px" }}
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
          )}
          {savedConfig && (
            <button onClick={handleSave} className="primary">
              <FaCheck />
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivatePresentationModal;

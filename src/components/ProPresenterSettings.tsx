import React, { useState, useEffect } from "react";
import { FaPlus, FaTrash, FaCheck, FaTimes, FaEdit, FaChevronDown, FaChevronRight } from "react-icons/fa";
import {
  ProPresenterConnection,
} from "../types/propresenter";
import {
  loadProPresenterConnections,
  saveProPresenterConnections,
  testConnection,
  testTimer,
  generateUUID,
} from "../services/propresenterService";
import ProPresenterAITemplatesSettings from "./ProPresenterAITemplatesSettings";
import GlobalTemplatesSettings from "./GlobalTemplatesSettings";
import { loadProPresenterAITemplates } from "../utils/proPresenterAITemplates";
import { loadGlobalTemplates } from "../utils/globalTemplates";
import "../App.css";

interface ConnectionStatus {
  status: "none" | "testing" | "success" | "error";
  message: string;
}

const ProPresenterSettings: React.FC = () => {
  const [connections, setConnections] = useState<ProPresenterConnection[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [isAITemplatesExpanded, setIsAITemplatesExpanded] = useState(true);
  const [isGlobalTemplatesExpanded, setIsGlobalTemplatesExpanded] = useState(true);
  const [aiTemplatesCount, setAiTemplatesCount] = useState(0);
  const [globalTemplatesCount, setGlobalTemplatesCount] = useState(0);

  useEffect(() => {
    setConnections(loadProPresenterConnections());
    // Load AI templates count for display
    const aiTemplates = loadProPresenterAITemplates();
    setAiTemplatesCount(aiTemplates.length);
    // Load global templates count for display
    const globalTemplates = loadGlobalTemplates();
    setGlobalTemplatesCount(globalTemplates.length);
  }, []);

  const handleAddConnection = () => {
    const newConnection: ProPresenterConnection = {
      id: generateUUID(),
      name: `ProPresenter ${connections.length + 1}`,
      apiUrl: "http://localhost:1025",
      timerIndex: connections.length,
      isEnabled: false,
    };
    const updated = [...connections, newConnection];
    setConnections(updated);
    saveProPresenterConnections(updated);
    setEditingId(newConnection.id);
  };

  const handleDeleteConnection = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this connection?")) {
      return;
    }
    const updated = connections.filter((c) => c.id !== id);
    setConnections(updated);
    saveProPresenterConnections(updated);
    setConnectionStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdateConnection = (id: string, updates: Partial<ProPresenterConnection>) => {
    const updated = connections.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    setConnections(updated);
    saveProPresenterConnections(updated);
  };

  const handleTestConnection = async (connection: ProPresenterConnection) => {
    setConnectionStatuses((prev) => ({
      ...prev,
      [connection.id]: { status: "testing", message: "Testing connection..." },
    }));

    const result = await testConnection(connection);
    
    if (result.success) {
      // Also test the timer
      const timerResult = await testTimer(connection);
      setConnectionStatuses((prev) => ({
        ...prev,
        [connection.id]: {
          status: timerResult.success ? "success" : "error",
          message: timerResult.success 
            ? `${result.message} | ${timerResult.message}`
            : `${result.message} | Timer: ${timerResult.message}`,
        },
      }));
    } else {
      setConnectionStatuses((prev) => ({
        ...prev,
        [connection.id]: { status: "error", message: result.message },
      }));
    }
  };

  return (
    <div style={{ padding: "var(--spacing-4)" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "var(--spacing-4)" 
      }}>
        <div>
          <h2 style={{ margin: 0, marginBottom: "var(--spacing-1)" }}>
            ProPresenter Connections
          </h2>
          <p style={{ 
            margin: 0, 
            fontSize: "0.875rem", 
            color: "var(--app-text-color-secondary)" 
          }}>
            Configure multiple ProPresenter instances for timers and other integrations.
          </p>
        </div>
        <button onClick={handleAddConnection} className="primary">
          <FaPlus style={{ marginRight: "var(--spacing-1)" }} />
          Add Connection
        </button>
      </div>

      {connections.length === 0 ? (
        <div style={{
          padding: "var(--spacing-8)",
          textAlign: "center",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "8px",
          border: "1px solid var(--app-border-color)",
        }}>
          <p style={{ color: "var(--app-text-color-secondary)" }}>
            No ProPresenter connections configured. Click "Add Connection" to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          {connections.map((connection) => {
            const status = connectionStatuses[connection.id] || { status: "none", message: "" };
            const isEditing = editingId === connection.id;

            return (
              <div
                key={connection.id}
                style={{
                  backgroundColor: "var(--app-header-bg)",
                  borderRadius: "12px",
                  padding: "var(--spacing-4)",
                  border: `1px solid ${connection.isEnabled ? "var(--success)" : "var(--app-border-color)"}`,
                }}
              >
                {/* Header */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "var(--spacing-3)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={connection.name}
                        onChange={(e) => handleUpdateConnection(connection.id, { name: e.target.value })}
                        style={{
                          padding: "var(--spacing-2)",
                          borderRadius: "4px",
                          border: "1px solid var(--app-border-color)",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                          fontSize: "1rem",
                          fontWeight: 600,
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                        {connection.name}
                      </span>
                    )}
                    {connection.isEnabled && (
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        backgroundColor: "rgba(34, 197, 94, 0.2)",
                        color: "rgb(34, 197, 94)",
                      }}>
                        ENABLED
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-1)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={connection.isEnabled}
                        onChange={(e) => handleUpdateConnection(connection.id, { isEnabled: e.target.checked })}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.875rem" }}>Enable</span>
                    </label>
                  </div>
                </div>

                {/* Connection Details */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--spacing-3)",
                  marginBottom: "var(--spacing-3)",
                }}>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "var(--app-text-color-secondary)",
                      marginBottom: "var(--spacing-1)",
                    }}>
                      API URL
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={connection.apiUrl}
                        onChange={(e) => handleUpdateConnection(connection.id, { apiUrl: e.target.value })}
                        placeholder="http://localhost:1025"
                        style={{
                          width: "100%",
                          padding: "var(--spacing-2)",
                          borderRadius: "4px",
                          border: "1px solid var(--app-border-color)",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: "0.875rem" }}>{connection.apiUrl}</span>
                    )}
                  </div>
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "var(--app-text-color-secondary)",
                      marginBottom: "var(--spacing-1)",
                    }}>
                      Timer Index
                    </label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={connection.timerIndex}
                        onChange={(e) => handleUpdateConnection(connection.id, { timerIndex: parseInt(e.target.value) || 0 })}
                        min={0}
                        style={{
                          width: "100%",
                          padding: "var(--spacing-2)",
                          borderRadius: "4px",
                          border: "1px solid var(--app-border-color)",
                          backgroundColor: "var(--app-input-bg-color)",
                          color: "var(--app-input-text-color)",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: "0.875rem" }}>{connection.timerIndex}</span>
                    )}
                  </div>
                </div>

                {/* Status Message */}
                {status.status !== "none" && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-2)",
                    padding: "var(--spacing-2)",
                    borderRadius: "4px",
                    marginBottom: "var(--spacing-3)",
                    backgroundColor: status.status === "success" 
                      ? "rgba(34, 197, 94, 0.1)" 
                      : status.status === "error" 
                      ? "rgba(220, 38, 38, 0.1)" 
                      : "rgba(59, 130, 246, 0.1)",
                    color: status.status === "success" 
                      ? "rgb(34, 197, 94)" 
                      : status.status === "error" 
                      ? "rgb(220, 38, 38)" 
                      : "rgb(59, 130, 246)",
                    fontSize: "0.875rem",
                  }}>
                    {status.status === "success" && <FaCheck />}
                    {status.status === "error" && <FaTimes />}
                    {status.status === "testing" && <span className="spinner" />}
                    {status.message}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
                  {isEditing ? (
                    <>
                      <button 
                        onClick={() => setEditingId(null)}
                        className="secondary"
                        style={{ flex: 1 }}
                      >
                        Done
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => setEditingId(connection.id)} 
                        className="secondary"
                        style={{ flex: 1 }}
                      >
                        <FaEdit style={{ marginRight: "var(--spacing-1)" }} />
                        Edit
                      </button>
                      <button 
                        onClick={() => handleTestConnection(connection)}
                        className="secondary"
                        style={{ flex: 1 }}
                        disabled={status.status === "testing"}
                      >
                        {status.status === "testing" ? "Testing..." : "Test Connection"}
                      </button>
                      <button 
                        onClick={() => handleDeleteConnection(connection.id)}
                        className="danger"
                        title="Delete Connection"
                      >
                        <FaTrash />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Templates Section */}
      <div style={{
        marginTop: "var(--spacing-6)",
        padding: "var(--spacing-4)",
        backgroundColor: "var(--app-header-bg)",
        borderRadius: "12px",
        border: "1px solid var(--app-border-color)",
      }}>
        <div 
          onClick={() => setIsAITemplatesExpanded(!isAITemplatesExpanded)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            {isAITemplatesExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              ProPresenter AI Templates
            </h2>
            <span style={{
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "0.75rem",
              fontWeight: 500,
              backgroundColor: aiTemplatesCount > 0 ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.1)",
              color: aiTemplatesCount > 0 ? "rgb(59, 130, 246)" : "var(--app-text-color-secondary)",
            }}>
              ({aiTemplatesCount})
            </span>
          </div>
        </div>
        
        {isAITemplatesExpanded && (
          <div style={{ marginTop: "var(--spacing-4)" }}>
            <p style={{ 
              margin: 0, 
              marginBottom: "var(--spacing-4)",
              fontSize: "0.875rem", 
              color: "var(--app-text-color-secondary)" 
            }}>
              Templates for the AI to display content directly on ProPresenter. Each writes text to a file and triggers a slide.
            </p>
            <ProPresenterAITemplatesSettings 
              onTemplatesChange={(templates) => setAiTemplatesCount(templates.length)}
            />
          </div>
        )}
      </div>

      {/* Global Templates Section */}
      <div style={{
        marginTop: "var(--spacing-4)",
        padding: "var(--spacing-4)",
        backgroundColor: "var(--app-header-bg)",
        borderRadius: "12px",
        border: "1px solid var(--app-border-color)",
      }}>
        <div 
          onClick={() => setIsGlobalTemplatesExpanded(!isGlobalTemplatesExpanded)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            {isGlobalTemplatesExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              Global Templates
            </h2>
            <span style={{
              padding: "2px 8px",
              borderRadius: "12px",
              fontSize: "0.75rem",
              fontWeight: 500,
              backgroundColor: globalTemplatesCount > 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.1)",
              color: globalTemplatesCount > 0 ? "rgb(16, 185, 129)" : "var(--app-text-color-secondary)",
            }}>
              ({globalTemplatesCount})
            </span>
          </div>
        </div>
        
        {isGlobalTemplatesExpanded && (
          <div style={{ marginTop: "var(--spacing-4)" }}>
            <p style={{ 
              margin: 0, 
              marginBottom: "var(--spacing-4)",
              fontSize: "0.875rem", 
              color: "var(--app-text-color-secondary)" 
            }}>
              Reusable ProPresenter activations. Create once, then select from a dropdown anywhere you need to trigger a slide.
              This saves you from configuring the same presentation/slide repeatedly across the app.
            </p>
            <GlobalTemplatesSettings 
              onTemplatesChange={(templates) => setGlobalTemplatesCount(templates.length)}
            />
          </div>
        )}
      </div>

      {/* Info Section */}
      <div style={{
        marginTop: "var(--spacing-4)",
        padding: "var(--spacing-4)",
        backgroundColor: "var(--app-header-bg)",
        borderRadius: "8px",
        border: "1px solid var(--app-border-color)",
      }}>
        <h3 style={{ margin: 0, marginBottom: "var(--spacing-2)", fontSize: "0.875rem", fontWeight: 600 }}>
          ProPresenter API Setup
        </h3>
        <ul style={{
          margin: 0,
          paddingLeft: "var(--spacing-4)",
          fontSize: "0.875rem",
          color: "var(--app-text-color-secondary)",
          lineHeight: 1.6,
        }}>
          <li>In ProPresenter, go to <strong>Settings → Network</strong></li>
          <li>Enable the <strong>Network API</strong></li>
          <li>Note the port number (default: 1025) and enter it in the API URL above</li>
          <li>The Timer Index corresponds to the timer slot in ProPresenter (0 = first timer)</li>
          <li>You can add multiple connections for different ProPresenter instances</li>
        </ul>
      </div>
    </div>
  );
};

export default ProPresenterSettings;

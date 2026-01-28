import React, { useState, useEffect, useCallback, useRef } from "react";
import { FaPlus, FaPlay, FaStop, FaCopy, FaTrash, FaServer } from "react-icons/fa";
import {
  startLiveSlidesServer,
  stopLiveSlidesServer,
  createLiveSlideSession,
  deleteLiveSlideSession,
  getLiveSlidesServerInfo,
  loadLiveSlidesSettings,
  LiveSlidesWebSocket,
  generateWebSocketUrl,
  generateShareableNotepadUrl,
} from "../services/liveSlideService";
import {
  LiveSlideSession,
  LiveSlidesState,
  LiveSlide,
  WsSlidesUpdate,
} from "../types/liveSlides";
import ConfirmDialog from "../components/ConfirmDialog";
import "../App.css";

const LiveSlidesPage: React.FC = () => {
  const [serverInfo, setServerInfo] = useState<LiveSlidesState | null>(null);
  const [sessions, setSessions] = useState<LiveSlideSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<LiveSlideSession | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  // WebSocket connection for live updates
  const wsRef = useRef<LiveSlidesWebSocket | null>(null);

  // Fetch server info
  const refreshServerInfo = useCallback(async () => {
    try {
      const info = await getLiveSlidesServerInfo();
      setServerInfo(info);
      setSessions(Object.values(info.sessions));
    } catch (err) {
      console.error("Failed to get server info:", err);
    }
  }, []);

  useEffect(() => {
    refreshServerInfo();
    const interval = setInterval(refreshServerInfo, 5000);
    return () => clearInterval(interval);
  }, [refreshServerInfo]);

  // Connect to WebSocket for live updates when server is running
  useEffect(() => {
    if (serverInfo?.server_running && selectedSessionId) {
      const wsUrl = generateWebSocketUrl(serverInfo.local_ip, serverInfo.server_port);
      const ws = new LiveSlidesWebSocket(wsUrl, selectedSessionId, "viewer");
      wsRef.current = ws;

      ws.connect().catch((err) => console.error("WS connect failed:", err));

      const unsubscribe = ws.onSlidesUpdate((update: WsSlidesUpdate) => {
        // Update the session in our local state
        setSessions((prev) =>
          prev.map((s) =>
            s.id === update.session_id
              ? { ...s, slides: update.slides, raw_text: update.raw_text }
              : s
          )
        );
      });

      return () => {
        unsubscribe();
        ws.disconnect();
      };
    }
  }, [serverInfo?.server_running, serverInfo?.local_ip, serverInfo?.server_port, selectedSessionId]);

  const handleStartServer = async () => {
    setIsStartingServer(true);
    try {
      const settings = loadLiveSlidesSettings();
      await startLiveSlidesServer(settings.serverPort);
      setToast({ message: "Server started successfully", type: "success" });
      await refreshServerInfo();
    } catch (err) {
      setToast({ message: `Failed to start server: ${err}`, type: "error" });
    } finally {
      setIsStartingServer(false);
    }
  };

  const handleStopServer = async () => {
    try {
      await stopLiveSlidesServer();
      setToast({ message: "Server stopped", type: "info" });
      await refreshServerInfo();
    } catch (err) {
      setToast({ message: `Failed to stop server: ${err}`, type: "error" });
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    
    setIsCreatingSession(true);
    try {
      const session = await createLiveSlideSession(newSessionName.trim());
      setSessions((prev) => [...prev, session]);
      setSelectedSessionId(session.id);
      setNewSessionName("");
      setToast({ message: `Session "${session.name}" created`, type: "success" });
    } catch (err) {
      setToast({ message: `Failed to create session: ${err}`, type: "error" });
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!pendingDeleteSession) return;
    
    try {
      await deleteLiveSlideSession(pendingDeleteSession.id);
      setSessions((prev) => prev.filter((s) => s.id !== pendingDeleteSession.id));
      if (selectedSessionId === pendingDeleteSession.id) {
        setSelectedSessionId(null);
      }
      setToast({ message: `Session "${pendingDeleteSession.name}" deleted`, type: "info" });
    } catch (err) {
      setToast({ message: `Failed to delete session: ${err}`, type: "error" });
    } finally {
      setPendingDeleteSession(null);
    }
  };

  const handleCopyUrl = async (sessionId: string) => {
    if (!serverInfo) return;
    
    // Generate the shareable URL - this uses the Rust server port which serves
    // both the static frontend and WebSocket connections
    const url = generateShareableNotepadUrl(
      serverInfo.local_ip,
      serverInfo.server_port,
      sessionId
    );
    
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(sessionId);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      setToast({ message: "Failed to copy URL", type: "error" });
    }
  };


  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return (
    <div style={styles.container}>
      {/* Left Panel - Sessions List */}
      <div style={styles.leftPanel}>
        <div style={styles.sectionHeader}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Live Slides</h2>
        </div>

        {/* Server Status */}
        <div style={styles.serverStatus}>
          <div style={styles.serverStatusHeader}>
            <FaServer style={{ marginRight: "8px" }} />
            <span>WebSocket Server</span>
          </div>
          <div style={styles.serverStatusContent}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: serverInfo?.server_running ? "#10B981" : "#6B7280",
                }}
              />
              <span>{serverInfo?.server_running ? "Running" : "Stopped"}</span>
            </div>
            {serverInfo?.server_running && (
              <div style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
                {serverInfo.local_ip}:{serverInfo.server_port}
              </div>
            )}
            <button
              onClick={serverInfo?.server_running ? handleStopServer : handleStartServer}
              disabled={isStartingServer}
              style={{
                ...styles.serverButton,
                backgroundColor: serverInfo?.server_running ? "#EF4444" : "#10B981",
              }}
            >
              {serverInfo?.server_running ? (
                <>
                  <FaStop /> Stop
                </>
              ) : (
                <>
                  <FaPlay /> {isStartingServer ? "Starting..." : "Start"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Create Session */}
        <div style={styles.createSession}>
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="New session name..."
            style={styles.input}
            onKeyDown={(e) => e.key === "Enter" && handleCreateSession()}
            disabled={!serverInfo?.server_running}
          />
          <button
            onClick={handleCreateSession}
            disabled={!newSessionName.trim() || isCreatingSession || !serverInfo?.server_running}
            style={styles.createButton}
          >
            <FaPlus />
          </button>
        </div>

        {/* Sessions List */}
        <div style={styles.sessionsList}>
          {sessions.length === 0 ? (
            <div style={styles.emptyState}>
              {serverInfo?.server_running
                ? "No sessions yet. Create one above."
                : "Start the server to create sessions."}
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                style={{
                  ...styles.sessionItem,
                  backgroundColor:
                    selectedSessionId === session.id
                      ? "var(--app-playlist-item-selected-bg)"
                      : "transparent",
                }}
              >
                <div style={styles.sessionInfo}>
                  <div style={styles.sessionName}>{session.name}</div>
                  <div style={styles.sessionMeta}>
                    {session.slides.length} slides
                  </div>
                </div>
                <div style={styles.sessionActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyUrl(session.id);
                    }}
                    style={styles.iconButton}
                    title="Copy URL"
                  >
                    {copyFeedback === session.id ? "✓" : <FaCopy />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteSession(session);
                    }}
                    style={{ ...styles.iconButton, color: "#EF4444" }}
                    title="Delete session"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Session Details & Live Preview */}
      <div style={styles.rightPanel}>
        {selectedSession ? (
          <>
            <div style={styles.detailHeader}>
              <h2 style={{ margin: 0 }}>{selectedSession.name}</h2>
              <div style={styles.detailMeta}>
                Session ID: {selectedSession.id.slice(0, 8)}...
              </div>
            </div>

            {/* Slides Preview */}
            <div style={styles.slidesContainer}>
              <h3 style={{ marginTop: 0 }}>Live Preview</h3>
              {selectedSession.slides.length === 0 ? (
                <div style={styles.emptySlides}>
                  No slides yet. Copy the URL above and paste it into your browser to open the notepad and start typing!
                </div>
              ) : (
                <div style={styles.slidesList}>
                  {selectedSession.slides.map((slide: LiveSlide, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        ...styles.slideCard,
                        borderLeftColor: slide.color,
                      }}
                    >
                      <div style={styles.slideNumber}>{idx + 1}</div>
                      <div style={styles.slideContent}>
                        {slide.items.map((item, itemIdx) => (
                          <div
                            key={itemIdx}
                            style={{
                              marginLeft: item.is_sub_item ? "20px" : "0",
                              opacity: item.is_sub_item ? 0.85 : 1,
                              fontSize: item.is_sub_item ? "0.9rem" : "1rem",
                            }}
                          >
                            {item.is_sub_item && "↳ "}
                            {item.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Raw Text Preview */}
            {selectedSession.raw_text && (
              <div style={styles.rawTextContainer}>
                <h4 style={{ margin: "0 0 8px 0" }}>Raw Text</h4>
                <pre style={styles.rawText}>{selectedSession.raw_text}</pre>
              </div>
            )}
          </>
        ) : (
          <div style={styles.noSelection}>
            <FaServer style={{ fontSize: "3rem", opacity: 0.3, marginBottom: "16px" }} />
            <div>Select a session to view details</div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!pendingDeleteSession}
        title="Delete Session"
        message={`Are you sure you want to delete session "${pendingDeleteSession?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteSession}
        onCancel={() => setPendingDeleteSession(null)}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`toast toast-${toast.type}`}
          onClick={() => setToast(null)}
        >
          <span className="toast-text">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    height: "calc(100vh - 51px)",
    backgroundColor: "var(--app-bg-color)",
  },
  leftPanel: {
    width: "320px",
    borderRight: "1px solid var(--app-border-color)",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--surface-2)",
  },
  sectionHeader: {
    padding: "16px",
    borderBottom: "1px solid var(--app-border-color)",
  },
  serverStatus: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--app-border-color)",
    backgroundColor: "var(--app-header-bg)",
  },
  serverStatusHeader: {
    display: "flex",
    alignItems: "center",
    fontSize: "0.9rem",
    fontWeight: 500,
    marginBottom: "8px",
  },
  serverStatusContent: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  serverButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "8px 16px",
    border: "none",
    borderRadius: "6px",
    color: "white",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
    marginTop: "4px",
  },
  createSession: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid var(--app-border-color)",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--app-border-color)",
    backgroundColor: "var(--app-input-bg-color)",
    color: "var(--app-text-color)",
    fontSize: "0.9rem",
  },
  createButton: {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "var(--app-primary-color)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionsList: {
    flex: 1,
    overflowY: "auto",
  },
  emptyState: {
    padding: "24px",
    textAlign: "center",
    color: "var(--app-text-color-secondary)",
    fontSize: "0.9rem",
  },
  sessionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid var(--app-border-color)",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  sessionName: {
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  sessionMeta: {
    fontSize: "0.8rem",
    color: "var(--app-text-color-secondary)",
    marginTop: "2px",
  },
  sessionActions: {
    display: "flex",
    gap: "4px",
  },
  iconButton: {
    padding: "6px",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--app-text-color-secondary)",
    cursor: "pointer",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease",
  },
  rightPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    padding: "24px",
  },
  detailHeader: {
    marginBottom: "24px",
  },
  detailMeta: {
    fontSize: "0.85rem",
    color: "var(--app-text-color-secondary)",
    marginTop: "4px",
  },
  slidesContainer: {
    flex: 1,
    overflowY: "auto",
  },
  emptySlides: {
    padding: "40px",
    textAlign: "center",
    color: "var(--app-text-color-secondary)",
    backgroundColor: "var(--app-header-bg)",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  slidesList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  slideCard: {
    display: "flex",
    backgroundColor: "var(--app-header-bg)",
    borderRadius: "8px",
    borderLeft: "4px solid",
    padding: "16px",
    gap: "16px",
  },
  slideNumber: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    backgroundColor: "var(--app-button-bg-color)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.85rem",
    fontWeight: 600,
    flexShrink: 0,
  },
  slideContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  rawTextContainer: {
    marginTop: "24px",
    padding: "16px",
    backgroundColor: "var(--app-input-bg-color)",
    borderRadius: "8px",
  },
  rawText: {
    margin: 0,
    fontSize: "0.85rem",
    color: "var(--app-text-color-secondary)",
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    maxHeight: "150px",
    overflowY: "auto",
  },
  noSelection: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--app-text-color-secondary)",
  },
};

export default LiveSlidesPage;

import React, { useState, useEffect } from "react";
import { FaServer, FaDesktop, FaPlay, FaPlus, FaCopy } from "react-icons/fa";
import {
  createLiveSlideSession,
  getLiveSlidesServerInfo,
  loadLiveSlidesSettings,
  startLiveSlidesServer,
  generateShareableNotepadUrl,
} from "../services/liveSlideService";
import {
  LiveSlideSession,
  LiveSlidesState,
  LiveSlide,
} from "../types/liveSlides";
import { Slide, Template, LayoutType } from "../types";
import { stripBulletPrefix } from "../utils/liveSlideParser";
import "../App.css";

interface ImportFromLiveSlidesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    itemName: string,
    templateName: string,
    slides: Pick<Slide, "text" | "layout" | "isAutoScripture">[],
    options?: { liveSlidesSessionId?: string; liveSlidesLinked?: boolean }
  ) => boolean;
  templates: Template[];
}

const LIVE_SLIDES_TEMPLATE_NAME = "Live Slides";

const ImportFromLiveSlidesModal: React.FC<ImportFromLiveSlidesModalProps> = ({
  isOpen,
  onClose,
  onImport,
  templates, // kept for compatibility with existing modal API; Live Slides no longer needs templates
}) => {
  const [serverInfo, setServerInfo] = useState<LiveSlidesState | null>(null);
  const [sessions, setSessions] = useState<LiveSlideSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [itemName, setItemName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createdSession, setCreatedSession] = useState<{
    session: LiveSlideSession;
    typingUrl: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedSessionId(null);
      setError(null);
      setItemName("");
      setNewSessionName("");
      setToast("");
      setCreatedSession(null);
      fetchServerInfo();
    }
  }, [isOpen, templates]);

  const fetchServerInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await getLiveSlidesServerInfo();
      setServerInfo(info);
      const sessionList = Object.values(info.sessions);
      setSessions(sessionList);

      // Auto-select first session with slides
      const sessionWithSlides = sessionList.find((s) => s.slides.length > 0);
      if (sessionWithSlides) {
        setSelectedSessionId(sessionWithSlides.id);
        setItemName(sessionWithSlides.name);
      }
    } catch (err) {
      setError(
        "Live Slides server is not running. Start it to create or join sessions."
      );
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const convertLiveSlidesToSlides = (
    liveSlides: LiveSlide[]
  ): Pick<Slide, "text" | "layout" | "isAutoScripture">[] => {
    return liveSlides.map((liveSlide) => {
      // Combine items into text lines, stripping bullet characters (visual-only in notepad)
      const text = liveSlide.items
        .map((item) => stripBulletPrefix(item.text))
        .join("\n");

      // Determine layout based on number of items
      const itemCount = liveSlide.items.length;
      const layout = `${getLayoutName(itemCount)}-line` as LayoutType;

      return {
        text,
        layout,
        isAutoScripture: false,
      };
    });
  };

  const getLayoutName = (count: number): string => {
    const names: Record<number, string> = {
      1: "one",
      2: "two",
      3: "three",
      4: "four",
      5: "five",
      6: "six",
    };
    return names[Math.min(count, 6)] || "one";
  };

  const handleJoin = () => {
    if (!selectedSession || !itemName.trim()) {
      return;
    }

    const slides = convertLiveSlidesToSlides(selectedSession.slides);
    onImport(itemName.trim(), LIVE_SLIDES_TEMPLATE_NAME, slides, {
      liveSlidesSessionId: selectedSession.id,
      liveSlidesLinked: true, // join live updates
    });
    onClose();
  };

  const handleStartServer = async () => {
    setIsStartingServer(true);
    setError(null);
    setToast("");
    try {
      const settings = loadLiveSlidesSettings();
      await startLiveSlidesServer(settings.serverPort);
      await fetchServerInfo();
      setToast("Server started");
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to start server: ${msg}`);
    } finally {
      setIsStartingServer(false);
    }
  };

  const buildTypingUrl = (sessionId: string) => {
    const info = serverInfo;
    const settings = loadLiveSlidesSettings();
    const host = info?.local_ip || "localhost";
    // Use the server port (which serves both HTTP and WebSocket) instead of hardcoded dev port
    return generateShareableNotepadUrl(host, settings.serverPort, sessionId);
  };

  const handleCreateAndAdd = async () => {
    if (!newSessionName.trim()) return;

    setIsCreatingSession(true);
    setError(null);
    setToast("");
    setCreatedSession(null);
    try {
      if (!serverInfo?.server_running) {
        await handleStartServer();
      }

      const session = await createLiveSlideSession(newSessionName.trim());
      const typingUrl = buildTypingUrl(session.id);

      // Add to playlist as a live-linked item; slides will populate in Main via WS.
      onImport(newSessionName.trim(), LIVE_SLIDES_TEMPLATE_NAME, [], {
        liveSlidesSessionId: session.id,
        liveSlidesLinked: true,
      });

      // Show success state with the link
      setCreatedSession({ session, typingUrl });

      // Try to copy typing URL automatically (non-blocking)
      try {
        await navigator.clipboard.writeText(typingUrl);
      } catch (clipboardError) {
        // Clipboard access denied - user can copy manually
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to create session: ${msg}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCopyTypingUrl = async () => {
    if (!selectedSession) return;
    try {
      await navigator.clipboard.writeText(buildTypingUrl(selectedSession.id));
      setToast("Typing URL copied");
      setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("Failed to copy URL");
      setTimeout(() => setToast(""), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "600px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <FaDesktop />
          Live Slides
        </h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FaServer style={{ opacity: 0.7 }} />
            <span
              style={{
                fontSize: "0.9em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              Server: {serverInfo?.server_running ? "Running" : "Stopped"}
              {serverInfo?.server_running &&
                ` (${serverInfo.local_ip}:${serverInfo.server_port})`}
            </span>
          </div>
          {!serverInfo?.server_running && (
            <button
              onClick={handleStartServer}
              className="primary btn-sm"
              disabled={isStartingServer}
              title="Start WebSocket server"
            >
              <FaPlay /> {isStartingServer ? "Starting..." : "Start"}
            </button>
          )}
        </div>

        {toast && (
          <div
            style={{
              marginBottom: "12px",
              color: "var(--app-text-color-secondary)",
              fontSize: "0.9em",
            }}
          >
            {toast}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            Loading sessions...
          </div>
        ) : createdSession ? (
          /* Success state - show session created message with link */
          <div
            style={{
              padding: "24px",
              borderRadius: "8px",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                marginBottom: "12px",
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "1.1em",
                marginBottom: "8px",
                color: "#22c55e",
              }}
            >
              Session Created!
            </div>
            <div
              style={{
                color: "var(--app-text-color-secondary)",
                marginBottom: "20px",
                fontSize: "0.9em",
              }}
            >
              "{createdSession.session.name}" has been added to your playlist.
              <br />
              Here's the link to join:
            </div>
            <div
              style={{
                padding: "12px",
                borderRadius: "6px",
                backgroundColor: "var(--app-bg-color)",
                border: "1px solid var(--app-border-color)",
                marginBottom: "16px",
                wordBreak: "break-all",
                fontSize: "0.85em",
                color: "var(--text-color)",
                fontFamily: "monospace",
              }}
            >
              {createdSession.typingUrl}
            </div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "center",
              }}
            >
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      createdSession.typingUrl
                    );
                    setToast("Link copied to clipboard!");
                    setTimeout(() => setToast(""), 2000);
                  } catch (err) {
                    setToast("Failed to copy link");
                    setTimeout(() => setToast(""), 2000);
                  }
                }}
                className="primary"
              >
                <FaCopy /> Copy Link
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ color: "#EF4444", marginBottom: "12px" }}>
                {error}
              </div>
            )}

            {/* Create + Add (primary flow) */}
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                backgroundColor: "var(--app-header-bg)",
                marginBottom: "12px",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                Create a live session (recommended)
              </div>
              <div className="form-group">
                <label>Session Name:</label>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="e.g., Sunday Service - AM"
                  disabled={isCreatingSession}
                />
              </div>

              {isCreatingSession && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "20px",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  <div style={{ marginBottom: "8px" }}>⏳</div>
                  <div style={{ fontWeight: 500 }}>Creating session...</div>
                  <div style={{ fontSize: "0.9em", marginTop: "4px" }}>
                    Please wait
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  onClick={handleCreateAndAdd}
                  className="primary"
                  disabled={!newSessionName.trim() || isCreatingSession}
                  title="Creates a Live Slides session, adds it to the current playlist, and copies the typing URL"
                >
                  <FaPlus />{" "}
                  {isCreatingSession ? "Creating..." : "Create + Join"}
                </button>
              </div>
            </div>

            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px" }}>
                <div style={{ color: "var(--app-text-color-secondary)" }}>
                  No existing sessions yet.
                </div>
                <div
                  style={{
                    color: "var(--app-text-color-secondary)",
                    fontSize: "0.9rem",
                    marginTop: "8px",
                  }}
                >
                  Create one above, then share the typing URL.
                </div>
              </div>
            ) : (
              <>
                {/* Session Selection */}
                <div className="form-group">
                  <label>Select Session:</label>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    }}
                  >
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => {
                          setSelectedSessionId(session.id);
                          setItemName(session.name);
                        }}
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          border: `2px solid ${
                            selectedSessionId === session.id
                              ? "var(--app-primary-color)"
                              : "var(--app-border-color)"
                          }`,
                          backgroundColor:
                            selectedSessionId === session.id
                              ? "var(--app-playlist-item-selected-bg)"
                              : "var(--app-header-bg)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{session.name}</div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--app-text-color-secondary)",
                            marginTop: "4px",
                          }}
                        >
                          {session.slides.length} slides
                          {session.slides.length === 0 && " (empty)"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Item Name */}
                <div className="form-group">
                  <label htmlFor="itemName">Item Name:</label>
                  <input
                    type="text"
                    id="itemName"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Enter a name for this item"
                  />
                </div>

                {/* Preview */}
                {selectedSession && selectedSession.slides.length > 0 && (
                  <div className="form-group">
                    <label>
                      Preview ({selectedSession.slides.length} slides):
                    </label>
                    <div className="import-preview-area">
                      {selectedSession.slides.slice(0, 10).map((slide, idx) => (
                        <div
                          key={idx}
                          className="preview-slide-item"
                          style={{
                            borderLeft: `3px solid ${slide.color}`,
                            paddingLeft: "10px",
                          }}
                        >
                          <strong>Slide {idx + 1}:</strong>{" "}
                          {slide.items
                            .map((item) => item.text)
                            .join(" / ")
                            .slice(0, 80)}
                          {slide.items.map((item) => item.text).join(" / ")
                            .length > 80 && "..."}
                        </div>
                      ))}
                      {selectedSession.slides.length > 10 && (
                        <div
                          style={{
                            padding: "8px 0",
                            color: "var(--app-text-color-secondary)",
                          }}
                        >
                          +{selectedSession.slides.length - 10} more slides
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {selectedSession && (
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      marginBottom: "12px",
                    }}
                  >
                    <button
                      onClick={handleCopyTypingUrl}
                      className="secondary btn-sm"
                      title="Copy shareable typing URL"
                    >
                      <FaCopy /> Copy Typing URL
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="modal-actions">
          {createdSession ? (
            <button onClick={onClose} className="primary">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose}>Cancel</button>
              <button
                onClick={handleJoin}
                className="primary"
                disabled={
                  !selectedSession ||
                  !itemName.trim() ||
                  !serverInfo?.server_running
                }
              >
                Join Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportFromLiveSlidesModal;

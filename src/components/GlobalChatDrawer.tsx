/**
 * GlobalChatDrawer Component
 *
 * The main chat panel that slides in from the right side of the screen.
 * Takes up 25% of the screen width (right quarter) and provides
 * a comprehensive AI assistant interface.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FaTimes,
  FaPaperPlane,
  FaImage,
  FaTrash,
  FaSync,
  FaMagic,
} from "react-icons/fa";
import {
  ChatMessage as ChatMessageType,
  ExecutedAction,
  SetTimerParams,
} from "../types/globalChat";
import { Template, Playlist, Slide } from "../types";
import { ScheduleItem } from "../types/propresenter";
import ChatMessage from "./ChatMessage";
import {
  processGlobalChatMessage,
  executeActions,
  buildContext,
  isAIConfigured,
  ActionCallbacks,
  AIContextMode,
} from "../services/globalAIService";

interface GlobalChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage:
    | "main"
    | "stageAssist"
    | "liveSlides"
    | "media"
    | "smartVerses"
    | "settings"
    | "help";
  templates: Template[];
  currentPlaylist?: { id: string; name: string; items: any[] };
  currentSchedule?: ScheduleItem[];
  currentSlides?: Slide[]; // The slides of the currently selected playlist item
  onSlidesCreated?: (slides: Slide[], templateId: string) => void;
  onPlaylistCreated?: (playlist: Playlist) => void;
  onTimerSet?: (params: SetTimerParams) => void;
  onScheduleUpdated?: (schedule: ScheduleItem[]) => void;
  onCurrentSlidesUpdated?: (slides: Slide[]) => void; // Callback when AI updates current slides
}

const drawerStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(4px)",
    zIndex: 1000,
    transition: "opacity 0.3s ease",
  },
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100%",
    width: "25%",
    minWidth: "320px",
    maxWidth: "480px",
    backgroundColor: "#0f172a",
    boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.3)",
    zIndex: 1001,
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  headerText: {
    fontWeight: 600,
    color: "#fff",
    margin: 0,
    fontSize: "16px",
  },
  headerButtons: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  iconButton: {
    padding: "8px",
    background: "transparent",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    color: "rgba(255, 255, 255, 0.6)",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    textAlign: "center",
    padding: "16px",
  },
  emptyIcon: {
    fontSize: "48px",
    color: "#3b82f6",
    marginBottom: "16px",
  },
  emptyTitle: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#fff",
    marginBottom: "8px",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: "14px",
    marginBottom: "24px",
  },
  quickActions: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  quickAction: {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: "14px",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  inputArea: {
    padding: "16px",
    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  inputRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  },
  textarea: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "12px",
    padding: "12px 14px",
    color: "#fff",
    fontSize: "14px",
    resize: "none",
    minHeight: "44px",
    maxHeight: "150px",
    outline: "none",
    fontFamily: "inherit",
    lineHeight: "1.4",
    overflow: "auto",
  },
  sendButton: {
    padding: "10px",
    backgroundColor: "#3b82f6",
    border: "none",
    borderRadius: "12px",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  },
  imagePreview: {
    marginBottom: "8px",
    position: "relative",
    display: "inline-block",
  },
  previewImage: {
    height: "64px",
    borderRadius: "8px",
    objectFit: "cover",
  },
  removeImageButton: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    padding: "4px",
    backgroundColor: "#ef4444",
    border: "none",
    borderRadius: "50%",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
  },
};

// Context mode labels for display
const CONTEXT_MODE_LABELS: Record<AIContextMode, { label: string; icon: string; color: string }> = {
  auto: { label: "Auto", icon: "🤖", color: "#a855f7" },
  timer: { label: "Timer", icon: "⏱", color: "#3b82f6" },
  slides: { label: "All Slides", icon: "📊", color: "#22c55e" },
  currentSlide: { label: "Current Slide", icon: "📝", color: "#06b6d4" },
  all: { label: "All", icon: "🌐", color: "#f59e0b" },
};

export const GlobalChatDrawer: React.FC<GlobalChatDrawerProps> = ({
  isOpen,
  onClose,
  currentPage,
  templates,
  currentPlaylist,
  currentSchedule,
  currentSlides,
  onSlidesCreated,
  onPlaylistCreated,
  onTimerSet,
  onScheduleUpdated,
  onCurrentSlidesUpdated,
}) => {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [contextMode, setContextMode] = useState<AIContextMode>("auto");
  const [showContextMenu, setShowContextMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target as Node)
      ) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showContextMenu]);

  // Auto-switch context based on current page/tab
  useEffect(() => {
    // When user navigates to a different page, auto-set the context
    if (currentPage === "stageAssist") {
      setContextMode("timer");
    } else if (currentPage === "main") {
      setContextMode("slides");
    } else {
      // For other pages (settings, help, media, liveSlides), use auto
      setContextMode("auto");
    }
  }, [currentPage]);

  const generateMessageId = () =>
    `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() && !attachedImage) return;
    if (isProcessing) return;

    const userMessage: ChatMessageType = {
      id: generateMessageId(),
      role: "user",
      content: inputValue.trim() || "Analyze this image",
      timestamp: Date.now(),
      image: attachedImage || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setAttachedImage(null);
    setIsProcessing(true);

    const assistantMessageId = generateMessageId();
    const assistantMessage: ChatMessageType = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isLoading: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      let hasStreamedToken = false;
      const context = buildContext(
        currentPage,
        templates,
        currentPlaylist,
        currentSchedule,
        currentSlides
      );

      const response = await processGlobalChatMessage(
        userMessage.content,
        context,
        userMessage.image,
        contextMode,
        {
          onToken: (token) => {
            hasStreamedToken = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: (m.content || "") + token, isLoading: true }
                  : m
              )
            );
          },
          onStatus: (status, message) => {
            if (status === "loading" && !hasStreamedToken && message) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: message, isLoading: true }
                    : m
                )
              );
            }
            if (status === "start" && !hasStreamedToken) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: "", isLoading: true }
                    : m
                )
              );
            }
          },
        }
      );

      const callbacks: ActionCallbacks = {
        onSlidesCreated,
        onPlaylistCreated,
        onTimerSet,
        onScheduleUpdated,
        onCurrentSlidesUpdated,
      };

      let executedActions: ExecutedAction[] = [];
      if (response.action !== "none") {
        executedActions = await executeActions(response, templates, callbacks);
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: response.responseText,
                actions: executedActions.length > 0 ? executedActions : undefined,
                isLoading: false,
              }
            : m
        )
      );
    } catch (error) {
      console.error("Chat error:", error);

      const errorMessage: ChatMessageType = {
        id: assistantMessageId,
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Something went wrong"}`,
        timestamp: Date.now(),
        isLoading: false,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessageId ? errorMessage : m))
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    inputValue,
    attachedImage,
    isProcessing,
    currentPage,
    templates,
    currentPlaylist,
    currentSchedule,
    currentSlides,
    contextMode,
    onSlidesCreated,
    onPlaylistCreated,
    onTimerSet,
    onScheduleUpdated,
    onCurrentSlidesUpdated,
  ]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const aiConfigured = isAIConfigured();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={drawerStyles.backdrop} onClick={onClose} />

      {/* Drawer */}
      <div style={drawerStyles.drawer}>
        {/* Header */}
        <div style={drawerStyles.header}>
          <div style={drawerStyles.headerTitle}>
            <FaMagic style={{ color: "#3b82f6", fontSize: "18px" }} />
            <h2 style={drawerStyles.headerText}>AI Assistant</h2>
          </div>
          <div style={drawerStyles.headerButtons}>
            <button
              onClick={handleClearChat}
              style={drawerStyles.iconButton}
              title="Clear chat"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <FaTrash size={14} />
            </button>
            <button
              onClick={onClose}
              style={drawerStyles.iconButton}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div style={drawerStyles.messagesArea}>
          {!aiConfigured ? (
            <div style={drawerStyles.emptyState}>
              <FaMagic style={{ ...drawerStyles.emptyIcon, color: "#f59e0b" }} />
              <h3 style={drawerStyles.emptyTitle}>AI Not Configured</h3>
              <p style={drawerStyles.emptyText}>
                Please configure an AI provider (OpenAI, Gemini, or Groq) in
                Settings → AI Configuration to use the chat assistant.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div style={drawerStyles.emptyState}>
              <FaMagic style={drawerStyles.emptyIcon} />
              <h3 style={drawerStyles.emptyTitle}>How can I help?</h3>
              <p style={drawerStyles.emptyText}>
                I can help you create slides, manage playlists, control timers,
                and even control ProPresenter directly.
              </p>
              <div style={drawerStyles.quickActions}>
                <button
                  style={drawerStyles.quickAction}
                  onClick={() =>
                    setInputValue("Create prayer point slides for: ")
                  }
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                  }}
                >
                  → Create prayer point slides
                </button>
                <button
                  style={drawerStyles.quickAction}
                  onClick={() => setInputValue("Set a 5-minute countdown timer")}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                  }}
                >
                  → Set a 5-minute countdown
                </button>
                <button
                  style={drawerStyles.quickAction}
                  onClick={() =>
                    setInputValue("On ProPresenter, go to next slide")
                  }
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                  }}
                >
                  → On ProPresenter, go to next slide
                </button>
                <button
                  style={drawerStyles.quickAction}
                  onClick={() =>
                    setInputValue("On ProPresenter, clear all layers")
                  }
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.1)";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.05)";
                    e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
                  }}
                >
                  → Clear all ProPresenter layers
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div style={drawerStyles.inputArea}>
          {/* Context Selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)" }}>
              Context:
            </span>
            <div ref={contextMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  backgroundColor: `${CONTEXT_MODE_LABELS[contextMode].color}20`,
                  border: `1px solid ${CONTEXT_MODE_LABELS[contextMode].color}40`,
                  borderRadius: "16px",
                  color: CONTEXT_MODE_LABELS[contextMode].color,
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <span>{CONTEXT_MODE_LABELS[contextMode].icon}</span>
                <span>{CONTEXT_MODE_LABELS[contextMode].label}</span>
                <span style={{ fontSize: "10px", opacity: 0.7 }}>▼</span>
              </button>

              {showContextMenu && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    marginBottom: "4px",
                    backgroundColor: "#1e293b",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "4px",
                    minWidth: "140px",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                    zIndex: 10,
                  }}
                >
                  {(Object.keys(CONTEXT_MODE_LABELS) as AIContextMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setContextMode(mode);
                        setShowContextMenu(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        width: "100%",
                        padding: "8px 10px",
                        backgroundColor:
                          mode === contextMode
                            ? `${CONTEXT_MODE_LABELS[mode].color}30`
                            : "transparent",
                        border: "none",
                        borderRadius: "6px",
                        color:
                          mode === contextMode
                            ? CONTEXT_MODE_LABELS[mode].color
                            : "rgba(255, 255, 255, 0.7)",
                        fontSize: "13px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>{CONTEXT_MODE_LABELS[mode].icon}</span>
                      <span>{CONTEXT_MODE_LABELS[mode].label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span
              style={{
                fontSize: "11px",
                color: "rgba(255, 255, 255, 0.4)",
                marginLeft: "auto",
              }}
            >
              {contextMode === "auto"
                ? "AI selects context"
                : contextMode === "timer"
                ? "Schedule loaded"
                : contextMode === "slides"
                ? "Templates loaded"
                : contextMode === "currentSlide"
                ? currentSlides?.length ? `${currentSlides.length} slides` : "No slides selected"
                : "Full context"}
            </span>
          </div>

          {attachedImage && (
            <div style={drawerStyles.imagePreview as React.CSSProperties}>
              <img
                src={attachedImage}
                alt="Attached"
                style={drawerStyles.previewImage}
              />
              <button
                onClick={() => setAttachedImage(null)}
                style={drawerStyles.removeImageButton as React.CSSProperties}
              >
                <FaTimes size={8} />
              </button>
            </div>
          )}

          <div style={drawerStyles.inputRow}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...drawerStyles.iconButton,
                color: "rgba(255, 255, 255, 0.5)",
              }}
              title="Attach image"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "rgba(255, 255, 255, 0.5)";
              }}
            >
              <FaImage size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: "none" }}
            />

            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                // Auto-resize textarea
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
              }}
              onKeyDown={handleKeyPress}
              placeholder={
                aiConfigured ? "Type a message... (Shift+Enter for new line)" : "Configure AI first"
              }
              disabled={!aiConfigured || isProcessing}
              style={{
                ...drawerStyles.textarea,
                opacity: !aiConfigured || isProcessing ? 0.5 : 1,
              }}
              rows={1}
            />

            <button
              onClick={handleSend}
              disabled={
                (!inputValue.trim() && !attachedImage) ||
                isProcessing ||
                !aiConfigured
              }
              style={{
                ...drawerStyles.sendButton,
                opacity:
                  (!inputValue.trim() && !attachedImage) ||
                  isProcessing ||
                  !aiConfigured
                    ? 0.5
                    : 1,
                cursor:
                  (!inputValue.trim() && !attachedImage) ||
                  isProcessing ||
                  !aiConfigured
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {isProcessing ? (
                <FaSync size={16} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <FaPaperPlane size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default GlobalChatDrawer;

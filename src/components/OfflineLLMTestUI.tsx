/**
 * Offline LLM Test UI
 * 
 * A simple test interface for offline LLM models, similar to the
 * llama-3.2-webgpu reference implementation. No system prompts.
 */

import React, { useState, useEffect, useRef } from "react";
import { FaTimes, FaStop, FaArrowRight } from "react-icons/fa";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getAvailableModels } from "../services/offlineModelService";

interface OfflineLLMTestUIProps {
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

const EXAMPLES = [
  "Give me some tips to improve my time management skills.",
  "What is the difference between AI and ML?",
  "Write python code to compute the nth fibonacci number.",
];

const OfflineLLMTestUI: React.FC<OfflineLLMTestUIProps> = ({ isOpen, onClose }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Model selection and loading
  const [selectedModelPath, setSelectedModelPath] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [progressItems, setProgressItems] = useState<Array<{
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }>>([]);
  const [error, setError] = useState<string | null>(null);

  // Chat state
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tps, setTps] = useState<number | null>(null);
  const [numTokens, setNumTokens] = useState<number | null>(null);
  const [actualDevice, setActualDevice] = useState<"cpu" | "cuda" | "metal" | null>(null);
  const [unlistenToken, setUnlistenToken] = useState<UnlistenFn | null>(null);
  const [unlistenStatus, setUnlistenStatus] = useState<UnlistenFn | null>(null);

  // Get available LLM models
  const availableModels = getAvailableModels().filter((m) => m.type === "llm");
  const downloadedLLMModels = availableModels.filter((m) => m.isDownloaded);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      if (unlistenToken) {
        unlistenToken();
      }
      if (unlistenStatus) {
        unlistenStatus();
      }
    };
  }, [unlistenToken, unlistenStatus]);

  // Auto-resize textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    const target = textareaRef.current;
    target.style.height = "auto";
    const newHeight = Math.min(Math.max(target.scrollHeight, 24), 200);
    target.style.height = `${newHeight}px`;
  }, [input]);

  // Auto-scroll chat
  useEffect(() => {
    if (!chatContainerRef.current || !isRunning) return;
    const element = chatContainerRef.current;
    const STICKY_SCROLL_THRESHOLD = 120;
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICKY_SCROLL_THRESHOLD
    ) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, isRunning]);

  // Load model
  const handleLoadModel = async () => {
    if (!selectedModelPath) {
      setError("Please select a model first");
      return;
    }

    setError(null);
    setStatus("loading");
    setLoadingMessage("Loading model...");
    setProgressItems([]);

    try {
      // Set up status listener
      const statusUnlisten = await listen<{ status: string; message?: string; device?: string }>(
        "llm-status",
        (event) => {
          const { status, message, device } = event.payload;
          if (status === "loading" && message) {
            setLoadingMessage(message);
          } else if (status === "ready") {
            setStatus("ready");
            if (device) {
              setActualDevice(device as "cpu" | "cuda" | "metal");
            }
          } else if (status === "error" && message) {
            setError(message);
            setStatus("idle");
          }
        }
      );
      setUnlistenStatus(() => statusUnlisten);

      // Call Tauri command to load model
      await invoke("llm_load_model", {
        modelPath: selectedModelPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load model";
      setError(message);
      setStatus("idle");
    }
  };

  // Send message
  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isRunning || status !== "ready") return;

    // Add user message to state
    const updatedMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(updatedMessages);
    setInput("");
    setIsRunning(true);
    setTps(null);
    setNumTokens(null);

    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      // Set up token listener
      const tokenUnlisten = await listen<{ token: string; tps?: number; numTokens?: number }>(
        "llm-token",
        (event) => {
          const payload = event.payload;
          const token = typeof payload === "string" ? payload : payload.token;
          const tps = typeof payload === "object" ? payload.tps : undefined;
          const numTokens = typeof payload === "object" ? payload.numTokens : undefined;
          
          setTps(tps || null);
          setNumTokens(numTokens || null);
          setMessages((prev) => {
            const cloned = [...prev];
            const last = cloned[cloned.length - 1];
            if (last && last.role === "assistant") {
              cloned[cloned.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return cloned;
          });
        }
      );
      setUnlistenToken(() => tokenUnlisten);

      // Prepare messages for the backend
      const chatMessages = updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Call Tauri command to generate
      try {
        await invoke("llm_generate", {
          prompt: message,
          messages: chatMessages,
        });
      } catch (genErr) {
        const errorMsg = genErr instanceof Error ? genErr.message : String(genErr);
        // Check if it's a tokenizer error
        if (errorMsg.includes("tokenizer") || errorMsg.includes("Tokenizer")) {
          throw new Error(`Tokenizer error: ${errorMsg}. Please ensure tokenizer.json is downloaded and valid. You may need to re-download the model.`);
        }
        throw genErr;
      }

      setIsRunning(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      console.error("Generation error:", err);
      setError(message);
      setIsRunning(false);
      setMessages((prev) => {
        const cloned = [...prev];
        if (cloned[cloned.length - 1]?.role === "assistant") {
          cloned[cloned.length - 1] = {
            ...cloned[cloned.length - 1],
            content: cloned[cloned.length - 1].content || `Error: ${message}`,
          };
        }
        return cloned;
      });
    }
  };

  // Interrupt generation
  const handleInterrupt = async () => {
    try {
      await invoke("llm_interrupt");
    } catch (err) {
      console.error("Failed to interrupt:", err);
    }
  };

  // Reset conversation
  const handleReset = async () => {
    try {
      await invoke("llm_reset");
      setMessages([]);
      setTps(null);
      setNumTokens(null);
    } catch (err) {
      console.error("Failed to reset:", err);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (input.length > 0 && !isRunning && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: "var(--app-bg-color)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
          width: "90%",
          maxWidth: "800px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--spacing-4)",
            borderBottom: "1px solid var(--app-border-color)",
            backgroundColor: "var(--app-header-bg)",
          }}
        >
          <h2 style={{ margin: 0 }}>Offline LLM Test</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "var(--spacing-2)",
              color: "var(--app-text-color)",
            }}
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        {status === null && messages.length === 0 ? (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--spacing-6)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ maxWidth: "600px", textAlign: "center" }}>
              <h3 style={{ marginBottom: "var(--spacing-4)" }}>
                Offline LLM Test Interface
              </h3>
              <p style={{ marginBottom: "var(--spacing-4)", color: "var(--app-text-color-secondary)" }}>
                Select a downloaded model to test. This interface has no system prompts - just
                direct user/assistant conversation.
              </p>
              
              {/* Device Status */}
              <div
                style={{
                  padding: "var(--spacing-3)",
                  borderRadius: "8px",
                  marginBottom: "var(--spacing-4)",
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  color: "var(--success)",
                  fontSize: "0.9em",
                }}
              >
                Models will run on native GPU (CUDA/Metal) or CPU for optimal performance
              </div>

              {/* Model Selection */}
              <div style={{ marginBottom: "var(--spacing-4)" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "var(--spacing-2)",
                    fontWeight: 600,
                  }}
                >
                  Select Model:
                </label>
                <select
                  value={selectedModelPath}
                  onChange={(e) => setSelectedModelPath(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-2)",
                    borderRadius: "6px",
                    border: "1px solid var(--app-border-color)",
                    backgroundColor: "var(--app-bg-color)",
                    color: "var(--app-text-color)",
                  }}
                >
                  <option value="">-- Select a model --</option>
                  {downloadedLLMModels.map((model) => (
                    <option key={model.id} value={model.modelPath}>
                      {model.name} ({model.size})
                    </option>
                  ))}
                </select>
                {downloadedLLMModels.length === 0 && (
                  <p style={{ marginTop: "var(--spacing-2)", fontSize: "0.9em", color: "var(--warning)" }}>
                    No LLM models downloaded. Please download a model first from Settings.
                  </p>
                )}
              </div>

              {error && (
                <div
                  style={{
                    padding: "var(--spacing-3)",
                    backgroundColor: "rgba(220, 38, 38, 0.1)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "8px",
                    marginBottom: "var(--spacing-4)",
                    color: "#ef4444",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={handleLoadModel}
                disabled={!selectedModelPath || status === "loading"}
                style={{
                  padding: "var(--spacing-3) var(--spacing-6)",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    selectedModelPath && status !== "loading"
                      ? "var(--app-primary-color)"
                      : "var(--app-border-color)",
                  color: "white",
                  cursor:
                    selectedModelPath && status !== "loading" ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {status === "loading" ? "Loading..." : "Load Model"}
              </button>
            </div>
          </div>
        ) : status === "loading" ? (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--spacing-6)",
            }}
          >
            <p style={{ textAlign: "center", marginBottom: "var(--spacing-4)" }}>
              {loadingMessage}
            </p>
            {progressItems.map((item, i) => (
              <div key={i} style={{ marginBottom: "var(--spacing-2)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85em",
                    marginBottom: "4px",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  <span>{item.file || "Loading..."}</span>
                  {item.progress !== undefined && (
                    <span>{item.progress.toFixed(1)}%</span>
                  )}
                </div>
                {item.progress !== undefined && (
                  <div
                    style={{
                      height: "6px",
                      backgroundColor: "var(--app-bg-color)",
                      borderRadius: "3px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${item.progress}%`,
                        backgroundColor: "var(--app-primary-color)",
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : status === "ready" ? (
          <>
            {/* Chat Messages */}
            <div
              ref={chatContainerRef}
              style={{
                flex: 1,
                overflow: "auto",
                padding: "var(--spacing-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-3)",
              }}
            >
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
                  {EXAMPLES.map((msg, i) => (
                    <div
                      key={i}
                      onClick={() => handleSendMessage(msg)}
                      style={{
                        padding: "var(--spacing-3)",
                        borderRadius: "8px",
                        border: "1px solid var(--app-border-color)",
                        backgroundColor: "var(--app-header-bg)",
                        cursor: "pointer",
                        transition: "background-color 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--app-bg-color)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--app-header-bg)";
                      }}
                    >
                      {msg}
                    </div>
                  ))}
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    backgroundColor:
                      msg.role === "user"
                        ? "var(--app-primary-color)"
                        : "var(--app-header-bg)",
                    color:
                      msg.role === "user"
                        ? "white"
                        : "var(--app-text-color)",
                  }}
                >
                  {msg.content}
                </div>
              ))}

              {/* Stats */}
              {tps !== null && messages.length > 0 && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "0.85em",
                    color: "var(--app-text-color-secondary)",
                    padding: "var(--spacing-2)",
                  }}
                >
                  {actualDevice && (
                    <span style={{ marginRight: "var(--spacing-2)" }}>
                      Running on: <strong>{actualDevice.toUpperCase()}</strong>
                      {" • "}
                    </span>
                  )}
                  {!isRunning && numTokens && tps && (
                    <span>
                      Generated {numTokens} tokens in {(numTokens / tps).toFixed(2)} seconds (
                    </span>
                  )}
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>
                    {tps.toFixed(2)}
                  </span>{" "}
                  tokens/second
                  {!isRunning && (
                    <>
                      {numTokens && tps && <span>)</span>}
                      {" • "}
                      <span
                        onClick={handleReset}
                        style={{
                          textDecoration: "underline",
                          cursor: "pointer",
                          color: "var(--app-primary-color)",
                        }}
                      >
                        Reset
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Input Area */}
            <div
              style={{
                borderTop: "1px solid var(--app-border-color)",
                padding: "var(--spacing-3)",
                display: "flex",
                alignItems: "flex-end",
                gap: "var(--spacing-2)",
              }}
            >
              <div
                style={{
                  flex: 1,
                  position: "relative",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "8px",
                  backgroundColor: "var(--app-header-bg)",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={status !== "ready" || isRunning}
                  style={{
                    width: "100%",
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    border: "none",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: "var(--app-text-color)",
                    resize: "none",
                    minHeight: "24px",
                    maxHeight: "200px",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                  }}
                />
                {isRunning ? (
                  <button
                    onClick={handleInterrupt}
                    style={{
                      position: "absolute",
                      right: "var(--spacing-2)",
                      bottom: "var(--spacing-2)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "var(--spacing-1)",
                      color: "var(--app-text-color)",
                    }}
                  >
                    <FaStop size={16} />
                  </button>
                ) : input.length > 0 ? (
                  <button
                    onClick={() => handleSendMessage(input)}
                    style={{
                      position: "absolute",
                      right: "var(--spacing-2)",
                      bottom: "var(--spacing-2)",
                      background: "var(--app-primary-color)",
                      border: "none",
                      cursor: "pointer",
                      padding: "var(--spacing-1)",
                      borderRadius: "4px",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <FaArrowRight size={16} />
                  </button>
                ) : null}
              </div>
            </div>

            <div
              style={{
                padding: "var(--spacing-2)",
                textAlign: "center",
                fontSize: "0.75em",
                color: "var(--app-text-color-secondary)",
                borderTop: "1px solid var(--app-border-color)",
              }}
            >
              Disclaimer: Generated content may be inaccurate or false.
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default OfflineLLMTestUI;

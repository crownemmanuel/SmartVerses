/**
 * Offline LLM Test UI
 * 
 * A simple test interface for offline LLM models, similar to the
 * llama-3.2-webgpu reference implementation. No system prompts.
 */

import React, { useState, useEffect, useRef } from "react";
import { FaTimes, FaStop, FaArrowRight } from "react-icons/fa";
import { offlineLLMService, OfflineLLMChatMessage } from "../services/offlineLLMService";
import { AVAILABLE_OFFLINE_MODELS } from "../types/smartVerses";
import { getDownloadedModelIds } from "../services/offlineModelService";

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
  const [selectedModelId, setSelectedModelId] = useState<string>("");
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
  const [hasWebGPU, setHasWebGPU] = useState<boolean | null>(null);
  const [actualDevice, setActualDevice] = useState<"webgpu" | "wasm" | null>(null);

  // Get available LLM models
  const availableModels = AVAILABLE_OFFLINE_MODELS.filter((m) => m.type === "llm");
  const downloadedModels = getDownloadedModelIds();
  const downloadedLLMModels = availableModels.filter((m) =>
    downloadedModels.includes(m.modelId)
  );

  // Check WebGPU support properly (async)
  useEffect(() => {
    const checkWebGPU = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as any;
        if (!nav.gpu) {
          setHasWebGPU(false);
          return;
        }
        const adapter = await nav.gpu.requestAdapter();
        setHasWebGPU(adapter !== null);
      } catch {
        setHasWebGPU(false);
      }
    };
    checkWebGPU();
  }, []);

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
    if (!selectedModelId) {
      setError("Please select a model first");
      return;
    }

    setError(null);
    setStatus("loading");
    setLoadingMessage("Loading model...");
    setProgressItems([]);

    try {
      await offlineLLMService.loadModel(selectedModelId, {
        onStatus: (status, data) => {
          if (status === "loading" && data) {
            setLoadingMessage(data);
          } else if (status === "ready") {
            setStatus("ready");
            // Worker sends device info in the ready message
            // Check if data contains device info or if we need to infer from hasWebGPU
            if (data && typeof data === "string") {
              if (data.toLowerCase().includes("webgpu")) {
                setActualDevice("webgpu");
              } else if (data.toLowerCase().includes("wasm")) {
                setActualDevice("wasm");
              } else {
                // Fallback: use hasWebGPU status
                setActualDevice(hasWebGPU ? "webgpu" : "wasm");
              }
            } else {
              // Fallback: use hasWebGPU status
              setActualDevice(hasWebGPU ? "webgpu" : "wasm");
            }
          } else if (status === "error" && data) {
            setError(data);
            setStatus("idle");
          } else if (status === "info" && data) {
            console.log("Info:", data);
            // Worker sends info message when WebGPU is not available
            if (data.toLowerCase().includes("wasm")) {
              setActualDevice("wasm");
            }
          }
        },
        onProgress: (data) => {
          if (data.file) {
            setProgressItems((prev) => {
              const existing = prev.find((item) => item.file === data.file);
              if (existing) {
                return prev.map((item) =>
                  item.file === data.file ? { ...item, ...data } : item
                );
              }
              return [...prev, { file: data.file, ...data }];
            });
          }
        },
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
      // Pass full conversation history (excluding the empty assistant message we just added)
      const chatMessages: OfflineLLMChatMessage[] = updatedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await offlineLLMService.generate(selectedModelId, chatMessages, {
        onToken: (token, stats) => {
          setTps(stats?.tps || null);
          setNumTokens(stats?.numTokens || null);
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
        },
        onStatus: (status) => {
          if (status === "start") {
            // Already added assistant message
          } else if (status === "complete") {
            setIsRunning(false);
          } else if (status === "error") {
            setIsRunning(false);
            setError("Generation failed");
          }
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
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
  const handleInterrupt = () => {
    offlineLLMService.interrupt();
  };

  // Reset conversation
  const handleReset = () => {
    offlineLLMService.reset();
    setMessages([]);
    setTps(null);
    setNumTokens(null);
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
              
              {/* WebGPU Status */}
              {hasWebGPU !== null && (
                <div
                  style={{
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    marginBottom: "var(--spacing-4)",
                    backgroundColor: hasWebGPU
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(251, 191, 36, 0.1)",
                    border: `1px solid ${
                      hasWebGPU
                        ? "rgba(34, 197, 94, 0.3)"
                        : "rgba(251, 191, 36, 0.3)"
                    }`,
                    color: hasWebGPU ? "var(--success)" : "var(--warning)",
                    fontSize: "0.9em",
                  }}
                >
                  {hasWebGPU ? (
                    "✓ WebGPU is available - models will run faster"
                  ) : (
                    "⚠ WebGPU is not available - models will use WASM fallback (slower)"
                  )}
                </div>
              )}

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
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
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
                    <option key={model.modelId} value={model.modelId}>
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
                disabled={!selectedModelId || status === "loading"}
                style={{
                  padding: "var(--spacing-3) var(--spacing-6)",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor:
                    selectedModelId && status !== "loading"
                      ? "var(--app-primary-color)"
                      : "var(--app-border-color)",
                  color: "white",
                  cursor:
                    selectedModelId && status !== "loading" ? "pointer" : "not-allowed",
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
                      {actualDevice === "wasm" && " (slower)"}
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

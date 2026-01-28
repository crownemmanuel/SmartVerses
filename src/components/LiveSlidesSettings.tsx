import React, { useEffect, useState } from "react";
import { FaDesktop, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import {
  loadLiveSlidesSettings,
  saveLiveSlidesSettings,
} from "../services/liveSlideService";
import {
  DEFAULT_LIVE_SLIDES_SETTINGS,
  LiveSlidesSettings as LiveSlidesSettingsType,
  LiveSlidesProPresenterActivationRule,
} from "../types/liveSlides";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterConnection } from "../types/propresenter";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import "../App.css";

const LiveSlidesSettings: React.FC = () => {
  const [settings, setSettings] = useState<LiveSlidesSettingsType>(
    DEFAULT_LIVE_SLIDES_SETTINGS
  );
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ProPresenter activation rules state
  const [proPresenterRules, setProPresenterRules] = useState<
    LiveSlidesProPresenterActivationRule[]
  >([]);
  const [isLoadingRuleId, setIsLoadingRuleId] = useState<string | null>(null);
  const [ruleErrors, setRuleErrors] = useState<Record<string, string | null>>(
    {}
  );
  const [ruleSuccess, setRuleSuccess] = useState<Record<string, boolean>>({});

  // ProPresenter connection selection
  const [enabledConnections, setEnabledConnections] = useState<
    ProPresenterConnection[]
  >([]);

  useEffect(() => {
    const loaded = loadLiveSlidesSettings();
    setSettings(loaded);
    setProPresenterRules(loaded.proPresenterActivationRules || []);
    setSettingsLoaded(true);

    const connections = getEnabledConnections();
    setEnabledConnections(connections);
  }, []);

  const createRuleId = () => {
    try {
      // Modern browsers
      return crypto.randomUUID();
    } catch {
      return `rule-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
  };

  const addRule = () => {
    const id = createRuleId();
    const defaultSource = enabledConnections[0]?.id;
    const newRule: LiveSlidesProPresenterActivationRule = {
      id,
      lineCount: 0,
      sourceConnectionId: defaultSource,
      activationClicks: 1,
      takeOffClicks: 0,
      clearTextFileOnTakeOff: true,
    };
    setProPresenterRules((prev) => [newRule, ...prev]);
    setRuleErrors((prev) => ({ ...prev, [id]: null }));
    setRuleSuccess((prev) => ({ ...prev, [id]: false }));
  };

  const removeRule = (id: string) => {
    setProPresenterRules((prev) => prev.filter((r) => r.id !== id));
    setRuleErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRuleSuccess((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateRule = (
    id: string,
    patch: Partial<LiveSlidesProPresenterActivationRule>
  ) => {
    setProPresenterRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  // Auto-save settings on change (debounced), after initial load.
  useDebouncedEffect(
    () => {
      try {
        if (settings.serverPort < 1024 || settings.serverPort > 65535) {
          throw new Error("Port must be between 1024 and 65535");
        }
        if (!settings.outputPath.trim()) {
          throw new Error("Output path is required");
        }
        if (!settings.outputFilePrefix.trim()) {
          throw new Error("Output file prefix is required");
        }

        saveLiveSlidesSettings({
          ...settings,
          // Prefer the rules-based config; keep legacy field unset going forward.
          proPresenterActivationRules: proPresenterRules,
          proPresenterActivation: undefined,
        });
        setSaveMessage({ text: "All changes saved", type: "success" });
        setTimeout(() => setSaveMessage({ text: "", type: "" }), 2000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save settings";
        setSaveMessage({ text: message, type: "error" });
      }
    },
    [
      settings,
      proPresenterRules,
      settingsLoaded,
    ],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );

  const handleChange = (
    field: keyof LiveSlidesSettingsType,
    value: string | number | boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGetSlideForRule = async (ruleId: string) => {
    setIsLoadingRuleId(ruleId);
    setRuleErrors((prev) => ({ ...prev, [ruleId]: null }));
    setRuleSuccess((prev) => ({ ...prev, [ruleId]: false }));

    if (enabledConnections.length === 0) {
      setRuleErrors((prev) => ({
        ...prev,
        [ruleId]:
        "No enabled ProPresenter connections found. Please enable at least one connection in Settings > ProPresenter."
      }));
      setIsLoadingRuleId(null);
      return;
    }

    const rule = proPresenterRules.find((r) => r.id === ruleId);
    const selectedId = rule?.sourceConnectionId;
    const connection =
      enabledConnections.find((c) => c.id === selectedId) ||
      enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        updateRule(ruleId, {
          presentationUuid:
            slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName:
            slideIndexData.presentation_index.presentation_id.name,
        });
        setRuleSuccess((prev) => ({ ...prev, [ruleId]: true }));
        setIsLoadingRuleId(null);
        return;
      }
      setRuleErrors((prev) => ({
        ...prev,
        [ruleId]:
        "No active presentation found. Make sure a slide is live in ProPresenter."
      }));
    } catch (err) {
      setRuleErrors((prev) => ({
        ...prev,
        [ruleId]: err instanceof Error ? err.message : "Failed to get slide index",
      }));
    }

    setIsLoadingRuleId(null);
  };

  const handleReset = () => {
    setSettings(DEFAULT_LIVE_SLIDES_SETTINGS);
    setProPresenterRules([]);
    setRuleErrors({});
    setRuleSuccess({});
  };

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Live Slides Settings</h2>

      {/* Live Slides Output Section */}
      <div
        style={{
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-4)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--spacing-3)",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Live Slides Output
        </h3>

        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Output Configuration
          </h4>
          <p
            style={{
              marginBottom: "var(--spacing-3)",
              fontSize: "0.9em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            Configure where live slide content will be written when a slide is
            made live.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-3)",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "var(--spacing-1)",
                  fontWeight: 500,
                }}
              >
                Output Path
              </label>
              <input
                type="text"
                value={settings.outputPath}
                onChange={(e) => handleChange("outputPath", e.target.value)}
                placeholder="~/Documents/ProAssist/Templates/live slides"
                style={{ width: "100%", padding: "var(--spacing-2)" }}
              />
              <p
                style={{
                  marginTop: "var(--spacing-1)",
                  fontSize: "0.85em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Directory where live slide files will be written
              </p>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "var(--spacing-1)",
                  fontWeight: 500,
                }}
              >
                Output File Prefix
              </label>
              <input
                type="text"
                value={settings.outputFilePrefix}
                onChange={(e) => handleChange("outputFilePrefix", e.target.value)}
                placeholder="live_slide_"
                style={{ width: "300px", padding: "var(--spacing-2)" }}
              />
              <p
                style={{
                  marginTop: "var(--spacing-1)",
                  fontSize: "0.85em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Prefix for output files (e.g., "live_slide_" → "live_slide_1.txt")
              </p>
            </div>
          </div>
        </div>

        {/* Example Output */}
        <div>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Example Output
          </h4>
          <div
            style={{
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-input-bg-color)",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "0.85em",
            }}
          >
            <div style={{ color: "var(--app-text-color-secondary)" }}>
              {settings.outputPath}
              {settings.outputFilePrefix}1.txt
            </div>
            <div style={{ color: "var(--app-text-color-secondary)" }}>
              {settings.outputPath}
              {settings.outputFilePrefix}2.txt
            </div>
            <div style={{ color: "var(--app-text-color-secondary)" }}>...</div>
          </div>
        </div>
      </div>

      {/* ProPresenter Activation */}
      <div style={{ marginBottom: "var(--spacing-5)" }}>
        <h3
          style={{
            marginBottom: "var(--spacing-3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <FaDesktop />
          ProPresenter Activation
        </h3>
        <p
          style={{
            marginBottom: "var(--spacing-3)",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Optionally trigger a ProPresenter presentation when a live slide goes
          live or is taken off. This is useful for showing overlays or animations
          when Live Slides are active.
        </p>

        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p
            style={{
              margin: "0 0 12px 0",
              color: "var(--app-text-color)",
              fontSize: "0.9em",
            }}
          >
            <strong>Instructions:</strong> Go to ProPresenter and put the slide
            you want to trigger live, then click "Get Slide".
          </p>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--app-text-color)" }}>
              Rules (by line count)
            </div>
            <button onClick={addRule} className="secondary">
              + Add Rule
            </button>
          </div>

          {proPresenterRules.length === 0 ? (
            <div
              style={{
                padding: "10px",
                backgroundColor: "var(--app-header-bg)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "6px",
                color: "var(--app-text-color-secondary)",
                fontSize: "0.9em",
              }}
            >
              No rules configured yet. Click “Add Rule”, pick a line count (1–6),
              then click “Get Slide”.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {proPresenterRules.map((rule) => {
                const err = ruleErrors[rule.id] || null;
                const ok = !!ruleSuccess[rule.id];
                const hasConfig =
                  !!rule.presentationUuid && typeof rule.slideIndex === "number";

                return (
                  <div
                    key={rule.id}
                    style={{
                      padding: "10px",
                      backgroundColor: "var(--app-header-bg)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "10px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 600, color: "var(--app-text-color)" }}>
                          Applies to:
                        </div>
                        <select
                          value={rule.lineCount}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              lineCount: Math.max(0, Math.min(6, parseInt(e.target.value, 10) || 0)),
                            })
                          }
                          style={{
                            padding: "6px 8px",
                            fontSize: "0.9em",
                            backgroundColor: "var(--app-input-bg-color)",
                            color: "var(--app-input-text-color)",
                            border: "1px solid var(--app-border-color)",
                            borderRadius: "6px",
                          }}
                        >
                          <option value={0}>Any (fallback)</option>
                          <option value={1}>1 line</option>
                          <option value={2}>2 lines</option>
                          <option value={3}>3 lines</option>
                          <option value={4}>4 lines</option>
                          <option value={5}>5 lines</option>
                          <option value={6}>6 lines</option>
                        </select>
                      </div>
                      <button onClick={() => removeRule(rule.id)} className="secondary">
                        <FaTimes style={{ marginRight: "6px" }} />
                        Remove
                      </button>
                    </div>

                    {err && (
                      <div
                        style={{
                          marginTop: "10px",
                          padding: "10px",
                          backgroundColor: "rgba(220, 38, 38, 0.1)",
                          border: "1px solid rgba(220, 38, 38, 0.3)",
                          borderRadius: "8px",
                          color: "#ef4444",
                          fontSize: "0.9em",
                        }}
                      >
                        {err}
                      </div>
                    )}

                    {ok && hasConfig && (
                      <div
                        style={{
                          marginTop: "10px",
                          padding: "10px",
                          backgroundColor: "rgba(34, 197, 94, 0.1)",
                          border: "1px solid rgba(34, 197, 94, 0.3)",
                          borderRadius: "8px",
                          color: "#22c55e",
                          fontSize: "0.9em",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <FaCheck />
                          <div>
                            <div style={{ fontWeight: 600 }}>Slide captured!</div>
                            <div style={{ fontSize: "0.85em", marginTop: "4px", opacity: 0.9 }}>
                              Presentation: {rule.presentationName || rule.presentationUuid}
                              <br />
                              Slide Index: {rule.slideIndex}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: "10px",
                        padding: "10px",
                        backgroundColor: "var(--app-input-bg-color)",
                        border: "1px solid var(--app-border-color)",
                        borderRadius: "8px",
                        fontSize: "0.9em",
                        color: "var(--app-text-color-secondary)",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--app-text-color)" }}>
                        Current Configuration:
                      </div>
                      {hasConfig ? (
                        <div>
                          Presentation: {rule.presentationName || rule.presentationUuid}
                          <br />
                          Slide Index: {rule.slideIndex}
                        </div>
                      ) : (
                        <div>No slide selected yet.</div>
                      )}
                    </div>

                    {/* Click Settings */}
                    <div
                      style={{
                        marginTop: "10px",
                        padding: "10px",
                        backgroundColor: "var(--app-input-bg-color)",
                        border: "1px solid var(--app-border-color)",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ fontSize: "0.85em", fontWeight: 600, marginBottom: "8px", color: "var(--app-text-color)" }}>
                        Animation Trigger Settings:
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px", color: "var(--app-text-color-secondary)" }}>
                            Go Live Clicks:
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={rule.activationClicks}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                activationClicks: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              fontSize: "0.85em",
                              backgroundColor: "var(--app-input-bg-color)",
                              color: "var(--app-input-text-color)",
                              border: "1px solid var(--app-border-color)",
                              borderRadius: "6px",
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.8em", display: "block", marginBottom: "4px", color: "var(--app-text-color-secondary)" }}>
                            Take Off Clicks:
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={rule.takeOffClicks}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                takeOffClicks: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              fontSize: "0.85em",
                              backgroundColor: "var(--app-input-bg-color)",
                              color: "var(--app-input-text-color)",
                              border: "1px solid var(--app-border-color)",
                              borderRadius: "6px",
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: "0.75em", color: "var(--app-text-color-secondary)", marginTop: "6px" }}>
                        Use multiple clicks to trigger ProPresenter animations. "Go Live Clicks" triggers when a live slide is set live. "Take Off Clicks" triggers when taking off the live slide.
                      </div>

                      <div style={{ marginTop: "var(--spacing-3)", paddingTop: "var(--spacing-3)", borderTop: "1px solid var(--app-border-color)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                          <input
                            type="checkbox"
                            id={`clearLiveSlidesTextOnTakeOff-${rule.id}`}
                            checked={rule.clearTextFileOnTakeOff !== false}
                            onChange={(e) =>
                              updateRule(rule.id, {
                                clearTextFileOnTakeOff: e.target.checked,
                              })
                            }
                            style={{ width: "auto", margin: 0 }}
                          />
                          <label
                            htmlFor={`clearLiveSlidesTextOnTakeOff-${rule.id}`}
                            style={{ margin: 0, cursor: "pointer", fontWeight: 500, fontSize: "0.9em" }}
                          >
                            Clear text files when taking off live
                          </label>
                        </div>
                        <div style={{ fontSize: "0.75em", color: "var(--app-text-color-secondary)", marginTop: "4px", marginLeft: "24px" }}>
                          If unchecked, the Live Slides output files will remain unchanged when taking off. Only the ProPresenter slide will be triggered.
                        </div>
                      </div>
                    </div>

                    {/* ProPresenter Connection Selector */}
                    {enabledConnections.length > 0 && (
                      <div style={{ marginTop: "10px" }}>
                        <label style={{ fontSize: "0.85em", display: "block", marginBottom: "6px", color: "var(--app-text-color-secondary)", fontWeight: 600 }}>
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
                              borderRadius: "6px",
                            }}
                          >
                            {enabledConnections[0].name} ({enabledConnections[0].apiUrl})
                          </div>
                        ) : (
                          <select
                            value={rule.sourceConnectionId || ""}
                            onChange={(e) => updateRule(rule.id, { sourceConnectionId: e.target.value })}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              fontSize: "0.9em",
                              backgroundColor: "var(--app-input-bg-color)",
                              color: "var(--app-input-text-color)",
                              border: "1px solid var(--app-border-color)",
                              borderRadius: "6px",
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

                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <button
                        onClick={() => handleGetSlideForRule(rule.id)}
                        disabled={isLoadingRuleId === rule.id || enabledConnections.length === 0}
                        className="secondary"
                        style={{ minWidth: "160px" }}
                      >
                        {isLoadingRuleId === rule.id ? (
                          <>
                            <FaSpinner style={{ animation: "spin 1s linear infinite", marginRight: "6px" }} />
                            Reading...
                          </>
                        ) : (
                          <>
                            <FaDesktop style={{ marginRight: "6px" }} />
                            Get Slide
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-2)",
        }}
      >
        <button onClick={handleReset} className="secondary">
          Reset to Defaults
        </button>
        {saveMessage.text && (
          <span
            style={{
              marginLeft: "var(--spacing-2)",
              color: saveMessage.type === "success" ? "#22c55e" : "#dc2626",
              fontSize: "0.9em",
            }}
          >
            {saveMessage.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default LiveSlidesSettings;

import React, { useState, useEffect } from "react";
import { FaDesktop, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import { FirebaseConfig, LiveTestimoniesSettings as LiveTestimoniesSettingsType, NameFormattingType, LiveTestimonyProPresenterConfig } from "../types/testimonies";
import {
  saveFirebaseConfig,
  loadLiveTestimoniesSettings,
  saveLiveTestimoniesSettings,
} from "../utils/testimoniesStorage";
import { formatNameForCopy } from "../utils/nameUtils";
import ImportFirebaseConfigModal from "./ImportFirebaseConfigModal";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
} from "../services/propresenterService";
import { ProPresenterConnection } from "../types/propresenter";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import "../App.css";

const LiveTestimoniesSettings: React.FC = () => {
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig | null>(
    null
  );
  const [outputPath, setOutputPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [nameFormattingType, setNameFormattingType] = useState<NameFormattingType>("default");
  const [customLogic, setCustomLogic] = useState("");
  const [testName, setTestName] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // ProPresenter activation state
  const [proPresenterConfig, setProPresenterConfig] = useState<LiveTestimonyProPresenterConfig | null>(null);
  const [isLoadingSlide, setIsLoadingSlide] = useState(false);
  const [slideLoadError, setSlideLoadError] = useState<string | null>(null);
  const [slideLoadSuccess, setSlideLoadSuccess] = useState(false);
  const [activationClicks, setActivationClicks] = useState<number>(1);
  const [takeOffClicks, setTakeOffClicks] = useState<number>(0);
  const [clearTextFileOnTakeOff, setClearTextFileOnTakeOff] = useState<boolean>(true);

  // ProPresenter connection selection
  const [enabledConnections, setEnabledConnections] = useState<ProPresenterConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  useEffect(() => {
    const settings = loadLiveTestimoniesSettings();
    setFirebaseConfig(settings.firebaseConfig);
    setOutputPath(settings.liveTestimonyOutputPath);
    setFileName(settings.liveTestimonyFileName);
    setNameFormattingType(settings.nameFormatting?.type || "default");
    setCustomLogic(settings.nameFormatting?.customLogic || "");
    if (settings.proPresenterActivation) {
      setProPresenterConfig(settings.proPresenterActivation);
      setActivationClicks(settings.proPresenterActivation.activationClicks ?? 1);
      setTakeOffClicks(settings.proPresenterActivation.takeOffClicks ?? 0);
      setClearTextFileOnTakeOff(settings.proPresenterActivation.clearTextFileOnTakeOff !== false); // Default to true
    }

    // Load ProPresenter connections
    const connections = getEnabledConnections();
    setEnabledConnections(connections);
    if (connections.length > 0) {
      setSelectedConnectionId(connections[0].id);
    }
    setSettingsLoaded(true);
  }, []);

  // Auto-save settings on change (debounced), after initial load.
  // We persist even partial values so users don't lose progress.
  useDebouncedEffect(
    () => {
      try {
        if (firebaseConfig) {
          saveFirebaseConfig(firebaseConfig);
        }

        const proPresenterActivation = proPresenterConfig
          ? {
              ...proPresenterConfig,
              activationClicks,
              takeOffClicks,
              clearTextFileOnTakeOff,
            }
          : undefined;

        const settingsToSave: LiveTestimoniesSettingsType = {
          firebaseConfig,
          liveTestimonyOutputPath: outputPath,
          liveTestimonyFileName: fileName,
          nameFormatting: {
            type: nameFormattingType,
            customLogic: nameFormattingType !== "default" ? customLogic : undefined,
          },
          proPresenterActivation,
        };

        saveLiveTestimoniesSettings(settingsToSave);
        setSaveMessage({ text: "All changes saved", type: "success" });
        setTimeout(() => setSaveMessage({ text: "", type: "" }), 2000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save settings";
        setSaveMessage({ text: message, type: "error" });
      }
    },
    [
      firebaseConfig,
      outputPath,
      fileName,
      nameFormattingType,
      customLogic,
      proPresenterConfig,
      activationClicks,
      takeOffClicks,
      clearTextFileOnTakeOff,
      settingsLoaded,
    ],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );
  
  const handleGetSlide = async () => {
    setIsLoadingSlide(true);
    setSlideLoadError(null);
    setSlideLoadSuccess(false);

    if (enabledConnections.length === 0) {
      setSlideLoadError("No enabled ProPresenter connections found. Please enable at least one connection in Settings > ProPresenter.");
      setIsLoadingSlide(false);
      return;
    }

    // Find the selected connection
    const connection = enabledConnections.find(c => c.id === selectedConnectionId) || enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        const config: LiveTestimonyProPresenterConfig = {
          presentationUuid: slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName: slideIndexData.presentation_index.presentation_id.name,
          activationClicks: activationClicks,
          takeOffClicks: takeOffClicks,
          clearTextFileOnTakeOff: clearTextFileOnTakeOff,
        };
        setProPresenterConfig(config);
        setSlideLoadSuccess(true);
        setIsLoadingSlide(false);
        return;
      } else {
        setSlideLoadError("No active presentation found. Make sure a slide is live in ProPresenter.");
      }
    } catch (err) {
      setSlideLoadError(err instanceof Error ? err.message : "Failed to get slide index");
    }

    setIsLoadingSlide(false);
  };

  const handleRemoveProPresenterConfig = () => {
    setProPresenterConfig(null);
    setSlideLoadSuccess(false);
    setSlideLoadError(null);
  };

  const handleFirebaseConfigChange = (
    field: keyof FirebaseConfig,
    value: string
  ) => {
    setFirebaseConfig((prev) => {
      if (!prev) {
        // Initialize with empty config
        return {
          apiKey: "",
          authDomain: "",
          databaseURL: "",
          projectId: "",
          storageBucket: "",
          messagingSenderId: "",
          appId: "",
          [field]: value,
        } as FirebaseConfig;
      }
      return { ...prev, [field]: value };
    });
  };

  const handleImportConfig = (config: FirebaseConfig) => {
    setFirebaseConfig(config);
    setSaveMessage({ text: "Firebase configuration imported successfully", type: "success" });
    setTimeout(() => setSaveMessage({ text: "", type: "" }), 3000);
  };

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Live Testimonies Settings</h2>

      {/* Link to web app */}
      <div
        style={{
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-3)",
          backgroundColor: "var(--app-input-bg-color)",
          borderRadius: "8px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        <p style={{ margin: "0 0 var(--spacing-2) 0", fontWeight: 500 }}>
          Web App Implementation
        </p>
        <p style={{ margin: "0 0 var(--spacing-2) 0", fontSize: "0.9em" }}>
          To implement the web app side of Live Testimonies, visit:
        </p>
        <a
          href="https://github.com/crownemmanuel/LiveTestimonies"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--app-primary-color)",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          https://github.com/crownemmanuel/LiveTestimonies
        </a>
      </div>

      {/* Firebase Configuration */}
      <div style={{ marginBottom: "var(--spacing-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-3)" }}>
          <h3 style={{ margin: 0 }}>Firebase Configuration</h3>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="secondary"
            style={{ whiteSpace: "nowrap" }}
          >
            Import Config
          </button>
        </div>
          <p style={{ marginBottom: "var(--spacing-3)", fontSize: "0.9em", color: "var(--app-text-color-secondary)" }}>
            Enter your Firebase Realtime Database configuration. You can find these values in your Firebase project settings.
            You can also import from environment variables or JavaScript config object.
          </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              API Key *
            </label>
            <input
              type="text"
              value={firebaseConfig?.apiKey || ""}
              onChange={(e) => handleFirebaseConfigChange("apiKey", e.target.value)}
              placeholder="AIza..."
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Auth Domain *
            </label>
            <input
              type="text"
              value={firebaseConfig?.authDomain || ""}
              onChange={(e) => handleFirebaseConfigChange("authDomain", e.target.value)}
              placeholder="your-project.firebaseapp.com"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Database URL *
            </label>
            <input
              type="text"
              value={firebaseConfig?.databaseURL || ""}
              onChange={(e) => handleFirebaseConfigChange("databaseURL", e.target.value)}
              placeholder="https://your-project-default-rtdb.firebaseio.com"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Project ID *
            </label>
            <input
              type="text"
              value={firebaseConfig?.projectId || ""}
              onChange={(e) => handleFirebaseConfigChange("projectId", e.target.value)}
              placeholder="your-project-id"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Storage Bucket *
            </label>
            <input
              type="text"
              value={firebaseConfig?.storageBucket || ""}
              onChange={(e) => handleFirebaseConfigChange("storageBucket", e.target.value)}
              placeholder="your-project.appspot.com"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Messaging Sender ID *
            </label>
            <input
              type="text"
              value={firebaseConfig?.messagingSenderId || ""}
              onChange={(e) => handleFirebaseConfigChange("messagingSenderId", e.target.value)}
              placeholder="123456789"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              App ID *
            </label>
            <input
              type="text"
              value={firebaseConfig?.appId || ""}
              onChange={(e) => handleFirebaseConfigChange("appId", e.target.value)}
              placeholder="1:123456789:web:abc123"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
          </div>
        </div>
      </div>

      {/* Output Configuration */}
      <div style={{ marginBottom: "var(--spacing-5)" }}>
        <h3 style={{ marginBottom: "var(--spacing-3)" }}>Live Testimony Output</h3>
        <p style={{ marginBottom: "var(--spacing-3)", fontSize: "0.9em", color: "var(--app-text-color-secondary)" }}>
          Configure where the live testimony name will be saved when you click the "Live" button.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Output Path *
            </label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="~/Documents/ProAssist/Templates"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
            <p style={{ marginTop: "var(--spacing-1)", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
              Directory where the live testimony file will be saved
            </p>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              File Name *
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="live_testimony.txt"
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            />
            <p style={{ marginTop: "var(--spacing-1)", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
              Name of the file that will contain the formatted testimony name
            </p>
          </div>
        </div>
      </div>

      {/* Name Formatting Configuration */}
      <div style={{ marginBottom: "var(--spacing-5)" }}>
        <h3 style={{ marginBottom: "var(--spacing-3)" }}>Name Formatting Logic</h3>
        <p style={{ marginBottom: "var(--spacing-3)", fontSize: "0.9em", color: "var(--text-secondary)" }}>
          Configure how names are formatted when copying or setting live. Default behavior formats names as "FirstName L." (e.g., "John D.") and removes common prefixes.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <div>
            <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
              Formatting Type
            </label>
            <select
              value={nameFormattingType}
              onChange={(e) => {
                setNameFormattingType(e.target.value as NameFormattingType);
                setTestResult(null);
              }}
              style={{ width: "100%", padding: "var(--spacing-2)" }}
            >
              <option value="default">Default (FirstName L.)</option>
              <option value="regex">Custom Regex Pattern</option>
              <option value="javascript">Custom JavaScript Function</option>
            </select>
          </div>

          {nameFormattingType !== "default" && (
            <div>
              <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontWeight: 500 }}>
                {nameFormattingType === "regex" ? "Regex Pattern" : "JavaScript Function"} *
              </label>
              {nameFormattingType === "regex" ? (
                <>
                  <input
                    type="text"
                    value={customLogic}
                    onChange={(e) => {
                      setCustomLogic(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder='e.g., "^([A-Z][a-z]+)\\s+([A-Z])"'
                    style={{ width: "100%", padding: "var(--spacing-2)", fontFamily: "monospace" }}
                  />
                  <p style={{ marginTop: "var(--spacing-1)", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
                    Enter a regex pattern. The first match will be used as the formatted name.
                  </p>
                </>
              ) : (
                <>
                  <textarea
                    value={customLogic}
                    onChange={(e) => {
                      setCustomLogic(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={`// Example: return name.split(' ')[0] + ' ' + name.split(' ')[name.split(' ').length - 1][0] + '.';\n// Function receives 'name' as parameter and should return a string\nreturn name.trim();`}
                    rows={8}
                    style={{
                      width: "100%",
                      padding: "var(--spacing-2)",
                      fontFamily: "monospace",
                      fontSize: "0.9em",
                    }}
                  />
                  <p style={{ marginTop: "var(--spacing-1)", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
                    Enter JavaScript code. The function receives <code>name</code> as a parameter and should return a formatted string.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Test Section */}
          <div
            style={{
              marginTop: "var(--spacing-2)",
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-input-bg-color)",
              borderRadius: "8px",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "var(--spacing-2)", fontSize: "1em" }}>
              Test Formatting
            </h4>
            <div style={{ display: "flex", gap: "var(--spacing-2)", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: "var(--spacing-1)", fontSize: "0.875rem" }}>
                  Test Name
                </label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => {
                    setTestName(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder='e.g., "Brother John Doe"'
                  style={{ width: "100%", padding: "var(--spacing-2)" }}
                />
              </div>
              <button
                onClick={() => {
                  if (!testName.trim()) {
                    setTestResult("Please enter a test name");
                    return;
                  }
                  if (nameFormattingType !== "default" && !customLogic.trim()) {
                    setTestResult("Please enter custom logic first");
                    return;
                  }
                  try {
                    const result = formatNameForCopy(testName, {
                      type: nameFormattingType,
                      customLogic: nameFormattingType !== "default" ? customLogic : undefined,
                    });
                    setTestResult(`Result: "${result}"`);
                  } catch (error) {
                    setTestResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
                  }
                }}
                className="secondary"
                style={{ whiteSpace: "nowrap" }}
              >
                Test
              </button>
            </div>
            {testResult && (
              <div
                style={{
                  marginTop: "var(--spacing-2)",
                  padding: "var(--spacing-2)",
                  backgroundColor: testResult.startsWith("Error")
                    ? "rgba(220, 38, 38, 0.1)"
                    : "rgba(34, 197, 94, 0.1)",
                  borderRadius: "4px",
                  fontSize: "0.9em",
                  color: testResult.startsWith("Error")
                    ? "rgb(220, 38, 38)"
                    : "rgb(34, 197, 94)",
                }}
              >
                {testResult}
              </div>
            )}
          </div>

          {/* Default Formatting Info */}
          {nameFormattingType === "default" && (
            <div
              style={{
                padding: "var(--spacing-3)",
                backgroundColor: "var(--app-input-bg-color)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <h4 style={{ marginTop: 0, marginBottom: "var(--spacing-2)", fontSize: "1em" }}>
                Default Formatting Behavior
              </h4>
              <ul style={{ margin: 0, paddingLeft: "var(--spacing-4)", fontSize: "0.9em" }}>
                <li>Removes common prefixes (Brother, Sister, Pastor, Dr., etc.)</li>
                <li>Formats as "FirstName L." (e.g., "John Doe" → "John D.")</li>
                <li>Capitalizes first letter of first name</li>
                <li>Uses last initial with period</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ProPresenter Activation */}
      <div style={{ marginBottom: "var(--spacing-5)" }}>
        <h3 style={{ marginBottom: "var(--spacing-3)", display: "flex", alignItems: "center", gap: "8px" }}>
          <FaDesktop />
          ProPresenter Activation
        </h3>
        <p style={{ marginBottom: "var(--spacing-3)", fontSize: "0.9em", color: "var(--app-text-color-secondary)" }}>
          Optionally trigger a ProPresenter presentation when a testimony goes live or when cleared.
          This is useful for showing a graphic overlay when testimonies are being given.
        </p>

        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p style={{ margin: "0 0 12px 0", color: "var(--app-text-color)", fontSize: "0.9em" }}>
            <strong>Instructions:</strong> Go to ProPresenter and put the slide you want to trigger live, then click "Get Slide".
          </p>

          {slideLoadError && (
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
              {slideLoadError}
            </div>
          )}

          {slideLoadSuccess && proPresenterConfig && (
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
                  <div style={{ fontWeight: 600 }}>Slide captured!</div>
                  <div style={{ fontSize: "0.85em", marginTop: "4px", opacity: 0.9 }}>
                    Presentation: {proPresenterConfig.presentationName || proPresenterConfig.presentationUuid}
                    <br />
                    Slide Index: {proPresenterConfig.slideIndex}
                  </div>
                </div>
              </div>
            </div>
          )}

          {proPresenterConfig && !slideLoadSuccess && (
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
                Presentation: {proPresenterConfig.presentationName || proPresenterConfig.presentationUuid}
                <br />
                Slide Index: {proPresenterConfig.slideIndex}
              </div>
            </div>
          )}

          {/* Click Settings */}
          {proPresenterConfig && (
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
                    Clear/Off Live Clicks:
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
                Use multiple clicks to trigger ProPresenter animations. "Go Live Clicks" triggers when a testimony is set live. "Clear/Off Live Clicks" triggers when clearing the live testimony.
              </div>
              
              {/* Clear Text File on Take Off Option */}
              <div style={{ marginTop: "var(--spacing-3)", paddingTop: "var(--spacing-3)", borderTop: "1px solid var(--app-border-color)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                  <input
                    type="checkbox"
                    id="clearTextFileOnTakeOff"
                    checked={clearTextFileOnTakeOff}
                    onChange={(e) => setClearTextFileOnTakeOff(e.target.checked)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  <label
                    htmlFor="clearTextFileOnTakeOff"
                    style={{ margin: 0, cursor: "pointer", fontWeight: 500, fontSize: "0.9em" }}
                  >
                    Clear text file when taking off live
                  </label>
                </div>
                <div style={{ fontSize: "0.75em", color: "var(--app-text-color-secondary)", marginTop: "4px", marginLeft: "24px" }}>
                  If unchecked, the text file will remain unchanged when clearing a live testimony. Only the ProPresenter slide will be triggered.
                </div>
              </div>
            </div>
          )}

          {/* ProPresenter Connection Selector */}
          {enabledConnections.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
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

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleGetSlide}
              disabled={isLoadingSlide || enabledConnections.length === 0}
              className="secondary"
              style={{ minWidth: "140px" }}
            >
              {isLoadingSlide ? (
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
            {proPresenterConfig && (
              <button onClick={handleRemoveProPresenterConfig} className="secondary">
                <FaTimes style={{ marginRight: "6px" }} />
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-save status */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
        {saveMessage.text && (
          <span
            style={{
              color:
                saveMessage.type === "success"
                  ? "#22c55e"
                  : "#dc2626",
              fontSize: "0.9em",
            }}
          >
            {saveMessage.text}
          </span>
        )}
      </div>

      {/* Import Firebase Config Modal */}
      <ImportFirebaseConfigModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportConfig}
      />
    </div>
  );
};

export default LiveTestimoniesSettings;

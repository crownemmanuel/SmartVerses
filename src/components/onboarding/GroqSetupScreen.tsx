/**
 * Screen 5: Groq Setup
 */

import React, { useState, useEffect } from "react";
import { FaCheck, FaTimes } from "react-icons/fa";
import { saveSmartVersesSettings, loadSmartVersesSettings } from "../../services/transcriptionService";
import { getAppSettings, saveAppSettings } from "../../utils/aiConfig";
import "./onboarding.css";

interface GroqSetupScreenProps {
  apiKey?: string;
  onApiKeyChange: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const GroqSetupScreen: React.FC<GroqSetupScreenProps> = ({
  apiKey,
  onApiKeyChange,
  onNext,
  onBack,
  onSkip,
}) => {
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [isExistingKey, setIsExistingKey] = useState(false);

  // Load existing key from settings on mount
  useEffect(() => {
    const settings = loadSmartVersesSettings();
    const existingKey = settings.groqApiKey || apiKey || "";
    if (existingKey) {
      setKey(existingKey);
      onApiKeyChange(existingKey);
      setIsExistingKey(true);
      setTestStatus("success");
      setTestMessage("Using saved API key from settings");
    }
  }, []);

  const handleKeyChange = (value: string) => {
    setKey(value);
    onApiKeyChange(value);
    setIsExistingKey(false);
    setTestStatus("idle");
    setTestMessage("");

    // Save immediately to settings
    const smartVersesSettings = loadSmartVersesSettings();
    smartVersesSettings.groqApiKey = value;
    saveSmartVersesSettings(smartVersesSettings);

    // Also save to AI config for paraphrasing
    const appSettings = getAppSettings();
    appSettings.groqConfig = { apiKey: value };
    saveAppSettings(appSettings);
  };

  const handleTestKey = async () => {
    if (!key) {
      setTestStatus("error");
      setTestMessage("Please enter an API key first");
      return;
    }

    setTesting(true);
    setTestStatus("idle");
    setTestMessage("");

    try {
      // Test by making a simple API call to Groq
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (response.ok) {
        setTestStatus("success");
        setTestMessage("API key verified successfully");
        
        // Save to both Groq transcription settings and AI config (for paraphrasing)
        const smartVersesSettings = loadSmartVersesSettings();
        smartVersesSettings.groqApiKey = key;
        smartVersesSettings.transcriptionEngine = "groq";
        saveSmartVersesSettings(smartVersesSettings);

        // Also save to AI config for paraphrasing
        const appSettings = getAppSettings();
        appSettings.groqConfig = { apiKey: key };
        saveAppSettings(appSettings);
      } else {
        throw new Error(`API returned status ${response.status}`);
      }
    } catch (err) {
      setTestStatus("error");
      const message = err instanceof Error ? err.message : String(err);
      setTestMessage(`Failed to verify API key: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = () => {
    if (key && testStatus !== "success") {
      const proceed = window.confirm(
        "You haven't tested your API key yet. Continue anyway?"
      );
      if (!proceed) return;
    }
    onNext();
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">
          <img
            src="/assets/onboarding/groq.jpg"
            alt="Groq"
            className="onboarding-title-icon"
          />
          Connect Groq
        </h1>
        <p className="onboarding-body">
          Groq can handle your transcription in the cloud and offers a generous
          free quota each day.
        </p>

        {/* Status Message for Existing Configuration */}
        {isExistingKey && (
          <div className="onboarding-message onboarding-message-success">
            <FaCheck style={{ marginRight: "8px" }} />
            Already configured! Using saved Groq API key from settings.
          </div>
        )}

        {/* API Key Input */}
        <div className="onboarding-form-field">
          <label className="onboarding-label" htmlFor="groq-key">
            Groq API Key
          </label>
          <div className="onboarding-input-group">
            <input
              id="groq-key"
              type="password"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="Enter your Groq API key"
              className="onboarding-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleTestKey}
              disabled={testing || !key}
              className="onboarding-button onboarding-button-secondary"
            >
              {testing ? (
                <>
                  <span className="onboarding-spinner"></span>
                  Testing...
                </>
              ) : (
                "Test API key"
              )}
            </button>
          </div>

          {/* Test Status */}
          {testStatus === "success" && !isExistingKey && (
            <div className="onboarding-message onboarding-message-success">
              <FaCheck style={{ marginRight: "8px" }} />
              {testMessage}
            </div>
          )}
          {testStatus === "error" && (
            <div className="onboarding-message onboarding-message-error">
              <FaTimes style={{ marginRight: "8px" }} />
              {testMessage}
            </div>
          )}
        </div>

        <p
          className="onboarding-body"
          style={{ marginTop: "0.75rem", fontSize: "0.95rem" }}
        >
          Get your free API key from{" "}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--onboarding-cyan-bright)" }}
          >
            console.groq.com/keys
          </a>
        </p>

        {/* Info Note */}
        <div className="onboarding-message onboarding-message-info">
          Groq provides a generous free quota for transcription and AI calls.
          Check your Groq console for current limits.
        </div>

        <div className="onboarding-buttons">
          <button
            onClick={handleNext}
            disabled={!key}
            className="onboarding-button onboarding-button-primary"
          >
            Next
          </button>
          <button
            onClick={onBack}
            className="onboarding-button onboarding-button-secondary"
          >
            Back
          </button>
          <button
            onClick={onSkip}
            className="onboarding-button onboarding-button-tertiary"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroqSetupScreen;

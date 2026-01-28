/**
 * Screen 4: AssemblyAI Setup
 */

import React, { useState, useEffect } from "react";
import { FaCheck, FaTimes } from "react-icons/fa";
import { getAssemblyAITemporaryToken } from "../../services/assemblyaiTokenService";
import { saveSmartVersesSettings, loadSmartVersesSettings } from "../../services/transcriptionService";
import "./onboarding.css";

interface AssemblyAISetupScreenProps {
  apiKey?: string;
  onApiKeyChange: (key: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const AssemblyAISetupScreen: React.FC<AssemblyAISetupScreenProps> = ({
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
    const existingKey = settings.assemblyAIApiKey || apiKey || "";
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
    const settings = loadSmartVersesSettings();
    settings.assemblyAIApiKey = value;
    saveSmartVersesSettings(settings);
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
      await getAssemblyAITemporaryToken(key, 60);
      setTestStatus("success");
      setTestMessage("API key verified successfully");
      
      // Save to settings
      const settings = loadSmartVersesSettings();
      settings.assemblyAIApiKey = key;
      settings.transcriptionEngine = "assemblyai";
      saveSmartVersesSettings(settings);
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
      // If they have a key but haven't tested it, show a warning
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
            src="/assets/onboarding/assemblyai.jpg"
            alt="AssemblyAI"
            className="onboarding-title-icon"
          />
          Connect AssemblyAI
        </h1>
        <p className="onboarding-body">
          Enter your AssemblyAI API key so Smart Verses can transcribe your
          services in the cloud.
        </p>

        {/* Status Message for Existing Configuration */}
        {isExistingKey && (
          <div className="onboarding-message onboarding-message-success">
            <FaCheck style={{ marginRight: "8px" }} />
            Already configured! Using saved AssemblyAI API key from settings.
          </div>
        )}

        {/* API Key Input */}
        <div className="onboarding-form-field">
          <label className="onboarding-label" htmlFor="assemblyai-key">
            AssemblyAI API Key
          </label>
          <div className="onboarding-input-group">
            <input
              id="assemblyai-key"
              type="password"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="Enter your AssemblyAI API key"
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
          Get your API key at{" "}
          <a
            href="https://www.assemblyai.com/dashboard/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--onboarding-cyan-bright)" }}
          >
            assemblyai.com/dashboard/api-keys
          </a>
        </p>

        {/* Important Note */}
        <div className="onboarding-message onboarding-message-info">
          <strong>Important:</strong> To use AssemblyAI, you must add credits to
          your AssemblyAI account. Without credits, transcription requests will
          not work.
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

export default AssemblyAISetupScreen;

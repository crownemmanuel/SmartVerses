/**
 * Screen 7: Paraphrasing LLM Setup
 */

import React, { useState, useEffect } from "react";
import { FaCloud, FaLaptop, FaCheck } from "react-icons/fa";
import { getAppSettings, saveAppSettings } from "../../utils/aiConfig";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import "./onboarding.css";

interface ParaphrasingSetupScreenProps {
  provider?: "groq" | "offline";
  onProviderChange: (provider?: "groq" | "offline") => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type TabType = "cloud" | "offline";

const ParaphrasingSetupScreen: React.FC<ParaphrasingSetupScreenProps> = ({
  provider,
  onProviderChange,
  onNext,
  onBack,
  onSkip,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return provider === "offline" ? "offline" : "cloud";
  });
  const [groqKey, setGroqKey] = useState("");

  useEffect(() => {
    const appSettings = getAppSettings();
    setGroqKey(appSettings.groqConfig?.apiKey || "");
    
    if (!provider && appSettings.groqConfig?.apiKey) {
      onProviderChange("groq");
    }
  }, [provider, onProviderChange]);

  useEffect(() => {
    if (provider) {
      setActiveTab(provider === "offline" ? "offline" : "cloud");
    }
  }, [provider]);

  const handleProviderSelect = (selectedProvider: "groq" | "offline") => {
    onProviderChange(selectedProvider);

    // Save to settings
    const settings = loadSmartVersesSettings();
    settings.bibleSearchProvider = selectedProvider;
    settings.paraphraseDetectionMode =
      selectedProvider === "offline" ? "offline" : "ai";
    if (selectedProvider === "offline") {
      settings.enableKeyPointExtraction = false;
    }
    saveSmartVersesSettings(settings);
  };

  const handleGroqKeyChange = (value: string) => {
    setGroqKey(value);

    const appSettings = getAppSettings();
    appSettings.groqConfig = { apiKey: value };
    saveAppSettings(appSettings);

    const settings = loadSmartVersesSettings();
    settings.groqApiKey = value;
    saveSmartVersesSettings(settings);

    if (value && !provider) {
      onProviderChange("groq");
    }
  };

  const showApiKeyInput = provider === "groq" || (activeTab === "cloud" && !provider);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">Choose Paraphrase Detection Provider</h1>
        <p className="onboarding-subtitle">
          Select how Smart Verses will detect paraphrased Bible verses.
        </p>

        {/* Icon tabs */}
        <div className="onboarding-tabs">
          <div
            className={`onboarding-tab ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("cloud");
              onProviderChange("groq");
            }}
          >
            <FaCloud className="onboarding-tab-icon" />
            <span className="onboarding-tab-label">Cloud</span>
          </div>
          <div
            className={`onboarding-tab ${activeTab === "offline" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("offline");
              onProviderChange("offline");
            }}
          >
            <FaLaptop className="onboarding-tab-icon" />
            <span className="onboarding-tab-label">Offline</span>
          </div>
        </div>

        {/* Provider cards based on active tab */}
        <div className="onboarding-cards">
          {activeTab === "cloud" && (
            <div
              className={`onboarding-card ${
                provider === "groq" ? "selected" : ""
              }`}
              onClick={() => handleProviderSelect("groq")}
            >
              <img
                src="/assets/onboarding/groq.jpg"
                alt="Groq"
                className="onboarding-card-icon"
              />
              <h3 className="onboarding-card-title">
                Groq
                <span className="onboarding-card-tag">Free · Most accurate · Recommended</span>
                {provider === "groq" && (
                  <FaCheck
                    style={{ marginLeft: "8px", color: "#22c55e" }}
                  />
                )}
              </h3>
              <p className="onboarding-card-text">
                Free, most accurate option with ultra-fast responses. Includes a generous free tier.
              </p>
            </div>
          )}

          {activeTab === "offline" && (
            <div
              className={`onboarding-card ${
                provider === "offline" ? "selected" : ""
              }`}
              onClick={() => handleProviderSelect("offline")}
            >
              <FaLaptop
                style={{
                  width: "48px",
                  height: "48px",
                  color: "var(--onboarding-text-secondary)",
                  marginBottom: "12px",
                }}
              />
              <h3 className="onboarding-card-title">
                Offline Search
                <span className="onboarding-card-tag">Experimental</span>
                {provider === "offline" && (
                  <FaCheck
                    style={{ marginLeft: "8px", color: "#22c55e" }}
                  />
                )}
              </h3>
              <p className="onboarding-card-text">
                Offline Search (Experimental) runs locally. Less accurate - we recommend the free Groq option.
              </p>
            </div>
          )}
        </div>

        {/* API Key input - only show for Groq */}
        {showApiKeyInput && (
          <div className="onboarding-form-field" style={{ marginTop: "1.25rem" }}>
            <label className="onboarding-label" htmlFor="groq-api-key">
              Groq API Key (free)
            </label>
            <div className="onboarding-input-group">
              <input
                id="groq-api-key"
                type="password"
                value={groqKey}
                onChange={(e) => handleGroqKeyChange(e.target.value)}
                placeholder="Enter your Groq API key"
                className="onboarding-input"
                style={{ flex: 1 }}
              />
            </div>
            <p
              className="onboarding-body"
              style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}
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
          </div>
        )}

        <p className="onboarding-help-text">
          API keys are configured in Settings → AI Configuration. You can set
          these up later if needed.
        </p>

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
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

export default ParaphrasingSetupScreen;

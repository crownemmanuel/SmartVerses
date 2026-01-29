/**
 * Screen 3: Transcription Provider Selection
 */

import React, { useEffect, useState } from "react";
import { FaCloud, FaCoins, FaLaptop, FaCheck } from "react-icons/fa";
import "./onboarding.css";

interface TranscriptionProviderScreenProps {
  selectedProvider?:
    | "assemblyai"
    | "groq"
    | "offline-whisper"
    | "offline-whisper-native"
    | "offline-moonshine";
  onSelectProvider: (
    provider:
      | "assemblyai"
      | "groq"
      | "offline-whisper"
      | "offline-whisper-native"
      | "offline-moonshine"
  ) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type TabType = "cloud" | "free" | "offline";

const TranscriptionProviderScreen: React.FC<
  TranscriptionProviderScreenProps
> = ({ selectedProvider, onSelectProvider, onNext, onBack, onSkip }) => {
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const resolveTabForProvider = (
    provider?:
      | "assemblyai"
      | "groq"
      | "offline-whisper"
      | "offline-whisper-native"
      | "offline-moonshine"
  ): TabType => {
    if (
      provider === "offline-whisper" ||
      provider === "offline-whisper-native" ||
      provider === "offline-moonshine"
    ) {
      return "offline";
    }
    if (provider === "groq" || provider === "assemblyai") {
      return "cloud";
    }
    return "cloud";
  };

  const [activeTab, setActiveTab] = useState<TabType>(() =>
    resolveTabForProvider(selectedProvider)
  );

  useEffect(() => {
    if (!selectedProvider) return;
    setActiveTab(resolveTabForProvider(selectedProvider));
  }, [selectedProvider]);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">Choose Transcription Provider</h1>
        <p className="onboarding-subtitle">
          Select how Smart Verses will transcribe audio from your services.
        </p>

        {/* Icon tabs */}
        <div className="onboarding-tabs">
          <div
            className={`onboarding-tab ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => setActiveTab("cloud")}
          >
            <FaCloud className="onboarding-tab-icon" />
            <span className="onboarding-tab-label">Cloud</span>
          </div>
          <div
            className={`onboarding-tab ${activeTab === "free" ? "active" : ""}`}
            onClick={() => setActiveTab("free")}
          >
            <FaCoins className="onboarding-tab-icon" />
            <span className="onboarding-tab-label">Free</span>
          </div>
          <div
            className={`onboarding-tab ${activeTab === "offline" ? "active" : ""}`}
            onClick={() => setActiveTab("offline")}
          >
            <FaLaptop className="onboarding-tab-icon" />
            <span className="onboarding-tab-label">Offline</span>
          </div>
        </div>

        {/* Provider cards based on active tab */}
        <div className="onboarding-cards">
          {activeTab === "cloud" && (
            <>
              <div
                className={`onboarding-card ${
                  selectedProvider === "assemblyai" ? "selected" : ""
                }`}
                onClick={() => onSelectProvider("assemblyai")}
              >
                <img
                  src="/assets/onboarding/assemblyai.jpg"
                  alt="AssemblyAI"
                  className="onboarding-card-icon"
                />
                <h3 className="onboarding-card-title">
                  AssemblyAI
                  <span className="onboarding-card-tag">Most accurate · Recommended</span>
                  {selectedProvider === "assemblyai" && (
                    <FaCheck
                      style={{ marginLeft: "8px", color: "#22c55e" }}
                    />
                  )}
                </h3>
                <p className="onboarding-card-text">
                  Cloud transcription powered by AssemblyAI.
                </p>
              </div>
              <div
                className={`onboarding-card ${
                  selectedProvider === "groq" ? "selected" : ""
                }`}
                onClick={() => onSelectProvider("groq")}
              >
                <img
                  src="/assets/onboarding/groq.jpg"
                  alt="Groq"
                  className="onboarding-card-icon"
                />
                <h3 className="onboarding-card-title">
                  Groq
                  {selectedProvider === "groq" && (
                    <FaCheck
                      style={{ marginLeft: "8px", color: "#22c55e" }}
                    />
                  )}
                </h3>
                <p className="onboarding-card-text">
                  Fast cloud transcription with generous free tier.
                </p>
              </div>
            </>
          )}

          {activeTab === "free" && (
            <>
              <div
                className={`onboarding-card ${
                  selectedProvider === "groq" ? "selected" : ""
                }`}
                onClick={() => onSelectProvider("groq")}
              >
                <img
                  src="/assets/onboarding/groq.jpg"
                  alt="Groq"
                  className="onboarding-card-icon"
                />
                <h3 className="onboarding-card-title">
                  Groq
                  {selectedProvider === "groq" && (
                    <FaCheck
                      style={{ marginLeft: "8px", color: "#22c55e" }}
                    />
                  )}
                </h3>
                <p className="onboarding-card-text">
                  Fast cloud transcription with a generous free tier.
                </p>
              </div>
              {isMac && (
                <div
                  className={`onboarding-card ${
                    selectedProvider === "offline-whisper-native" ? "selected" : ""
                  }`}
                  onClick={() => onSelectProvider("offline-whisper-native")}
                >
                  <img
                    src="/assets/onboarding/whisper.jpg"
                    alt="Whisper Native"
                    className="onboarding-card-icon"
                  />
                  <h3 className="onboarding-card-title">
                    Whisper Native (Mac)
                    <span className="onboarding-card-tag">Fast · Metal GPU</span>
                    {selectedProvider === "offline-whisper-native" && (
                      <FaCheck
                        style={{ marginLeft: "8px", color: "#22c55e" }}
                      />
                    )}
                  </h3>
                  <p className="onboarding-card-text">
                    Native Whisper running on Apple Silicon with Metal acceleration.
                  </p>
                </div>
              )}
              {!isMac && (
                <div
                  className={`onboarding-card ${
                    selectedProvider === "offline-whisper" ? "selected" : ""
                  }`}
                  onClick={() => onSelectProvider("offline-whisper")}
                >
                  <img
                    src="/assets/onboarding/whisper.jpg"
                    alt="Whisper"
                    className="onboarding-card-icon"
                  />
                  <h3 className="onboarding-card-title">
                    Whisper (Web)
                    {selectedProvider === "offline-whisper" && (
                      <FaCheck
                        style={{ marginLeft: "8px", color: "#22c55e" }}
                      />
                    )}
                  </h3>
                  <p className="onboarding-card-text">
                    Free offline transcription using Whisper models. Runs locally on your device.
                  </p>
                </div>
              )}
              <div
                className={`onboarding-card ${
                  selectedProvider === "offline-moonshine" ? "selected" : ""
                }`}
                onClick={() => onSelectProvider("offline-moonshine")}
              >
                <img
                  src="/assets/onboarding/moonshine.jpg"
                  alt="Moonshine"
                  className="onboarding-card-icon"
                />
                <h3 className="onboarding-card-title">
                  Moonshine
                  {selectedProvider === "offline-moonshine" && (
                    <FaCheck
                      style={{ marginLeft: "8px", color: "#22c55e" }}
                    />
                  )}
                </h3>
                <p className="onboarding-card-text">
                  Free offline transcription using Moonshine models. Optimized for real-time use.
                </p>
              </div>
            </>
          )}

          {activeTab === "offline" && (
            <>
              {isMac && (
                <div
                  className={`onboarding-card ${
                    selectedProvider === "offline-whisper-native" ? "selected" : ""
                  }`}
                  onClick={() => onSelectProvider("offline-whisper-native")}
                >
                  <img
                    src="/assets/onboarding/whisper.jpg"
                    alt="Whisper Native"
                    className="onboarding-card-icon"
                  />
                  <h3 className="onboarding-card-title">
                    Whisper Native (Mac)
                    <span className="onboarding-card-tag">Fast · Metal GPU</span>
                    {selectedProvider === "offline-whisper-native" && (
                      <FaCheck
                        style={{ marginLeft: "8px", color: "#22c55e" }}
                      />
                    )}
                  </h3>
                  <p className="onboarding-card-text">
                    Native Whisper on Apple Silicon with Metal acceleration.
                  </p>
                </div>
              )}
              {!isMac && (
                <div
                  className={`onboarding-card ${
                    selectedProvider === "offline-whisper" ? "selected" : ""
                  }`}
                  onClick={() => onSelectProvider("offline-whisper")}
                >
                  <img
                    src="/assets/onboarding/whisper.jpg"
                    alt="Whisper"
                    className="onboarding-card-icon"
                  />
                  <h3 className="onboarding-card-title">
                    Whisper (Web)
                    <span className="onboarding-card-tag">Recommended</span>
                    {selectedProvider === "offline-whisper" && (
                      <FaCheck
                        style={{ marginLeft: "8px", color: "#22c55e" }}
                      />
                    )}
                  </h3>
                  <p className="onboarding-card-text">
                    Local transcription using OpenAI Whisper models. No internet required after download.
                  </p>
                </div>
              )}
              <div
                className={`onboarding-card ${
                  selectedProvider === "offline-moonshine" ? "selected" : ""
                }`}
                onClick={() => onSelectProvider("offline-moonshine")}
              >
                <img
                  src="/assets/onboarding/moonshine.jpg"
                  alt="Moonshine"
                  className="onboarding-card-icon"
                />
                <h3 className="onboarding-card-title">
                  Moonshine
                  {selectedProvider === "offline-moonshine" && (
                    <FaCheck
                      style={{ marginLeft: "8px", color: "#22c55e" }}
                    />
                  )}
                </h3>
                <p className="onboarding-card-text">
                  Local transcription optimized for real-time performance. No internet required.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
            disabled={!selectedProvider}
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

export default TranscriptionProviderScreen;

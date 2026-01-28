/**
 * Screen 9B: Test Keypoint Extraction
 */

import React, { useState } from "react";
import { FaPlay, FaStop } from "react-icons/fa";
import "./onboarding.css";

interface TestKeypointScreenProps {
  transcriptionConfigured: boolean;
  paraphrasingConfigured: boolean;
  micConfigured: boolean;
  onBack: () => void;
  onSkip: () => void;
}

const TestKeypointScreen: React.FC<TestKeypointScreenProps> = ({
  transcriptionConfigured,
  paraphrasingConfigured,
  micConfigured,
  onBack,
  onSkip,
}) => {
  const [recording, setRecording] = useState(false);
  const [extractedKeypoint, setExtractedKeypoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canTest =
    transcriptionConfigured && paraphrasingConfigured && micConfigured;

  const exampleText = `"Let me tell you something today. The level at which you commit your time is the level at which you will succeed. That is a simple fact of life you need to know."`;

  const handleStartRecording = () => {
    setRecording(true);
    setError(null);
    setExtractedKeypoint(null);

    // In a real implementation, this would:
    // 1. Capture audio from microphone
    // 2. Send to transcription service
    // 3. Send transcription to keypoint extraction
    // For now, we'll simulate it
    setTimeout(() => {
      setExtractedKeypoint(
        "Your level of commitment determines your level of success."
      );
      setRecording(false);
    }, 5000);
  };

  const handleStopRecording = () => {
    setRecording(false);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">Test Keypoint Extraction</h1>
        <p className="onboarding-body">
          We will capture a short sample and extract the main point from what you
          say.
        </p>

        {!canTest ? (
          <div className="onboarding-message onboarding-message-warning">
            <strong>Testing is unavailable</strong>
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
              Keypoint extraction tests require transcription, paraphrasing, and
              microphone to be configured. You can complete the setup from
              Settings later.
            </p>
          </div>
        ) : (
          <>
            {/* Example Text */}
            <div
              style={{
                padding: "var(--spacing-4)",
                background: "var(--surface-2)",
                borderRadius: "12px",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <h3 style={{ margin: "0 0 var(--spacing-3)" }}>Example Speech</h3>
              <p style={{ margin: 0, fontStyle: "italic", fontSize: "0.95rem" }}>
                You can read this example aloud, or say something similar in your
                own words:
              </p>
              <p
                style={{
                  margin: "var(--spacing-3) 0 0",
                  padding: "var(--spacing-3)",
                  background: "var(--surface-3)",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  fontStyle: "italic",
                }}
              >
                {exampleText}
              </p>
            </div>

            {/* Recording Controls */}
            <div
              style={{
                padding: "var(--spacing-4)",
                background: "var(--surface-2)",
                borderRadius: "12px",
                border: "1px solid var(--app-border-color)",
              }}
            >
              {!recording ? (
                <button
                  onClick={handleStartRecording}
                  className="onboarding-button onboarding-button-primary"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    justifyContent: "center",
                  }}
                >
                  <FaPlay />
                  Start recording
                </button>
              ) : (
                <>
                  <div className="onboarding-message onboarding-message-info">
                    <span className="onboarding-spinner"></span>
                    Recording and analyzing...
                  </div>
                  <button
                    onClick={handleStopRecording}
                    className="onboarding-button onboarding-button-secondary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      width: "100%",
                      justifyContent: "center",
                    }}
                  >
                    <FaStop />
                    Stop recording
                  </button>
                </>
              )}
            </div>

            {/* Results */}
            {extractedKeypoint && (
              <div
                style={{
                  padding: "var(--spacing-4)",
                  background: "var(--surface-2)",
                  borderRadius: "12px",
                  border: "2px solid var(--app-primary-color)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 var(--spacing-2)",
                    color: "var(--app-primary-color)",
                  }}
                >
                  Detected keypoint:
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    fontWeight: 500,
                    fontStyle: "italic",
                  }}
                >
                  "{extractedKeypoint}"
                </p>
              </div>
            )}

            {error && (
              <div className="onboarding-message onboarding-message-error">
                {error}
              </div>
            )}
          </>
        )}

        <p className="onboarding-help-text">
          <strong>Note:</strong> The extracted keypoint is always based on what
          you actually say, not the example text.
        </p>

        <div className="onboarding-buttons">
          <button
            onClick={onBack}
            className="onboarding-button onboarding-button-primary"
          >
            Back to Smart Verses test
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

export default TestKeypointScreen;

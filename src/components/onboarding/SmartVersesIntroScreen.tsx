/**
 * Screen 2: Meet Smart Verses
 */

import React from "react";
import SmartVersesDemo from "./SmartVersesDemo";
import "./onboarding.css";

interface SmartVersesIntroScreenProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const SmartVersesIntroScreen: React.FC<SmartVersesIntroScreenProps> = ({
  enabled,
  onToggle,
  onNext,
  onBack,
  onSkip,
}) => {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-split">
        {/* Visual side: Live Demo Animation */}
        <div className="onboarding-visual">
          <SmartVersesDemo />
        </div>

        {/* Content side */}
        <div className="onboarding-content">
          <h1 className="onboarding-title">Meet Smart Verses</h1>
          <p className="onboarding-body">
            Smart Verses listens to your sermon or service in real time. Using
            AI, it detects scriptures when they are mentioned or paraphrased and
            can display them live to the audience. It also extracts key points
            from the sermon that can be displayed live or shared on social media.
          </p>

          {/* Toggle */}
          <div
            className="onboarding-toggle"
            onClick={() => onToggle(!enabled)}
            style={{ cursor: "pointer" }}
          >
            <span className="onboarding-toggle-label">Enable Smart Verses</span>
            <div className={`toggle-switch ${enabled ? "active" : ""}`}></div>
          </div>

          <p
            className="onboarding-body"
            style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}
          >
            You can change this anytime from Settings.
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
    </div>
  );
};

export default SmartVersesIntroScreen;

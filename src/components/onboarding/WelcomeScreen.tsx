/**
 * Screen 1: Welcome to ProAssist
 */

import React from "react";
import "./onboarding.css";

interface WelcomeScreenProps {
  onNext: () => void;
  onSkip: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNext, onSkip }) => {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-split">
        {/* Left side: Logo and branding */}
        <div className="onboarding-visual">
          <div style={{ textAlign: "center" }}>
            <img
              src="/ProAssist.png"
              alt="ProAssist Logo"
              style={{ maxWidth: "300px", marginBottom: "var(--spacing-3)" }}
            />
            <p
              style={{
                fontSize: "1.2rem",
                color: "var(--app-text-color-secondary)",
                margin: 0,
              }}
            >
              pro-assist.app
            </p>
          </div>
        </div>

        {/* Right side: Welcome content */}
        <div className="onboarding-content">
          <h1 className="onboarding-title">Welcome to ProAssist</h1>
          <p className="onboarding-body">
            ProAssist brings AI and intelligent automation into your media
            workflow. It is designed to work natively with ProPresenter and can
            also run as a standalone tool.
          </p>

          <div className="onboarding-buttons">
            <button
              onClick={onNext}
              className="onboarding-button onboarding-button-primary"
            >
              Get started
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

export default WelcomeScreen;

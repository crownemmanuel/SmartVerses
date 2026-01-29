/**
 * Screen: Usage Mode Selection
 * Asks how the user wants to use SmartVerses (ProPresenter or Standalone)
 */

import React from "react";
import { FaDesktop, FaLaptop } from "react-icons/fa";
import "./onboarding.css";

interface UsageModeScreenProps {
  selectedMode?: "propresenter" | "standalone";
  onSelectMode: (mode: "propresenter" | "standalone") => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const UsageModeScreen: React.FC<UsageModeScreenProps> = ({
  selectedMode,
  onSelectMode,
  onNext,
  onBack,
  onSkip,
}) => {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">How would you like to use SmartVerses?</h1>
        <p className="onboarding-subtitle">
          Choose how SmartVerses will integrate with your workflow.
        </p>

        <div className="onboarding-cards" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div
            className={`onboarding-card ${selectedMode === "propresenter" ? "selected" : ""}`}
            onClick={() => onSelectMode("propresenter")}
            style={{ cursor: "pointer" }}
          >
            <FaDesktop
              style={{ fontSize: "3rem", color: "var(--onboarding-cyan-bright)", marginBottom: "1rem" }}
            />
            <h3 className="onboarding-card-title">Connect to ProPresenter</h3>
            <p className="onboarding-card-text">
              SmartVerses will automatically trigger slides on your ProPresenter and interact with your
              presentations.
            </p>
          </div>

          <div
            className={`onboarding-card ${selectedMode === "standalone" ? "selected" : ""}`}
            onClick={() => onSelectMode("standalone")}
            style={{ cursor: "pointer" }}
          >
            <FaLaptop
              style={{ fontSize: "3rem", color: "var(--onboarding-purple-light)", marginBottom: "1rem" }}
            />
            <h3 className="onboarding-card-title">Use as Standalone</h3>
            <p className="onboarding-card-text">
              Use SmartVerses independently without ProPresenter integration.
            </p>
          </div>
        </div>

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
            disabled={!selectedMode}
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

export default UsageModeScreen;

/**
 * Screen 12: SmartVerses Additional Features
 */

import React from "react";
import { FaClock, FaStickyNote, FaCircle, FaUser } from "react-icons/fa";
import { saveEnabledFeatures, loadEnabledFeatures } from "../../services/recorderService";
import "./onboarding.css";

interface AdditionalFeaturesScreenProps {
  smartTimersEnabled: boolean;
  smartSlidesEnabled: boolean;
  recorderEnabled: boolean;
  liveTestimoniesEnabled: boolean;
  onToggle: (feature: string, enabled: boolean) => void;
  onFinish: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const AdditionalFeaturesScreen: React.FC<AdditionalFeaturesScreenProps> = ({
  smartTimersEnabled,
  smartSlidesEnabled,
  recorderEnabled,
  liveTestimoniesEnabled,
  onToggle,
  onFinish,
  onBack,
  onSkip,
}) => {
  const handleToggle = (feature: string, enabled: boolean) => {
    onToggle(feature, enabled);

    // Save to enabled features
    const features = loadEnabledFeatures();
    switch (feature) {
      case "smartTimersEnabled":
        features.timer = enabled;
        break;
      case "smartSlidesEnabled":
        features.slides = enabled;
        break;
      case "recorderEnabled":
        features.recorder = enabled;
        break;
      case "liveTestimoniesEnabled":
        features.liveTestimonies = enabled;
        break;
    }
    saveEnabledFeatures(features);

    // Dispatch event to update UI
    window.dispatchEvent(
      new CustomEvent("features-updated", { detail: features })
    );
  };

  const handleFinishSetup = () => {
    // Save all features one final time
    const features = loadEnabledFeatures();
    features.timer = smartTimersEnabled;
    features.slides = smartSlidesEnabled;
    features.recorder = recorderEnabled;
    features.liveTestimonies = liveTestimoniesEnabled;
    saveEnabledFeatures(features);

    // Dispatch event
    window.dispatchEvent(
      new CustomEvent("features-updated", { detail: features })
    );

    onFinish();
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">More SmartVerses Tools</h1>
        <p className="onboarding-body">
          SmartVerses includes other tools to support your media workflow. Turn on
          any features you plan to use.
        </p>

        {/* Feature Cards with Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          {/* Smart Timers */}
          <div
            className="onboarding-toggle"
            onClick={() => handleToggle("smartTimersEnabled", !smartTimersEnabled)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaClock style={{ fontSize: "1.2rem" }} />
                <span
                  className="onboarding-toggle-label"
                  style={{ marginBottom: 0 }}
                >
                  Smart Timers
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Tools that help you manage service and segment countdowns
                intelligently.
              </p>
            </div>
            <div className={`toggle-switch ${smartTimersEnabled ? "active" : ""}`}></div>
          </div>

          {/* Smart Slides */}
          <div
            className="onboarding-toggle"
            onClick={() => handleToggle("smartSlidesEnabled", !smartSlidesEnabled)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaStickyNote style={{ fontSize: "1.2rem" }} />
                <span
                  className="onboarding-toggle-label"
                  style={{ marginBottom: 0 }}
                >
                  Smart Slides
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Features for generating and managing slides more efficiently.
              </p>
            </div>
            <div className={`toggle-switch ${smartSlidesEnabled ? "active" : ""}`}></div>
          </div>

          {/* Recorder */}
          <div
            className="onboarding-toggle"
            onClick={() => handleToggle("recorderEnabled", !recorderEnabled)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaCircle style={{ fontSize: "1.2rem" }} />
                <span
                  className="onboarding-toggle-label"
                  style={{ marginBottom: 0 }}
                >
                  Recorder
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Capture audio or services directly inside SmartVerses for later use.
              </p>
            </div>
            <div className={`toggle-switch ${recorderEnabled ? "active" : ""}`}></div>
          </div>

          {/* Live Testimonies */}
          <div
            className="onboarding-toggle"
            onClick={() => handleToggle("liveTestimoniesEnabled", !liveTestimoniesEnabled)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                <FaUser style={{ fontSize: "1.2rem" }} />
                <span
                  className="onboarding-toggle-label"
                  style={{ marginBottom: 0 }}
                >
                  Live Testimonies
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Tools that help you capture, curate, and display live testimonies
                during services.
              </p>
            </div>
            <div className={`toggle-switch ${liveTestimoniesEnabled ? "active" : ""}`}></div>
          </div>
        </div>

        <p className="onboarding-help-text">
          You can enable or disable these features anytime from Settings →
          Features.
        </p>

        <div className="onboarding-buttons">
          <button
            onClick={handleFinishSetup}
            className="onboarding-button onboarding-button-primary"
          >
            Finish setup
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

export default AdditionalFeaturesScreen;

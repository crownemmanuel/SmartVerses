/**
 * Screen: Standalone Setup
 * Configure standalone mode settings (audience screen, monitor, auto-trigger)
 */

import React, { useCallback, useEffect, useState } from "react";
import { FaDesktop } from "react-icons/fa";
import { Monitor } from "@tauri-apps/api/window";
import { getAvailableMonitors } from "../../services/displayService";
import MonitorSelectDropdown from "../MonitorSelectDropdown";
import "./onboarding.css";

interface StandaloneSetupScreenProps {
  audienceScreenEnabled: boolean;
  selectedMonitorIndex: number | null;
  autoTriggerScriptures: boolean;
  onAudienceScreenChange: (enabled: boolean) => void;
  onMonitorChange: (index: number | null) => void;
  onAutoTriggerChange: (enabled: boolean) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const StandaloneSetupScreen: React.FC<StandaloneSetupScreenProps> = ({
  audienceScreenEnabled,
  selectedMonitorIndex,
  autoTriggerScriptures,
  onAudienceScreenChange,
  onMonitorChange,
  onAutoTriggerChange,
  onNext,
  onBack,
  onSkip,
}) => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  const loadMonitors = useCallback(async () => {
    try {
      const availableMonitors = await getAvailableMonitors();
      setMonitors(availableMonitors);
    } catch (error) {
      console.error("Failed to load monitors:", error);
    }
  }, []);

  // Load monitors on mount
  useEffect(() => {
    void loadMonitors();
  }, [loadMonitors]);

  const handleNext = () => {
    onNext();
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">
          <FaDesktop
            className="onboarding-title-icon"
            style={{ marginRight: "0.5rem" }}
          />
          Standalone Configuration
        </h1>
        <p className="onboarding-subtitle">
          Configure how SmartVerses displays content to your audience.
        </p>

        {/* Enable Audience Screen Toggle */}
        <div
          style={{
            marginTop: "2rem",
            marginBottom: "2rem",
            padding: "1.5rem",
            background: "var(--onboarding-bg-card)",
            border: "1px solid var(--onboarding-border-subtle)",
            borderRadius: "12px",
          }}
        >
          <div
            className="onboarding-toggle"
            onClick={() => {
              const nextEnabled = !audienceScreenEnabled;
              if (
                nextEnabled &&
                selectedMonitorIndex === null &&
                monitors.length > 0
              ) {
                const defaultIndex = monitors.length > 1 ? 1 : 0;
                onMonitorChange(defaultIndex);
              }
              onAudienceScreenChange(nextEnabled);
            }}
            style={{ cursor: "pointer", marginBottom: "1rem" }}
          >
            <span className="onboarding-toggle-label" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Enable audience screen
            </span>
            <div className={`toggle-switch ${audienceScreenEnabled ? "active" : ""}`}></div>
          </div>

          {/* Monitor Selection */}
          {audienceScreenEnabled && (
            <div style={{ marginTop: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  color: "var(--onboarding-text-secondary)",
                  fontSize: "0.95rem",
                }}
              >
                Select monitor for audience display:
              </label>
              <MonitorSelectDropdown
                monitors={monitors}
                selectedIndex={selectedMonitorIndex}
                onSelect={(index) => onMonitorChange(index)}
                onRefresh={loadMonitors}
                disabled={monitors.length === 0}
              />
              {monitors.length === 0 && (
                <p
                  style={{
                    marginTop: "0.5rem",
                    fontSize: "0.85rem",
                    color: "var(--onboarding-text-muted)",
                  }}
                >
                  No additional monitors detected.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Auto-trigger Scriptures Toggle */}
        <div
          style={{
            marginBottom: "2rem",
            padding: "1.5rem",
            background: "var(--onboarding-bg-card)",
            border: "1px solid var(--onboarding-border-subtle)",
            borderRadius: "12px",
          }}
        >
          <div
            className="onboarding-toggle"
            onClick={() => onAutoTriggerChange(!autoTriggerScriptures)}
            style={{ cursor: "pointer", marginBottom: "0.75rem" }}
          >
            <span className="onboarding-toggle-label" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Automatically trigger scriptures when detected
            </span>
            <div className={`toggle-switch ${autoTriggerScriptures ? "active" : ""}`}></div>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.9rem",
              color: "var(--onboarding-text-muted)",
              lineHeight: "1.6",
            }}
          >
            This will automatically display scriptures to the audience when they're intelligently detected
            during live transcription.
          </p>
        </div>

        <div className="onboarding-buttons">
          <button onClick={handleNext} className="onboarding-button onboarding-button-primary">
            Next
          </button>
          <button onClick={onBack} className="onboarding-button onboarding-button-secondary">
            Back
          </button>
          <button onClick={onSkip} className="onboarding-button onboarding-button-tertiary">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default StandaloneSetupScreen;

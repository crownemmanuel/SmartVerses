/**
 * Features Settings Component
 * 
 * Allows users to enable/disable app features.
 * Unchecking a feature hides it from the navigation.
 */

import React, { useState, useEffect } from "react";
import {
  FaClock,
  FaStickyNote,
  FaBible,
  FaCircle,
  FaToggleOn,
  FaUser,
} from "react-icons/fa";
import {
  loadEnabledFeatures,
  saveEnabledFeatures,
} from "../services/recorderService";
import { EnabledFeatures } from "../types/recorder";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import "../App.css";

interface FeatureConfig {
  key: keyof EnabledFeatures;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const FEATURES: FeatureConfig[] = [
  {
    key: "slides",
    label: "Slides",
    description: "Main slide management and presentation control",
    icon: <FaStickyNote />,
    color: "#3b82f6",
  },
  {
    key: "timer",
    label: "Timer",
    description: "Stage assist countdown timer and schedule management",
    icon: <FaClock />,
    color: "#f59e0b",
  },
  {
    key: "liveTestimonies",
    label: "Live Testimonies",
    description: "Display and manage live testimonies from congregation",
    icon: <FaUser />,
    color: "#ec4899",
  },
  {
    key: "smartVerses",
    label: "SmartVerses",
    description: "AI-powered Bible verse detection and display",
    icon: <FaBible />,
    color: "#10b981",
  },
  {
    key: "recorder",
    label: "Recorder",
    description: "Video and audio recording for services",
    icon: <FaCircle />,
    color: "#ff3b5c",
  },
];

const FeaturesSettings: React.FC = () => {
  const [features, setFeatures] = useState<EnabledFeatures | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load features on mount
  useEffect(() => {
    const loaded = loadEnabledFeatures();
    setFeatures(loaded);
    setSettingsLoaded(true);
  }, []);

  // Auto-save with debounce
  useDebouncedEffect(
    () => {
      if (!features) return;
      try {
        saveEnabledFeatures(features);
        setSaveMessage("Changes saved");
        setTimeout(() => setSaveMessage(""), 2000);
      } catch (err) {
        console.error("Failed to save features:", err);
      }
    },
    [features, settingsLoaded],
    { delayMs: 400, enabled: settingsLoaded, skipFirstRun: true }
  );

  const handleToggle = (key: keyof EnabledFeatures) => {
    setFeatures((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  };

  if (!features) {
    return <div>Loading...</div>;
  }

  const enabledCount = Object.values(features).filter(Boolean).length;

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Features</h2>
      <p
        style={{
          marginBottom: "var(--spacing-6)",
          color: "var(--app-text-color-secondary)",
        }}
      >
        Enable or disable features to customize SmartVerses for your needs.
        Disabled features will be hidden from the navigation.
      </p>

      {/* Summary */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-3)",
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-3)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          borderRadius: "10px",
          border: "1px solid rgba(59, 130, 246, 0.2)",
        }}
      >
        <FaToggleOn size={24} style={{ color: "#3b82f6" }} />
        <span>
          <strong>{enabledCount}</strong> of {FEATURES.length} features enabled
        </span>
      </div>

      {/* Feature List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {FEATURES.map((feature) => {
          const isEnabled = features[feature.key];
          return (
            <div
              key={feature.key}
              onClick={() => handleToggle(feature.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-4)",
                padding: "var(--spacing-4)",
                backgroundColor: "var(--app-header-bg)",
                borderRadius: "12px",
                border: `1px solid ${isEnabled ? feature.color + "40" : "var(--app-border-color)"}`,
                cursor: "pointer",
                transition: "all 0.2s",
                opacity: isEnabled ? 1 : 0.6,
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: isEnabled ? feature.color + "20" : "var(--app-bg-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isEnabled ? feature.color : "var(--app-text-color-secondary)",
                  fontSize: "1.25rem",
                  transition: "all 0.2s",
                }}
              >
                {feature.icon}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    marginBottom: "4px",
                    color: isEnabled ? "var(--app-text-color)" : "var(--app-text-color-secondary)",
                  }}
                >
                  {feature.label}
                </div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  {feature.description}
                </div>
              </div>

              {/* Toggle */}
              <div
                style={{
                  width: "52px",
                  height: "28px",
                  borderRadius: "14px",
                  backgroundColor: isEnabled ? feature.color : "var(--app-bg-color)",
                  border: `1px solid ${isEnabled ? feature.color : "var(--app-border-color)"}`,
                  position: "relative",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    backgroundColor: "white",
                    position: "absolute",
                    top: "2px",
                    left: isEnabled ? "26px" : "2px",
                    transition: "all 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Status */}
      {saveMessage && (
        <div
          style={{
            marginTop: "var(--spacing-4)",
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "8px",
            color: "#22c55e",
            fontSize: "0.9rem",
          }}
        >
          {saveMessage}
        </div>
      )}
    </div>
  );
};

export default FeaturesSettings;

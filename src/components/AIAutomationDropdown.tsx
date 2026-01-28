import React, { useState, useRef, useEffect } from "react";
import { FaRobot, FaClock, FaSpellCheck, FaSpinner } from "react-icons/fa";
import { Slide } from "../types";
import { ScheduleItem } from "../types/propresenter";
import { autoAssignTimersToSlides } from "../utils/timerMatcher";
import { proofreadSlideTexts } from "../services/aiService";
import { getAppSettings } from "../utils/aiConfig";
import "../App.css";

interface AIAutomationDropdownProps {
  slides: Slide[];
  schedule: ScheduleItem[];
  onSlidesUpdated: (updatedSlides: Slide[], correctedSlideIds?: string[]) => void;
  disabled?: boolean;
}

const AIAutomationDropdown: React.FC<AIAutomationDropdownProps> = ({
  slides,
  schedule,
  onSlidesUpdated,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProofreading, setIsProofreading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  // Clear status message after a delay
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const handleAutoAssignTimers = () => {
    if (slides.length === 0) {
      setStatusMessage("No slides to process");
      setIsOpen(false);
      return;
    }

    if (schedule.length === 0) {
      setStatusMessage("No schedule loaded");
      setIsOpen(false);
      return;
    }

    const { updatedSlides, matchedCount, skippedCount } = autoAssignTimersToSlides(
      slides,
      schedule
    );

    onSlidesUpdated(updatedSlides);
    setIsOpen(false);

    if (matchedCount > 0) {
      const skippedText = skippedCount > 0 ? `, ${skippedCount} skipped` : "";
      setStatusMessage(`✓ ${matchedCount} timer${matchedCount > 1 ? "s" : ""} assigned${skippedText}`);
    } else if (skippedCount > 0 && skippedCount === slides.length) {
      setStatusMessage("All slides are scripture");
    } else {
      setStatusMessage("No matches found");
    }
  };

  const handleProofread = async () => {
    if (slides.length === 0) {
      setStatusMessage("No slides to proofread");
      setIsOpen(false);
      return;
    }

    // Filter out auto-scripture slides for proofreading
    const slidesToProofread = slides.filter((s) => !s.isAutoScripture);
    if (slidesToProofread.length === 0) {
      setStatusMessage("No slides to proofread (all scripture)");
      setIsOpen(false);
      return;
    }

    const appSettings = getAppSettings();
    
    // Get spell check model settings
    const spellCheckSettings = appSettings.spellCheckModel;
    const provider = spellCheckSettings?.provider || appSettings.defaultAIProvider;
    const model = spellCheckSettings?.model;

    if (!provider) {
      setStatusMessage("Configure AI in Settings first");
      setIsOpen(false);
      return;
    }

    // Check if we have an API key for the provider
    const apiKey = provider === "openai" 
      ? appSettings.openAIConfig?.apiKey 
      : provider === "groq"
      ? appSettings.groqConfig?.apiKey
      : appSettings.geminiConfig?.apiKey;
    
    if (!apiKey) {
      setStatusMessage(`No API key for ${provider}`);
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    setIsProofreading(true);
    setStatusMessage("Proofreading...");

    try {
      const slideTexts = slidesToProofread.map((s) => s.text);
    const defaultModel =
      provider === appSettings.defaultAIProvider && appSettings.defaultAIModel
        ? appSettings.defaultAIModel
        : provider === "openai"
        ? "gpt-4o-mini"
        : provider === "groq"
        ? "llama-3.3-70b-versatile"
        : "gemini-1.5-flash-latest";
      const correctedTexts = await proofreadSlideTexts(
        slideTexts,
        provider as "openai" | "gemini" | "groq",
        model || defaultModel,
        appSettings
      );

      // Map corrections back to slides and track which were corrected
      let correctionIndex = 0;
      const correctedSlideIds: string[] = [];
      const updatedSlides = slides.map((slide) => {
        if (slide.isAutoScripture) {
          return slide;
        }
        const correctedText = correctedTexts[correctionIndex];
        correctionIndex++;
        
        if (correctedText !== slide.text) {
          correctedSlideIds.push(slide.id);
          return { ...slide, text: correctedText };
        }
        return slide;
      });

      onSlidesUpdated(updatedSlides, correctedSlideIds);
      
      if (correctedSlideIds.length > 0) {
        setStatusMessage(`✓ ${correctedSlideIds.length} slide${correctedSlideIds.length > 1 ? "s" : ""} corrected`);
      } else {
        setStatusMessage("✓ No errors found");
      }
    } catch (error) {
      console.error("Proofreading error:", error);
      setStatusMessage("Proofreading failed");
    } finally {
      setIsProofreading(false);
    }
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <button
        onClick={() => !disabled && !isProofreading && setIsOpen(!isOpen)}
        disabled={disabled || isProofreading}
        className="secondary"
        style={{
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          cursor: disabled || isProofreading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
        title="AI Automation - Auto-assign timers, proofread slides, and more"
      >
        {isProofreading ? (
          <FaSpinner
            style={{
              color: "#a855f7",
              animation: "spin 1s linear infinite",
            }}
          />
        ) : (
          <FaRobot
            style={{
              color: "#a855f7", // Purple color for AI
              fontSize: "1.1em",
            }}
          />
        )}
      </button>

      {statusMessage && (
        <span
          style={{
            fontSize: "0.8em",
            color: statusMessage.startsWith("✓") ? "#22c55e" : "var(--accent)",
            whiteSpace: "nowrap",
          }}
        >
          {statusMessage}
        </span>
      )}

      {isOpen && !disabled && !isProofreading && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            backgroundColor: "var(--app-bg-color)",
            border: "1px solid var(--app-border-color)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            zIndex: 1000,
            minWidth: "220px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: "0.85em",
              color: "var(--app-text-color-secondary)",
              borderBottom: "1px solid var(--app-border-color)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FaRobot style={{ color: "#a855f7" }} />
            AI Automation
          </div>

          <div
            onClick={handleAutoAssignTimers}
            style={{
              padding: "12px 14px",
              cursor: schedule.length === 0 ? "not-allowed" : "pointer",
              fontSize: "0.9em",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderBottom: "1px solid var(--app-border-color)",
              opacity: schedule.length === 0 ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (schedule.length > 0) {
                e.currentTarget.style.backgroundColor = "var(--app-header-bg)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title={schedule.length === 0 ? "Load a schedule first" : "Match slide names to schedule sessions"}
          >
            <FaClock style={{ color: "#3b82f6", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 500 }}>Auto-attach Timers</div>
              <div style={{ fontSize: "0.85em", opacity: 0.7, marginTop: "2px" }}>
                Match slides to schedule sessions
              </div>
            </div>
          </div>

          <div
            onClick={handleProofread}
            style={{
              padding: "12px 14px",
              cursor: "pointer",
              fontSize: "0.9em",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--app-header-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Check and fix spelling/grammar errors using AI"
          >
            <FaSpellCheck style={{ color: "#22c55e", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 500 }}>Auto Proofread</div>
              <div style={{ fontSize: "0.85em", opacity: 0.7, marginTop: "2px" }}>
                Fix spelling & grammar errors
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AIAutomationDropdown;

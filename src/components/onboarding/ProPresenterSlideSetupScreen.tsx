/**
 * Screen: ProPresenter Setup - Capture slide for SmartVerses
 */

import React, { useEffect, useState } from "react";
import { FaCheck } from "react-icons/fa";
import {
  getCurrentSlideIndex,
  loadProPresenterConnections,
} from "../../services/propresenterService";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import type { ProPresenterConnection } from "../../types/propresenter";
import type { SmartVersesSettings } from "../../types/smartVerses";
import "./onboarding.css";

interface ProPresenterSlideSetupScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const ProPresenterSlideSetupScreen: React.FC<
  ProPresenterSlideSetupScreenProps
> = ({ onNext, onBack, onSkip }) => {
  const [connection, setConnection] = useState<ProPresenterConnection | null>(
    null
  );
  const [isLoadingSlide, setIsLoadingSlide] = useState(false);
  const [slideLoadError, setSlideLoadError] = useState<string | null>(null);
  const [slideLoadSuccess, setSlideLoadSuccess] = useState(false);
  const [activationClicks, setActivationClicks] = useState(1);
  const [takeOffClicks, setTakeOffClicks] = useState(0);
  const [clearTextFileOnTakeOff, setClearTextFileOnTakeOff] = useState(true);
  const [activationConfig, setActivationConfig] = useState<
    SmartVersesSettings["proPresenterActivation"] | null
  >(null);

  useEffect(() => {
    const settings = loadSmartVersesSettings();
    const connections = loadProPresenterConnections().filter((c) => c.isEnabled);
    const selectedId =
      settings.selectedProPresenterConnectionId || connections[0]?.id;
    const selected =
      connections.find((c) => c.id === selectedId) || connections[0] || null;
    setConnection(selected);

    if (settings.proPresenterActivation) {
      setActivationConfig(settings.proPresenterActivation);
      setActivationClicks(
        settings.proPresenterActivation.activationClicks ?? 1
      );
      setTakeOffClicks(settings.proPresenterActivation.takeOffClicks ?? 0);
      setClearTextFileOnTakeOff(
        settings.proPresenterActivation.clearTextFileOnTakeOff !== false
      );
    }
  }, []);

  const saveActivation = (
    nextActivation: SmartVersesSettings["proPresenterActivation"]
  ) => {
    setActivationConfig(nextActivation);
    const settings = loadSmartVersesSettings();
    settings.proPresenterActivation = nextActivation;
    if (connection) {
      settings.selectedProPresenterConnectionId = connection.id;
      settings.proPresenterConnectionIds = [connection.id];
    }
    saveSmartVersesSettings(settings);
    window.dispatchEvent(
      new CustomEvent("smartverses-settings-changed", { detail: settings })
    );
  };

  const handleGetSlide = async () => {
    if (!connection) {
      setSlideLoadError(
        "No enabled ProPresenter connection found. Please configure your connection first."
      );
      return;
    }
    setIsLoadingSlide(true);
    setSlideLoadError(null);
    setSlideLoadSuccess(false);

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        const newActivation = {
          presentationUuid:
            slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName:
            slideIndexData.presentation_index.presentation_id.name,
          activationClicks,
          takeOffClicks,
          clearTextFileOnTakeOff,
        };
        saveActivation(newActivation);
        setSlideLoadSuccess(true);
      } else {
        setSlideLoadError(
          "No active presentation found. Make sure the slide is live in ProPresenter."
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSlideLoadError(message);
    } finally {
      setIsLoadingSlide(false);
    }
  };

  const handleActivationClicksChange = (value: number) => {
    const nextValue = Math.max(1, value || 1);
    setActivationClicks(nextValue);
    if (activationConfig) {
      saveActivation({
        ...activationConfig,
        activationClicks: nextValue,
      });
    }
  };

  const handleTakeOffClicksChange = (value: number) => {
    const nextValue = Math.max(0, value || 0);
    setTakeOffClicks(nextValue);
    if (activationConfig) {
      saveActivation({
        ...activationConfig,
        takeOffClicks: nextValue,
      });
    }
  };

  const handleClearTextToggle = (enabled: boolean) => {
    setClearTextFileOnTakeOff(enabled);
    if (activationConfig) {
      saveActivation({
        ...activationConfig,
        clearTextFileOnTakeOff: enabled,
      });
    }
  };

  return (
    <div className="onboarding-screen">
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "500px",
        }}
      >
        <div
          className="onboarding-content"
          style={{
            maxWidth: "600px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <h1 className="onboarding-title">Capture your scripture slide</h1>
          <p className="onboarding-body">
            Put the scripture slide live in ProPresenter, then click &quot;Get
            Slide&quot; to link SmartVerses to your slide.
          </p>

          {slideLoadError && (
            <div className="onboarding-message onboarding-message-error">
              {slideLoadError}
            </div>
          )}

          {slideLoadSuccess && activationConfig && (
            <div className="onboarding-message onboarding-message-success">
              <FaCheck style={{ marginRight: "8px" }} />
              Slide captured! {activationConfig.presentationName} (Slide{" "}
              {activationConfig.slideIndex})
            </div>
          )}

          <div className="onboarding-buttons" style={{ justifyContent: "center" }}>
            <button
              onClick={handleGetSlide}
              disabled={isLoadingSlide}
              className="onboarding-button onboarding-button-secondary"
            >
              {isLoadingSlide ? "Getting slide..." : "Get Slide"}
            </button>
          </div>

          {activationConfig && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px",
                backgroundColor: "var(--app-header-bg)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "0.85em",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "var(--app-text-color)",
                }}
              >
                Animation Trigger Settings:
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "0.8em",
                      display: "block",
                      marginBottom: "4px",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Go Live Clicks:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={activationClicks}
                    onChange={(e) =>
                      handleActivationClicksChange(parseInt(e.target.value, 10))
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      fontSize: "0.85em",
                      backgroundColor: "var(--app-input-bg-color)",
                      color: "var(--app-input-text-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "4px",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "0.8em",
                      display: "block",
                      marginBottom: "4px",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Clear/Off Live Clicks:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={takeOffClicks}
                    onChange={(e) =>
                      handleTakeOffClicksChange(parseInt(e.target.value, 10))
                    }
                    style={{
                      width: "100%",
                      padding: "4px 6px",
                      fontSize: "0.85em",
                      backgroundColor: "var(--app-input-bg-color)",
                      color: "var(--app-input-text-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  fontSize: "0.75em",
                  color: "var(--app-text-color-secondary)",
                  marginTop: "6px",
                }}
              >
                Use multiple clicks to trigger ProPresenter animations.
                &quot;Go Live Clicks&quot; triggers when a verse is set live.
                &quot;Clear/Off Live Clicks&quot; triggers when clearing the
                live verse.
              </div>
              <div
                style={{
                  marginTop: "var(--spacing-3)",
                  paddingTop: "var(--spacing-3)",
                  borderTop: "1px solid var(--app-border-color)",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <input
                    type="checkbox"
                    id="clearTextFileOnTakeOff"
                    checked={clearTextFileOnTakeOff}
                    onChange={(e) => handleClearTextToggle(e.target.checked)}
                    style={{ width: "auto", margin: 0 }}
                  />
                  <label
                    htmlFor="clearTextFileOnTakeOff"
                    style={{ margin: 0, cursor: "pointer", fontWeight: 500 }}
                  >
                    Clear text file when taking off live
                  </label>
                </div>
                <div
                  style={{
                    fontSize: "0.75em",
                    color: "var(--app-text-color-secondary)",
                    marginTop: "4px",
                    marginLeft: "24px",
                  }}
                >
                  If unchecked, the text file will remain unchanged when
                  clearing a live verse. Only the ProPresenter slide will be
                  triggered.
                </div>
              </div>
            </div>
          )}

          <div className="onboarding-buttons" style={{ justifyContent: "center" }}>
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

export default ProPresenterSlideSetupScreen;

/**
 * Screen: ProPresenter Setup - Create linked text files
 */

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import {
  PROPRESENTER_REF_FILE,
  PROPRESENTER_TEMPLATE_DIR,
  PROPRESENTER_TEXT_FILE,
  SAMPLE_SCRIPTURE_REF,
  SAMPLE_SCRIPTURE_TEXT,
} from "./proPresenterOnboardingUtils";
import "./onboarding.css";

interface ProPresenterSetupSlideScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type WriteStatus = "idle" | "writing" | "success" | "error";

const ProPresenterSetupSlideScreen: React.FC<
  ProPresenterSetupSlideScreenProps
> = ({ onNext, onBack, onSkip }) => {
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const writeSampleFiles = async () => {
    setStatus("writing");
    setErrorMessage(null);
    try {
      await invoke("write_text_to_file", {
        filePath: `${PROPRESENTER_TEMPLATE_DIR}${PROPRESENTER_TEXT_FILE}`,
        content: SAMPLE_SCRIPTURE_TEXT,
      });
      await invoke("write_text_to_file", {
        filePath: `${PROPRESENTER_TEMPLATE_DIR}${PROPRESENTER_REF_FILE}`,
        content: SAMPLE_SCRIPTURE_REF,
      });

      const settings = loadSmartVersesSettings();
      settings.bibleOutputPath = PROPRESENTER_TEMPLATE_DIR;
      settings.bibleTextFileName = PROPRESENTER_TEXT_FILE;
      settings.bibleReferenceFileName = PROPRESENTER_REF_FILE;
      saveSmartVersesSettings(settings);
      window.dispatchEvent(
        new CustomEvent("smartverses-settings-changed", { detail: settings })
      );

      setStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus("error");
      setErrorMessage(message);
    }
  };

  useEffect(() => {
    void writeSampleFiles();
  }, []);

  return (
    <div className="onboarding-screen">
      <div className="onboarding-split">
        <div className="onboarding-content">
          <h1 className="onboarding-title">Setup a presentation slide</h1>
          <p className="onboarding-body">
            We&apos;re creating two SmartVerses sample files so ProPresenter can
            link to them. You&apos;ll use these as Linked Text boxes for the
            scripture and the reference.
          </p>

          {status === "writing" && (
            <div className="onboarding-message onboarding-message-info">
              <span className="onboarding-spinner"></span>
              Writing sample scripture files...
            </div>
          )}

          {status === "success" && (
            <div className="onboarding-message onboarding-message-success">
              Files created in{" "}
              <code>{PROPRESENTER_TEMPLATE_DIR}</code>
            </div>
          )}

          {status === "error" && (
            <div className="onboarding-message onboarding-message-error">
              Failed to create sample files. {errorMessage}
              <button
                onClick={writeSampleFiles}
                className="onboarding-button onboarding-button-secondary"
                style={{ marginLeft: "12px" }}
              >
                Try again
              </button>
            </div>
          )}

          <div>
            <p className="onboarding-body" style={{ fontSize: "0.95rem" }}>
              Create a new ProPresenter presentation with two text boxes:
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              <li>Scripture text box</li>
              <li>Reference text box</li>
            </ul>
          </div>

          <div className="onboarding-buttons">
            <button
              onClick={onNext}
              disabled={status === "writing"}
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

        <div className="onboarding-visual">
          <img
            src="/assets/onboarding/create_proPresenter_slides.gif"
            alt="ProPresenter slide creation demonstration"
          />
        </div>
      </div>
    </div>
  );
};

export default ProPresenterSetupSlideScreen;

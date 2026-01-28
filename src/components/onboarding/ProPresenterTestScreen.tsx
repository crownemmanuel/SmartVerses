/**
 * Screen: ProPresenter Setup - Test linked text
 */

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import {
  PROPRESENTER_REF_FILE,
  PROPRESENTER_TEMPLATE_DIR,
  PROPRESENTER_TEXT_FILE,
  TEST_SCRIPTURE_REF,
  TEST_SCRIPTURE_TEXT,
} from "./proPresenterOnboardingUtils";
import "./onboarding.css";

interface ProPresenterTestScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

const ProPresenterTestScreen: React.FC<ProPresenterTestScreenProps> = ({
  onNext,
  onBack,
  onSkip,
}) => {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [message, setMessage] = useState("");

  const handleTest = async () => {
    setStatus("testing");
    setMessage("Writing Genesis 1:1 to linked files...");
    try {
      const settings = loadSmartVersesSettings();
      const rawBasePath = settings.bibleOutputPath || PROPRESENTER_TEMPLATE_DIR;
      const basePath = rawBasePath.replace(/\/?$/, "/");
      const textFile = settings.bibleTextFileName || PROPRESENTER_TEXT_FILE;
      const refFile = settings.bibleReferenceFileName || PROPRESENTER_REF_FILE;

      await invoke("write_text_to_file", {
        filePath: `${basePath}${textFile}`,
        content: TEST_SCRIPTURE_TEXT,
      });
      await invoke("write_text_to_file", {
        filePath: `${basePath}${refFile}`,
        content: TEST_SCRIPTURE_REF,
      });

      settings.bibleOutputPath = basePath;
      settings.bibleTextFileName = textFile;
      settings.bibleReferenceFileName = refFile;
      saveSmartVersesSettings(settings);
      window.dispatchEvent(
        new CustomEvent("smartverses-settings-changed", { detail: settings })
      );

      setStatus("success");
      setMessage(
        "Test sent! If you see Genesis 1:1 in ProPresenter, you are ready to continue."
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus("error");
      setMessage(`Failed to write test files: ${msg}`);
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
          <h1 className="onboarding-title">Test your setup</h1>
          <p className="onboarding-body">
            Click &quot;Test&quot; to send Genesis 1:1 to your linked text boxes.
            If you see the verse in ProPresenter, everything is working.
          </p>

          <div className="onboarding-buttons" style={{ justifyContent: "center" }}>
            <button
              onClick={handleTest}
              disabled={status === "testing"}
              className="onboarding-button onboarding-button-secondary"
            >
              {status === "testing" ? "Testing..." : "Test"}
            </button>
          </div>

          {status !== "idle" && (
            <div
              className={`onboarding-message ${
                status === "success"
                  ? "onboarding-message-success"
                  : status === "error"
                  ? "onboarding-message-error"
                  : "onboarding-message-info"
              }`}
            >
              {message}
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

export default ProPresenterTestScreen;

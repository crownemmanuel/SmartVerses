/**
 * Screen: ProPresenter Setup - Link text boxes to files
 */

import React from "react";
import {
  PROPRESENTER_REF_FILE,
  PROPRESENTER_TEMPLATE_DIR,
  PROPRESENTER_TEXT_FILE,
} from "./proPresenterOnboardingUtils";
import "./onboarding.css";

interface ProPresenterLinkFilesScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const ProPresenterLinkFilesScreen: React.FC<ProPresenterLinkFilesScreenProps> = ({
  onNext,
  onBack,
  onSkip,
}) => {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-split">
        <div className="onboarding-content">
          <h1 className="onboarding-title">Link your text boxes</h1>
          <p className="onboarding-body">
            In ProPresenter, link each text box to its file using Linked Text →
            File.
          </p>

          <div
            style={{
              padding: "1rem 1.25rem",
              background: "var(--onboarding-bg-card)",
              border: "1px solid var(--onboarding-border-subtle)",
              borderRadius: "12px",
            }}
          >
            <p className="onboarding-body" style={{ fontSize: "0.95rem" }}>
              Scripture text box:
              <br />
              <code>
                {PROPRESENTER_TEMPLATE_DIR}
                {PROPRESENTER_TEXT_FILE}
              </code>
            </p>
            <p
              className="onboarding-body"
              style={{ fontSize: "0.95rem", marginTop: "0.75rem" }}
            >
              Reference text box:
              <br />
              <code>
                {PROPRESENTER_TEMPLATE_DIR}
                {PROPRESENTER_REF_FILE}
              </code>
            </p>
          </div>

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

        <div className="onboarding-visual">
          <img
            src="/assets/onboarding/Link_proPresenter_slides.gif"
            alt="ProPresenter link text boxes demonstration"
          />
        </div>
      </div>
    </div>
  );
};

export default ProPresenterLinkFilesScreen;

/**
 * Screen: ProPresenter Setup - Enable network control
 */

import React from "react";
import "./onboarding.css";

interface ProPresenterEnableNetworkScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const ProPresenterEnableNetworkScreen: React.FC<
  ProPresenterEnableNetworkScreenProps
> = ({ onNext, onBack, onSkip }) => {
  return (
    <div className="onboarding-screen">
      <div className="onboarding-split">
        <div className="onboarding-content">
          <h1 className="onboarding-title">Enable ProPresenter network</h1>
          <p className="onboarding-body">
            Open ProPresenter, go to Settings → Network, and enable network
            control. Make sure the network port is enabled.
          </p>
          <p className="onboarding-body" style={{ fontSize: "0.95rem" }}>
            Default port: <strong>59343</strong>
          </p>

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
            src="/assets/onboarding/TurnOn_Network.gif"
            alt="ProPresenter enable network demonstration"
          />
        </div>
      </div>
    </div>
  );
};

export default ProPresenterEnableNetworkScreen;

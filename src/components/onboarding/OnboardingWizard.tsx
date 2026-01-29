/**
 * Main Onboarding Wizard Component
 * Orchestrates the flow through all onboarding screens
 */

import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  OnboardingState,
  OnboardingScreen,
  loadOnboardingState,
  saveOnboardingState,
  markOnboardingCompleted,
  markOnboardingSkipped,
} from "../../types/onboarding";
import {
  loadEnabledFeatures,
  saveEnabledFeatures,
} from "../../services/recorderService";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import {
  loadDisplaySettings,
  saveDisplaySettings,
} from "../../services/displayService";
import type { DisplaySettings as DisplaySettingsType } from "../../types/display";
import type {
  SmartVersesSettings as SmartVersesSettingsType,
  TranscriptionEngine,
} from "../../types/smartVerses";
import WelcomeScreen from "./WelcomeScreen";
import UsageModeScreen from "./UsageModeScreen";
import StandaloneSetupScreen from "./StandaloneSetupScreen";
import SmartVersesIntroScreen from "./SmartVersesIntroScreen";
import TranscriptionProviderScreen from "./TranscriptionProviderScreen";
import AssemblyAISetupScreen from "./AssemblyAISetupScreen";
import GroqSetupScreen from "./GroqSetupScreen";
import OfflineModelSetupScreen from "./OfflineModelSetupScreen";
import ParaphrasingSetupScreen from "./ParaphrasingSetupScreen";
import MicSetupScreen from "./MicSetupScreen";
import TestSmartVersesScreen from "./TestSmartVersesScreen";
import TestKeypointScreen from "./TestKeypointScreen";
import AdditionalFeaturesScreen from "./AdditionalFeaturesScreen";
import ProPresenterSetupSlideScreen from "./ProPresenterSetupSlideScreen";
import ProPresenterLinkFilesScreen from "./ProPresenterLinkFilesScreen";
import ProPresenterEnableNetworkScreen from "./ProPresenterEnableNetworkScreen";
import ProPresenterConnectionScreen from "./ProPresenterConnectionScreen";
import ProPresenterSlideSetupScreen from "./ProPresenterSlideSetupScreen";
import ProPresenterTestScreen from "./ProPresenterTestScreen";
import "./onboarding.css";

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type OsType = "windows" | "mac" | "linux" | "unknown";

const detectOsType = (): OsType => {
  if (typeof navigator === "undefined") return "unknown";
  const userAgent = navigator.userAgent;
  if (userAgent.indexOf("Win") !== -1) return "windows";
  if (userAgent.indexOf("Mac") !== -1) return "mac";
  if (userAgent.indexOf("Linux") !== -1) return "linux";
  return "unknown";
};

const resolveTranscriptionProvider = (
  engine?: TranscriptionEngine
): OnboardingState["transcriptionProvider"] => {
  if (
    engine === "assemblyai" ||
    engine === "groq" ||
    engine === "offline-whisper" ||
    engine === "offline-whisper-native" ||
    engine === "offline-moonshine"
  ) {
    return engine;
  }
  return undefined;
};

const resolveAudienceScreenEnabled = (
  settings: DisplaySettingsType,
  osType: OsType
): boolean => {
  if (osType === "windows") return !!settings.windowAudienceScreen;
  return !!settings.enabled;
};

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onSkip,
}) => {
  const osType = detectOsType();
  const [state, setState] = useState<OnboardingState>(() => {
    const onboardingState = loadOnboardingState();
    // Load actual feature enablement from EnabledFeatures
    const enabledFeatures = loadEnabledFeatures();
    const smartVersesSettings = loadSmartVersesSettings();
    const displaySettings = loadDisplaySettings();
    return {
      ...onboardingState,
      smartVersesEnabled: enabledFeatures.smartVerses,
      transcriptionProvider: resolveTranscriptionProvider(
        smartVersesSettings.transcriptionEngine
      ),
      autoTriggerScriptures: smartVersesSettings.autoTriggerOnDetection,
      audienceScreenEnabled: resolveAudienceScreenEnabled(displaySettings, osType),
      selectedMonitorIndex: displaySettings.monitorIndex,
    };
  });

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveOnboardingState(state);
  }, [state]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const syncSmartVersesSettings = (updates: Partial<SmartVersesSettingsType>) => {
    const current = loadSmartVersesSettings();
    const next: SmartVersesSettingsType = { ...current, ...updates };
    const changed = Object.entries(updates).some(
      ([key, value]) =>
        current[key as keyof SmartVersesSettingsType] !== value
    );
    if (!changed) return;
    saveSmartVersesSettings(next);
    window.dispatchEvent(
      new CustomEvent("smartverses-settings-changed", { detail: next })
    );
  };

  const syncDisplaySettings = (updates: Partial<DisplaySettingsType>) => {
    const current = loadDisplaySettings();
    const next: DisplaySettingsType = { ...current, ...updates };
    const changed = Object.entries(updates).some(
      ([key, value]) => (current as DisplaySettingsType)[key as keyof DisplaySettingsType] !== value
    );
    if (!changed) return;
    saveDisplaySettings(next);
  };

  const handleTranscriptionProviderChange = (
    provider: OnboardingState["transcriptionProvider"]
  ) => {
    if (!provider) return;
    updateState({ transcriptionProvider: provider });
    syncSmartVersesSettings({
      transcriptionEngine: provider as TranscriptionEngine,
    });
  };

  const handleAutoTriggerChange = (enabled: boolean) => {
    updateState({ autoTriggerScriptures: enabled });
    syncSmartVersesSettings({ autoTriggerOnDetection: enabled });
  };

  const handleAudienceScreenChange = (enabled: boolean) => {
    updateState({ audienceScreenEnabled: enabled });
    if (osType === "windows") {
      syncDisplaySettings({ windowAudienceScreen: enabled });
    } else {
      syncDisplaySettings({ enabled });
    }
  };

  const handleMonitorChange = (index: number | null) => {
    updateState({ selectedMonitorIndex: index });
    syncDisplaySettings({ monitorIndex: index });
  };

  useEffect(() => {
    const handleSmartVersesSettingsChanged = (
      event: Event
    ) => {
      const detail =
        (event as CustomEvent<SmartVersesSettingsType | undefined>).detail ||
        loadSmartVersesSettings();
      const nextProvider = resolveTranscriptionProvider(
        detail.transcriptionEngine
      );
      const nextAutoTrigger = detail.autoTriggerOnDetection;

      setState((prev) => {
        const updates: Partial<OnboardingState> = {};
        if (nextProvider !== prev.transcriptionProvider) {
          updates.transcriptionProvider = nextProvider;
        }
        if (nextAutoTrigger !== prev.autoTriggerScriptures) {
          updates.autoTriggerScriptures = nextAutoTrigger;
        }
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    };

    window.addEventListener(
      "smartverses-settings-changed",
      handleSmartVersesSettingsChanged as EventListener
    );

    let unlistenDisplay: (() => void) | undefined;
    listen<DisplaySettingsType>("display:settings", () => {
      const displaySettings = loadDisplaySettings();
      const nextEnabled = resolveAudienceScreenEnabled(displaySettings, osType);
      const nextMonitor = displaySettings.monitorIndex;

      setState((prev) => {
        const updates: Partial<OnboardingState> = {};
        if (nextEnabled !== prev.audienceScreenEnabled) {
          updates.audienceScreenEnabled = nextEnabled;
        }
        if (nextMonitor !== prev.selectedMonitorIndex) {
          updates.selectedMonitorIndex = nextMonitor;
        }
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    })
      .then((unlisten) => {
        unlistenDisplay = unlisten;
      })
      .catch((error) => {
        console.warn(
          "[Onboarding] Failed to listen for display settings:",
          error
        );
      });

    return () => {
      window.removeEventListener(
        "smartverses-settings-changed",
        handleSmartVersesSettingsChanged as EventListener
      );
      unlistenDisplay?.();
    };
  }, [osType]);

  const goToScreen = (screen: OnboardingScreen) => {
    updateState({ currentScreen: screen });
  };

  const handleNext = (nextScreen: OnboardingScreen) => {
    goToScreen(nextScreen);
  };

  const handleBack = (previousScreen: OnboardingScreen) => {
    goToScreen(previousScreen);
  };

  const handleSkip = () => {
    markOnboardingSkipped();
    onSkip();
  };

  const handleFinish = () => {
    markOnboardingCompleted();
    onComplete();
  };

  // Render current screen
  const renderScreen = () => {
    switch (state.currentScreen) {
      case "welcome":
        return (
          <WelcomeScreen
            onNext={() => handleNext("smart-verses-intro")}
            onSkip={handleSkip}
          />
        );

      case "usage-mode":
        return (
          <UsageModeScreen
            selectedMode={state.usageMode}
            onSelectMode={(mode) => updateState({ usageMode: mode })}
            onNext={() => {
              // If standalone is selected, go to standalone setup
              // If ProPresenter is selected, go to ProPresenter setup
              if (state.usageMode === "standalone") {
                handleNext("standalone-setup");
              } else {
                handleNext("propresenter-setup-slide");
              }
            }}
            onBack={() => handleBack("test-smart-verses")}
            onSkip={() => {
              // Skip directly to additional features
              handleNext("additional-features");
            }}
          />
        );

      case "standalone-setup":
        return (
          <StandaloneSetupScreen
            audienceScreenEnabled={state.audienceScreenEnabled}
            selectedMonitorIndex={state.selectedMonitorIndex}
            autoTriggerScriptures={state.autoTriggerScriptures}
            onAudienceScreenChange={handleAudienceScreenChange}
            onMonitorChange={handleMonitorChange}
            onAutoTriggerChange={handleAutoTriggerChange}
            onNext={() => handleNext("additional-features")}
            onBack={() => handleBack("usage-mode")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "smart-verses-intro":
        return (
          <SmartVersesIntroScreen
            enabled={state.smartVersesEnabled}
            onToggle={(enabled) => {
              // Update both onboarding state and EnabledFeatures
              updateState({ smartVersesEnabled: enabled });
              const enabledFeatures = loadEnabledFeatures();
              enabledFeatures.smartVerses = enabled;
              saveEnabledFeatures(enabledFeatures);
            }}
            onNext={() => {
              if (state.smartVersesEnabled) {
                handleNext("transcription-provider");
              } else {
                // Skip Smart Verses setup if disabled - go to usage mode
                handleNext("usage-mode");
              }
            }}
            onBack={() => handleBack("welcome")}
            onSkip={handleSkip}
          />
        );

      case "transcription-provider":
        return (
          <TranscriptionProviderScreen
            selectedProvider={state.transcriptionProvider}
            onSelectProvider={handleTranscriptionProviderChange}
            onNext={() => {
              // Route to appropriate setup screen based on selected provider
              if (state.transcriptionProvider === "assemblyai") {
                handleNext("assemblyai-setup");
              } else if (state.transcriptionProvider === "groq") {
                handleNext("groq-setup");
              } else if (
                state.transcriptionProvider === "offline-whisper" ||
                state.transcriptionProvider === "offline-whisper-native" ||
                state.transcriptionProvider === "offline-moonshine"
              ) {
                handleNext("offline-model-setup");
              }
            }}
            onBack={() => handleBack("smart-verses-intro")}
            onSkip={() => {
              updateState({ transcriptionConfigured: false });
              handleNext("paraphrasing-setup");
            }}
          />
        );

      case "assemblyai-setup":
        return (
          <AssemblyAISetupScreen
            apiKey={state.assemblyAIKey}
            onApiKeyChange={(key) => updateState({ assemblyAIKey: key })}
            onNext={() => {
              updateState({ transcriptionConfigured: !!state.assemblyAIKey });
              handleNext("paraphrasing-setup");
            }}
            onBack={() => handleBack("transcription-provider")}
            onSkip={() => {
              updateState({ transcriptionConfigured: false });
              handleNext("paraphrasing-setup");
            }}
          />
        );

      case "groq-setup":
        return (
          <GroqSetupScreen
            apiKey={state.groqKey}
            onApiKeyChange={(key) => updateState({ groqKey: key })}
            onNext={() => {
              const configured = !!state.groqKey;
              updateState({
                transcriptionConfigured: configured,
                paraphrasingConfigured: configured,
              });
              // Skip paraphrasing setup since Groq handles both
              handleNext("mic-setup");
            }}
            onBack={() => handleBack("transcription-provider")}
            onSkip={() => {
              updateState({
                transcriptionConfigured: false,
                paraphrasingConfigured: false,
              });
              handleNext("paraphrasing-setup");
            }}
          />
        );

      case "offline-model-setup":
        return (
          <OfflineModelSetupScreen
            modelType={
              state.transcriptionProvider === "offline-whisper" ||
              state.transcriptionProvider === "offline-whisper-native"
                ? "whisper"
                : "moonshine"
            }
            whisperBackend={
              state.transcriptionProvider === "offline-whisper-native"
                ? "native"
                : "web"
            }
            onNext={() => {
              updateState({ transcriptionConfigured: true });
              handleNext("paraphrasing-setup");
            }}
            onBack={() => handleBack("transcription-provider")}
            onSkip={() => {
              updateState({ transcriptionConfigured: false });
              handleNext("paraphrasing-setup");
            }}
          />
        );

      case "paraphrasing-setup":
        return (
          <ParaphrasingSetupScreen
            provider={state.paraphrasingProvider}
            onProviderChange={(provider) =>
              updateState({ paraphrasingProvider: provider })
            }
            onNext={() => {
              updateState({
                paraphrasingConfigured: !!state.paraphrasingProvider,
              });
              handleNext("mic-setup");
            }}
            onBack={() => {
              // Determine where to go back based on transcription provider
              if (state.transcriptionProvider === "groq") {
                handleBack("groq-setup");
              } else if (state.transcriptionProvider === "assemblyai") {
                handleBack("assemblyai-setup");
              } else if (
                state.transcriptionProvider === "offline-whisper" ||
                state.transcriptionProvider === "offline-whisper-native" ||
                state.transcriptionProvider === "offline-moonshine"
              ) {
                handleBack("offline-model-setup");
              } else {
                handleBack("transcription-provider");
              }
            }}
            onSkip={() => {
              updateState({ paraphrasingConfigured: false });
              handleNext("mic-setup");
            }}
          />
        );

      case "mic-setup":
        return (
          <MicSetupScreen
            selectedMicId={state.selectedMicId}
            onMicSelect={(micId) => updateState({ selectedMicId: micId })}
            onNext={() => {
              updateState({ micConfigured: !!state.selectedMicId });
              handleNext("test-smart-verses");
            }}
            onBack={() => handleBack("paraphrasing-setup")}
            onSkip={() => {
              updateState({ micConfigured: false });
              handleNext("test-smart-verses");
            }}
          />
        );

      case "test-smart-verses":
        return (
          <TestSmartVersesScreen
            transcriptionConfigured={state.transcriptionConfigured}
            micConfigured={state.micConfigured}
            transcriptionProvider={state.transcriptionProvider}
            onNext={() => handleNext("usage-mode")}
            onBack={() => handleBack("mic-setup")}
            onSkip={() => handleNext("usage-mode")}
          />
        );

      case "test-keypoint":
        return (
          <TestKeypointScreen
            transcriptionConfigured={state.transcriptionConfigured}
            paraphrasingConfigured={state.paraphrasingConfigured}
            micConfigured={state.micConfigured}
            onBack={() => handleBack("test-smart-verses")}
            onSkip={() => handleNext("test-smart-verses")}
          />
        );

      case "additional-features":
        return (
          <AdditionalFeaturesScreen
            smartTimersEnabled={state.smartTimersEnabled}
            smartSlidesEnabled={state.smartSlidesEnabled}
            recorderEnabled={state.recorderEnabled}
            liveTestimoniesEnabled={state.liveTestimoniesEnabled}
            onToggle={(feature, enabled) => {
              updateState({ [feature]: enabled });
            }}
            onFinish={handleFinish}
            onBack={() => {
              // Go back to standalone setup if standalone mode, otherwise usage mode
              if (state.usageMode === "standalone") {
                handleBack("standalone-setup");
              } else if (state.usageMode === "propresenter") {
                handleBack("propresenter-test");
              } else {
                handleBack("usage-mode");
              }
            }}
            onSkip={handleSkip}
          />
        );

      case "propresenter-setup-slide":
        return (
          <ProPresenterSetupSlideScreen
            onNext={() => handleNext("propresenter-link-files")}
            onBack={() => handleBack("usage-mode")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "propresenter-link-files":
        return (
          <ProPresenterLinkFilesScreen
            onNext={() => handleNext("propresenter-enable-network")}
            onBack={() => handleBack("propresenter-setup-slide")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "propresenter-enable-network":
        return (
          <ProPresenterEnableNetworkScreen
            onNext={() => handleNext("propresenter-connection")}
            onBack={() => handleBack("propresenter-link-files")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "propresenter-connection":
        return (
          <ProPresenterConnectionScreen
            onNext={() => handleNext("propresenter-slide-setup")}
            onBack={() => handleBack("propresenter-enable-network")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "propresenter-slide-setup":
        return (
          <ProPresenterSlideSetupScreen
            onNext={() => handleNext("propresenter-test")}
            onBack={() => handleBack("propresenter-connection")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      case "propresenter-test":
        return (
          <ProPresenterTestScreen
            onNext={() => handleNext("additional-features")}
            onBack={() => handleBack("propresenter-slide-setup")}
            onSkip={() => handleNext("additional-features")}
          />
        );

      default:
        return (
          <div className="onboarding-error">
            <p>Unknown screen: {state.currentScreen}</p>
            <button onClick={() => goToScreen("welcome")}>Start Over</button>
          </div>
        );
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">{renderScreen()}</div>
    </div>
  );
};

export default OnboardingWizard;

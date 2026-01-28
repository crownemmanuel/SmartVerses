/**
 * Types for onboarding wizard
 */

export type OnboardingScreen =
  | "welcome"
  | "usage-mode"
  | "standalone-setup"
  | "smart-verses-intro"
  | "transcription-provider"
  | "assemblyai-setup"
  | "groq-setup"
  | "offline-model-setup"
  | "paraphrasing-setup"
  | "mic-setup"
  | "test-smart-verses"
  | "test-keypoint"
  | "propresenter-setup-slide"
  | "propresenter-link-files"
  | "propresenter-enable-network"
  | "propresenter-connection"
  | "propresenter-slide-setup"
  | "propresenter-test"
  | "additional-features";

export interface OnboardingState {
  // Current screen
  currentScreen: OnboardingScreen;

  // Usage mode
  usageMode?: "propresenter" | "standalone";

  // Standalone configuration
  audienceScreenEnabled: boolean;
  selectedMonitorIndex: number | null;
  autoTriggerScriptures: boolean;

  // Feature enablement
  smartVersesEnabled: boolean;

  // Configuration flags
  transcriptionConfigured: boolean;
  paraphrasingConfigured: boolean;
  micConfigured: boolean;

  // Provider selections
  transcriptionProvider?: "assemblyai" | "groq" | "offline-whisper" | "offline-moonshine";
  paraphrasingProvider?: "openai" | "gemini" | "groq";

  // API Keys
  assemblyAIKey?: string;
  groqKey?: string;

  // Microphone
  selectedMicId?: string;

  // Additional features
  smartTimersEnabled: boolean;
  smartSlidesEnabled: boolean;
  recorderEnabled: boolean;
  liveTestimoniesEnabled: boolean;

  // Completion
  completed: boolean;
  completedAt?: number;
  skipped: boolean;
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  currentScreen: "welcome",
  audienceScreenEnabled: false,
  selectedMonitorIndex: null,
  autoTriggerScriptures: false,
  smartVersesEnabled: true,
  transcriptionConfigured: false,
  paraphrasingConfigured: false,
  micConfigured: false,
  smartTimersEnabled: false,
  smartSlidesEnabled: false,
  recorderEnabled: false,
  liveTestimoniesEnabled: false,
  completed: false,
  skipped: false,
};

export const ONBOARDING_STORAGE_KEY = "proassist-onboarding-state";

/**
 * Load onboarding state from localStorage
 */
export function loadOnboardingState(): OnboardingState {
  try {
    const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_ONBOARDING_STATE, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error("Failed to load onboarding state:", error);
  }
  return { ...DEFAULT_ONBOARDING_STATE };
}

/**
 * Save onboarding state to localStorage
 */
export function saveOnboardingState(state: OnboardingState): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save onboarding state:", error);
  }
}

/**
 * Check if onboarding has been completed
 */
export function isOnboardingCompleted(): boolean {
  const state = loadOnboardingState();
  return state.completed || state.skipped;
}

/**
 * Mark onboarding as completed
 */
export function markOnboardingCompleted(): void {
  const state = loadOnboardingState();
  state.completed = true;
  state.completedAt = Date.now();
  saveOnboardingState(state);
}

/**
 * Mark onboarding as skipped
 */
export function markOnboardingSkipped(): void {
  const state = loadOnboardingState();
  state.skipped = true;
  state.completed = false;
  saveOnboardingState(state);
}

/**
 * Reset onboarding state (for testing or re-onboarding)
 */
export function resetOnboardingState(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

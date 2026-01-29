import { AppSettings, AIProvider } from "../types";

const APP_SETTINGS_KEY = "proassist_app_settings";

// Default settings if nothing is found in localStorage
const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "dark", // Default to dark theme
  openAIConfig: undefined,
  geminiConfig: undefined,
  groqConfig: undefined,
  defaultAIProvider: null,
  defaultAIModel: undefined,
};

/**
 * Retrieves AppSettings from localStorage.
 * If no settings are found, returns default settings.
 */
export const getAppSettings = (): AppSettings => {
  try {
    const storedSettings = localStorage.getItem(APP_SETTINGS_KEY);
    if (storedSettings) {
      const parsedSettings = JSON.parse(storedSettings) as AppSettings;
      // Basic validation or migration could be added here if settings structure changes
      return { ...DEFAULT_APP_SETTINGS, ...parsedSettings };
    }
  } catch (error) {
    console.error("Error reading app settings from localStorage:", error);
    // Fallback to defaults in case of parsing error
  }
  return DEFAULT_APP_SETTINGS;
};

/**
 * Saves AppSettings to localStorage.
 * @param settings The AppSettings object to save.
 */
export const saveAppSettings = (settings: AppSettings): void => {
  try {
    const settingsToSave = JSON.stringify(settings);
    localStorage.setItem(APP_SETTINGS_KEY, settingsToSave);
  } catch (error) {
    console.error("Error saving app settings to localStorage:", error);
  }
};

// Helper functions to update specific parts of the settings might be useful later

/**
 * Updates the OpenAI API key in AppSettings.
 */
export const updateOpenAIKey = (apiKey: string): AppSettings => {
  const currentSettings = getAppSettings();
  const newSettings: AppSettings = {
    ...currentSettings,
    openAIConfig: { apiKey },
  };
  saveAppSettings(newSettings);
  return newSettings;
};

/**
 * Updates the Gemini API key in AppSettings.
 */
export const updateGeminiKey = (apiKey: string): AppSettings => {
  const currentSettings = getAppSettings();
  const newSettings: AppSettings = {
    ...currentSettings,
    geminiConfig: { apiKey },
  };
  saveAppSettings(newSettings);
  return newSettings;
};

/**
 * Updates the Groq API key in AppSettings.
 */
export const updateGroqKey = (apiKey: string): AppSettings => {
  const currentSettings = getAppSettings();
  const newSettings: AppSettings = {
    ...currentSettings,
    groqConfig: { apiKey },
  };
  saveAppSettings(newSettings);
  return newSettings;
};

/**
 * Updates the default AI provider in AppSettings.
 */
export const updateDefaultAIProvider = (provider: AIProvider): AppSettings => {
  const currentSettings = getAppSettings();
  const newSettings: AppSettings = {
    ...currentSettings,
    defaultAIProvider: provider,
  };
  saveAppSettings(newSettings);
  return newSettings;
};

/**
 * Updates the theme in AppSettings.
 */
export const updateTheme = (theme: "light" | "dark"): AppSettings => {
  const currentSettings = getAppSettings();
  const newSettings: AppSettings = {
    ...currentSettings,
    theme,
  };
  saveAppSettings(newSettings);
  document.documentElement.setAttribute("data-theme", theme);
  return newSettings;
};

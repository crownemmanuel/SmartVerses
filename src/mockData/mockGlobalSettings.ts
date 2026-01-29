import { AppSettings } from "../types";

// This is a mock for global application settings.
// In a real app, these would likely be loaded from localStorage or a config file.
export const mockAppSettings: AppSettings = {
  theme: "dark", // Default theme
  // Templates are managed by SettingsPage and stored separately, not here.
  // openAIAPIKey: "sk-yourOpenAIKey", // Example, manage securely
  // geminiAPIKey: "yourGeminiAPIKey", // Example, manage securely
  // defaultAIProvider: "openai", // Example
  openAIConfig: undefined, // Initially no keys
  geminiConfig: undefined,
  defaultAIProvider: null,
  defaultAIModel: undefined,
};

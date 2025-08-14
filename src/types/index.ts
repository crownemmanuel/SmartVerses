export type LayoutType =
  | "one-line"
  | "two-line"
  | "three-line"
  | "four-line"
  | "five-line"
  | "six-line";

export type TemplateType = "text" | "image" | "video";

// Define AI Provider and Model Types
export type AIProviderType = "openai" | "gemini";

export const OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
] as const;
export type OpenAIModelType = (typeof OPENAI_MODELS)[number];

export const GEMINI_MODELS = [
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash-latest",
  "gemini-1.0-pro", // Older, but might be preferred for cost/legacy
] as const;
export type GeminiModelType = (typeof GEMINI_MODELS)[number];

export interface Slide {
  id: string;
  text: string; // Can be multi-line, actual rendering will depend on layout
  layout: LayoutType;
  order: number; // To maintain order within a playlist item
}

export interface PlaylistItem {
  // This seems to represent a collection of slides generated from one import/template application
  id: string;
  title: string; // Derived from import or manually set
  templateName: string;
  templateColor: string; // From the template used
  slides: Slide[];
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[]; // A playlist contains multiple "PlaylistItems" which are groups of slides
}

export interface Template {
  id: string;
  name: string;
  color: string;
  type: TemplateType;
  logic?: string; // Could be a path to a script, regex, or other rules
  availableLayouts: LayoutType[];
  aiPrompt?: string; // User-defined prompt for AI processing
  processWithAI?: boolean; // If true, use AI for slide generation
  aiProvider?: AIProviderType; // Specify AI provider for this template
  aiModel?: OpenAIModelType | GeminiModelType | string; // Specify AI model for this template (string for flexibility if new models added)
  outputPath: string;
  outputFileNamePrefix: string;
}

export interface ProPresenterSettings {
  timerOutputPath: string;
  timerFileName: string;
  timerFormat?: "mm:ss" | "h:mm:ss";
  warnThresholdSeconds?: number;
}

export interface AppSettings {
  theme: "light" | "dark";
  openAIConfig?: AIServiceConfig; // Stores API key for OpenAI
  geminiConfig?: AIServiceConfig; // Stores API key for Gemini
  defaultAIProvider?: AIProvider; // User's preferred default AI if multiple are configured
  proPresenter?: ProPresenterSettings;
  // Other global settings can be added here
}

export interface ProPresenterData {
  liveSlideText: string;
  // Potentially other fields ProPresenter needs
}

export type AIProvider = "openai" | "gemini" | null;

export interface AIServiceConfig {
  // provider: AIProvider; // Redundant if keys are specific e.g. openAIAPIKey
  apiKey: string;
}

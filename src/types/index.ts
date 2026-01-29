export type LayoutType =
  | "one-line"
  | "two-line"
  | "three-line"
  | "four-line"
  | "five-line"
  | "six-line";

export type TemplateType = "text" | "image" | "video";

// Define AI Provider and Model Types
export type AIProviderType = "openai" | "gemini" | "groq";

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

export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
] as const;
export type GroqModelType = (typeof GROQ_MODELS)[number];

export interface Slide {
  id: string;
  text: string; // Can be multi-line, actual rendering will depend on layout
  layout: LayoutType;
  order: number; // To maintain order within a playlist item
  isAutoScripture?: boolean; // True if this slide was auto-generated from detected scripture reference
  timerSessionIndex?: number; // Index of schedule session to trigger when going live (from Stage Assist timer tab)
  proPresenterActivation?: {
    presentationUuid: string;
    slideIndex: number;
    presentationName?: string;
    activationClicks?: number; // Per-slide override for activation clicks
    takeOffClicks?: number; // Per-slide override for take off clicks
  }; // Per-slide override for ProPresenter presentation activation
}

export interface PlaylistItem {
  // This seems to represent a collection of slides generated from one import/template application
  id: string;
  title: string; // Derived from import or manually set
  templateName: string;
  templateColor: string; // From the template used
  slides: Slide[];
  /**
   * Live Slides integration (optional):
   * When set, this playlist item is backed by a Live Slides session and can update in real-time.
   */
  liveSlidesSessionId?: string;
  liveSlidesLinked?: boolean; // default true when liveSlidesSessionId is set
  /**
   * Persisted copy of the session's raw_text so sessions can be resumed after app restart.
   * This is the canonical serialization for Live Slides (blank line = new slide).
   */
  liveSlidesCachedRawText?: string;
  /**
   * Default ProPresenter presentation activation config for all slides in this item.
   * Individual slides can override this with their own proPresenterActivation property.
   */
  defaultProPresenterActivation?: {
    presentationUuid: string;
    slideIndex: number;
    presentationName?: string;
    activationClicks?: number; // Per-item override for activation clicks
    takeOffClicks?: number; // Per-item override for take off clicks
  };
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[]; // A playlist contains multiple "PlaylistItems" which are groups of slides
}

export interface Template {
  id: string;
  name: string;
  icon?: string;
  color: string;
  type: TemplateType;
  processingType: "simple" | "regex" | "javascript" | "ai";
  logic: string; // Could be a path to a script, regex, or other rules
  availableLayouts: LayoutType[];
  aiPrompt?: string; // User-defined prompt for AI processing
  aiProvider?: AIProviderType; // Specify AI provider for this template
  aiModel?: OpenAIModelType | GeminiModelType | GroqModelType | string; // Specify AI model for this template (string for flexibility if new models added)
  processWithAI?: boolean; // Whether to process text using AI for this template
  outputPath: string;
  outputFileNamePrefix: string;
  // Auto-scripture output mapping
  scriptureReferenceFileIndex?: number; // Which file index (1-6) to write scripture reference to
  scriptureTextFileIndex?: number; // Which file index (1-6) to write scripture text to
  // ProPresenter activation settings
  proPresenterActivation?: {
    presentationUuid: string;
    slideIndex: number;
    presentationName?: string;
  }; // ProPresenter presentation activation config for this template
  proPresenterConnectionIds?: string[]; // Specific ProPresenter connection IDs to trigger on (empty = all enabled)
  proPresenterActivationClicks?: number; // Number of times to trigger on "Go Live" (default: 1) - for animations
  proPresenterTakeOffClicks?: number; // Number of times to trigger on "Take Off" (default: 1) - for exit animations
  clearTextAfterLive?: boolean; // Whether to clear text files after going live
  clearTextDelay?: number; // Delay in milliseconds before clearing text (default: 0)
  autoLoadBibleVerses?: boolean; // Whether to auto-load Bible verses (KJV) by default when importing with this template
}

export interface AIModelSetting {
  provider: AIProviderType;
  model: string;
}

export interface AppSettings {
  theme: "light" | "dark";
  openAIConfig?: AIServiceConfig; // Stores API key for OpenAI
  geminiConfig?: AIServiceConfig; // Stores API key for Gemini
  groqConfig?: AIServiceConfig; // Stores API key for Groq
  defaultAIProvider?: AIProvider; // User's preferred default AI if multiple are configured
  defaultAIModel?: string; // Model for the default AI provider
  // AI Model settings for specific features
  spellCheckModel?: AIModelSetting; // Provider and model for spell checking
  timerAssistantModel?: AIModelSetting; // Provider and model for timer AI assistant
  globalAssistantModel?: AIModelSetting; // Provider and model for global AI chat assistant
  // Other global settings can be added here
}

export interface ProPresenterData {
  liveSlideText: string;
  // Potentially other fields ProPresenter needs
}

export type AIProvider = "openai" | "gemini" | "groq" | null;

export interface AIServiceConfig {
  // provider: AIProvider; // Redundant if keys are specific e.g. openAIAPIKey
  apiKey: string;
}

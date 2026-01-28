/**
 * Global Chat Assistant Types
 * 
 * Types for the comprehensive AI chat assistant that can control
 * both the ProAssist app and ProPresenter directly.
 */

import { LayoutType } from "./index";
import { ScheduleItem, SmartAutomationRule } from "./propresenter";

// ============================================
// Chat Message Types
// ============================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  image?: string; // Base64 image for vision requests
  actions?: ExecutedAction[]; // Actions that were executed
  isLoading?: boolean;
}

export interface ExecutedAction {
  type: "internal" | "propresenter";
  action: string;
  success: boolean;
  message?: string;
}

// ============================================
// ProPresenter AI Template Types
// ============================================

export type ProPresenterAITemplateUseCase =
  | "lower-third"
  | "prayer"
  | "scripture"
  | "announcement"
  | "points-3line"
  | "points-6line"
  | "custom";

export interface ProPresenterAITemplate {
  id: string;
  name: string;
  description: string; // AI uses this to select appropriate template
  useCase: ProPresenterAITemplateUseCase;
  maxLines: number; // Maximum lines/files this template supports (1-6)
  outputPath: string; // Folder path where files are written (e.g., /Users/you/ProPresenter/)
  outputFileNamePrefix: string; // Prefix for file names (e.g., "verse_" creates verse_1.txt, verse_2.txt)
  presentationUuid: string; // ProPresenter presentation UUID to trigger
  slideIndex: number; // Slide index within the presentation
  activationClicks?: number; // Number of times to trigger the presentation (default: 1, use multiple for animations)
  connectionIds?: string[]; // Specific ProPresenter connections (empty = all enabled)
}

// ============================================
// Global Templates (Reusable ProPresenter Activations)
// ============================================

/**
 * Global Template - A reusable ProPresenter activation configuration
 * that can be selected from a dropdown anywhere ProPresenter triggers are used.
 * This saves users from repeatedly configuring the same presentation/slide.
 */
export interface GlobalTemplate {
  id: string;
  name: string; // User-friendly name (e.g., "Main Lower Third", "Prayer Overlay")
  description?: string; // Optional description for clarity
  presentationUuid: string; // ProPresenter presentation UUID
  presentationName?: string; // Human-readable presentation name (cached from ProPresenter)
  slideIndex: number; // Slide index within the presentation
  activationClicks?: number; // Number of times to trigger on "Go Live" (default: 1)
  takeOffClicks?: number; // Number of times to trigger on "Take Off" (default: 0 = don't trigger)
  connectionIds?: string[]; // Specific ProPresenter connection IDs (empty = all enabled)
  createdAt: number; // Timestamp for sorting/display
  updatedAt: number; // Timestamp for tracking changes
}

// ============================================
// AI Context Types
// ============================================

export interface AIAssistantContext {
  // App state
  currentPage: "main" | "stageAssist" | "liveSlides" | "media" | "smartVerses" | "settings" | "help";

  // Available templates (for slide creation)
  availableTemplates: Array<{
    id: string;
    name: string;
    processingType: "simple" | "regex" | "javascript" | "ai";
    availableLayouts: LayoutType[];
  }>;

  // Current playlist context
  currentPlaylist?: {
    id: string;
    name: string;
    itemCount: number;
  };

  // Current slides context (the slides of the currently selected playlist item)
  currentSlides?: Array<{
    id: string;
    text: string;
    layout: string;
    order: number;
    isAutoScripture?: boolean;
  }>;

  // Timer/Schedule context
  currentSchedule?: ScheduleItem[];
  smartAutomations?: SmartAutomationRule[];

  // ProPresenter state
  proPresenter: {
    isConnected: boolean;
    connections: Array<{
      id: string;
      name: string;
      isEnabled: boolean;
    }>;
    aiTemplates: ProPresenterAITemplate[];
  };

  // Available actions summary
  availableActions: string[];
}

// ============================================
// AI Action Types
// ============================================

export type AIActionType =
  | "none"
  | "createSlides"
  | "createPlaylist"
  | "addToPlaylist"
  | "setTimer"
  | "stopTimer"
  | "updateSchedule"
  | "updateCurrentSlides"
  | "triggerSlide"
  | "triggerNextSlide"
  | "triggerPreviousSlide"
  | "changeStageLayout"
  | "displayMessage"
  | "clearMessage"
  | "displayWithAITemplate"
  | "triggerMacro"
  | "triggerLook"
  | "clearLayer"
  | "clearAll"
  | "setProPresenterTimer";

export interface CreateSlidesParams {
  text: string;
  templateId?: string; // AI can auto-select if not provided
  templateName?: string; // Alternative: match by name
  addToPlaylist?: boolean;
  playlistName?: string;
}

export interface CreatePlaylistParams {
  name: string;
  items?: Array<{ text: string; templateId: string }>;
}

export interface SetTimerParams {
  type: "countdown" | "countdownToTime";
  value: number | string; // seconds for countdown, "HH:MM AM/PM" for countdownToTime
  sessionName?: string;
}

export interface TriggerSlideParams {
  presentationUuid: string;
  slideIndex: number;
}

export interface ChangeStageLayoutParams {
  screenIndex: number;
  layoutIndex: number;
}

export interface DisplayMessageParams {
  messageId: string;
  tokens?: Record<string, string>;
}

export interface DisplayWithAITemplateParams {
  templateId: string;
  text: string;
  reference?: string;
}

export interface SetProPresenterTimerParams {
  timerId: string | number;
  operation: "start" | "stop" | "reset";
  duration?: number;
  name?: string;
}

export interface ClearLayerParams {
  layer: "audio" | "props" | "messages" | "announcements" | "slide" | "media" | "video_input";
}

export interface UpdateCurrentSlidesParams {
  slides: Array<{
    id: string;
    text: string;
    layout?: string;
    order: number;
    isAutoScripture?: boolean;
  }>;
}

export interface SlideNavigationParams {
  count?: number; // Number of times to trigger (default: 1)
}

// ============================================
// AI Response Types
// ============================================

export interface InternalAction {
  type: "createSlides" | "createPlaylist" | "addToPlaylist" | "setTimer" | "stopTimer" | "updateSchedule" | "updateCurrentSlides";
  params?: CreateSlidesParams | CreatePlaylistParams | SetTimerParams | ScheduleItem[] | UpdateCurrentSlidesParams;
}

export interface ProPresenterAction {
  type:
    | "triggerSlide"
    | "triggerNextSlide"
    | "triggerPreviousSlide"
    | "changeStageLayout"
    | "displayMessage"
    | "clearMessage"
    | "displayWithAITemplate"
    | "triggerMacro"
    | "triggerLook"
    | "clearLayer"
    | "clearAll"
    | "setProPresenterTimer";
  params?:
    | TriggerSlideParams
    | SlideNavigationParams
    | ChangeStageLayoutParams
    | DisplayMessageParams
    | DisplayWithAITemplateParams
    | SetProPresenterTimerParams
    | ClearLayerParams
    | { macroId: string }
    | { lookId: string }
    | { messageId: string };
}

export interface GlobalAIResponse {
  action: "internal" | "propresenter" | "combined" | "none";
  internalAction?: InternalAction;
  propresenterAction?: ProPresenterAction;
  responseText: string;
}

// ============================================
// Chat Settings Types
// ============================================

export interface GlobalChatSettings {
  enabled: boolean;
  customSystemPrompt?: string;
  autoExpandOnMessage?: boolean;
}

// ============================================
// Chat State Types
// ============================================

export interface GlobalChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
}

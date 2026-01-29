// Live Slides Types - matching Rust backend types

export interface LiveSlideItem {
  text: string;
  is_sub_item: boolean;
}

export interface LiveSlide {
  items: LiveSlideItem[];
  color: string;
}

export interface LiveSlideSession {
  id: string;
  name: string;
  slides: LiveSlide[];
  raw_text: string;
  created_at: number;
}

export interface LiveSlidesState {
  sessions: Record<string, LiveSlideSession>;
  server_running: boolean;
  server_port: number;
  local_ip: string;
}

// WebSocket message types
export type WsMessageType =
  | "text_update"
  | "join_session"
  | "slides_update"
  | "session_created"
  | "session_deleted"
  | "transcription_stream"
  | "error";

export interface WsTextUpdate {
  type: "text_update";
  session_id: string;
  text: string;
}

export interface WsJoinSession {
  type: "join_session";
  session_id: string;
  client_type: "notepad" | "viewer";
}

export interface WsSlidesUpdate {
  type: "slides_update";
  session_id: string;
  slides: LiveSlide[];
  raw_text: string;
}

export interface WsSessionCreated {
  type: "session_created";
  session: LiveSlideSession;
}

export interface WsSessionDeleted {
  type: "session_deleted";
  session_id: string;
}

export interface WsError {
  type: "error";
  message: string;
}

export type TranscriptionStreamKind = "interim" | "final";

export interface WsTranscriptionStream {
  type: "transcription_stream";
  kind: TranscriptionStreamKind;
  timestamp: number;
  engine: string;
  text: string;
  audio_level?: number;
  segment?: {
    id: string;
    text: string;
    timestamp: number;
    isFinal: boolean;
  };
  scripture_references?: string[];
  key_points?: Array<{
    text: string;
    category: string;
  }>;
  paraphrased_verses?: Array<{
    reference: string;
    confidence: number;
    matchedPhrase: string;
  }>;
}

export type WsMessage =
  | WsTextUpdate
  | WsJoinSession
  | WsSlidesUpdate
  | WsSessionCreated
  | WsSessionDeleted
  | WsTranscriptionStream
  | WsError;

// Settings types
export interface LiveSlidesSettings {
  serverPort: number;
  autoStartServer: boolean;
  outputPath: string;
  outputFilePrefix: string;
  /**
   * ProPresenter activation rules by slide line-count.
   * - `lineCount: 1` applies to one-line slides
   * - `lineCount: 2` applies to two-line slides, etc.
   * - `lineCount: 0` is a catch-all fallback (applies to any line-count if no exact match exists)
   */
  proPresenterActivationRules?: LiveSlidesProPresenterActivationRule[];
  /**
   * Legacy single activation config (pre-rules). Kept for backwards-compat + migration.
   * New code should prefer `proPresenterActivationRules`.
   */
  proPresenterActivation?: LiveSlidesProPresenterConfig;
}

export interface LiveSlidesProPresenterConfig {
  presentationUuid: string;
  slideIndex: number;
  presentationName?: string;
  activationClicks: number; // Number of clicks when going live (default: 1)
  takeOffClicks: number; // Number of clicks when taking off (default: 0)
  clearTextFileOnTakeOff?: boolean; // Whether to clear text files on take off
}

export interface LiveSlidesProPresenterActivationRule {
  id: string;
  lineCount: number; // 0 = any, 1..6 = exact match
  // Where to read slide index from when clicking "Get Slide" (optional convenience).
  sourceConnectionId?: string;
  // The ProPresenter target for this rule (optional until captured).
  presentationUuid?: string;
  slideIndex?: number;
  presentationName?: string;
  activationClicks: number;
  takeOffClicks: number;
  clearTextFileOnTakeOff?: boolean;
}

// Default settings
export const DEFAULT_LIVE_SLIDES_SETTINGS: LiveSlidesSettings = {
  serverPort: 9876,
  autoStartServer: false,
  outputPath: "~/Documents/SmartVerses/Templates/LiveSlides",
  outputFilePrefix: "live_slide_",
};

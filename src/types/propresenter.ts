// ProPresenter connection and timer types

export interface ProPresenterConnection {
  id: string;
  name: string;
  apiUrl: string;
  timerIndex: number;
  isEnabled: boolean;
}

export interface ProPresenterTimerPayload {
  id: {
    name: string;
    index: number;
    uuid: string;
  };
  allows_overrun: boolean;
  countdown?: {
    duration: number;
  };
  count_down_to_time?: {
    time_of_day: number;
    period: string;
  };
}

export interface ProPresenterTimerResponse {
  id: {
    name: string;
    index: number;
    uuid: string;
  };
  allows_overrun: boolean;
  countdown?: {
    duration: number;
  };
}

export interface ProPresenterSlidePayload {
  presentation_uuid?: string;
  slide_index?: number;
}

export interface ProPresenterVersionResponse {
  name: string;
  platform: string;
  os_version: string;
  version: string;
  host_description: string;
  api_version?: string; // Optional, may be present in some API versions
}

// ProPresenter Presentation Activation Types
export interface ProPresenterPresentationId {
  uuid: string;
  name: string;
  index: number;
}

export interface ProPresenterPresentationIndex {
  index: number;
  presentation_id: ProPresenterPresentationId;
}

export interface ProPresenterSlideIndexResponse {
  presentation_index: ProPresenterPresentationIndex;
}

export interface ProPresenterActivationConfig {
  presentationUuid: string;
  slideIndex: number;
  presentationName?: string;
  activationClicks?: number; // Per-slide override for activation clicks (default: use template)
  takeOffClicks?: number; // Per-slide override for take off clicks (default: use template)
}

// Stage Assist Schedule Types
export interface ScheduleItem {
  id: number;
  session: string;
  startTime: string;
  endTime: string;
  duration: string;
  minister?: string;
  automations?: ScheduleItemAutomation[]; // Optional ProPresenter automations on start (can run multiple)
  automation?: ScheduleItemAutomation; // Legacy single-automation field (auto-migrated on load)
}

export interface TimerState {
  isRunning: boolean;
  timeLeft: number;
  sessionName?: string;
  endTime?: string;
  isOverrun?: boolean;
}

export type Period = "AM" | "PM";

export type TimeAdjustmentMode = "NONE" | "EARLY_END" | "OVERRUN" | "BOTH";

export type HttpAutomationMethod = "GET" | "POST" | "PUT" | "DELETE";

// AI Schedule parsing response
export interface AIScheduleResponse {
  action: "none" | "SetCountDown" | "CountDownToTime" | "UpdateSchedule";
  actionValue?: number | string | ScheduleItem[];
  responseText: string;
}

// Stage screen and layout types
export interface ProPresenterStageScreen {
  uuid: string;
  name: string;
  index: number;
}

export interface ProPresenterStageLayout {
  id: {
    uuid: string;
    name: string;
    index: number;
  };
}

// Schedule item automation configuration - discriminated union
export type ScheduleItemAutomation =
  | {
      type: "slide";
      presentationUuid: string;
      slideIndex: number;
      presentationName?: string;
      activationClicks?: number; // Number of clicks when starting (default: 1)
    }
  | {
      type: "stageLayout";
      screenUuid: string;
      screenName?: string;
      screenIndex: number;
      layoutUuid: string;
      layoutName?: string;
      layoutIndex: number;
    }
  // Recording automations
  | { type: "startVideoRecording" }
  | { type: "stopVideoRecording" }
  | { type: "startAudioRecording" }
  | { type: "stopAudioRecording" }
  | { type: "startBothRecording" }  // Start both video and audio
  | { type: "stopBothRecording" }  // Stop both video and audio
  // MIDI automations
  | {
      type: "midi";
      deviceId: string;
      deviceName?: string;
      channel: number; // 1-16
      note: number; // 0-127
      velocity?: number; // 0-127 (default: 127)
    }
  | {
      type: "http";
      method: HttpAutomationMethod;
      url: string;
      payload?: string; // JSON payload as string (validated before save)
    };

// Smart automation rule - trigger based on session name matching
export interface SmartAutomationRule {
  id: string;
  sessionNamePattern: string; // The session name to match (case-insensitive)
  isExactMatch: boolean; // True for exact match, false for contains match
  automations: ScheduleItemAutomation[];
  automation?: ScheduleItemAutomation; // Legacy single-automation field (auto-migrated on load)
  createdAt: number;
}

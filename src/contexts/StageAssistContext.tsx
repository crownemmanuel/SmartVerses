import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ScheduleItem, TimerState, TimeAdjustmentMode, ScheduleItemAutomation } from "../types/propresenter";
import { startTimerOnAllEnabled, stopTimerOnAllEnabled } from "../services/propresenterService";
import { saveDisplayTimerState } from "../services/displayService";
import { loadNetworkSyncSettings, networkSyncManager } from "../services/networkSyncService";
import { mergeScheduleWithLocalAutomations, stripScheduleAutomations } from "../utils/scheduleSync";

// Storage keys
const SCHEDULE_STORAGE_KEY = "proassist-stage-assist-schedule";
const SETTINGS_STORAGE_KEY = "proassist-stage-assist-settings";
const RUNTIME_STORAGE_KEY = "proassist-stage-assist-runtime";

// Recording automation types
const RECORDING_AUTOMATION_TYPES = [
  "startVideoRecording",
  "stopVideoRecording",
  "startAudioRecording",
  "stopAudioRecording",
  "startBothRecording",
  "stopBothRecording",
] as const;

function normalizeAutomation(raw: any): ScheduleItemAutomation | null {
  if (!raw || typeof raw !== "object") return null;

  // already in the new shape
  if (
    raw.type === "slide" ||
    raw.type === "stageLayout" ||
    raw.type === "midi" ||
    raw.type === "http"
  ) {
    return raw as ScheduleItemAutomation;
  }

  // Recording automation types
  if (RECORDING_AUTOMATION_TYPES.includes(raw.type)) {
    return { type: raw.type } as ScheduleItemAutomation;
  }

  // legacy slide automation (no `type`)
  if (typeof raw.presentationUuid === "string" && typeof raw.slideIndex === "number") {
    return {
      type: "slide",
      presentationUuid: raw.presentationUuid,
      slideIndex: raw.slideIndex,
      presentationName: raw.presentationName,
      activationClicks: raw.activationClicks,
    };
  }

  // legacy stage layout automation (unlikely, but safe)
  if (typeof raw.screenIndex === "number" && typeof raw.layoutIndex === "number") {
    return {
      type: "stageLayout",
      screenUuid: raw.screenUuid ?? "",
      screenName: raw.screenName,
      screenIndex: raw.screenIndex,
      layoutUuid: raw.layoutUuid ?? "",
      layoutName: raw.layoutName,
      layoutIndex: raw.layoutIndex,
    };
  }

  return null;
}

function normalizeItemAutomations(item: any): ScheduleItemAutomation[] {
  const list: ScheduleItemAutomation[] = [];

  if (Array.isArray(item?.automations)) {
    for (const a of item.automations) {
      const normalized = normalizeAutomation(a);
      if (normalized) list.push(normalized);
    }
  } else if (item?.automation) {
    const normalized = normalizeAutomation(item.automation);
    if (normalized) list.push(normalized);
  }

  // ensure unique by type (one of each type max)
  const byType = new Map<ScheduleItemAutomation["type"], ScheduleItemAutomation>();
  for (const a of list) byType.set(a.type, a);
  return Array.from(byType.values());
}

// Helper to dispatch recording automation events
function dispatchRecordingAutomation(automationType: ScheduleItemAutomation["type"]): void {
  const eventMap: Record<string, string> = {
    startVideoRecording: "automation-start-video-recording",
    stopVideoRecording: "automation-stop-video-recording",
    startAudioRecording: "automation-start-audio-recording",
    stopAudioRecording: "automation-stop-audio-recording",
    startBothRecording: "automation-start-both-recording",
    stopBothRecording: "automation-stop-both-recording",
  };

  const eventName = eventMap[automationType];
  if (eventName) {
    console.log(`[Automation] Dispatching ${eventName}`);
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

function normalizeSchedule(rawSchedule: any): ScheduleItem[] {
  if (!Array.isArray(rawSchedule)) return defaultSchedule;
  return rawSchedule.map((item: any) => {
    const automations = normalizeItemAutomations(item);
    const normalized: ScheduleItem = {
      id: item.id,
      session: item.session,
      startTime: item.startTime,
      endTime: item.endTime,
      duration: item.duration,
      minister: item.minister,
      automations: automations.length > 0 ? automations : undefined,
    };
    return normalized;
  });
}

export interface StageAssistSettings {
  timeAdjustmentMode: TimeAdjustmentMode;
  useDurations: boolean;
  isAutoPlay: boolean;
  isAllowOverrun: boolean;
  triggerOnce: boolean; // When true, each timer can only be triggered once per session until reset
}

const defaultSchedule: ScheduleItem[] = [
  {
    id: 1,
    session: "Opening Prayer",
    startTime: "10:30 AM",
    endTime: "10:32 AM",
    duration: "02mins",
  },
  {
    id: 2,
    session: "Worship & Praise",
    startTime: "10:32 AM",
    endTime: "10:45 AM",
    duration: "13mins",
    minister: "worship team",
  },
  {
    id: 3,
    session: "Call to Worship (Psalm 3)",
    startTime: "10:45 AM",
    endTime: "10:48 AM",
    duration: "03mins",
  },
];

const defaultSettings: StageAssistSettings = {
  timeAdjustmentMode: "NONE",
  useDurations: false,
  isAutoPlay: false,
  isAllowOverrun: false,
  triggerOnce: true, // Default: timers can only be triggered once per schedule item
};

export function formatStageAssistTime(seconds: number) {
  const isNegative = seconds < 0;
  const absoluteSeconds = Math.abs(seconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const remainingSeconds = absoluteSeconds % 60;
  return `${isNegative ? "-" : ""}${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function parseDurationToSeconds(durationStr: string): number {
  const minutes = parseInt(durationStr) || 0;
  return minutes * 60;
}

type StageAssistContextValue = {
  // persisted user data
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  settings: StageAssistSettings;
  setSettings: React.Dispatch<React.SetStateAction<StageAssistSettings>>;

  // runtime state
  timerState: TimerState;
  setTimerState: React.Dispatch<React.SetStateAction<TimerState>>;
  currentSessionIndex: number | null;
  setCurrentSessionIndex: React.Dispatch<React.SetStateAction<number | null>>;

  // triggered sessions tracking (session IDs that have been triggered)
  triggeredSessions: Set<number>;
  markSessionTriggered: (sessionId: number) => void;
  resetTriggeredSessions: () => void;
  isSessionTriggered: (sessionId: number) => boolean;

  // countdown controls
  countdownHours: string;
  setCountdownHours: React.Dispatch<React.SetStateAction<string>>;
  countdownMinutes: string;
  setCountdownMinutes: React.Dispatch<React.SetStateAction<string>>;
  countdownSeconds: string;
  setCountdownSeconds: React.Dispatch<React.SetStateAction<string>>;
  countdownToTime: string;
  setCountdownToTime: React.Dispatch<React.SetStateAction<string>>;
  countdownToPeriod: "AM" | "PM";
  setCountdownToPeriod: React.Dispatch<React.SetStateAction<"AM" | "PM">>;

  // actions
  startSession: (index: number) => Promise<{ success: number; failed: number; errors: string[] }>;
  startCountdown: (totalSeconds?: number) => Promise<{ success: number; failed: number; errors: string[] }>;
  startCountdownToTime: (
    time?: string,
    period?: "AM" | "PM"
  ) => Promise<{ success: number; failed: number; errors: string[] }>;
  stopTimer: () => Promise<{ success: number; failed: number }>;
  getNextSession: () => ScheduleItem | null;
  goNextSession: () => Promise<boolean>;
};

const StageAssistContext = createContext<StageAssistContextValue | null>(null);

export const StageAssistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [settings, setSettings] = useState<StageAssistSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [timerState, setTimerState] = useState<TimerState>({
    isRunning: false,
    timeLeft: 0,
    sessionName: "",
    endTime: "",
    isOverrun: false,
  });
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number | null>(null);

  // Keep refs to latest values for sync callbacks (avoids stale closures)
  const scheduleRef = useRef<ScheduleItem[]>([]);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const [countdownHours, setCountdownHours] = useState("0");
  const [countdownMinutes, setCountdownMinutes] = useState("5");
  const [countdownSeconds, setCountdownSeconds] = useState("0");
  const [countdownToTime, setCountdownToTime] = useState("7:30");
  const [countdownToPeriod, setCountdownToPeriod] = useState<"AM" | "PM">("PM");

  // Track which sessions have been triggered (by session ID)
  const [triggeredSessions, setTriggeredSessions] = useState<Set<number>>(new Set());

  // Load persisted schedule/settings on mount
  useEffect(() => {
    try {
      const savedSchedule = localStorage.getItem(SCHEDULE_STORAGE_KEY);
      if (savedSchedule) {
        const parsed = JSON.parse(savedSchedule);
        setSchedule(normalizeSchedule(parsed));
      } else {
        setSchedule(defaultSchedule);
      }
    } catch (error) {
      console.error("Error loading schedule from localStorage:", error);
      setSchedule(defaultSchedule);
    }

    try {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (error) {
      console.error("Error loading settings from localStorage:", error);
      // Keep default settings
    }

    // Mark settings as loaded after initial load
    setSettingsLoaded(true);

    // Restore runtime timer state so it survives navigation (and even app reload)
    const savedRuntime = localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (savedRuntime) {
      try {
        const parsed = JSON.parse(savedRuntime) as { timerState: TimerState; savedAt: number; currentSessionIndex: number | null };
        const elapsed = Math.floor((Date.now() - parsed.savedAt) / 1000);
        const restoredTimeLeft = parsed.timerState.isRunning ? parsed.timerState.timeLeft - elapsed : parsed.timerState.timeLeft;
        setTimerState({
          ...parsed.timerState,
          timeLeft: restoredTimeLeft,
          isOverrun: restoredTimeLeft < 0,
        });
        setCurrentSessionIndex(parsed.currentSessionIndex ?? null);
      } catch {
        // ignore
      }
    }
  }, []);

  // Persist schedule/settings
  useEffect(() => {
    if (schedule.length > 0) {
      try {
        localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
      } catch (error) {
        console.error("Error saving schedule to localStorage:", error);
      }
    }
  }, [schedule]);

  // Update schedule on server for remote viewing
  useEffect(() => {
    // Dynamically import to avoid issues if server is not running
    import("../services/scheduleService")
      .then(({ updateSchedule }) => {
        updateSchedule(schedule, currentSessionIndex);
      })
      .catch((error) => {
        // Silently fail if server is not running
        console.debug("Schedule service not available:", error);
      });
  }, [schedule, currentSessionIndex]);

  // Broadcast schedule changes to network sync
  const lastBroadcastRef = useRef<string>("");
  useEffect(() => {
    const syncSettings = loadNetworkSyncSettings();
    if (!syncSettings.syncSchedule || syncSettings.mode === "off" || syncSettings.mode === "slave") {
      return;
    }
    
    // Only broadcast if schedule actually changed (to avoid loops)
    const scheduleKey = JSON.stringify({ schedule: stripScheduleAutomations(schedule), currentSessionIndex });
    if (scheduleKey === lastBroadcastRef.current) return;
    lastBroadcastRef.current = scheduleKey;
    
    networkSyncManager
      .broadcastScheduleSync(stripScheduleAutomations(schedule), currentSessionIndex)
      .catch((error) => {
      console.debug("Failed to broadcast schedule sync:", error);
    });
  }, [schedule, currentSessionIndex]);

  // Track the last session index we triggered automations for (to avoid duplicate triggers)
  const lastTriggeredSessionIndexRef = useRef<number | null>(null);

  const startSessionLocally = useCallback(
    (index: number, sessionSchedule: ScheduleItem[]) => {
      const session = sessionSchedule[index];
      if (!session) return;

      const duration = settings.useDurations ? parseDurationToSeconds(session.duration) : undefined;
      const end = new Date(`${new Date().toDateString()} ${session.endTime}`);
      const now = new Date();
      const timeLeft = duration || Math.floor((end.getTime() - now.getTime()) / 1000);

      setTimerState({
        isRunning: true,
        timeLeft,
        sessionName: session.session,
        endTime: session.endTime,
        isOverrun: false,
      });
      setCurrentSessionIndex(index);

      // Still mark as triggered for UI/consistency if triggerOnce is enabled, but do not block follower updates.
      if (settings.triggerOnce) {
        setTriggeredSessions((prev) => new Set(prev).add(session.id));
      }
    },
    [settings.triggerOnce, settings.useDurations]
  );

  const stopTimerLocally = useCallback(() => {
    setTimerState((prev) => ({ ...prev, isRunning: false }));
  }, []);

  // Function to run local automations for a session (used by Follow Master Timer)
  const runLocalAutomations = useCallback(async (sessionIndex: number, sessionSchedule: ScheduleItem[]) => {
    const session = sessionSchedule[sessionIndex];
    if (!session) return;

    const automations = session.automations || [];
    if (automations.length === 0) return;

    console.log(`[FollowMaster] Running local automations for session: ${session.session}`);

    // Import propresenter service dynamically to avoid circular dependencies
    const { triggerPresentationOnConnections, changeStageLayoutOnAllEnabled } = await import("../services/propresenterService");

    // Sort automations: stageLayout first, then slides, then midi, then http, then recording
    const ordered = [...automations].sort((a, b) => {
      const order = (x: ScheduleItemAutomation) => {
        if (x.type === "stageLayout") return 0;
        if (x.type === "slide") return 1;
        if (x.type === "midi") return 2;
        if (x.type === "http") return 3;
        return 4; // recording automations last
      };
      return order(a) - order(b);
    });

    for (const automation of ordered) {
      try {
        if (automation.type === "stageLayout") {
          const result = await changeStageLayoutOnAllEnabled(
            automation.screenIndex,
            automation.layoutIndex
          );
          console.log(`[FollowMaster] Stage layout automation: ${result.success} success, ${result.failed} failed`);
        } else if (automation.type === "slide") {
          const result = await triggerPresentationOnConnections(
            {
              presentationUuid: automation.presentationUuid,
              slideIndex: automation.slideIndex,
            },
            undefined,
            automation.activationClicks || 1,
            100
          );
          console.log(`[FollowMaster] Slide automation: ${result.success} success, ${result.failed} failed`);
        } else if (automation.type === "midi") {
          // MIDI automations
          try {
            const { sendMidiNote } = await import("../services/midiService");
            await sendMidiNote(
              automation.deviceId,
              automation.channel,
              automation.note,
              automation.velocity || 127
            );
            console.log(`[FollowMaster] MIDI automation: Sent note ${automation.note} on channel ${automation.channel}`);
          } catch (err) {
            console.error(`[FollowMaster] MIDI automation error:`, err);
          }
        } else if (automation.type === "http") {
          try {
            const { triggerHttpAutomation } = await import(
              "../services/httpAutomationService"
            );
            const result = await triggerHttpAutomation(automation);
            if (result.ok) {
              console.log(
                `[FollowMaster] HTTP automation: ${automation.method} ${automation.url} (${result.status ?? "ok"})`
              );
            } else {
              console.warn(
                `[FollowMaster] HTTP automation failed: ${automation.method} ${automation.url}`,
                result.error || result.status
              );
            }
          } catch (err) {
            console.error(`[FollowMaster] HTTP automation error:`, err);
          }
        } else {
          // Recording automations
          dispatchRecordingAutomation(automation.type);
        }
      } catch (err) {
        console.error(`[FollowMaster] Automation error:`, err);
      }
    }
  }, []);

  // Listen for incoming schedule sync updates
  useEffect(() => {
    const syncSettings = loadNetworkSyncSettings();
    if (syncSettings.mode === "off" || syncSettings.mode === "master") {
      return;
    }

    networkSyncManager.setCallbacks({
      onScheduleSync: (syncedSchedule, syncedCurrentSessionIndex) => {
        console.log("[NetworkSync] Received schedule update");
        // Only update if schedule is different to avoid loops
        const newKey = JSON.stringify({
          schedule: stripScheduleAutomations(syncedSchedule),
          currentSessionIndex: syncedCurrentSessionIndex,
        });
        if (newKey !== lastBroadcastRef.current) {
          lastBroadcastRef.current = newKey;

          // Merge schedule but NEVER import automations from master
          const merged = mergeScheduleWithLocalAutomations(scheduleRef.current, syncedSchedule);
          setSchedule(merged);

          const currentSyncSettings = loadNetworkSyncSettings();
          if (currentSyncSettings.followMasterTimer) {
            // Always track what master says is active
            setCurrentSessionIndex(syncedCurrentSessionIndex);

            if (syncedCurrentSessionIndex === null) {
              lastTriggeredSessionIndexRef.current = null;
              stopTimerLocally();
              return;
            }

            // Master started (or re-announced) a session; only *trigger* actions on index change
            if (syncedCurrentSessionIndex !== lastTriggeredSessionIndexRef.current) {
              lastTriggeredSessionIndexRef.current = syncedCurrentSessionIndex;
              runLocalAutomations(syncedCurrentSessionIndex, merged);
              startSessionLocally(syncedCurrentSessionIndex, merged);
            }
          } else {
            setCurrentSessionIndex(syncedCurrentSessionIndex);
          }
        }
      },
      onFullStateSync: (_playlists, syncedSchedule, syncedCurrentSessionIndex) => {
        if (syncedSchedule) {
          console.log("[NetworkSync] Received full state with schedule");
          const newKey = JSON.stringify({
            schedule: stripScheduleAutomations(syncedSchedule),
            currentSessionIndex: syncedCurrentSessionIndex,
          });
          if (newKey !== lastBroadcastRef.current) {
            lastBroadcastRef.current = newKey;
            const merged = mergeScheduleWithLocalAutomations(scheduleRef.current, syncedSchedule);
            setSchedule(merged);
            const currentSyncSettings = loadNetworkSyncSettings();
            if (currentSyncSettings.followMasterTimer && syncedCurrentSessionIndex !== undefined) {
              // Always track what master says is active (if included in full state)
              setCurrentSessionIndex(syncedCurrentSessionIndex);

              if (syncedCurrentSessionIndex === null) {
                lastTriggeredSessionIndexRef.current = null;
                stopTimerLocally();
                return;
              }

              if (syncedCurrentSessionIndex !== lastTriggeredSessionIndexRef.current) {
                lastTriggeredSessionIndexRef.current = syncedCurrentSessionIndex;
                runLocalAutomations(syncedCurrentSessionIndex, merged);
                startSessionLocally(syncedCurrentSessionIndex, merged);
              }
            } else if (syncedCurrentSessionIndex !== undefined) {
              setCurrentSessionIndex(syncedCurrentSessionIndex);
            }
          }
        }
      },
    });
  }, [runLocalAutomations, startSessionLocally, stopTimerLocally]);

  // Persist settings only after initial load (to avoid overwriting saved settings)
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error("Error saving settings to localStorage:", error);
    }
  }, [settings, settingsLoaded]);

  // Persist runtime timer state (for navigation + reload safety)
  useEffect(() => {
    localStorage.setItem(
      RUNTIME_STORAGE_KEY,
      JSON.stringify({ timerState, currentSessionIndex, savedAt: Date.now() })
    );
  }, [timerState, currentSessionIndex]);

  // Update timer state on server for remote viewing
  useEffect(() => {
    // Dynamically import to avoid issues if server is not running
    import("../services/scheduleService")
      .then(({ updateTimerState }) => {
        updateTimerState(timerState);
      })
      .catch((error) => {
        // Silently fail if server is not running
        console.debug("Timer service not available:", error);
      });
  }, [timerState]);

  // Keep audience display timer in sync
  useEffect(() => {
    saveDisplayTimerState(timerState);
  }, [timerState]);

  // Countdown ticking (lives at app level so it survives route changes)
  const tickIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!timerState.isRunning) {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      return;
    }

    if (tickIntervalRef.current) return;

    tickIntervalRef.current = window.setInterval(() => {
      setTimerState((prev) => {
        if (!prev.isRunning) return prev;
        const newTimeLeft = prev.timeLeft - 1;
        return {
          ...prev,
          timeLeft: newTimeLeft,
          isOverrun: newTimeLeft < 0,
        };
      });
    }, 1000);

    return () => {
      if (tickIntervalRef.current) {
        window.clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, [timerState.isRunning]);

  // Listen for AI-triggered timer stop events
  useEffect(() => {
    const handleAITimerStop = () => {
      setTimerState((prev) => ({ ...prev, isRunning: false }));
    };

    window.addEventListener("ai-timer-stopped", handleAITimerStop);
    return () => {
      window.removeEventListener("ai-timer-stopped", handleAITimerStop);
    };
  }, []);

  // Listen for AI-triggered schedule update events
  useEffect(() => {
    const handleAIScheduleUpdate = (event: CustomEvent<{ schedule: ScheduleItem[] }>) => {
      const newSchedule = normalizeSchedule(event.detail.schedule);
      console.log("[AI] Schedule updated:", newSchedule);
      setSchedule(newSchedule);
    };

    window.addEventListener("ai-schedule-updated", handleAIScheduleUpdate as EventListener);
    return () => {
      window.removeEventListener("ai-schedule-updated", handleAIScheduleUpdate as EventListener);
    };
  }, []);

  const startSession = useCallback(
    async (index: number) => {
      const session = schedule[index];
      if (!session) return { success: 0, failed: 0, errors: [] };

      // Check if trigger once is enabled and session is already triggered
      if (settings.triggerOnce && triggeredSessions.has(session.id)) {
        return { success: 0, failed: 0, errors: ["Timer already triggered for this session"] };
      }

      const duration = settings.useDurations ? parseDurationToSeconds(session.duration) : undefined;
      const end = new Date(`${new Date().toDateString()} ${session.endTime}`);
      const now = new Date();
      const timeLeft = duration || Math.floor((end.getTime() - now.getTime()) / 1000);

      setTimerState({
        isRunning: true,
        timeLeft,
        sessionName: session.session,
        endTime: session.endTime,
        isOverrun: false,
      });
      setCurrentSessionIndex(index);

      // Mark session as triggered (if trigger once is enabled)
      if (settings.triggerOnce) {
        setTriggeredSessions((prev) => new Set(prev).add(session.id));
      }

      return await startTimerOnAllEnabled(session.session, duration, settings.useDurations ? undefined : session.endTime);
    },
    [schedule, settings.useDurations, settings.triggerOnce, triggeredSessions]
  );

  // Auto-play next session (runs at app level so it survives navigation)
  useEffect(() => {
    if (
      timerState.timeLeft === 0 &&
      settings.isAutoPlay &&
      !settings.isAllowOverrun &&
      timerState.isRunning
    ) {
      const nextIndex = currentSessionIndex !== null ? currentSessionIndex + 1 : 0;
      if (nextIndex < schedule.length) {
        // best-effort; ignore failures
        void startSession(nextIndex);
      }
    }
  }, [
    timerState.timeLeft,
    timerState.isRunning,
    settings.isAutoPlay,
    settings.isAllowOverrun,
    currentSessionIndex,
    schedule.length,
    startSession,
  ]);

  const startCountdown = useCallback(
    async (totalSeconds?: number) => {
      const computed =
        totalSeconds ??
        parseInt(countdownHours) * 3600 +
          parseInt(countdownMinutes) * 60 +
          parseInt(countdownSeconds);
      if (!computed || computed <= 0) return { success: 0, failed: 0, errors: [] };

      setTimerState({
        isRunning: true,
        timeLeft: computed,
        sessionName: "Countdown",
        endTime: "",
        isOverrun: false,
      });
      setCurrentSessionIndex(null);

      return await startTimerOnAllEnabled("Countdown", computed);
    },
    [countdownHours, countdownMinutes, countdownSeconds]
  );

  useEffect(() => {
    let unlisten: null | (() => void) = null;

    (async () => {
      try {
        const events = await import("@tauri-apps/api/event");
        unlisten = await events.listen<{ seconds?: number }>(
          "api-timer-start",
          async (event) => {
            const seconds = Number(event.payload?.seconds ?? 0);
            if (!Number.isFinite(seconds)) return;
            const totalSeconds = Math.floor(seconds);
            if (totalSeconds <= 0) return;
            const result = await startCountdown(totalSeconds);
            if (result.errors?.length) {
              console.warn("[API] Timer start errors:", result.errors);
            }
          }
        );
      } catch (error) {
        console.warn("[API] Failed to listen for timer events:", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [startCountdown]);

  const startCountdownToTime = useCallback(
    async (time?: string, period?: "AM" | "PM") => {
      const finalTime = time ?? countdownToTime;
      const finalPeriod = period ?? countdownToPeriod;
      const [hours, minutes] = finalTime.split(":").map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return { success: 0, failed: 0, errors: [] };

      const now = new Date();
      const target = new Date();
      target.setHours(finalPeriod === "PM" && hours !== 12 ? hours + 12 : hours);
      target.setMinutes(minutes);
      target.setSeconds(0);
      if (target < now) target.setDate(target.getDate() + 1);

      const timeLeft = Math.floor((target.getTime() - now.getTime()) / 1000);
      const endTimeStr = `${finalTime} ${finalPeriod}`;

      setTimerState({
        isRunning: true,
        timeLeft,
        sessionName: "Countdown",
        endTime: endTimeStr,
        isOverrun: false,
      });
      setCurrentSessionIndex(null);

      return await startTimerOnAllEnabled("Countdown", undefined, endTimeStr);
    },
    [countdownToPeriod, countdownToTime]
  );

  const stopTimer = useCallback(async () => {
    setTimerState((prev) => ({ ...prev, isRunning: false }));
    return await stopTimerOnAllEnabled();
  }, []);

  // Mark a session as triggered
  const markSessionTriggered = useCallback((sessionId: number) => {
    setTriggeredSessions((prev) => new Set(prev).add(sessionId));
  }, []);

  // Reset all triggered sessions (allows re-triggering)
  const resetTriggeredSessions = useCallback(() => {
    setTriggeredSessions(new Set());
  }, []);

  // Check if a session has been triggered
  const isSessionTriggered = useCallback((sessionId: number) => {
    return triggeredSessions.has(sessionId);
  }, [triggeredSessions]);

  const getNextSession = useCallback(() => {
    if (currentSessionIndex === null || currentSessionIndex >= schedule.length - 1) return null;
    return schedule[currentSessionIndex + 1];
  }, [currentSessionIndex, schedule]);

  const goNextSession = useCallback(async () => {
    const nextIndex = currentSessionIndex === null ? 0 : currentSessionIndex + 1;
    if (nextIndex >= schedule.length) return false;
    await startSession(nextIndex);
    return true;
  }, [currentSessionIndex, schedule.length, startSession]);

  const value = useMemo<StageAssistContextValue>(
    () => ({
      schedule,
      setSchedule,
      settings,
      setSettings,
      timerState,
      setTimerState,
      currentSessionIndex,
      setCurrentSessionIndex,
      triggeredSessions,
      markSessionTriggered,
      resetTriggeredSessions,
      isSessionTriggered,
      countdownHours,
      setCountdownHours,
      countdownMinutes,
      setCountdownMinutes,
      countdownSeconds,
      setCountdownSeconds,
      countdownToTime,
      setCountdownToTime,
      countdownToPeriod,
      setCountdownToPeriod,
      startSession,
      startCountdown,
      startCountdownToTime,
      stopTimer,
      getNextSession,
      goNextSession,
    }),
    [
      schedule,
      settings,
      timerState,
      currentSessionIndex,
      triggeredSessions,
      markSessionTriggered,
      resetTriggeredSessions,
      isSessionTriggered,
      countdownHours,
      countdownMinutes,
      countdownSeconds,
      countdownToTime,
      countdownToPeriod,
      startSession,
      startCountdown,
      startCountdownToTime,
      stopTimer,
      getNextSession,
      goNextSession,
    ]
  );

  return <StageAssistContext.Provider value={value}>{children}</StageAssistContext.Provider>;
};

export function useStageAssist() {
  const ctx = useContext(StageAssistContext);
  if (!ctx) throw new Error("useStageAssist must be used within StageAssistProvider");
  return ctx;
}

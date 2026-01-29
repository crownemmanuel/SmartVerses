import { FirebaseConfig, LiveTestimoniesSettings } from "../types/testimonies";
import { SmartAutomationRule, ScheduleItemAutomation } from "../types/propresenter";

const STORAGE_KEY_FIREBASE_CONFIG = "proassist-firebase-config";
const STORAGE_KEY_LIVE_TESTIMONIES_SETTINGS = "proassist-live-testimonies-settings";
const STORAGE_KEY_SMART_AUTOMATIONS = "proassist-smart-automations";

export function saveFirebaseConfig(config: FirebaseConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to save Firebase config:", err);
  }
}

export function loadFirebaseConfig(): FirebaseConfig | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (!saved) return null;
    return JSON.parse(saved) as FirebaseConfig;
  } catch (err) {
    console.error("Failed to load Firebase config:", err);
    return null;
  }
}

export function saveLiveTestimoniesSettings(
  settings: LiveTestimoniesSettings
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_LIVE_TESTIMONIES_SETTINGS,
      JSON.stringify(settings)
    );
  } catch (err) {
    console.error("Failed to save Live Testimonies settings:", err);
  }
}

export function loadLiveTestimoniesSettings(): LiveTestimoniesSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LIVE_TESTIMONIES_SETTINGS);
    if (saved) {
      const parsed = JSON.parse(saved) as LiveTestimoniesSettings;
      // Ensure defaults
      return {
        firebaseConfig: parsed.firebaseConfig || null,
        liveTestimonyOutputPath:
          parsed.liveTestimonyOutputPath || "~/Documents/SmartVerses/Templates",
        liveTestimonyFileName:
          parsed.liveTestimonyFileName || "live_testimony.txt",
        nameFormatting: parsed.nameFormatting || {
          type: "default",
        },
        proPresenterActivation: parsed.proPresenterActivation,
      };
    }
  } catch (err) {
    console.error("Failed to load Live Testimonies settings:", err);
  }
  // Return defaults
  return {
    firebaseConfig: null,
    liveTestimonyOutputPath: "~/Documents/SmartVerses/Templates",
    liveTestimonyFileName: "live_testimony.txt",
    nameFormatting: {
      type: "default",
    },
  };
}

// Smart Automations for Schedule Items
export function saveSmartAutomations(rules: SmartAutomationRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SMART_AUTOMATIONS, JSON.stringify(rules));
  } catch (err) {
    console.error("Failed to save smart automations:", err);
  }
}

export function loadSmartAutomations(): SmartAutomationRule[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SMART_AUTOMATIONS);
    if (saved) {
      const parsed = JSON.parse(saved) as any[];
      if (!Array.isArray(parsed)) return [];

      const recordingTypes = [
        "startVideoRecording",
        "stopVideoRecording",
        "startAudioRecording",
        "stopAudioRecording",
        "startBothRecording",
        "stopBothRecording",
      ] as const;

      // Migrate legacy rules: `automation` -> `automations[]`, and add missing `type` for slide rules.
      const migrated: SmartAutomationRule[] = parsed
        .map((rule: any) => {
          if (!rule || typeof rule !== "object") return null;

          const rawAutomations: any[] = Array.isArray(rule.automations)
            ? rule.automations
            : rule.automation
              ? [rule.automation]
              : [];

          const normalizedAutomations: ScheduleItemAutomation[] = [];
          for (const raw of rawAutomations) {
            if (!raw || typeof raw !== "object") continue;

            // already discriminated
            if (raw.type === "slide" || raw.type === "stageLayout") {
              normalizedAutomations.push(raw as ScheduleItemAutomation);
              continue;
            }

            if (recordingTypes.includes(raw.type)) {
              normalizedAutomations.push({ type: raw.type } as ScheduleItemAutomation);
              continue;
            }

            if (
              raw.type === "midi" &&
              typeof raw.deviceId === "string" &&
              typeof raw.channel === "number" &&
              typeof raw.note === "number"
            ) {
              normalizedAutomations.push(raw as ScheduleItemAutomation);
              continue;
            }

            if (raw.type === "http" && typeof raw.method === "string" && typeof raw.url === "string") {
              normalizedAutomations.push(raw as ScheduleItemAutomation);
              continue;
            }

            // legacy slide
            if (typeof raw.presentationUuid === "string" && typeof raw.slideIndex === "number") {
              normalizedAutomations.push({
                type: "slide",
                presentationUuid: raw.presentationUuid,
                slideIndex: raw.slideIndex,
                presentationName: raw.presentationName,
                activationClicks: raw.activationClicks,
              });
              continue;
            }

            // legacy stage layout (defensive)
            if (typeof raw.screenIndex === "number" && typeof raw.layoutIndex === "number") {
              normalizedAutomations.push({
                type: "stageLayout",
                screenUuid: raw.screenUuid ?? "",
                screenName: raw.screenName,
                screenIndex: raw.screenIndex,
                layoutUuid: raw.layoutUuid ?? "",
                layoutName: raw.layoutName,
                layoutIndex: raw.layoutIndex,
              });
              continue;
            }
          }

          // unique by type
          const byType = new Map<ScheduleItemAutomation["type"], ScheduleItemAutomation>();
          for (const a of normalizedAutomations) byType.set(a.type, a);
          const automations = Array.from(byType.values());

          const migratedRule: SmartAutomationRule = {
            id: rule.id ?? `rule-${Date.now()}`,
            sessionNamePattern: rule.sessionNamePattern ?? "",
            isExactMatch: !!rule.isExactMatch,
            automations,
            createdAt: typeof rule.createdAt === "number" ? rule.createdAt : Date.now(),
          };

          return migratedRule.sessionNamePattern ? migratedRule : null;
        })
        .filter(Boolean) as SmartAutomationRule[];

      // Best-effort persist back in the new format (prevents repeated migrations)
      try {
        localStorage.setItem(STORAGE_KEY_SMART_AUTOMATIONS, JSON.stringify(migrated));
      } catch {
        // ignore
      }

      return migrated;
    }
  } catch (err) {
    console.error("Failed to load smart automations:", err);
  }
  return [];
}

export function addSmartAutomation(rule: SmartAutomationRule): void {
  const rules = loadSmartAutomations();

  // Upsert by session name pattern (case-insensitive) and MERGE automations by type
  const normalizedPattern = rule.sessionNamePattern.toLowerCase();
  const existing = rules.find((r) => r.sessionNamePattern.toLowerCase() === normalizedPattern);

  if (!existing) {
    saveSmartAutomations([...rules, rule]);
    return;
  }

  const byType = new Map<ScheduleItemAutomation["type"], ScheduleItemAutomation>();
  for (const a of existing.automations || []) byType.set(a.type, a);
  for (const a of rule.automations || []) byType.set(a.type, a);

  const merged: SmartAutomationRule = {
    ...existing,
    // allow updating match mode if user saved again
    isExactMatch: rule.isExactMatch,
    automations: Array.from(byType.values()),
    createdAt: existing.createdAt ?? Date.now(),
  };

  saveSmartAutomations(rules.map((r) => (r.id === existing.id ? merged : r)));
}

export function removeSmartAutomation(ruleId: string): void {
  const rules = loadSmartAutomations();
  saveSmartAutomations(rules.filter((r) => r.id !== ruleId));
}

export function findMatchingAutomation(sessionName: string): ScheduleItemAutomation[] | null {
  const rules = loadSmartAutomations();
  const normalizedName = sessionName.toLowerCase().trim();
  
  // First try exact matches
  for (const rule of rules) {
    if (rule.isExactMatch && rule.sessionNamePattern.toLowerCase().trim() === normalizedName) {
      return rule.automations?.length ? rule.automations : null;
    }
  }
  
  // Then try contains matches
  for (const rule of rules) {
    if (!rule.isExactMatch && normalizedName.includes(rule.sessionNamePattern.toLowerCase().trim())) {
      return rule.automations?.length ? rule.automations : null;
    }
  }
  
  return null;
}

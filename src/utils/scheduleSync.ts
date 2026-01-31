import {
  ScheduleItem,
  ScheduleItemAutomation,
  SmartAutomationRule,
  RECORDING_AUTOMATION_TYPES,
} from "../types/propresenter";
import { loadSmartAutomations } from "./testimoniesStorage";

function normalizeSessionKey(session: string | undefined | null): string {
  return (session ?? "").trim().toLowerCase();
}

function normalizeAutomationList(
  item: ScheduleItem
): ScheduleItemAutomation[] | undefined {
  // Prefer modern `automations` array; fall back to legacy single `automation`
  const list =
    item.automations ??
    ((item as any).automation ? [(item as any).automation] : undefined);
  if (!list || !Array.isArray(list) || list.length === 0) return undefined;
  // Trust existing normalization elsewhere; here we just ensure "undefined" vs empty array consistency.
  return list.filter(Boolean) as ScheduleItemAutomation[];
}

export function normalizeScheduleItemAutomations(item: ScheduleItem): ScheduleItemAutomation[] {
  const rawList = Array.isArray(item.automations)
    ? item.automations
    : (item as any).automation
      ? [(item as any).automation]
      : [];

  const byType = new Map<ScheduleItemAutomation["type"], ScheduleItemAutomation>();
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;

    const rawType = (raw as any).type as ScheduleItemAutomation["type"] | undefined;
    let normalized: ScheduleItemAutomation | null = null;

    if (
      rawType === "slide" ||
      rawType === "stageLayout" ||
      rawType === "midi" ||
      rawType === "http" ||
      (rawType && RECORDING_AUTOMATION_TYPES.includes(rawType as any))
    ) {
      normalized = raw as ScheduleItemAutomation;
    } else if (
      typeof (raw as any).presentationUuid === "string" &&
      typeof (raw as any).slideIndex === "number"
    ) {
      normalized = {
        type: "slide",
        presentationUuid: (raw as any).presentationUuid,
        slideIndex: (raw as any).slideIndex,
        presentationName: (raw as any).presentationName,
        activationClicks: (raw as any).activationClicks,
      };
    } else if (
      typeof (raw as any).screenIndex === "number" &&
      typeof (raw as any).layoutIndex === "number"
    ) {
      normalized = {
        type: "stageLayout",
        screenUuid: (raw as any).screenUuid ?? "",
        screenName: (raw as any).screenName,
        screenIndex: (raw as any).screenIndex,
        layoutUuid: (raw as any).layoutUuid ?? "",
        layoutName: (raw as any).layoutName,
        layoutIndex: (raw as any).layoutIndex,
      };
    }

    if (normalized) {
      byType.set(normalized.type, normalized);
    }
  }

  return Array.from(byType.values());
}

function mergeAutomations(
  existing: ScheduleItemAutomation[],
  incoming: ScheduleItemAutomation[]
): ScheduleItemAutomation[] {
  const byType = new Map<ScheduleItemAutomation["type"], ScheduleItemAutomation>();
  for (const a of existing) byType.set(a.type, a);
  for (const a of incoming) {
    if (!byType.has(a.type)) byType.set(a.type, a);
  }
  return Array.from(byType.values());
}

function findMatchingAutomationForSession(
  rules: SmartAutomationRule[],
  sessionName: string
): ScheduleItemAutomation[] | null {
  const normalizedName = (sessionName ?? "").toLowerCase().trim();
  if (!normalizedName) return null;

  // Exact matches first
  for (const rule of rules) {
    const pattern = rule.sessionNamePattern.toLowerCase().trim();
    if (rule.isExactMatch && pattern === normalizedName) {
      return rule.automations?.length ? rule.automations : null;
    }
  }

  // Then contains matches
  for (const rule of rules) {
    const pattern = rule.sessionNamePattern.toLowerCase().trim();
    if (!rule.isExactMatch && pattern && normalizedName.includes(pattern)) {
      return rule.automations?.length ? rule.automations : null;
    }
  }

  return null;
}

/**
 * Removes all automation fields from a schedule. This ensures automations are never synced over the network.
 */
export function stripScheduleAutomations(schedule: ScheduleItem[]): ScheduleItem[] {
  return schedule.map((item) => {
    const { automations: _automations, ...rest } = item as any;
    // also remove any legacy `automation` field if present
    const { automation: _automation, ...rest2 } = rest;
    return rest2 as ScheduleItem;
  });
}

/**
 * Merge an incoming schedule with *local* automations by matching on the session name.
 *
 * Rules:
 * - Never import automations from incoming schedule (master)
 * - If an incoming item matches a local item by session name (case-insensitive), apply the local automations
 * - If no match, the incoming item gets no automations ("undo automation" for mismatched sessions)
 */
export function mergeScheduleWithLocalAutomations(
  localSchedule: ScheduleItem[],
  incomingSchedule: ScheduleItem[]
): ScheduleItem[] {
  // Build map of sessionName -> automations
  const localAutoBySession = new Map<string, ScheduleItemAutomation[] | undefined>();
  for (const item of localSchedule) {
    const key = normalizeSessionKey(item.session);
    if (!key) continue;
    // Keep first match to make behavior deterministic when duplicates exist
    if (localAutoBySession.has(key)) continue;
    localAutoBySession.set(key, normalizeAutomationList(item));
  }

  // Apply local automations to incoming, stripping any incoming automations.
  const strippedIncoming = stripScheduleAutomations(incomingSchedule);
  return strippedIncoming.map((item) => {
    const key = normalizeSessionKey(item.session);
    const automations = key ? localAutoBySession.get(key) : undefined;
    return {
      ...item,
      ...(automations && automations.length > 0 ? { automations } : {}),
    };
  });
}

/**
 * Apply locally-saved smart automation rules to a schedule without overwriting existing automations.
 */
export function applySmartAutomationsToSchedule(
  schedule: ScheduleItem[]
): ScheduleItem[] {
  const rules = loadSmartAutomations();
  if (!rules.length) return schedule;

  let hasChanges = false;
  const updated = schedule.map((item) => {
    const matching = findMatchingAutomationForSession(rules, item.session);
    if (!matching || matching.length === 0) return item;

    const existing = normalizeScheduleItemAutomations(item);
    const merged = mergeAutomations(existing, matching);
    if (merged.length === existing.length) return item;

    hasChanges = true;
    return { ...item, automations: merged };
  });

  return hasChanges ? updated : schedule;
}


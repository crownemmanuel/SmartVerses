import { ScheduleItem } from "../types/propresenter";
import { StageAssistSettings } from "../contexts/StageAssistContext";

// Storage key for timer templates
const TIMER_TEMPLATES_STORAGE_KEY = "proassist-timer-templates";

// Timer template interface
export interface TimerTemplate {
  id: string;
  name: string;
  description?: string;
  schedule: ScheduleItem[];
  settings?: StageAssistSettings;
  createdAt: number;
  updatedAt: number;
}

// Generate a unique ID
function generateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Load all templates from localStorage
export function loadTimerTemplates(): TimerTemplate[] {
  try {
    const saved = localStorage.getItem(TIMER_TEMPLATES_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.error("Error loading timer templates:", error);
    return [];
  }
}

// Save all templates to localStorage
function saveTimerTemplates(templates: TimerTemplate[]): void {
  try {
    localStorage.setItem(TIMER_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("Error saving timer templates:", error);
  }
}

// Create a new template
export function createTimerTemplate(
  name: string,
  schedule: ScheduleItem[],
  settings?: StageAssistSettings,
  description?: string
): TimerTemplate {
  const templates = loadTimerTemplates();
  const now = Date.now();

  const newTemplate: TimerTemplate = {
    id: generateId(),
    name,
    description,
    schedule: schedule.map((item) => ({
      ...item,
      // Strip automations when saving templates (they are device-specific)
      automations: undefined,
      automation: undefined,
    })),
    settings,
    createdAt: now,
    updatedAt: now,
  };

  templates.push(newTemplate);
  saveTimerTemplates(templates);

  return newTemplate;
}

// Update an existing template
export function updateTimerTemplate(
  id: string,
  updates: {
    name?: string;
    description?: string;
    schedule?: ScheduleItem[];
    settings?: StageAssistSettings;
  }
): TimerTemplate | null {
  const templates = loadTimerTemplates();
  const index = templates.findIndex((t) => t.id === id);

  if (index === -1) return null;

  const template = templates[index];
  const updatedTemplate: TimerTemplate = {
    ...template,
    ...updates,
    schedule: updates.schedule
      ? updates.schedule.map((item) => ({
          ...item,
          // Strip automations when saving templates
          automations: undefined,
          automation: undefined,
        }))
      : template.schedule,
    updatedAt: Date.now(),
  };

  templates[index] = updatedTemplate;
  saveTimerTemplates(templates);

  return updatedTemplate;
}

// Delete a template
export function deleteTimerTemplate(id: string): boolean {
  const templates = loadTimerTemplates();
  const filtered = templates.filter((t) => t.id !== id);

  if (filtered.length === templates.length) {
    return false; // Template not found
  }

  saveTimerTemplates(filtered);
  return true;
}

// Get a single template by ID
export function getTimerTemplate(id: string): TimerTemplate | null {
  const templates = loadTimerTemplates();
  return templates.find((t) => t.id === id) || null;
}

// Check if a template name already exists
export function templateNameExists(name: string, excludeId?: string): boolean {
  const templates = loadTimerTemplates();
  return templates.some(
    (t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== excludeId
  );
}

// Duplicate a template
export function duplicateTimerTemplate(id: string): TimerTemplate | null {
  const original = getTimerTemplate(id);
  if (!original) return null;

  // Find a unique name
  let newName = `${original.name} (Copy)`;
  let counter = 1;
  while (templateNameExists(newName)) {
    counter++;
    newName = `${original.name} (Copy ${counter})`;
  }

  return createTimerTemplate(
    newName,
    original.schedule,
    original.settings,
    original.description
  );
}

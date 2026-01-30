import type { BibleConversionTemplate } from "../types/bibleConversion";

const STORAGE_KEY = "proassist-bible-conversion-templates";

function generateTemplateId(): string {
  return `bible-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadBibleConversionTemplates(): BibleConversionTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed as BibleConversionTemplate[];
      }
    }
  } catch (error) {
    console.error("[BibleConversion] Failed to load templates:", error);
  }
  return [];
}

export function saveBibleConversionTemplates(
  templates: BibleConversionTemplate[]
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error("[BibleConversion] Failed to save templates:", error);
  }
}

export function addBibleConversionTemplate(
  template: Omit<BibleConversionTemplate, "id" | "createdAt" | "updatedAt">
): BibleConversionTemplate {
  const templates = loadBibleConversionTemplates();
  const now = new Date().toISOString();
  const newTemplate: BibleConversionTemplate = {
    ...template,
    id: generateTemplateId(),
    createdAt: now,
    updatedAt: now,
  };
  templates.push(newTemplate);
  saveBibleConversionTemplates(templates);
  return newTemplate;
}

export function updateBibleConversionTemplate(
  template: BibleConversionTemplate
): boolean {
  const templates = loadBibleConversionTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index === -1) return false;
  templates[index] = { ...template, updatedAt: new Date().toISOString() };
  saveBibleConversionTemplates(templates);
  return true;
}

export function deleteBibleConversionTemplate(id: string): boolean {
  const templates = loadBibleConversionTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;
  saveBibleConversionTemplates(filtered);
  return true;
}

/**
 * Global Templates Utility
 * 
 * Manages reusable ProPresenter activation configurations (Global Templates).
 * These templates can be selected from a dropdown anywhere ProPresenter triggers are used,
 * saving users from repeatedly configuring the same presentation/slide.
 */

import { GlobalTemplate } from "../types/globalChat";

const STORAGE_KEY = "proassist-global-templates";

/**
 * Load Global Templates from localStorage
 */
export function loadGlobalTemplates(): GlobalTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log(`[Global Templates] Loading templates from localStorage. Raw data exists: ${!!stored}`);
    if (stored) {
      const templates = JSON.parse(stored);
      console.log(`[Global Templates] Loaded ${templates.length} template(s):`, templates.map((t: GlobalTemplate) => t.name));
      return templates;
    }
  } catch (error) {
    console.error("[Global Templates] Failed to load templates:", error);
  }
  console.log("[Global Templates] No templates found in localStorage");
  return [];
}

/**
 * Save Global Templates to localStorage
 */
export function saveGlobalTemplates(templates: GlobalTemplate[]): void {
  try {
    const jsonData = JSON.stringify(templates);
    localStorage.setItem(STORAGE_KEY, jsonData);
    console.log(`[Global Templates] Saved ${templates.length} template(s):`, templates.map(t => t.name));
    
    // Emit event so other components can react to changes
    window.dispatchEvent(new CustomEvent("global-templates-updated", { detail: templates }));
  } catch (error) {
    console.error("[Global Templates] Failed to save templates:", error);
  }
}

/**
 * Add a new Global Template
 */
export function addGlobalTemplate(template: Omit<GlobalTemplate, "id" | "createdAt" | "updatedAt">): GlobalTemplate {
  const templates = loadGlobalTemplates();
  const now = Date.now();
  const newTemplate: GlobalTemplate = {
    ...template,
    id: generateTemplateId(),
    createdAt: now,
    updatedAt: now,
  };
  templates.push(newTemplate);
  saveGlobalTemplates(templates);
  return newTemplate;
}

/**
 * Update an existing Global Template
 */
export function updateGlobalTemplate(template: GlobalTemplate): boolean {
  const templates = loadGlobalTemplates();
  const index = templates.findIndex((t) => t.id === template.id);
  if (index !== -1) {
    templates[index] = {
      ...template,
      updatedAt: Date.now(),
    };
    saveGlobalTemplates(templates);
    return true;
  }
  return false;
}

/**
 * Delete a Global Template
 */
export function deleteGlobalTemplate(id: string): boolean {
  const templates = loadGlobalTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length !== templates.length) {
    saveGlobalTemplates(filtered);
    return true;
  }
  return false;
}

/**
 * Get a Global Template by ID
 */
export function getGlobalTemplateById(id: string): GlobalTemplate | undefined {
  const templates = loadGlobalTemplates();
  return templates.find((t) => t.id === id);
}

/**
 * Get a Global Template by name (case-insensitive)
 */
export function getGlobalTemplateByName(name: string): GlobalTemplate | undefined {
  const templates = loadGlobalTemplates();
  const lowerName = name.toLowerCase();
  return templates.find((t) => t.name.toLowerCase() === lowerName);
}

/**
 * Generate a unique template ID
 */
function generateTemplateId(): string {
  return `gt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert a GlobalTemplate to the activation config format used by other components
 */
export function globalTemplateToActivation(template: GlobalTemplate): {
  presentationUuid: string;
  slideIndex: number;
  presentationName?: string;
  activationClicks?: number;
  takeOffClicks?: number;
} {
  return {
    presentationUuid: template.presentationUuid,
    slideIndex: template.slideIndex,
    presentationName: template.presentationName,
    activationClicks: template.activationClicks,
    takeOffClicks: template.takeOffClicks,
  };
}

import { Template } from "../types";

type TemplateFileV1 = {
  version: 1;
  type: "proassist-templates";
  templates: Template[];
};

type SingleTemplateFileV1 = {
  version: 1;
  type: "proassist-template";
  template: Template;
};

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportResult =
  | { status: "saved"; filePath?: string }
  | { status: "cancelled" }
  | { status: "fallback" };

export async function exportAllTemplatesToFile(
  templates: Template[],
  filename = `proassist-templates-${new Date().toISOString().slice(0, 10)}.json`
): Promise<ExportResult> {
  const payload: TemplateFileV1 = {
    version: 1,
    type: "proassist-templates",
    templates,
  };
  const tauriResult = await trySaveViaTauriDialog(filename, payload);
  if (tauriResult.status === "failed") {
    downloadJSON(filename, payload);
    return { status: "fallback" };
  }
  return tauriResult;
}

export async function exportSingleTemplateToFile(
  template: Template,
  filename = `proassist-template-${sanitizeFilename(template.name)}.json`
): Promise<ExportResult> {
  const payload: SingleTemplateFileV1 = {
    version: 1,
    type: "proassist-template",
    template,
  };
  const tauriResult = await trySaveViaTauriDialog(filename, payload);
  if (tauriResult.status === "failed") {
    downloadJSON(filename, payload);
    return { status: "fallback" };
  }
  return tauriResult;
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export async function parseTemplatesFromJsonFile(
  file: File
): Promise<Template[]> {
  const text = await readFileAsText(file);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("Invalid JSON file");
  }

  // Support multiple shapes for compatibility
  const templates: Template[] = [];
  if (isTemplateFileV1(data)) {
    templates.push(...data.templates);
  } else if (isSingleTemplateFileV1(data)) {
    templates.push(data.template);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      if (isTemplate(item)) templates.push(item);
    }
  } else if (isTemplate(data)) {
    templates.push(data);
  }

  if (templates.length === 0) {
    throw new Error("No templates found in file");
  }
  return templates.map(fillTemplateDefaults);
}

function isTemplateFileV1(value: unknown): value is TemplateFileV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).version === 1 &&
    (value as any).type === "proassist-templates" &&
    Array.isArray((value as any).templates)
  );
}

function isSingleTemplateFileV1(value: unknown): value is SingleTemplateFileV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as any).version === 1 &&
    (value as any).type === "proassist-template" &&
    typeof (value as any).template === "object"
  );
}

function isTemplate(value: unknown): value is Template {
  if (typeof value !== "object" || value === null) return false;
  const t = value as any;
  return (
    typeof t.name === "string" &&
    typeof t.type === "string" &&
    Array.isArray(t.availableLayouts)
  );
}

function fillTemplateDefaults(t: Template): Template {
  return {
    id:
      typeof t.id === "string" && t.id.length > 0 ? t.id : generateTemplateId(),
    name: t.name || "Imported Template",
    color: t.color || "#4CAF50",
    type: t.type || "text",
    processingType: t.processingType || "simple",
    logic: t.logic || "",
    availableLayouts:
      Array.isArray(t.availableLayouts) && t.availableLayouts.length > 0
        ? t.availableLayouts
        : ["one-line"],
    aiPrompt: t.aiPrompt || "",
    processWithAI: !!t.processWithAI,
    // Preserve provider/model if either legacy flag is true or processingType is ai
    aiProvider:
      t.processWithAI || t.processingType === "ai" ? t.aiProvider : undefined,
    aiModel:
      t.processWithAI || t.processingType === "ai" ? t.aiModel : undefined,
    outputPath: t.outputPath || "~/Documents/SmartVerses/Templates",
    outputFileNamePrefix: t.outputFileNamePrefix || "imported_slide_",
    // Preserve ProPresenter activation settings if present
    proPresenterActivation: t.proPresenterActivation,
    proPresenterConnectionIds: Array.isArray(t.proPresenterConnectionIds) && t.proPresenterConnectionIds.length > 0
      ? t.proPresenterConnectionIds
      : undefined,
    proPresenterActivationClicks: t.proPresenterActivationClicks,
    proPresenterTakeOffClicks: t.proPresenterTakeOffClicks,
    clearTextAfterLive: t.clearTextAfterLive,
    clearTextDelay: t.clearTextDelay,
    // Preserve scripture output mapping if present
    scriptureReferenceFileIndex: t.scriptureReferenceFileIndex,
    scriptureTextFileIndex: t.scriptureTextFileIndex,
  };
}

export function generateTemplateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 40);
}

async function trySaveViaTauriDialog(
  defaultFileName: string,
  data: unknown
): Promise<
  | { status: "saved"; filePath: string }
  | { status: "cancelled" }
  | { status: "failed" }
> {
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const filePath = await dialog.save({
      defaultPath: defaultFileName,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!filePath) {
      // user canceled dialog; handled via Tauri
      return { status: "cancelled" };
    }
    let finalPath = String(filePath);
    if (!/\.json$/i.test(finalPath)) {
      finalPath = `${finalPath}.json`;
    }
    const contents = JSON.stringify(data, null, 2);
    await (fs as any).writeTextFile(finalPath as any, contents);
    return { status: "saved", filePath: finalPath };
  } catch (e) {
    // Not in Tauri or API unavailable; fall back to browser download
    console.error("Tauri save failed or unavailable:", e);
    return { status: "failed" };
  }
}

import type { BibleTranslationFile } from "../types/bible";
import { downloadJSON } from "./templateIO";

const DEFAULT_BIBLE_DIR_SEGMENTS = ["Documents", "SmartVerses", "Bibles"];

type SaveResult =
  | { status: "saved"; filePath?: string }
  | { status: "cancelled" }
  | { status: "fallback" }
  | { status: "failed" };

function ensureSvjsonExtension(fileName: string): string {
  return /\.svjson$/i.test(fileName) ? fileName : `${fileName}.svjson`;
}

async function writeFileWithTauri(
  filePath: string,
  contents: string
): Promise<boolean> {
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    await (fs as any).writeTextFile(filePath as any, contents);
    return true;
  } catch (error) {
    console.error("[BibleConversion] Failed to write file:", error);
    return false;
  }
}

export async function saveBibleTranslationToDefaultDir(
  data: BibleTranslationFile,
  fileName: string
): Promise<SaveResult> {
  const finalName = ensureSvjsonExtension(fileName);
  try {
    const { homeDir, join } = await import("@tauri-apps/api/path");
    const fs = await import("@tauri-apps/plugin-fs");
    const home = await homeDir();
    const targetDir = await join(home, ...DEFAULT_BIBLE_DIR_SEGMENTS);
    try {
      await (fs as any).mkdir(targetDir, { recursive: true });
    } catch (error) {
      console.warn("[BibleConversion] Failed to ensure bible dir:", error);
    }
    const outputPath = await join(targetDir, finalName);
    const contents = JSON.stringify(data, null, 2);
    const ok = await writeFileWithTauri(outputPath, contents);
    if (ok) {
      return { status: "saved", filePath: outputPath };
    }
    throw new Error("writeTextFile failed");
  } catch (error) {
    console.error("[BibleConversion] Default save failed:", error);
    downloadJSON(finalName, data);
    return { status: "fallback" };
  }
}

export async function saveBibleTranslationWithDialog(
  data: BibleTranslationFile,
  fileName: string
): Promise<SaveResult> {
  const finalName = ensureSvjsonExtension(fileName);
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const filePath = await dialog.save({
      defaultPath: finalName,
      filters: [{ name: "SVJSON", extensions: ["svjson"] }],
    });
    if (!filePath) {
      return { status: "cancelled" };
    }
    const outputPath = ensureSvjsonExtension(String(filePath));
    const contents = JSON.stringify(data, null, 2);
    const ok = await writeFileWithTauri(outputPath, contents);
    if (ok) {
      return { status: "saved", filePath: outputPath };
    }
    throw new Error("writeTextFile failed");
  } catch (error) {
    console.error("[BibleConversion] Save dialog failed:", error);
    downloadJSON(finalName, data);
    return { status: "fallback" };
  }
}

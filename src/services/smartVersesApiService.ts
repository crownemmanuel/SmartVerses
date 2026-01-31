import { invoke } from "@tauri-apps/api/core";
import { DetectedBibleReference, SmartVersesSettings } from "../types/smartVerses";
import { loadSmartVersesSettings } from "./transcriptionService";
import {
  BUILTIN_KJV_ID,
  getTranslationById,
  resolveTranslationToken,
} from "./bibleLibraryService";
import { detectAndLookupReferences } from "./smartVersesBibleService";
import { searchBibleTextAsReferences } from "./bibleTextSearchService";
import { triggerPresentationOnConnections } from "./propresenterService";

let apiAutoClearTimeout: number | null = null;

async function resolveReferences(
  query: string,
  translationId: string
): Promise<DetectedBibleReference[]> {
  const direct = await detectAndLookupReferences(query, { translationId });
  if (direct.length > 0) return direct;
  return await searchBibleTextAsReferences(query, 5, translationId);
}

async function goLiveReference(
  reference: DetectedBibleReference,
  settings: SmartVersesSettings
): Promise<void> {
  const basePath = settings.bibleOutputPath?.replace(/\/?$/, "/") || "";

  if (apiAutoClearTimeout !== null) {
    window.clearTimeout(apiAutoClearTimeout);
    apiAutoClearTimeout = null;
  }

  if (basePath && settings.bibleTextFileName) {
    const textFilePath = `${basePath}${settings.bibleTextFileName}`;
    await invoke("write_text_to_file", {
      filePath: textFilePath,
      content: reference.verseText || "",
    });
  }

  if (basePath && settings.bibleReferenceFileName) {
    const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
    await invoke("write_text_to_file", {
      filePath: refFilePath,
      content: reference.displayRef || "",
    });
  }

  if (settings.proPresenterActivation) {
    const { presentationUuid, slideIndex, activationClicks } =
      settings.proPresenterActivation;
    const clicks = activationClicks ?? 1;
    await triggerPresentationOnConnections(
      { presentationUuid, slideIndex },
      settings.proPresenterConnectionIds,
      clicks,
      100
    );
  }

  const clearDelay = settings.clearTextDelay ?? 0;
  if (settings.clearTextAfterLive && basePath && clearDelay > 0) {
    apiAutoClearTimeout = window.setTimeout(async () => {
      try {
        if (settings.bibleTextFileName) {
          const textFilePath = `${basePath}${settings.bibleTextFileName}`;
          await invoke("write_text_to_file", {
            filePath: textFilePath,
            content: "",
          });
        }
        if (settings.bibleReferenceFileName) {
          const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
          await invoke("write_text_to_file", {
            filePath: refFilePath,
            content: "",
          });
        }
      } catch (error) {
        console.error("[API] Failed to auto-clear SmartVerses files:", error);
      } finally {
        apiAutoClearTimeout = null;
      }
    }, clearDelay);
  }
}

async function resolveApiTranslationId(
  overrideTranslation?: string
): Promise<string> {
  const settings = loadSmartVersesSettings();
  const fallback = settings.defaultBibleTranslationId || BUILTIN_KJV_ID;
  const trimmed = overrideTranslation?.trim();
  if (!trimmed) return fallback;

  const resolved = await resolveTranslationToken(trimmed);
  if (resolved) return resolved;

  const byId = await getTranslationById(trimmed);
  if (byId) return trimmed;

  return fallback;
}

export async function goLiveScriptureReference(
  query: string,
  translationOverride?: string
): Promise<DetectedBibleReference | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const settings = loadSmartVersesSettings();
  const translationId = await resolveApiTranslationId(translationOverride);
  const references = await resolveReferences(trimmed, translationId);
  if (!references.length) return null;

  try {
    await goLiveReference(references[0], settings);
    return references[0];
  } catch (error) {
    console.error("[API] Failed to go live:", error);
    return null;
  }
}

import type {
  BibleBooks,
  BibleTranslation,
  BibleTranslationFile,
  BibleTranslationMetadata,
  BibleTranslationSummary,
  BibleVerseEntry,
} from "../types/bible";

const BUILTIN_KJV_METADATA: BibleTranslationMetadata = {
  id: "kjv",
  shortName: "KJV",
  fullName: "King James Version",
  language: "en",
  source: "Public Domain",
  aliases: ["KJV", "King James", "King James Version"],
};

const USER_BIBLE_DIR_SEGMENTS = ["Documents", "SmartVerses", "Bibles"];

type BibleLibraryState = {
  translations: Record<string, BibleTranslation>;
  summaries: BibleTranslationSummary[];
  aliasIndex: Map<string, string>;
  aliasEntries: Array<{ alias: string; id: string; pattern: RegExp }>;
};

let libraryState: BibleLibraryState | null = null;
let libraryPromise: Promise<BibleLibraryState> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToPattern(alias: string): RegExp {
  const normalized = escapeRegex(alias.trim().toLowerCase());
  const spaced = normalized.replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${spaced}\\b`, "i");
}

function buildAliasIndex(
  summaries: BibleTranslationSummary[]
): { aliasIndex: Map<string, string>; aliasEntries: Array<{ alias: string; id: string; pattern: RegExp }> } {
  const aliasIndex = new Map<string, string>();
  const aliasEntries: Array<{ alias: string; id: string; pattern: RegExp }> = [];

  const addAlias = (alias: string, id: string) => {
    const normalized = normalizeAlias(alias);
    if (!normalized) return;
    if (aliasIndex.has(normalized)) return;
    aliasIndex.set(normalized, id);
    aliasEntries.push({ alias: normalized, id, pattern: aliasToPattern(normalized) });
  };

  summaries.forEach((meta) => {
    addAlias(meta.id, meta.id);
    addAlias(meta.shortName, meta.id);
    addAlias(meta.fullName, meta.id);
    (meta.aliases || []).forEach((alias) => addAlias(alias, meta.id));
  });

  aliasEntries.sort((a, b) => b.alias.length - a.alias.length);
  return { aliasIndex, aliasEntries };
}

function buildVerseIndex(books: BibleBooks): Record<string, string> {
  const index: Record<string, string> = {};

  for (const [bookName, chapters] of Object.entries(books)) {
    if (!isRecord(chapters)) continue;
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      if (!isRecord(verses)) continue;
      const chapterNum = parseInt(chapterKey, 10);
      if (!Number.isFinite(chapterNum)) continue;
      for (const [verseKey, verseValue] of Object.entries(verses)) {
        const verseNum = parseInt(verseKey, 10);
        if (!Number.isFinite(verseNum)) continue;
        const text =
          typeof verseValue === "string"
            ? verseValue
            : (verseValue as BibleVerseEntry).t;
        if (!text) continue;
        const ref = `${bookName} ${chapterNum}:${verseNum}`;
        index[ref] = text;
      }
    }
  }

  return index;
}

function normalizeTranslation(
  raw: unknown,
  fallbackMetadata: BibleTranslationMetadata,
  options?: { isBuiltin?: boolean; sourcePath?: string }
): BibleTranslation | null {
  if (!isRecord(raw)) return null;

  const hasBooks = isRecord(raw.books);
  const books = (hasBooks ? raw.books : raw) as BibleBooks;

  const metadata: BibleTranslationMetadata = {
    id: typeof raw.id === "string" ? raw.id : fallbackMetadata.id,
    shortName:
      typeof raw.shortName === "string"
        ? raw.shortName
        : fallbackMetadata.shortName,
    fullName:
      typeof raw.fullName === "string"
        ? raw.fullName
        : fallbackMetadata.fullName,
    language:
      typeof raw.language === "string"
        ? raw.language
        : fallbackMetadata.language,
    source:
      typeof raw.source === "string"
        ? raw.source
        : fallbackMetadata.source,
    aliases: Array.isArray(raw.aliases)
      ? raw.aliases.filter((a) => typeof a === "string")
      : fallbackMetadata.aliases,
  };

  const verseIndex = buildVerseIndex(books);
  return {
    ...metadata,
    books,
    verseIndex,
    isBuiltin: options?.isBuiltin ?? false,
    sourcePath: options?.sourcePath,
  };
}

function validateUserTranslationFile(raw: unknown): BibleTranslationFile | null {
  if (!isRecord(raw)) return null;

  const required = ["id", "shortName", "fullName", "language", "books"] as const;
  for (const key of required) {
    if (!(key in raw)) return null;
  }

  if (
    typeof raw.id !== "string" ||
    typeof raw.shortName !== "string" ||
    typeof raw.fullName !== "string" ||
    typeof raw.language !== "string"
  ) {
    return null;
  }

  if (!isRecord(raw.books)) return null;

  for (const [bookName, chapters] of Object.entries(raw.books)) {
    if (!isRecord(chapters)) {
      console.warn(`[BibleLibrary] Invalid chapters for book "${bookName}".`);
      return null;
    }
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      if (!isRecord(verses)) {
        console.warn(
          `[BibleLibrary] Invalid verses for ${bookName} ${chapterKey}.`
        );
        return null;
      }
      for (const [verseKey, verseValue] of Object.entries(verses)) {
        if (!isRecord(verseValue)) {
          console.warn(
            `[BibleLibrary] Verse ${bookName} ${chapterKey}:${verseKey} is not an object.`
          );
          return null;
        }
        const v = (verseValue as unknown as BibleVerseEntry).v;
        const t = (verseValue as unknown as BibleVerseEntry).t;
        if (typeof v !== "number" || typeof t !== "string") {
          console.warn(
            `[BibleLibrary] Verse ${bookName} ${chapterKey}:${verseKey} missing v/t fields.`
          );
          return null;
        }
      }
    }
  }

  return raw as unknown as BibleTranslationFile;
}

async function loadBuiltinKjv(): Promise<BibleTranslation | null> {
  try {
    const response = await fetch("/data/bibles/kjv.svjson");
    if (response.ok) {
      const data = await response.json();
      return normalizeTranslation(data, BUILTIN_KJV_METADATA, { isBuiltin: true });
    }
  } catch (error) {
    console.warn("[BibleLibrary] Failed to fetch built-in KJV:", error);
  }
  return null;
}

async function loadUserTranslations(): Promise<BibleTranslation[]> {
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    const { homeDir, join } = await import("@tauri-apps/api/path");
    const home = await homeDir();
    const userDir = await join(home, ...USER_BIBLE_DIR_SEGMENTS);

    if (!(await (fs as any).exists(userDir))) {
      return [];
    }

    const entries = await (fs as any).readDir(userDir, { recursive: false });
    const translations: BibleTranslation[] = [];

    for (const entry of entries || []) {
      if (!entry || entry.isDirectory) continue;
      const name = String(entry.name || "");
      if (!name.toLowerCase().endsWith(".svjson")) continue;
      const filePath = await join(userDir, name);

      try {
        const rawText = await (fs as any).readTextFile(filePath);
        const parsed = JSON.parse(rawText);
        const validated = validateUserTranslationFile(parsed);
        if (!validated) {
          console.warn(
            `[BibleLibrary] Skipping invalid Bible file: ${filePath}`
          );
          continue;
        }

        const translation = normalizeTranslation(validated, validated, {
          isBuiltin: false,
          sourcePath: filePath,
        });
        if (translation) translations.push(translation);
      } catch (error) {
        console.warn(
          `[BibleLibrary] Failed to load Bible file ${filePath}:`,
          error
        );
      }
    }

    return translations;
  } catch (error) {
    console.warn(
      "[BibleLibrary] User Bible folder not available:",
      error
    );
    return [];
  }
}

async function buildLibraryState(): Promise<BibleLibraryState> {
  const translations: Record<string, BibleTranslation> = {};

  const builtin = await loadBuiltinKjv();
  if (builtin) {
    translations[builtin.id] = builtin;
  }

  const userTranslations = await loadUserTranslations();
  for (const translation of userTranslations) {
    if (translation.id === BUILTIN_KJV_METADATA.id) {
      console.warn(
        `[BibleLibrary] Ignoring user translation with reserved id "${translation.id}".`
      );
      continue;
    }
    translations[translation.id] = translation;
  }

  const summaries: BibleTranslationSummary[] = Object.values(translations).map(
    (translation) => ({
      id: translation.id,
      shortName: translation.shortName,
      fullName: translation.fullName,
      language: translation.language,
      source: translation.source,
      aliases: translation.aliases,
      isBuiltin: translation.isBuiltin,
      sourcePath: translation.sourcePath,
    })
  );

  summaries.sort((a, b) => {
    if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
    return a.shortName.localeCompare(b.shortName);
  });

  const { aliasIndex, aliasEntries } = buildAliasIndex(summaries);

  return { translations, summaries, aliasIndex, aliasEntries };
}

async function ensureLibraryLoaded(): Promise<BibleLibraryState> {
  if (libraryState) return libraryState;
  if (!libraryPromise) {
    libraryPromise = buildLibraryState().then((state) => {
      libraryState = state;
      return state;
    });
  }
  return libraryPromise;
}

export async function refreshBibleLibrary(): Promise<BibleTranslationSummary[]> {
  libraryPromise = buildLibraryState().then((state) => {
    libraryState = state;
    return state;
  });
  const state = await libraryPromise;
  return state.summaries;
}

export async function getAvailableTranslations(): Promise<
  BibleTranslationSummary[]
> {
  const state = await ensureLibraryLoaded();
  return state.summaries;
}

export async function getTranslationById(
  translationId: string
): Promise<BibleTranslation | null> {
  const state = await ensureLibraryLoaded();
  return state.translations[translationId] || null;
}

export async function resolveTranslationToken(
  token: string
): Promise<string | null> {
  const normalized = normalizeAlias(token);
  if (!normalized) return null;
  const state = await ensureLibraryLoaded();
  return state.aliasIndex.get(normalized) || null;
}

export async function findTranslationCue(text: string): Promise<string | null> {
  const normalized = normalizeAlias(text);
  if (!normalized) return null;
  const state = await ensureLibraryLoaded();
  const hasContext =
    /\b(translation|version)\b/i.test(normalized) ||
    /\b(in|from)\s+the\b/i.test(normalized);

  for (const entry of state.aliasEntries) {
    if (!entry.pattern.test(normalized)) continue;
    if (hasContext || entry.alias.length <= 4) {
      return entry.id;
    }
  }

  return null;
}

export const BUILTIN_KJV_ID = BUILTIN_KJV_METADATA.id;

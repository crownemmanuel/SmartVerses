import type {
  BibleBooks,
  BibleTranslationFile,
  BibleTranslationMetadata,
  BibleVerseEntry,
} from "../types/bible";

type RawBooks = Record<string, Record<string, Record<string, unknown>>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function coerceVerseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    if (typeof value.t === "string") return value.t;
    if (typeof value.text === "string") return value.text;
  }
  return String(value ?? "");
}

function extractBooks(raw: unknown): RawBooks | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.books)) {
    return raw.books as RawBooks;
  }
  return raw as RawBooks;
}

function convertBooks(inputBooks: RawBooks): BibleBooks {
  const books: BibleBooks = {};
  for (const [bookName, chapters] of Object.entries(inputBooks)) {
    if (!isRecord(chapters)) continue;
    books[bookName] = {};
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      if (!isRecord(verses)) continue;
      books[bookName][chapterKey] = {};
      for (const [verseKey, verseValue] of Object.entries(verses)) {
        const verseNum = parseInt(verseKey, 10);
        const entry: BibleVerseEntry = {
          v: Number.isFinite(verseNum) ? verseNum : 0,
          t: coerceVerseText(verseValue),
        };
        books[bookName][chapterKey][verseKey] = entry;
      }
    }
  }
  return books;
}

export type BibleConversionMetadata = BibleTranslationMetadata & {
  source?: string;
  aliases?: string[];
};

export function buildTranslationId(shortName: string): string {
  return normalizeId(shortName);
}

export function convertSourceToBibleTranslationFile(
  raw: unknown,
  metadata: BibleConversionMetadata
): BibleTranslationFile {
  if (!metadata.shortName.trim()) {
    throw new Error("Short name is required.");
  }
  if (!metadata.fullName.trim()) {
    throw new Error("Full name is required.");
  }

  const rawBooks = extractBooks(raw);
  if (!rawBooks || Object.keys(rawBooks).length === 0) {
    throw new Error("No books found in the source file.");
  }

  const books = convertBooks(rawBooks);
  const id = metadata.id?.trim()
    ? normalizeId(metadata.id)
    : buildTranslationId(metadata.shortName);

  return {
    id,
    shortName: metadata.shortName.trim(),
    fullName: metadata.fullName.trim(),
    language: metadata.language.trim(),
    source: metadata.source?.trim() || undefined,
    aliases:
      metadata.aliases && metadata.aliases.length > 0
        ? metadata.aliases.map((alias) => alias.trim()).filter(Boolean)
        : undefined,
    books,
  };
}

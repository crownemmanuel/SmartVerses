/**
 * SmartVerses Bible Service
 * 
 * Enhanced Bible reference parsing service with context-aware parsing,
 * speech-to-text preprocessing, and verse lookup capabilities.
 * 
 * Based on the "Bible Pacer" system from the original SmartVerses app.
 */

import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser";
import * as en from "bible-passage-reference-parser/esm/lang/en";
import { 
  ParsedBibleReference, 
  BibleParseContext, 
  DetectedBibleReference 
} from "../types/smartVerses";
import { loadVerses } from "./bibleService";

// =============================================================================
// GLOBAL STATE - Context Tracking
// =============================================================================

/**
 * Enhanced context tracking for chapter and verse-only references
 * This maintains the last successfully parsed reference for context-aware parsing
 */
let lastParsedContext: BibleParseContext = {
  book: null,
  chapter: null,
  verse: null,
  endChapter: null,
  endVerse: null,
  fullReference: null,
};

// Legacy context variable (for backward compatibility with bcv_parser)
let legacyContext: string | null = null;

// Singleton parser instance
let bcvParser: bcv_parser | null = null;

// Book name mapping from parser output to standard names
const BOOK_NAME_MAPPING: Record<string, string> = {
  Gen: "Genesis",
  Exod: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Esth: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Song: "Song of Solomon",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Jonah: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi",
  Matt: "Matthew",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Rom: "Romans",
  "1Cor": "1 Corinthians",
  "2Cor": "2 Corinthians",
  Gal: "Galatians",
  Eph: "Ephesians",
  Phil: "Philippians",
  Col: "Colossians",
  "1Thess": "1 Thessalonians",
  "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy",
  "2Tim": "2 Timothy",
  Titus: "Titus",
  Phlm: "Philemon",
  Heb: "Hebrews",
  Jas: "James",
  "1Pet": "1 Peter",
  "2Pet": "2 Peter",
  "1John": "1 John",
  "2John": "2 John",
  "3John": "3 John",
  Jude: "Jude",
  Rev: "Revelation",
};

// Shared regex for book name matching in normalization steps.
// Keep this in sync with common English book names used by the parser.
const BOOKS_REGEX_STRICT =
  "(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|" +
  "Joshua|Judges|Ruth|1\\s*Samuel|2\\s*Samuel|1\\s*Kings|2\\s*Kings|" +
  "1\\s*Chronicles|2\\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?"+
  "|Proverbs?|Ecclesiastes|Song\\s+of\\s+Solomon|Song\\s+of\\s+Songs|Canticles|" +
  "Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|" +
  "Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|" +
  "Matthew|Mark|Luke|John|Acts|Romans|1\\s*Corinthians|2\\s*Corinthians|" +
  "Galatians|Ephesians|Philippians|Colossians|1\\s*Thessalonians|2\\s*Thessalonians|" +
  "1\\s*Timothy|2\\s*Timothy|Titus|Philemon|Hebrews|James|1\\s*Peter|2\\s*Peter|" +
  "1\\s*John|2\\s*John|3\\s*John|Jude|Revelation)";

// Common abbreviations and shorthand used in spoken/typed references.
// Keep this tighter to avoid false positives; ambiguous 2-letter abbreviations are excluded.
const BOOKS_REGEX_ABBREV =
  "(?:Gen\\.?|Exod\\.?|Lev\\.?|Num\\.?|Deut\\.?|Josh\\.?|Judg\\.?|" +
  "1\\s*Sam\\.?|2\\s*Sam\\.?|1\\s*Kgs\\.?|2\\s*Kgs\\.?|1\\s*Chr\\.?|2\\s*Chr\\.?|" +
  "Neh\\.?|Esth\\.?|Ps\\.?|Prov\\.?|Eccl\\.?|Song\\.?|Cant\\.?|Isa\\.?|Jer\\.?|" +
  "Lam\\.?|Ezek\\.?|Dan\\.?|Hos\\.?|Joel\\.?|Amos\\.?|Obad\\.?|Jonah\\.?|Mic\\.?|" +
  "Nah\\.?|Hab\\.?|Zeph\\.?|Hag\\.?|Zech\\.?|Mal\\.?|Matt\\.?|Mark\\.?|Luke\\.?|" +
  "Jn\\.?|Acts\\.?|Rom\\.?|1\\s*Cor\\.?|2\\s*Cor\\.?|Gal\\.?|Eph\\.?|Phil\\.?|Col\\.?|" +
  "1\\s*Thess\\.?|2\\s*Thess\\.?|1\\s*Tim\\.?|2\\s*Tim\\.?|Phlm\\.?|Heb\\.?|Jas\\.?|" +
  "1\\s*Pet\\.?|2\\s*Pet\\.?|1\\s*Jn\\.?|2\\s*Jn\\.?|3\\s*Jn\\.?|Jude\\.?|Rev\\.?)";

const BOOKS_REGEX_FLEX = `(?:${BOOKS_REGEX_STRICT}|${BOOKS_REGEX_ABBREV})`;

const NUMBER_WORDS_PATTERN =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|" +
  "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|" +
  "thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|" +
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)";

const BIBLE_BOOK_PATTERN_STRICT = new RegExp(`\\b${BOOKS_REGEX_STRICT}\\b`, "i");
const BIBLE_BOOK_ABBREV_CONTEXT_PATTERN = new RegExp(
  `\\b${BOOKS_REGEX_ABBREV}\\b(?=\\s*(?:\\d{1,3}|chapter|ch\\.?|\\d{1,3}:\\d{1,3}))`,
  "i"
);
const BIBLE_BOOK_ABBREV_JOINED_PATTERN = new RegExp(
  `\\b${BOOKS_REGEX_ABBREV}\\s*\\d{1,3}(?::\\d{1,3})?\\b`,
  "i"
);

function containsBibleBook(text: string): boolean {
  if (!text) return false;
  if (BIBLE_BOOK_PATTERN_STRICT.test(text)) return true;
  return (
    BIBLE_BOOK_ABBREV_CONTEXT_PATTERN.test(text) ||
    BIBLE_BOOK_ABBREV_JOINED_PATTERN.test(text)
  );
}

function isDebugBibleParse(): boolean {
  try {
    return localStorage.getItem("proassist_debug_bible_parse") === "true";
  } catch {
    return false;
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Get or initialize the BCV parser
 */
function getParser(): bcv_parser {
  if (!bcvParser) {
    bcvParser = new bcv_parser(en);
    bcvParser.set_options({
      osis_compaction_strategy: "bcv",
      consecutive_combination_strategy: "combine",
    });
  }
  return bcvParser;
}

/**
 * Reset the parsing context
 */
export function resetParseContext(): void {
  lastParsedContext = {
    book: null,
    chapter: null,
    verse: null,
    endChapter: null,
    endVerse: null,
    fullReference: null,
  };
  legacyContext = null;
}

/**
 * Get the current parsing context
 */
export function getParseContext(): BibleParseContext {
  return { ...lastParsedContext };
}

// =============================================================================
// PREPROCESSING FUNCTIONS
// =============================================================================

/**
 * Transcription error corrections for Bible book names
 * Maps common transcription errors to correct book names
 * Only applies when followed by a number or "chapter"
 * 
 * To add more corrections, simply add entries to this object.
 * Format: 'error text': 'correct book name'
 * 
 * Note: Multi-word errors should be listed before single-word errors
 * that might match within them (e.g., "fast chronicles" before "fast")
 */
const TRANSCRIPTION_ERRORS: Record<string, string> = {
  // Multi-word corrections (order matters - longer patterns first)
  'fast chronicles': 'Chronicles',
  'fast kings': 'Kings',
  'fast samuel': 'Samuel',
  'force corinthians': '1 Corinthians',
  'the tronomy': 'Deuteronomy',
  // Single word corrections
  'axe': 'Acts',
  'romance': 'Romans',
  'viticus': 'Leviticus',
  'route': 'Ruth',
  'look': 'Luke',
};

/**
 * Normalize transcription errors in Bible book names
 * Only corrects when the word/phrase is followed by:
 * - A numeric number (e.g., "3", "16")
 * - A number word (e.g., "three", "sixteen")
 * - The word "chapter" or "ch" abbreviation
 * 
 * This prevents false positives in general text where these words
 * might appear in other contexts.
 * 
 * Examples:
 * - "axe chapter 1" -> "Acts chapter 1"
 * - "romance 3:5" -> "Romans 3:5"
 * - "fast chronicles chapter 2" -> "Chronicles chapter 2"
 * - "1 fast chronicles 5" -> "1 Chronicles 5"
 */
function normalizeTranscriptionErrors(text: string): string {
  let normalized = text;
  
  // Pattern that must follow the error word/phrase
  // Matches: space + (number | number word | chapter/ch)
  const requiredFollowPattern = `\\s+(?:\\d+|${NUMBER_WORDS_PATTERN}|chapter|ch\\.?)\\b`;
  
  // Process entries in reverse length order (longer patterns first)
  // This ensures "fast chronicles" is matched before just "fast"
  const sortedEntries = Object.entries(TRANSCRIPTION_ERRORS).sort(
    (a, b) => b[0].length - a[0].length
  );
  
  for (const [error, correction] of sortedEntries) {
    // Escape special regex characters in the error text
    const escapedError = error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create pattern: word boundary + error text + word boundary + required follow pattern
    // The word boundaries ensure we match complete words/phrases, not partial matches
    const pattern = new RegExp(
      `\\b${escapedError}\\b${requiredFollowPattern}`,
      'gi'
    );
    
    normalized = normalized.replace(pattern, (match) => {
      // Replace the error portion with the correction, keeping the following text
      // The match includes the error + the required follow pattern
      // We replace just the error part, keeping the rest
      return match.replace(new RegExp(`\\b${escapedError}\\b`, 'i'), correction);
    });
  }
  
  return normalized;
}

function normalizeLikelyBookHomophones(text: string): string {
  return text.replace(/\bdue\s+(?=chapter|ch\.?)/gi, "Joel ");
}

/**
 * Simple number word to digit conversion
 * Handles basic written numbers commonly used in speech
 */
function wordsToNumbers(text: string): string {
  const numberWords: Record<string, string> = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20',
    'thirty': '30', 'forty': '40', 'fifty': '50', 'sixty': '60',
    'seventy': '70', 'eighty': '80', 'ninety': '90',
    'first': '1', 'second': '2', 'third': '3',
  };

  let result = text.toLowerCase();
  
  // Handle compound numbers like "twenty one" -> "21"
  const compoundPattern = /(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)/gi;
  result = result.replace(compoundPattern, (_, tens, ones) => {
    const tensVal = parseInt(numberWords[tens.toLowerCase()] || '0');
    const onesVal = parseInt(numberWords[ones.toLowerCase()] || '0');
    return String(tensVal + onesVal);
  });

  // Handle simple number words
  for (const [word, digit] of Object.entries(numberWords)) {
    const pattern = new RegExp(`\\b${word}\\b`, 'gi');
    result = result.replace(pattern, digit);
  }

  return result;
}

function normalizeDashVariants(text: string): string {
  return text.replace(/[\u2013\u2014]/g, "-");
}

function normalizeOrdinalIndicators(text: string): string {
  return text.replace(/\b(\d{1,3})(?:st|nd|rd|th)\b/gi, "$1");
}

function romanToInt(roman: string): number | null {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  const chars = roman.toLowerCase().split("");
  let total = 0;
  let prev = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const value = map[chars[i]];
    if (!value) return null;
    if (value < prev) total -= value;
    else {
      total += value;
      prev = value;
    }
  }
  return total > 0 ? total : null;
}

function normalizeRomanNumeralsForChapterVerse(text: string): string {
  return text.replace(
    /\b(chapter|ch\.?|verse|verses|v|vs)\s+([ivxlc]{1,6})\b/gi,
    (match, label, roman) => {
      const value = romanToInt(roman);
      if (!value) return match;
      return `${label} ${value}`;
    }
  );
}

function normalizeRomanNumeralsForBooks(text: string): string {
  const numberedBooks =
    "(?:Samuel|Kings|Chronicles|Corinthians|Thessalonians|Timothy|Peter|John)";
  const regex = new RegExp(`\\b(I{1,3})\\.?\\s+(?=${numberedBooks}\\b)`, "gi");
  return text.replace(regex, (match, roman) => {
    const normalized = roman.toLowerCase();
    if (normalized === "i") return "1 ";
    if (normalized === "ii") return "2 ";
    if (normalized === "iii") return "3 ";
    return match;
  });
}

function normalizeSpokenChapterDigits(text: string): string {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  const regex = new RegExp(
    `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(?:chapter\\s+)?(\\d)\\s+(\\d)\\s+(\\d)(?=\\s*(?:,\\s*)?(?:verse|verses|v|vs)\\b)`,
    "gi"
  );

  return text.replace(regex, (_match, book, d1, d2, d3) => {
    const combined = `${d1}${d2}${d3}`;
    return `${book} ${combined}`;
  });
}

type VerseRange = { start: number; end: number };

function isValidVerseNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 200;
}

function parseVerseRangeList(rawList: string): VerseRange[] {
  const cleaned = normalizeDashVariants(String(rawList || ""))
    .replace(/\bthrough\b|\bthru\b/gi, "to")
    .replace(/\band\b/gi, ",")
    .replace(/&/g, ",")
    .replace(/\bverses?\b/gi, " ")
    .replace(/\bvv?\.?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const tokens = cleaned
    .split(/[,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const ranges: VerseRange[] = [];
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d{1,3})\s*(?:-|to)\s*(\d{1,3})$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (isValidVerseNumber(start) && isValidVerseNumber(end)) {
        ranges.push({ start: Math.min(start, end), end: Math.max(start, end) });
      }
      continue;
    }

    const nums = token.match(/\d{1,3}/g);
    if (!nums) continue;
    for (const n of nums) {
      const value = parseInt(n, 10);
      if (isValidVerseNumber(value)) {
        ranges.push({ start: value, end: value });
      }
    }
  }

  return ranges;
}

function mergeVerseRanges(ranges: VerseRange[]): VerseRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: VerseRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

function formatVerseRanges(ranges: VerseRange[]): string | null {
  if (!ranges.length) return null;
  const merged = mergeVerseRanges(ranges);
  return merged
    .map((range) =>
      range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`
    )
    .join(", ");
}

function trimVerseListTail(raw: string): string {
  if (!raw) return raw;
  const stopRegex = new RegExp(`\\b(?:chapter|ch\\.?|${BOOKS_REGEX_FLEX})\\b`, "i");
  const idx = raw.search(stopRegex);
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

function extractVerseListToken(text: string): string | null {
  const match = text.match(/\b(?:verses?|vv?\.?|v|vs)\s+([^.;\n]{0,80})/i);
  if (!match) return null;
  const trimmed = trimVerseListTail(match[1]);
  return trimmed || null;
}

function extractVerseRangesFromText(text: string): VerseRange[] {
  const ranges: VerseRange[] = [];
  const listToken = extractVerseListToken(text);
  if (listToken) {
    ranges.push(...parseVerseRangeList(listToken));
  }

  const explicitPattern =
    /\b(?:verse|verses|vv?\.?|v|vs)\s+(\d{1,3})(?:\s*(?:-|to|through|thru)\s*(\d{1,3}))?/gi;
  for (const match of text.matchAll(explicitPattern)) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    if (isValidVerseNumber(start) && isValidVerseNumber(end)) {
      ranges.push({ start: Math.min(start, end), end: Math.max(start, end) });
    }
  }

  return mergeVerseRanges(ranges);
}

/**
 * Preprocessor function to normalize Bible references before parsing
 * Handles period-separated references from speech-to-text
 */
function preprocessBibleReference(reference: string): string {
  // Step 1: Replace periods followed by spaces (or end of string) with just spaces
  // This handles cases like "Luke. Three. Three." -> "Luke Three Three"
  let normalized = reference.replace(/\.\s*/g, ' ');

  // Step 1b: Remove commas that speech-to-text often inserts between words
  // Example: "Romans, three, five" -> "Romans three five"
  // IMPORTANT: We only remove commas that follow letters, so verse lists like "John 3:16, 17"
  // (comma after a digit) remain intact.
  normalized = normalized.replace(/([A-Za-z])\s*,\s*(?=[A-Za-z0-9])/g, '$1 ');

  // Step 1c: Fix common typos from speech-to-text
  // Example: "chaper" -> "chapter"
  normalized = normalized.replace(/\bchaper\b/gi, "chapter");

  // Step 1d: Normalize transcription errors in Bible book names
  // This corrects common misspellings like "axe" -> "Acts", "Romance" -> "Romans"
  // Only applies when followed by a number or "chapter"
  normalized = normalizeTranscriptionErrors(normalized);

  // Step 1e: Normalize likely homophone book mentions with explicit chapter cues
  normalized = normalizeLikelyBookHomophones(normalized);

  // Step 1f: Remove stray slashes/backslashes before book names (e.g., "\Psalms 91:2")
  normalized = normalized.replace(
    new RegExp(`[\\\\/]+(?=${BOOKS_REGEX_FLEX})`, "gi"),
    ""
  );

  // Step 2: Clean up multiple spaces
  normalized = normalizeDashVariants(normalized);
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Normalize explicit chapter lists into verse-1 references.
 *
 * Example:
 * - "Exodus chapters 30 and 31" -> "Exodus 30:1; Exodus 31:1"
 */
function normalizeExplicitChapterListToVerseOne(text: string): string {
  const regex = new RegExp(
    `\\b(?<book>${BOOKS_REGEX_FLEX})\\s+chapters?\\s+(?<c1>\\d{1,3})\\s*(?:,|\\band\\b|\\bto\\b|-)\\s*(?<c2>\\d{1,3})\\b`,
    "gi"
  );

  return text.replace(regex, (_m, book, c1, c2) => {
    const b = String(book).trim();
    return `${b} ${c1}:1; ${b} ${c2}:1`;
  });
}

/**
 * Normalize chapter-only ranges/lists into explicit verse-1 references.
 *
 * Examples:
 * - "Matthew 21 to 22" -> "Matthew 21:1; Matthew 22:1"
 * - "Exodus 30 and 31" -> "Exodus 30:1; Exodus 31:1"
 *
 * Guardrails:
 * - Only applies when there is NO ":" present and NO explicit verse indicator
 * - Only triggers when exactly two chapter numbers are present (avoid "Isaiah 58, 6 to 14")
 */
function normalizeChapterRangeOrListToVerseOne(text: string): string {
  if (!text) return text;
  const lowered = String(text).toLowerCase();
  if (lowered.includes(":")) return text;
  if (/(?:\bverse\b|\bverses\b|\bvs\.?\b|\bv\.?\b)/i.test(text)) return text;

  const regex = new RegExp(
    `\\b(?<book>${BOOKS_REGEX_FLEX})\\s+(?<c1>\\d{1,3})\\s*(?:\\band\\b|\\bto\\b|-)\\s*(?<c2>\\d{1,3})\\b(?!\\s*(?:to|-)\\s*\\d)`,
    "gi"
  );

  return text.replace(regex, (_m, book, c1, c2) => {
    const b = String(book).trim();
    return `${b} ${c1}:1; ${b} ${c2}:1`;
  });
}

/**
 * Normalize common speech-to-text pattern: "Book 3, 5" -> "Book 3:5"
 *
 * AssemblyAI (and similar STT) frequently produces "Romans three, five" or "Romans 3, 5"
 * when the speaker means Romans 3:5. The BCV parser interprets "3, 5" as chapters 3 and 5,
 * so we rewrite this to a chapter:verse form before parsing.
 */
function normalizeCommaSeparatedChapterVerse(text: string): string {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  return text.replace(
    new RegExp(
      `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(\\d{1,3})\\s*,\\s*(\\d{1,3})(?=[^\\d]|$)`,
      "gi"
    ),
    (_match, book, chapter, verse) => `${book} ${chapter}:${verse}`
  );
}

/**
 * Normalize speech pattern: "Book 3 verse 5" or "Book chapter 3 verse 5" -> "Book 3:5"
 * This is common in live speech (e.g., "Psalm 66, verse three").
 *
 * Only used in aggressive speech normalization (transcription), not search box.
 */
function normalizeBookChapterVersePhrase(text: string): string {
  // IMPORTANT: Only match recognized Bible book names (via BOOKS_REGEX_FLEX).
  // This avoids capturing leading words like "In" (e.g., "In Micah chapter 2 verse 13").
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  const regex = new RegExp(
    // Support ranges like "verse 29 to 31" / "verse 29-31" / "verse 29 and 31"
    `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(?:chapter\\s+)?(\\d{1,3})\\s*(?:,\\s*)?(?:verse|verses|v|vs)\\s+(\\d{1,3})\\b(?:(?:\\s*(?:-|to)\\s*|\\s*(?:and|&)\\s*)(\\d{1,3})\\b)?(?=[^\\d]|$)`,
    "gi"
  );
  return text.replace(regex, (_match, book, chapter, verse, endVerse) => {
    if (endVerse) return `${book} ${chapter}:${verse}-${endVerse}`;
    return `${book} ${chapter}:${verse}`;
  });
}

/**
 * Normalize verse lists: "Book 3 verses 4, 5 and 7" -> "Book 3:4, 5, 7"
 */
function normalizeBookChapterVerseList(text: string): string {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  const regex = new RegExp(
    `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(?:chapter\\s+)?(\\d{1,3})\\s*(?:,\\s*)?(?:verses?|vv?\\.?|v|vs)\\s+([^.;\\n]{0,80})`,
    "gi"
  );

  return text.replace(regex, (match, book, chapter, verseList) => {
    const ranges = parseVerseRangeList(trimVerseListTail(verseList));
    const formatted = formatVerseRanges(ranges);
    if (!formatted) return match;
    return `${book} ${chapter}:${formatted}`;
  });
}

/**
 * Normalize mixed typed/speech pattern: "Book chapter 21:5" -> "Book 21:5"
 * (Sometimes users say/type "chapter" and still include a colon.)
 */
function normalizeBookChapterColonVerse(text: string): string {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  const regex = new RegExp(
    `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(?:chapter|ch\\.?)+\\s+(\\d{1,3}:\\d{1,3}(?:-\\d{1,3})?)\\b`,
    "gi"
  );
  return text.replace(regex, (_m, book, ref) => `${book} ${ref}`);
}

/**
 * Normalize speech pattern where "verse" appears later with filler words in between:
 * Example: "Psalms 107, thank you Holy Spirit, verse 15 and 16" -> "Psalms 107:15-16"
 *
 * Guardrails:
 * - The gap between chapter and "verse" must contain no digits (avoid "Isaiah 56, I mean 58, 6 to 14")
 * - Cap the gap length to avoid spanning too far across sentences.
 */
function normalizeBookChapterThenVerseLater(text: string): string {
  const regex = new RegExp(
    `\\b(${BOOKS_REGEX_FLEX})\\s+(\\d{1,3})\\b([^\\d]{0,80}?)\\b(?:verse|verses|v|vs)\\s+([^.;\\n]{0,60})`,
    "gi"
  );
  return text.replace(regex, (match, book, chapter, _gap, verseList) => {
    const ranges = parseVerseRangeList(trimVerseListTail(verseList));
    const formatted = formatVerseRanges(ranges);
    if (!formatted) return match;
    return `${book} ${chapter}:${formatted}`;
  });
}

/**
 * Normalize trailing verse lists after a full reference: "John 3:16 and 17" -> "John 3:16-17"
 */
function normalizeTrailingVerseListAfterFullReference(text: string): string {
  const regex = new RegExp(
    `\\b(${BOOKS_REGEX_FLEX})\\s+(\\d{1,3}):(\\d{1,3})\\s*((?:\\s*(?:,|and|&|to|-)\\s*\\d{1,3}){1,6})`,
    "gi"
  );
  return text.replace(regex, (match, book, chapter, startVerse, tail) => {
    const ranges = parseVerseRangeList(`${startVerse} ${tail}`);
    const formatted = formatVerseRanges(ranges);
    if (!formatted) return match;
    return `${book} ${chapter}:${formatted}`;
  });
}

/**
 * Normalize speech pattern: "Book 3 16" -> "Book 3:16"
 * Only used in aggressive speech normalization to avoid false positives in typed search.
 */
function normalizeSpaceSeparatedChapterVerse(text: string): string {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  return text.replace(
    new RegExp(
      `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(\\d{1,3})\\s+(\\d{1,3})(?=[^\\d]|$)`,
      "gi"
    ),
    (_match, book, chapter, verse) => `${book} ${chapter}:${verse}`
  );
}

/**
 * Normalize comma between chapter and verse word: "chapter 21, verse 22" -> "chapter 21 verse 22"
 */
function normalizeCommaBetweenChapterAndVerse(text: string): string {
  return text.replace(/\b(\d{1,3})\s*,\s*(?=(?:verse|verses|v|vs)\b)/gi, "$1 ");
}

function normalizeFromVerseKeyword(text: string): string {
  return text.replace(/\bfrom\s+(verses?|vv?\.?|v|vs)\b/gi, "$1");
}

/**
 * Normalize missing space between book and chapter: "Daniel2:16" -> "Daniel 2:16"
 */
function normalizeMissingBookChapterSpace(text: string): string {
  const regex = new RegExp(`(${BOOKS_REGEX_FLEX})(\\d{1,3}(?::\\d{1,3})?)`, "gi");
  return text.replace(regex, "$1 $2");
}

/**
 * Normalize concatenated references: "Daniel 2:16Daniel 2:17" -> "Daniel 2:16 Daniel 2:17"
 */
function normalizeConcatenatedReferences(text: string): string {
  const regex = new RegExp(`(\\d{1,3}:\\d{1,3}(?:-\\d{1,3})?)(${BOOKS_REGEX_FLEX})`, "gi");
  return text.replace(regex, "$1 $2");
}


/**
 * Resolve a book name to the canonical form used in the verse data.
 */
function resolveBookName(bookText: string): string {
  // NOTE: `bcv_parser` does not return OSIS for a bare book name (e.g., "john"),
  // so we probe with a minimal reference ("Book 1:1") to resolve the OSIS book.
  const normalizedBookText = bookText
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^([1-3])\s*(?=[A-Za-z])/, "$1 "); // "1john" -> "1 john"

  const parser = getParser();
  parser.parse(`${normalizedBookText} 1:1`);
  const osis = parser.osis?.() as string | undefined;
  if (osis && osis.length > 0) {
    const first = osis.split(",")[0];
    const osisBook = first.split(".")[0];
    return mapBookName(osisBook);
  }

  // Fallback: return normalized input (may be lowercased); downstream parsing is case-insensitive.
  return normalizedBookText;
}

/**
 * Try to interpret combined chapter+verse digits like "John316" as "John 3:16".
 * Only applies when there is exactly one valid match in the verse data.
 */
async function normalizeCombinedChapterVerseInput(
  text: string,
  versesOverride?: Record<string, string>
): Promise<string> {
  const combinedRegex = new RegExp(
    `(?:\\b(?:the\\s+)?(?:book\\s+of\\s+))?(?<book>${BOOKS_REGEX_FLEX})\\s*(?<combined>\\d{3,5})\\b`,
    "gi"
  );

  const verses = versesOverride || (await loadVerses());
  let result = text;
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(result)) !== null) {
    const groups = match.groups as { book?: string; combined?: string } | undefined;
    const bookText = groups?.book;
    const combined = groups?.combined;
    if (!bookText || !combined) continue;

    // Heuristic guardrails:
    // - If punctuation immediately follows the digits, it's probably a chapter mention
    //   (e.g., "Psalms 107, ... verse 15") and we should NOT split 107 -> 10:7.
    // - Skip if a "verse" keyword appears shortly after, which implies the digits are a chapter.
    // - If ":" follows, it's already explicit chapter:verse (e.g., "Psalms 107:15").
    const afterIdx = match.index + match[0].length;
    const nextChar = result[afterIdx] || "";
    const afterWindow = result.slice(afterIdx, afterIdx + 100);
    if (
      nextChar === ":" ||
      /[),.;]/.test(nextChar) ||
      /\b(?:verse|verses|v|vs)\b/i.test(afterWindow)
    ) {
      continue;
    }

    const bookName = resolveBookName(bookText);
    const candidates: Array<{ chapter: number; verse: number }> = [];

    // Try chapter lengths of 1 and 2 digits (most realistic)
    for (const chapterLen of [1, 2]) {
      if (combined.length <= chapterLen) continue;
      const chapter = parseInt(combined.slice(0, chapterLen), 10);
      const verse = parseInt(combined.slice(chapterLen), 10);
      if (!Number.isFinite(chapter) || !Number.isFinite(verse)) continue;
      if (chapter <= 0 || verse <= 0) continue;
      candidates.push({ chapter, verse });
    }

    const valid = candidates.filter((c) => {
      const key = `${bookName} ${c.chapter}:${c.verse}`;
      return key in verses;
    });

    if (valid.length === 1) {
      const { chapter, verse } = valid[0];
      const replacement = `${bookName} ${chapter}:${verse}`;
      result =
        result.slice(0, match.index) +
        replacement +
        result.slice(match.index + match[0].length);

      // Reset regex index after replacement
      combinedRegex.lastIndex = match.index + replacement.length;
    }
  }

  return result;
}

// =============================================================================
// PATTERN DETECTION FUNCTIONS
// =============================================================================

/**
 * Check if reference is verse-only (e.g., "verse 7", "from verse 18", "in verse 5")
 */
function isVerseOnlyReference(text: string): number | null {
  const normalized = text.trim();

  // Look for "verse" or "v" followed by a number anywhere in the text
  const flexiblePatterns = [
    /(?:verse|verses|vv?\.?|v|vs)\s+(\d+)/i,
  ];

  for (const pattern of flexiblePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const verseNum = parseInt(match[1], 10);
      if (!isNaN(verseNum) && verseNum > 0) {
        return verseNum;
      }
    }
  }

  return null;
}

/**
 * Check if reference is chapter-only (e.g., "Matthew chapter 5", "chapter 3 of John")
 */
function isChapterOnlyReference(text: string): { book: string; chapter: number } | null {
  const chapterOnlyPatterns = [
    // "Matthew chapter 5", "Luke chapter three"
    /^(?:the\s+book\s+of\s+)?([A-Za-z0-9\s]+?)\s+chapter\s+(\d+|[a-z]+)$/i,
    // "chapter 5 of Matthew"
    /^chapter\s+(\d+|[a-z]+)\s+of\s+([A-Za-z0-9\s]+)$/i,
  ];

  const normalized = text.trim();

  for (const pattern of chapterOnlyPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let book, chapterStr;
      if (pattern.source.startsWith('^chapter')) {
        chapterStr = match[1];
        book = match[2];
      } else {
        book = match[1];
        chapterStr = match[2];
      }

      const chapter = parseInt(chapterStr, 10);
      if (!isNaN(chapter)) {
        return { book: book.trim(), chapter };
      }
    }
  }
  return null;
}

/**
 * Check for navigation commands that should be filtered out
 */
function isNavigationCommand(
  text: string
): 'next' | 'previous' | 'next_chapter' | 'previous_chapter' | null {
  const normalized = text.toLowerCase().trim();
  
  const nextPatterns = [
    /\bnext\s+(?:verse|scripture|one)\b/,
    /\bgo\s+(?:to\s+)?next\b/,
    /\bshow\s+next\b/,
  ];
  
  const prevPatterns = [
    /\b(?:previous|last)\s+(?:verse|scripture|one)\b/,
    /\bgo\s+back\b/,
  ];

  const nextChapterPatterns = [
    /\bnext\s+chapter\b/,
    /\bgo\s+(?:to\s+)?next\s+chapter\b/,
    /\bchapter\s+after\b/,
  ];

  const prevChapterPatterns = [
    /\bprevious\s+chapter\b/,
    /\bprior\s+chapter\b/,
    /\bgo\s+back\s+a\s+chapter\b/,
  ];
  
  for (const pattern of nextPatterns) {
    if (pattern.test(normalized)) return 'next';
  }
  
  for (const pattern of prevPatterns) {
    if (pattern.test(normalized)) return 'previous';
  }

  for (const pattern of nextChapterPatterns) {
    if (pattern.test(normalized)) return 'next_chapter';
  }

  for (const pattern of prevChapterPatterns) {
    if (pattern.test(normalized)) return 'previous_chapter';
  }
  
  return null;
}

function isLikelyNumberedList(text: string): boolean {
  const normalized = String(text || "").toLowerCase().trim();
  if (!normalized) return false;
  if (!/\bnumber\b/.test(normalized)) return false;
  if (/\bnumbers\b/.test(normalized)) return false;
  if (containsBibleBook(normalized)) return false;
  if (/\b(?:chapter|ch\.?|verse|verses|v|vs)\b/.test(normalized)) return false;
  if (/\d{1,3}:\d{1,3}/.test(normalized)) return false;

  const pattern = new RegExp(
    `\\bnumber\\s+(?:\\d{1,3}|${NUMBER_WORDS_PATTERN})\\b`,
    "i"
  );
  return pattern.test(normalized);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract chapter and verse numbers from text using regex
 */
function extractChapterAndVerse(text: string): { chapter: number | null; verse: number | null } {
  const result = {
    chapter: null as number | null,
    verse: null as number | null,
  };

  const chapterPattern = /(?:chapter|ch\.?)\s*(\d+)/i;
  const versePattern = /(?:verse|v\.?)\s*(\d+)/i;

  const chapterMatch = text.match(chapterPattern);
  if (chapterMatch) {
    result.chapter = parseInt(chapterMatch[1]);
  }

  const verseMatch = text.match(versePattern);
  if (verseMatch) {
    result.verse = parseInt(verseMatch[1]);
  }

  return result;
}

function extractExplicitChapterNumber(text: string): number | null {
  const match = text.match(/\b(?:chapter|ch\.?)\s*(\d{1,3})\b/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildContextualPassages(
  book: string,
  fullBookName: string,
  chapter: number,
  ranges: VerseRange[]
): ParsedBibleReference[] {
  const mappedBook = mapBookName(book);
  return ranges.map((range) => ({
    book: mappedBook,
    fullBookName,
    chapter,
    endChapter: chapter,
    startVerse: range.start,
    endVerse: range.end,
    translation: "default",
    displayRef: createDisplayRef(fullBookName, chapter, range.start, range.end),
  }));
}

function parseContextualVerseReferences(text: string): ParsedBibleReference[] | null {
  if (!lastParsedContext.book) return null;

  const book = lastParsedContext.book;
  const fullBookName = lastParsedContext.book;
  const explicitChapter = extractExplicitChapterNumber(text);
  const chapter = explicitChapter ?? lastParsedContext.chapter ?? null;

  const ranges = extractVerseRangesFromText(text);
  if (chapter && ranges.length > 0) {
    return buildContextualPassages(book, fullBookName, chapter, ranges);
  }

  // Handle "chapter N" without explicit verses (default to verse 1).
  if (explicitChapter && (!ranges || ranges.length === 0)) {
    return buildContextualPassages(book, fullBookName, explicitChapter, [
      { start: 1, end: 1 },
    ]);
  }

  return null;
}

function updateContextFromPassages(passages: ParsedBibleReference[], rawReference?: string): void {
  if (!passages || passages.length === 0) return;
  const lastPassage = passages[passages.length - 1];
  const endChapter = lastPassage.endChapter ?? lastPassage.chapter;
  const endVerse = lastPassage.endVerse ?? lastPassage.startVerse;
  lastParsedContext.book = lastPassage.fullBookName || lastPassage.book;
  lastParsedContext.chapter = lastPassage.chapter;
  lastParsedContext.verse = endVerse;
  lastParsedContext.endChapter = endChapter;
  lastParsedContext.endVerse = endVerse;
  lastParsedContext.fullReference = `${lastPassage.book} ${endChapter}:${endVerse}`;
  if (rawReference) legacyContext = rawReference;
}

/**
 * Map parser book name to full book name
 */
function mapBookName(parserBook: string): string {
  return BOOK_NAME_MAPPING[parserBook] || parserBook;
}

/**
 * Create display reference string
 */
function createDisplayRef(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse?: number,
  endChapter?: number
): string {
  const fullBook = mapBookName(book);
  if (endVerse && endVerse !== startVerse) {
    if (endChapter && endChapter !== chapter) {
      return `${fullBook} ${chapter}:${startVerse}-${endChapter}:${endVerse}`;
    }
    return `${fullBook} ${chapter}:${startVerse}-${endVerse}`;
  }
  return `${fullBook} ${chapter}:${startVerse}`;
}

// =============================================================================
// MAIN PARSING FUNCTION
// =============================================================================

/**
 * Main function to parse a Bible verse reference
 * This is the core "Bible Pacer" function that handles all reference formats
 */
export function parseVerseReference(reference: string): ParsedBibleReference[] | null {
  // Check for navigation commands first
  if (isNavigationCommand(reference)) {
    return null;
  }

  let passages: ParsedBibleReference[] | null = null;
  let hasBook = false;

  try {
    // Step 1: Preprocess the reference
    const preprocessed = preprocessBibleReference(reference);

    // Step 2: Convert written numbers to numeric values
    let textToProcess = wordsToNumbers(preprocessed);
    textToProcess = normalizeOrdinalIndicators(textToProcess);
    textToProcess = normalizeRomanNumeralsForBooks(textToProcess);
    textToProcess = normalizeRomanNumeralsForChapterVerse(textToProcess);
    textToProcess = normalizeSpokenChapterDigits(textToProcess);
    textToProcess = normalizeCommaBetweenChapterAndVerse(textToProcess);
    textToProcess = normalizeFromVerseKeyword(textToProcess);
    textToProcess = normalizeCommaSeparatedChapterVerse(textToProcess);
    textToProcess = normalizeExplicitChapterListToVerseOne(textToProcess);
    textToProcess = normalizeChapterRangeOrListToVerseOne(textToProcess);

    // If we have an explicit Bible book name, apply the safe "chapter/verse" phrase rewrite.
    // This avoids falling back to previous context when parsing phrases like:
    // "Luke chapter 4 verse 1 to 2"
    hasBook = containsBibleBook(textToProcess);
    if (hasBook) {
      textToProcess = normalizeBookChapterVerseList(textToProcess);
      textToProcess = normalizeBookChapterColonVerse(textToProcess);
      textToProcess = normalizeBookChapterVersePhrase(textToProcess);
      textToProcess = normalizeBookChapterThenVerseLater(textToProcess);
      textToProcess = normalizeTrailingVerseListAfterFullReference(textToProcess);
    }

    textToProcess = normalizeMissingBookChapterSpace(textToProcess);
    textToProcess = normalizeConcatenatedReferences(textToProcess);

    if (isDebugBibleParse()) {
      console.log("[SmartVerses][BibleParse] raw:", reference);
      console.log("[SmartVerses][BibleParse] normalized:", textToProcess);
    }

    // Check for context-only references (e.g., "chapter 3 verse 5", "verses 2 and 3")
    if (!hasBook) {
      const contextual = parseContextualVerseReferences(textToProcess);
      if (contextual && contextual.length > 0) {
        updateContextFromPassages(contextual, reference);
        return contextual;
      }
    }

    // Check for chapter-only reference (e.g., "Matthew chapter 5")
    const chapterOnly = isChapterOnlyReference(textToProcess);
    if (chapterOnly !== null) {
      const parser = getParser();
      const bookResult = parser.parse(chapterOnly.book);
      let fullBookName = chapterOnly.book;

      const osisResults = bookResult.osis_and_indices();
      if (osisResults && osisResults.length > 0 && osisResults[0].osis) {
        const osisParts = osisResults[0].osis.split('.');
        if (osisParts.length > 0) {
          fullBookName = osisParts[0];
        }
      }

      const mappedBook = mapBookName(fullBookName);
      passages = [
        {
          book: mappedBook,
          fullBookName: fullBookName,
          chapter: chapterOnly.chapter,
          endChapter: chapterOnly.chapter,
          startVerse: 1,
          endVerse: 1,
          translation: 'default',
          displayRef: createDisplayRef(fullBookName, chapterOnly.chapter, 1),
        },
      ];
      updateContextFromPassages(passages, reference);
      return passages;
    }

    // Standard parsing using bcv_parser
    const parser = getParser();
    parser.parse(textToProcess);
    passages = [];

    // Use `parser.entities[].passages[]` to avoid fragile string parsing of OSIS ranges.
    // This correctly handles:
    // - chapter-only inputs (e.g., "Romans 3" => start v=1, end v=31)
    // - verse ranges (e.g., "John 3:16-18")
    // - multiple references (e.g., "Romans 3:3, 5")
    const entities = ((parser as unknown) as any).entities as Array<any> | undefined;
    for (const entity of entities || []) {
      const entityPassages = (entity as any).passages as Array<any> | undefined;
      if (!entityPassages) continue;

      for (const p of entityPassages) {
        if (!p?.valid?.valid) continue;

        const start = p.start;
        const end = p.end || p.start;

        if (!start?.b || !start?.c) continue;

        const book = mapBookName(start.b);
        const chapter = start.c;
        const startVerse = start.v || 1;
        const endChapter = end.c || chapter;
        const endVerse = end.v || startVerse;

        passages.push({
          book,
          fullBookName: start.b,
          chapter,
          endChapter,
          startVerse,
          endVerse,
          translation: 'default',
          displayRef: createDisplayRef(
            start.b,
            chapter,
            startVerse,
            endVerse !== startVerse ? endVerse : undefined,
            endChapter !== chapter ? endChapter : undefined
          ),
        });
      }
    }

    if (isDebugBibleParse()) {
      console.log(
        "[SmartVerses][BibleParse] passages:",
        (passages || []).map((p) => p.displayRef)
      );
    }

  } catch (error) {
    console.error('Error parsing verse reference:', error);
  }

  // If no passages found and we have a stored context, try parsing with context.
  // IMPORTANT: Only do this when the current input does NOT already contain a book name.
  // If it contains a book and parsing failed, a context fallback can return the wrong book
  // (e.g., reusing the previous passage's book).
  if (
    (!passages || passages.length === 0) &&
    !hasBook &&
    lastParsedContext.fullReference
  ) {
    try {
      const parser = getParser();
      const contextResult = parser.parse_with_context(reference, lastParsedContext.fullReference);
      const osisRef = contextResult.osis();
      if (osisRef) {
        passages = parseVerseReference(osisRef);
      }
    } catch (error) {
      console.error('Error parsing with context:', error);
    }
  }

  // Also try with the old context variable as a final fallback
  if (
    (!passages || passages.length === 0) &&
    !hasBook &&
    legacyContext &&
    legacyContext !== reference
  ) {
    try {
      const parser = getParser();
      const contextResult = parser.parse_with_context(reference, legacyContext);
      const osisRef = contextResult.osis();
      if (osisRef) {
        passages = parseVerseReference(osisRef);
      }
    } catch (error) {
      console.error('Error with legacy context:', error);
    }
  }

  // If still no passages and context exists, try regex extraction
  if ((!passages || passages.length === 0) && legacyContext) {
    const extracted = extractChapterAndVerse(reference);
    if (extracted.chapter || extracted.verse) {
      const contextParts = legacyContext.match(/^(.+?)\s+(\d+):(\d+)$/);
      if (contextParts) {
        const [, book, contextChapter, contextVerse] = contextParts;
        const chapter = extracted.chapter || parseInt(contextChapter);
        const verse = extracted.verse || parseInt(contextVerse);

        passages = [
          {
            book: book,
            fullBookName: book,
            chapter,
            startVerse: verse,
            endVerse: verse,
            translation: 'default',
            displayRef: createDisplayRef(book, chapter, verse),
          },
        ];
      }
    }
  }

  // If we successfully parsed a reference, update the context variables
  if (passages && passages.length > 0) {
    updateContextFromPassages(passages, reference);
  }

  return passages && passages.length > 0 ? passages : null;
}

// =============================================================================
// VERSE LOOKUP FUNCTIONS
// =============================================================================

/**
 * Look up verse text for a parsed reference
 */
export async function lookupVerse(reference: ParsedBibleReference): Promise<string | null> {
  try {
    const verses = await loadVerses();
    const key = `${reference.book} ${reference.chapter}:${reference.startVerse}`;
    const text = verses[key];
    
    if (!text) {
      return null;
    }

    // Clean up the verse text
    return text
      .replace(/^#\s*/, "") // Remove leading #
      .replace(/\[([^\]]+)\]/g, "$1"); // Remove brackets around italic words
  } catch (error) {
    console.error('Error looking up verse:', error);
    return null;
  }
}

function findLastVerseInChapter(
  verses: Record<string, string>,
  book: string,
  chapter: number
): number | null {
  for (let v = 200; v >= 1; v--) {
    const key = `${book} ${chapter}:${v}`;
    if (key in verses) return v;
  }
  return null;
}

/**
 * Look up multiple verses for a reference range
 */
export async function lookupVerses(reference: ParsedBibleReference): Promise<Array<{
  verse: number;
  text: string;
  displayRef: string;
}>> {
  const results: Array<{ verse: number; text: string; displayRef: string }> = [];
  
  try {
    const verses = await loadVerses();

    const endChapter = reference.endChapter ?? reference.chapter;
    const startChapter = reference.chapter;

    for (let c = startChapter; c <= endChapter; c++) {
      const startVerse = c === startChapter ? reference.startVerse : 1;
      const endVerse =
        c === endChapter
          ? reference.endVerse
          : findLastVerseInChapter(verses, reference.book, c);

      if (!endVerse || endVerse < startVerse) continue;

      for (let v = startVerse; v <= endVerse; v++) {
        const key = `${reference.book} ${c}:${v}`;
        let text = verses[key];

        if (text) {
          // Clean up the verse text
          text = text
            .replace(/^#\s*/, "")
            .replace(/\[([^\]]+)\]/g, "$1");

          results.push({
            verse: v,
            text,
            displayRef: `${reference.book} ${c}:${v}`,
          });
        }
      }
    }
  } catch (error) {
    console.error('Error looking up verses:', error);
  }
  
  return results;
}

// =============================================================================
// HIGH-LEVEL DETECTION FUNCTION
// =============================================================================

/**
 * Detect Bible references in text and return fully resolved references with verse text
 */
export async function detectAndLookupReferences(
  text: string,
  options?: { aggressiveSpeechNormalization?: boolean }
): Promise<DetectedBibleReference[]> {
  const results: DetectedBibleReference[] = [];

  const navCommand = isNavigationCommand(text);
  if (navCommand && lastParsedContext.book && lastParsedContext.chapter) {
    const mappedBook = mapBookName(lastParsedContext.book);
    let target: { book: string; chapter: number; verse: number } | null = null;

    if (navCommand === "next" && lastParsedContext.verse) {
      const next = await getNextVerse(
        mappedBook,
        lastParsedContext.chapter,
        lastParsedContext.verse
      );
      if (next) target = { book: next.book, chapter: next.chapter, verse: next.verse };
    } else if (navCommand === "previous" && lastParsedContext.verse) {
      const prev = await getPreviousVerse(
        mappedBook,
        lastParsedContext.chapter,
        lastParsedContext.verse
      );
      if (prev) target = { book: prev.book, chapter: prev.chapter, verse: prev.verse };
    } else if (navCommand === "next_chapter") {
      target = {
        book: mappedBook,
        chapter: lastParsedContext.chapter + 1,
        verse: 1,
      };
    } else if (navCommand === "previous_chapter" && lastParsedContext.chapter > 1) {
      target = {
        book: mappedBook,
        chapter: lastParsedContext.chapter - 1,
        verse: 1,
      };
    }

    if (target) {
      const verseData = await loadVerseByComponents(
        target.book,
        target.chapter,
        target.verse
      );
      if (verseData) {
        const passage: ParsedBibleReference = {
          book: target.book,
          fullBookName: target.book,
          chapter: target.chapter,
          endChapter: target.chapter,
          startVerse: target.verse,
          endVerse: target.verse,
          translation: "default",
          displayRef: verseData.displayRef,
        };
        updateContextFromPassages([passage], text);
        return [
          {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            reference: verseData.displayRef,
            displayRef: verseData.displayRef,
            verseText: verseData.verseText,
            source: "direct",
            transcriptText: text,
            timestamp: Date.now(),
            book: target.book,
            chapter: target.chapter,
            verse: target.verse,
            isNavigationResult: true,
          },
        ];
      }
    }
  }

  if (isLikelyNumberedList(text)) {
    return results;
  }

  // Normalize common speech/typo patterns before parsing
  const preprocessed = preprocessBibleReference(text);
  let numericText = wordsToNumbers(preprocessed);
  numericText = normalizeOrdinalIndicators(numericText);
  numericText = normalizeRomanNumeralsForBooks(numericText);
  numericText = normalizeRomanNumeralsForChapterVerse(numericText);
  numericText = normalizeSpokenChapterDigits(numericText);
  numericText = normalizeCommaBetweenChapterAndVerse(numericText);
  numericText = normalizeFromVerseKeyword(numericText);

  // Guardrail: only apply the more aggressive/heuristic transforms if we actually
  // see a known Bible book in the text. This avoids accidental "chapter/verse"
  // style matches on unrelated speech.
  const hasBook = containsBibleBook(numericText);

  // Always handle the common "Book <chapter> ... verse <n>" pattern (even for typed queries),
  // but only when a Bible book is present.
  const phraseNormalized = hasBook
    ? normalizeTrailingVerseListAfterFullReference(
        normalizeBookChapterThenVerseLater(
          normalizeBookChapterVersePhrase(
            normalizeBookChapterColonVerse(normalizeBookChapterVerseList(numericText))
          )
        )
      )
    : numericText;

  let normalizedText = normalizeCommaSeparatedChapterVerse(phraseNormalized);
  normalizedText = normalizeExplicitChapterListToVerseOne(normalizedText);
  if (hasBook) {
    normalizedText = normalizeChapterRangeOrListToVerseOne(normalizedText);
  }
  if (options?.aggressiveSpeechNormalization && hasBook) {
    normalizedText = normalizeSpaceSeparatedChapterVerse(normalizedText);
  }
  normalizedText = normalizeMissingBookChapterSpace(normalizedText);
  normalizedText = normalizeConcatenatedReferences(normalizedText);
  // Reuse already-cached verses to avoid redundant loads during normalization.
  const verses = await loadVerses();
  normalizedText = await normalizeCombinedChapterVerseInput(normalizedText, verses);

  if (isDebugBibleParse()) {
    console.log("[SmartVerses][Detect] raw:", text);
    console.log("[SmartVerses][Detect] normalized:", normalizedText);
  }

  const parsed = parseVerseReference(normalizedText);
  if (!parsed || parsed.length === 0) {
    return results;
  }

  for (const ref of parsed) {
    const verseData = await lookupVerses(ref);
    
    for (const verse of verseData) {
      results.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        reference: verse.displayRef,
        displayRef: verse.displayRef,
        verseText: verse.text,
        source: 'direct',
        transcriptText: text,
        timestamp: Date.now(),
        // Include components for navigation
        book: ref.book,
        chapter: ref.chapter,
        verse: verse.verse,
      });
    }
  }

  return results;
}

// =============================================================================
// VERSE NAVIGATION FUNCTIONS
// =============================================================================

/**
 * Check if a verse exists in the Bible data
 */
export async function verseExists(book: string, chapter: number, verse: number): Promise<boolean> {
  try {
    const verses = await loadVerses();
    const key = `${book} ${chapter}:${verse}`;
    return key in verses;
  } catch {
    return false;
  }
}

/**
 * Get the previous verse reference if it exists
 * Handles chapter boundaries (e.g., John 3:1 → John 2:25)
 */
export async function getPreviousVerse(
  book: string,
  chapter: number,
  verse: number
): Promise<{ book: string; chapter: number; verse: number; displayRef: string } | null> {
  try {
    const verses = await loadVerses();
    
    // Try previous verse in same chapter
    if (verse > 1) {
      const prevKey = `${book} ${chapter}:${verse - 1}`;
      if (prevKey in verses) {
        return {
          book,
          chapter,
          verse: verse - 1,
          displayRef: prevKey,
        };
      }
    }
    
    // Try last verse of previous chapter
    if (chapter > 1) {
      // Find the last verse of the previous chapter by checking verses 1-200
      for (let v = 200; v >= 1; v--) {
        const prevChapterKey = `${book} ${chapter - 1}:${v}`;
        if (prevChapterKey in verses) {
          return {
            book,
            chapter: chapter - 1,
            verse: v,
            displayRef: prevChapterKey,
          };
        }
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the next verse reference if it exists
 * Handles chapter boundaries (e.g., John 3:36 → John 4:1)
 */
export async function getNextVerse(
  book: string,
  chapter: number,
  verse: number
): Promise<{ book: string; chapter: number; verse: number; displayRef: string } | null> {
  try {
    const verses = await loadVerses();
    
    // Try next verse in same chapter
    const nextKey = `${book} ${chapter}:${verse + 1}`;
    if (nextKey in verses) {
      return {
        book,
        chapter,
        verse: verse + 1,
        displayRef: nextKey,
      };
    }
    
    // Try first verse of next chapter
    const nextChapterKey = `${book} ${chapter + 1}:1`;
    if (nextChapterKey in verses) {
      return {
        book,
        chapter: chapter + 1,
        verse: 1,
        displayRef: nextChapterKey,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get navigation info for a verse (previous and next availability)
 */
export async function getVerseNavigation(
  book: string,
  chapter: number,
  verse: number
): Promise<{
  hasPrevious: boolean;
  hasNext: boolean;
  previous: { book: string; chapter: number; verse: number; displayRef: string } | null;
  next: { book: string; chapter: number; verse: number; displayRef: string } | null;
}> {
  const [previous, next] = await Promise.all([
    getPreviousVerse(book, chapter, verse),
    getNextVerse(book, chapter, verse),
  ]);

  return {
    hasPrevious: previous !== null,
    hasNext: next !== null,
    previous,
    next,
  };
}

/**
 * Load a verse by its components and return full reference data
 */
export async function loadVerseByComponents(
  book: string,
  chapter: number,
  verse: number
): Promise<{
  reference: string;
  displayRef: string;
  verseText: string;
  book: string;
  chapter: number;
  verse: number;
} | null> {
  try {
    const verses = await loadVerses();
    const key = `${book} ${chapter}:${verse}`;
    const text = verses[key];
    
    if (!text) return null;
    
    // Clean up the verse text
    const cleanedText = text
      .replace(/^#\s*/, "")
      .replace(/\[([^\]]+)\]/g, "$1");
    
    return {
      reference: key,
      displayRef: key,
      verseText: cleanedText,
      book,
      chapter,
      verse,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// Note: verseExists, getPreviousVerse, getNextVerse, getVerseNavigation, and 
// loadVerseByComponents are already exported in their function declarations above.

export {
  preprocessBibleReference,
  wordsToNumbers,
  isVerseOnlyReference,
  isChapterOnlyReference,
  isNavigationCommand,
  mapBookName,
};

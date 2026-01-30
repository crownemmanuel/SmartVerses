import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser.js";
import * as en from "bible-passage-reference-parser/esm/lang/en.js";

const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const DEFAULT_BASE_URL =
  process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const DEFAULT_VERSES_PATH =
  process.env.KJV_VERSES_PATH || "./public/data/bibles/kjv.svjson";

// All books of the Bible (66 books)
const BIBLE_BOOKS = [
  // Old Testament
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalm",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Song of Songs",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  // New Testament
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

// Create regex pattern for matching Bible books
// Handle variations like "1st", "2nd", "3rd", "1", "2", "3", and common abbreviations
function createBibleBookPattern() {
  const patterns = [];

  for (const book of BIBLE_BOOKS) {
    // Escape special regex characters
    const escaped = book.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Handle numbered books (1 Samuel, 2 Corinthians, etc.)
    if (/^\d+\s/.test(book)) {
      const num = book.match(/^(\d+)/)[1];
      const bookName = book.replace(/^\d+\s+/, "");

      // Match variations: "1 Samuel", "1st Samuel", "First Samuel", "I Samuel"
      patterns.push(
        `(\\d+|\\d+st|\\d+nd|\\d+rd|first|second|third|fourth|fifth|sixth|i|ii|iii|iv|v|vi)\\s+${bookName}`
      );
      // Also match just the book name (in case number is mentioned separately)
      patterns.push(bookName);
    } else {
      patterns.push(escaped);
    }
  }

  // Create pattern with word boundaries
  return new RegExp(`\\b(${patterns.join("|")})\\b`, "i");
}

const BIBLE_BOOK_PATTERN = createBibleBookPattern();

// Check if text contains a Bible book
function containsBibleBook(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Check with the pattern
  if (BIBLE_BOOK_PATTERN.test(text)) return true;
  return (
    BIBLE_BOOK_ABBREV_CONTEXT_PATTERN.test(text) ||
    BIBLE_BOOK_ABBREV_JOINED_PATTERN.test(text)
  );
}

function parseArgs(argv) {
  const args = {
    input: null,
    mode: "both",
    groqOut: null,
    failuresOut: null,
    parseOut: null,
    groqResults: null,
    start: 0,
    limit: null,
    delayMs: 0,
    retries: 1,
    versesPath: DEFAULT_VERSES_PATH,
    checkFalsePositives: true, // Default to checking false positives
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--input") args.input = next;
    else if (arg === "--mode") args.mode = next;
    else if (arg === "--groq-out") args.groqOut = next;
    else if (arg === "--grok-out") args.groqOut = next; // legacy alias
    else if (arg === "--failures-out") args.failuresOut = next;
    else if (arg === "--parse-out") args.parseOut = next;
    else if (arg === "--groq-results") args.groqResults = next;
    else if (arg === "--grok-results") args.groqResults = next; // legacy alias
    else if (arg === "--start") args.start = Number(next || 0);
    else if (arg === "--limit") args.limit = Number(next || 0);
    else if (arg === "--delay-ms") args.delayMs = Number(next || 0);
    else if (arg === "--retries") args.retries = Number(next || 1);
    else if (arg === "--verses") args.versesPath = next;
    else if (arg === "--no-check-false-positives")
      args.checkFalsePositives = false;
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeReference(ref) {
  return String(ref || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*-\s*/g, "-")
    .replace(/[)\],.;:]+$/g, "")
    .trim()
    .toLowerCase();
}

function expandRangeReference(ref) {
  // Parse reference like "Isaiah 45:1-3" or "Isaiah 45:1"
  // Returns array of normalized individual references
  const normalized = normalizeReference(ref);

  // Match cross-chapter range: "book 21:1-22:46"
  const crossChapterMatch = normalized.match(
    /^(.+?)\s+(\d+):(\d+)-(\d+):(\d+)$/
  );
  if (crossChapterMatch) {
    const [, book, startChapter, startVerse, endChapter, endVerse] =
      crossChapterMatch;
    // Avoid potentially huge expansions. Include the start verse and the first verse
    // of each subsequent chapter (enough to satisfy chapter-only expectations).
    const sc = parseInt(startChapter, 10);
    const ec = parseInt(endChapter, 10);
    const sv = parseInt(startVerse, 10);
    const ev = parseInt(endVerse, 10);
    if (
      Number.isFinite(sc) &&
      Number.isFinite(ec) &&
      Number.isFinite(sv) &&
      Number.isFinite(ev) &&
      sc > 0 &&
      ec > 0 &&
      sv > 0 &&
      ev > 0 &&
      ec >= sc
    ) {
      const expanded = [`${book} ${sc}:${sv}`];
      for (let c = sc + 1; c <= ec; c++) expanded.push(`${book} ${c}:1`);
      expanded.push(`${book} ${ec}:${ev}`);
      return expanded;
    }
  }

  // Match pattern: book chapter:start-end or book chapter:verse
  const rangeMatch = normalized.match(/^(.+?)\s+(\d+):(\d+)-(\d+)$/);
  if (rangeMatch) {
    const [, book, chapter, startVerse, endVerse] = rangeMatch;
    const start = parseInt(startVerse, 10);
    const end = parseInt(endVerse, 10);
    const expanded = [];
    for (let v = start; v <= end; v++) {
      expanded.push(`${book} ${chapter}:${v}`);
    }
    return expanded;
  }

  // Single verse reference - return as-is
  return [normalized];
}

function expandReferenceSet(refs) {
  // Expand all references (including ranges) to individual verses
  const expanded = new Set();
  for (const ref of refs) {
    const expandedRefs = expandRangeReference(ref);
    for (const expandedRef of expandedRefs) {
      expanded.add(expandedRef);
    }
  }
  return expanded;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJsonLines(filePath, lines) {
  const content = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  await fs.writeFile(filePath, content, "utf-8");
}

async function appendJsonLine(filePath, line) {
  await fs.appendFile(filePath, JSON.stringify(line) + "\n", "utf-8");
}

function estimateTokens(text) {
  // Rough estimate: ~4 characters per token for English text
  // Add some overhead for JSON structure
  return Math.ceil(text.length / 4) + 50;
}

function buildSystemPrompt() {
  return [
    "You extract EXPLICIT Bible references from text.",
    "Return strict JSON only.",
    "Schema:",
    '{"has_reference": boolean, "references": string[]}',
    "CRITICAL RULES:",
    "- ONLY detect references that are EXPLICITLY stated (e.g., 'Isaiah 46:10', 'John 3:16', 'Romans chapter 3 verse 4').",
    "- DO NOT detect paraphrased verses or quotes without explicit references (e.g., 'God so loved the world' without 'John 3:16' is NOT a reference).",
    "- DO NOT detect references from verse content alone - the book/chapter/verse must be mentioned.",
    "- If only a book and chapter are mentioned without a verse (e.g., 'Isaiah 46'), default to verse 1 (return 'Isaiah 46:1').",
    "- Normalize to standard format: Book Chapter:Verse, use full book names (e.g., 'Psalms 91:2', '1 Kings 18:46').",
    "- If no explicit reference is found, return has_reference=false and references=[].",
  ].join("\n");
}

function buildBatchedSystemPrompt() {
  return [
    "You extract EXPLICIT Bible references from multiple text chunks.",
    "Return strict JSON only as an array of results.",
    "Schema:",
    '[{"has_reference": boolean, "references": string[]}, ...]',
    "CRITICAL RULES:",
    "- Process each text chunk separately.",
    "- ONLY detect references that are EXPLICITLY stated (e.g., 'Isaiah 46:10', 'John 3:16', 'Romans chapter 3 verse 4').",
    "- DO NOT detect paraphrased verses or quotes without explicit references (e.g., 'God so loved the world' without 'John 3:16' is NOT a reference).",
    "- DO NOT detect references from verse content alone - the book/chapter/verse must be mentioned.",
    "- If only a book and chapter are mentioned without a verse (e.g., 'Isaiah 46'), default to verse 1 (return 'Isaiah 46:1').",
    "- Normalize to standard format: Book Chapter:Verse, use full book names (e.g., 'Psalms 91:2', '1 Kings 18:46').",
    "- If no explicit reference is found in a chunk, return has_reference=false and references=[] for that chunk.",
    "- Return one result object per input chunk, in the same order.",
  ].join("\n");
}

async function callGroq(text, { apiKey, model, baseUrl, retries }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: text },
    ],
    temperature: 0,
  };

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq API returned empty content");
      }

      const parsed = parseJsonFromResponse(content);
      if (
        !parsed ||
        typeof parsed.has_reference !== "boolean" ||
        !Array.isArray(parsed.references)
      ) {
        throw new Error(`Invalid Groq JSON response: ${content}`);
      }

      return {
        has_reference: parsed.has_reference,
        references: parsed.references,
      };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(800);
        continue;
      }
    }
  }

  throw lastError || new Error("Groq API request failed");
}

async function callGroqBatched(texts, { apiKey, model, baseUrl, retries }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const userContent = texts
    .map((text, idx) => `---CHUNK ${idx + 1}---\n${text}`)
    .join("\n\n");

  const body = {
    model,
    messages: [
      { role: "system", content: buildBatchedSystemPrompt() },
      { role: "user", content: userContent },
    ],
    temperature: 0,
  };

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error ${res.status}: ${errText}`);
      }

      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq API returned empty content");
      }

      const parsed = parseJsonFromResponse(content);
      if (!Array.isArray(parsed)) {
        throw new Error(
          `Invalid batched Groq JSON response: expected array, got ${typeof parsed}`
        );
      }

      // Validate each result
      const results = parsed.map((item, idx) => {
        if (
          !item ||
          typeof item.has_reference !== "boolean" ||
          !Array.isArray(item.references)
        ) {
          throw new Error(
            `Invalid result at index ${idx}: ${JSON.stringify(item)}`
          );
        }
        return {
          has_reference: item.has_reference,
          references: item.references,
        };
      });

      if (results.length !== texts.length) {
        throw new Error(
          `Result count mismatch: expected ${texts.length}, got ${results.length}`
        );
      }

      return results;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(800);
        continue;
      }
    }
  }

  throw lastError || new Error("Groq API batched request failed");
}

function parseJsonFromResponse(content) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// =============================================================================
// Local parser (copied from smartVersesBibleService)
// =============================================================================

const BOOK_NAME_MAPPING = {
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

const BOOKS_REGEX_STRICT =
  "(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|" +
  "Joshua|Judges|Ruth|1\\s*Samuel|2\\s*Samuel|1\\s*Kings|2\\s*Kings|" +
  "1\\s*Chronicles|2\\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?" +
  "|Proverbs?|Ecclesiastes|Song\\s+of\\s+Solomon|Song\\s+of\\s+Songs|Canticles|" +
  "Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|" +
  "Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|" +
  "Matthew|Mark|Luke|John|Acts|Romans|1\\s*Corinthians|2\\s*Corinthians|" +
  "Galatians|Ephesians|Philippians|Colossians|1\\s*Thessalonians|2\\s*Thessalonians|" +
  "1\\s*Timothy|2\\s*Timothy|Titus|Philemon|Hebrews|James|1\\s*Peter|2\\s*Peter|" +
  "1\\s*John|2\\s*John|3\\s*John|Jude|Revelation)";

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

const BIBLE_BOOK_ABBREV_CONTEXT_PATTERN = new RegExp(
  `\\b${BOOKS_REGEX_ABBREV}\\b(?=\\s*(?:\\d{1,3}|chapter|ch\\.?|\\d{1,3}:\\d{1,3}))`,
  "i"
);
const BIBLE_BOOK_ABBREV_JOINED_PATTERN = new RegExp(
  `\\b${BOOKS_REGEX_ABBREV}\\s*\\d{1,3}(?::\\d{1,3})?\\b`,
  "i"
);

let parserInstance = null;
let lastParsedContext = {
  book: null,
  chapter: null,
  verse: null,
  endChapter: null,
  endVerse: null,
  fullReference: null,
};
let legacyContext = null;

function getParser() {
  if (!parserInstance) {
    parserInstance = new bcv_parser(en);
    parserInstance.set_options({
      osis_compaction_strategy: "bcv",
      consecutive_combination_strategy: "combine",
    });
  }
  return parserInstance;
}

function resetContext() {
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

function wordsToNumbers(text) {
  const numberWords = {
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    eleven: "11",
    twelve: "12",
    thirteen: "13",
    fourteen: "14",
    fifteen: "15",
    sixteen: "16",
    seventeen: "17",
    eighteen: "18",
    nineteen: "19",
    twenty: "20",
    thirty: "30",
    forty: "40",
    fifty: "50",
    sixty: "60",
    seventy: "70",
    eighty: "80",
    ninety: "90",
    first: "1",
    second: "2",
    third: "3",
  };

  let result = String(text || "").toLowerCase();
  const compoundPattern =
    /(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)/gi;
  result = result.replace(compoundPattern, (_, tens, ones) => {
    const tensVal = parseInt(numberWords[tens.toLowerCase()] || "0", 10);
    const onesVal = parseInt(numberWords[ones.toLowerCase()] || "0", 10);
    return String(tensVal + onesVal);
  });

  for (const [word, digit] of Object.entries(numberWords)) {
    const pattern = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(pattern, digit);
  }

  return result;
}

function normalizeDashVariants(text) {
  return text.replace(/[–—]/g, "-");
}

function normalizeOrdinalIndicators(text) {
  return text.replace(/\b(\d{1,3})(?:st|nd|rd|th)\b/gi, "$1");
}

function romanToInt(roman) {
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100 };
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

function normalizeRomanNumeralsForChapterVerse(text) {
  return text.replace(
    /\b(chapter|ch\.?|verse|verses|v|vs)\s+([ivxlc]{1,6})\b/gi,
    (match, label, roman) => {
      const value = romanToInt(roman);
      if (!value) return match;
      return `${label} ${value}`;
    }
  );
}

function normalizeRomanNumeralsForBooks(text) {
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

function isValidVerseNumber(value) {
  return Number.isFinite(value) && value > 0 && value <= 200;
}

function parseVerseRangeList(rawList) {
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

  const ranges = [];
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

function mergeVerseRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
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

function formatVerseRanges(ranges) {
  if (!ranges.length) return null;
  const merged = mergeVerseRanges(ranges);
  return merged
    .map((range) =>
      range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`
    )
    .join(", ");
}

function trimVerseListTail(raw) {
  if (!raw) return raw;
  const stopRegex = new RegExp(`\\b(?:chapter|ch\\.?|${BOOKS_REGEX_FLEX})\\b`, "i");
  const idx = raw.search(stopRegex);
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

function extractVerseListToken(text) {
  const match = text.match(/\b(?:verses?|vv?\.?|v|vs)\s+([^.;\n]{0,80})/i);
  if (!match) return null;
  const trimmed = trimVerseListTail(match[1]);
  return trimmed || null;
}

function extractVerseRangesFromText(text) {
  const ranges = [];
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

function preprocessBibleReference(reference) {
  let normalized = String(reference || "").replace(/\.\s*/g, " ");
  normalized = normalized.replace(/([A-Za-z])\s*,\s*(?=[A-Za-z0-9])/g, "$1 ");
  // Fix common typos: "chaper" -> "chapter"
  normalized = normalized.replace(/\bchaper\b/gi, "chapter");
  normalized = normalized.replace(
    new RegExp(`[\\\\/]+(?=${BOOKS_REGEX_FLEX})`, "gi"),
    ""
  );
  normalized = normalizeDashVariants(normalized);
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized;
}

function normalizeChapterRangeOrListToVerseOne(text) {
  // If a reference is chapter-only and spans multiple chapters, normalize to explicit verse 1.
  // Examples:
  // - "Matthew 21 to 22" -> "Matthew 21:1; Matthew 22:1"
  // - "Exodus 30, 31" -> "Exodus 30:1; Exodus 31:1"
  //
  // IMPORTANT: Only do this when there is NO explicit verse indicator and NO ":" already present,
  // and when there are exactly two chapter numbers in the pattern (avoid "Isaiah 58, 6 to 14").
  if (!text) return text;
  const lowered = String(text).toLowerCase();
  if (lowered.includes(":")) return text;
  if (/(?:\bverse\b|\bverses\b|\bvs\.?\b|\bv\.?\b)/i.test(text)) return text;

  const regex = new RegExp(
    `\\b(?<book>${BOOKS_REGEX_FLEX})\\s+(?<c1>\\d{1,3})\\s*(?:,|\\band\\b|\\bto\\b|-)\\s*(?<c2>\\d{1,3})\\b(?!\\s*(?:to|-)\\s*\\d)`,
    "gi"
  );

  return text.replace(regex, (_m, book, c1, c2) => {
    const b = String(book).trim();
    return `${b} ${c1}:1; ${b} ${c2}:1`;
  });
}

function normalizeCommaSeparatedChapterVerse(text) {
  return text.replace(
    /\b((?:[1-3]\s*)?[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)*)\s+(\d{1,3})\s*,\s*(\d{1,3})(?=[^\d]|$)/gi,
    (_match, book, chapter, verse) => `${book} ${chapter}:${verse}`
  );
}

function normalizeBookChapterVersePhrase(text) {
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

function normalizeBookChapterVerseList(text) {
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

function normalizeBookChapterThenVerseLater(text) {
  // Handles patterns where "verse" comes later with speech fillers in between:
  // "Psalms 107, thank you Holy Spirit, verse 15 and 16" -> "Psalms 107:15-16"
  // Conservative guardrails:
  // - The gap between chapter and "verse" must contain no digits (avoid "Isaiah 56, I mean 58, 6 to 14")
  // - Cap the gap length to avoid spanning too far across sentences.
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

function normalizeTrailingVerseListAfterFullReference(text) {
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

function normalizeSpaceSeparatedChapterVerse(text) {
  return text.replace(
    /\b((?:[1-3]\s*)?[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z][A-Za-z0-9]*)*)\s+(\d{1,3})\s+(\d{1,3})(?=[^\d]|$)/gi,
    (_match, book, chapter, verse) => `${book} ${chapter}:${verse}`
  );
}

function normalizeCommaBetweenChapterAndVerse(text) {
  return text.replace(/\b(\d{1,3})\s*,\s*(?=(?:verse|verses|v|vs)\b)/gi, "$1 ");
}

function normalizeMissingBookChapterSpace(text) {
  const regex = new RegExp(
    `(${BOOKS_REGEX_FLEX})(\\d{1,3}(?::\\d{1,3})?)`,
    "gi"
  );
  return text.replace(regex, "$1 $2");
}

function normalizeConcatenatedReferences(text) {
  const regex = new RegExp(
    `(\\d{1,3}:\\d{1,3}(?:-\\d{1,3})?)(${BOOKS_REGEX_FLEX})`,
    "gi"
  );
  return text.replace(regex, "$1 $2");
}

function isVerseOnlyReference(text) {
  const normalized = String(text || "").trim();
  const flexiblePatterns = [/(?:verse|verses|vv?\.?|v|vs)\s+(\d+)/i];
  for (const pattern of flexiblePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const verseNum = parseInt(match[1], 10);
      if (!isNaN(verseNum) && verseNum > 0) return verseNum;
    }
  }
  return null;
}

function isChapterOnlyReference(text) {
  const chapterOnlyPatterns = [
    /^(?:the\s+book\s+of\s+)?([A-Za-z0-9\s]+?)\s+chapter\s+(\d+|[a-z]+)$/i,
    /^chapter\s+(\d+|[a-z]+)\s+of\s+([A-Za-z0-9\s]+)$/i,
  ];
  const normalized = String(text || "").trim();
  for (const pattern of chapterOnlyPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let book;
      let chapterStr;
      if (pattern.source.startsWith("^chapter")) {
        chapterStr = match[1];
        book = match[2];
      } else {
        book = match[1];
        chapterStr = match[2];
      }
      const chapter = parseInt(chapterStr, 10);
      if (!isNaN(chapter)) return { book: book.trim(), chapter };
    }
  }
  return null;
}

function extractExplicitChapterNumber(text) {
  const match = text.match(/\b(?:chapter|ch\.?)\s*(\d{1,3})\b/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildContextualPassages(book, fullBookName, chapter, ranges) {
  const mappedBook = mapBookName(book);
  return ranges.map((range) => ({
    book: mappedBook,
    fullBookName,
    chapter,
    endChapter: chapter,
    startVerse: range.start,
    endVerse: range.end,
    displayRef: createDisplayRef(fullBookName, chapter, range.start, range.end),
  }));
}

function parseContextualVerseReferences(text) {
  if (!lastParsedContext.book) return null;

  const book = lastParsedContext.book;
  const fullBookName = lastParsedContext.book;
  const explicitChapter = extractExplicitChapterNumber(text);
  const chapter = explicitChapter ?? lastParsedContext.chapter ?? null;
  const ranges = extractVerseRangesFromText(text);

  if (chapter && ranges.length > 0) {
    return buildContextualPassages(book, fullBookName, chapter, ranges);
  }

  if (explicitChapter && (!ranges || ranges.length === 0)) {
    return buildContextualPassages(book, fullBookName, explicitChapter, [
      { start: 1, end: 1 },
    ]);
  }

  return null;
}

function updateContextFromPassages(passages, rawReference) {
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

function mapBookName(parserBook) {
  return BOOK_NAME_MAPPING[parserBook] || parserBook;
}

function createDisplayRef(book, chapter, startVerse, endVerse, endChapter) {
  const fullBook = mapBookName(book);
  if (endVerse && endVerse !== startVerse) {
    if (endChapter && endChapter !== chapter) {
      return `${fullBook} ${chapter}:${startVerse}-${endChapter}:${endVerse}`;
    }
    return `${fullBook} ${chapter}:${startVerse}-${endVerse}`;
  }
  return `${fullBook} ${chapter}:${startVerse}`;
}

function createDisplayRefWithEnd(book, chapter, startVerse, endChapter, endVerse) {
  const fullBook = mapBookName(book);
  if (
    endChapter &&
    endVerse &&
    (endChapter !== chapter || endVerse !== startVerse)
  ) {
    if (endChapter === chapter) {
      return `${fullBook} ${chapter}:${startVerse}-${endVerse}`;
    }
    return `${fullBook} ${chapter}:${startVerse}-${endChapter}:${endVerse}`;
  }
  return `${fullBook} ${chapter}:${startVerse}`;
}

async function normalizeCombinedChapterVerseInput(text, verses) {
  const combinedRegex = new RegExp(
    `(?:\\b(?:the\\s+)?(?:book\\s+of\\s+))?(?<book>${BOOKS_REGEX_FLEX})\\s*(?<combined>\\d{3,5})\\b`,
    "gi"
  );

  let result = text;
  let match;
  while ((match = combinedRegex.exec(result)) !== null) {
    const groups = match.groups || {};
    const bookText = groups.book;
    const combined = groups.combined;
    if (!bookText || !combined) continue;

    // Heuristic guardrails:
    // - If the combined digits are immediately followed by punctuation, it's very likely a chapter mention
    //   (e.g., "Psalms 107, ... verse 15") and we should NOT split 107 -> 10:7.
    // - Also skip if a "verse" keyword appears shortly after, which implies the digits are a chapter.
    const afterIdx = match.index + match[0].length;
    const nextChar = result[afterIdx] || "";
    const afterWindow = result.slice(afterIdx, afterIdx + 100);
    // If ":" follows, it's already an explicit chapter:verse (e.g., "Psalms 107:15"),
    // so we must not reinterpret 107 as 10:7.
    if (
      nextChar === ":" ||
      /[),.;]/.test(nextChar) ||
      /\b(?:verse|verses|v|vs)\b/i.test(afterWindow)
    ) {
      continue;
    }

    const bookName = resolveBookName(bookText);
    const candidates = [];
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
      return verses && key in verses;
    });

    if (valid.length === 1) {
      const { chapter, verse } = valid[0];
      const replacement = `${bookName} ${chapter}:${verse}`;
      result =
        result.slice(0, match.index) +
        replacement +
        result.slice(match.index + match[0].length);
      combinedRegex.lastIndex = match.index + replacement.length;
    }
  }

  return result;
}

function resolveBookName(bookText) {
  const normalizedBookText = String(bookText || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^([1-3])\s*(?=[A-Za-z])/, "$1 ");

  const parser = getParser();
  parser.parse(`${normalizedBookText} 1:1`);
  const osis = parser.osis?.();
  if (osis && osis.length > 0) {
    const first = osis.split(",")[0];
    const osisBook = first.split(".")[0];
    return mapBookName(osisBook);
  }
  return normalizedBookText;
}

function parseVerseReference(reference) {
  let passages = null;
  let hasBook = false;
  try {
    const preprocessed = preprocessBibleReference(reference);
    let textToProcess = wordsToNumbers(preprocessed);
    textToProcess = normalizeOrdinalIndicators(textToProcess);
    textToProcess = normalizeRomanNumeralsForBooks(textToProcess);
    textToProcess = normalizeRomanNumeralsForChapterVerse(textToProcess);
    textToProcess = normalizeCommaBetweenChapterAndVerse(textToProcess);
    textToProcess = normalizeChapterRangeOrListToVerseOne(textToProcess);

    hasBook = containsBibleBook(textToProcess);
    if (hasBook) {
      textToProcess = normalizeBookChapterVerseList(textToProcess);
      textToProcess = normalizeBookChapterColonVerse(textToProcess);
      textToProcess = normalizeBookChapterVersePhrase(textToProcess);
      textToProcess = normalizeBookChapterThenVerseLater(textToProcess);
      textToProcess = normalizeTrailingVerseListAfterFullReference(textToProcess);
    }

    textToProcess = normalizeCommaSeparatedChapterVerse(textToProcess);
    textToProcess = normalizeMissingBookChapterSpace(textToProcess);
    textToProcess = normalizeConcatenatedReferences(textToProcess);

    if (!hasBook) {
      const contextual = parseContextualVerseReferences(textToProcess);
      if (contextual && contextual.length > 0) {
        updateContextFromPassages(contextual, reference);
        return contextual;
      }
    }

    const chapterOnly = isChapterOnlyReference(textToProcess);
    if (chapterOnly !== null) {
      const parser = getParser();
      const bookResult = parser.parse(chapterOnly.book);
      let fullBookName = chapterOnly.book;
      const osisResults = bookResult.osis_and_indices();
      if (osisResults && osisResults.length > 0 && osisResults[0].osis) {
        const osisParts = osisResults[0].osis.split(".");
        if (osisParts.length > 0) fullBookName = osisParts[0];
      }

      const mappedBook = mapBookName(fullBookName);
      passages = [
        {
          book: mappedBook,
          fullBookName,
          chapter: chapterOnly.chapter,
          startVerse: 1,
          endChapter: chapterOnly.chapter,
          endVerse: 1,
          displayRef: createDisplayRefWithEnd(
            fullBookName,
            chapterOnly.chapter,
            1,
            chapterOnly.chapter,
            1
          ),
        },
      ];

      updateContextFromPassages(passages, reference);
      return passages;
    }

    const parser = getParser();
    parser.parse(textToProcess);
    passages = [];
    const entities = parser.entities || [];
    for (const entity of entities) {
      const entityPassages = entity.passages || [];
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
          startVerse,
          endChapter,
          endVerse,
          displayRef: createDisplayRefWithEnd(
            start.b,
            chapter,
            startVerse,
            endChapter,
            endVerse
          ),
        });
      }
    }
  } catch (error) {
    console.error("Local parse error:", error);
  }

  if (
    (!passages || passages.length === 0) &&
    !hasBook &&
    lastParsedContext.fullReference
  ) {
    try {
      const parser = getParser();
      const contextResult = parser.parse_with_context(
        reference,
        lastParsedContext.fullReference
      );
      const osisRef = contextResult.osis();
      if (osisRef) {
        passages = parseVerseReference(osisRef);
      }
    } catch (error) {
      console.error("Local parse_with_context error:", error);
    }
  }

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
      console.error("Local parse legacy context error:", error);
    }
  }

  if (passages && passages.length > 0) {
    updateContextFromPassages(passages, reference);
  }

  return passages && passages.length > 0 ? passages : null;
}

function normalizeBookChapterColonVerse(text) {
  const bookPrefix = "(?:the\\s+)?(?:book\\s+of\\s+)?";
  const regex = new RegExp(
    `\\b(?:in\\s+)?${bookPrefix}(${BOOKS_REGEX_FLEX})\\s+(?:chapter|ch\\.?)+\\s+(\\d{1,3}:\\d{1,3}(?:-\\d{1,3})?)\\b`,
    "gi"
  );
  return text.replace(regex, (_m, book, ref) => `${book} ${ref}`);
}

async function localParseReferences(text, { verses, aggressiveSpeech }) {
  // Match exact normalization order from detectAndLookupReferences in smartVersesBibleService.ts
  const preprocessed = preprocessBibleReference(text);
  let numericText = wordsToNumbers(preprocessed);
  numericText = normalizeOrdinalIndicators(numericText);
  numericText = normalizeRomanNumeralsForBooks(numericText);
  numericText = normalizeRomanNumeralsForChapterVerse(numericText);
  numericText = normalizeCommaBetweenChapterAndVerse(numericText);
  const hasBook = containsBibleBook(numericText);

  // Always handle "Book <chapter> ... verse <n>" when a Bible book is present.
  const phraseNormalized = hasBook
    ? normalizeTrailingVerseListAfterFullReference(
        normalizeBookChapterThenVerseLater(
          normalizeBookChapterVersePhrase(
            normalizeBookChapterColonVerse(normalizeBookChapterVerseList(numericText))
          )
        )
      )
    : numericText;

  let normalizedText = hasBook
    ? normalizeChapterRangeOrListToVerseOne(phraseNormalized)
    : phraseNormalized;
  normalizedText = normalizeCommaSeparatedChapterVerse(normalizedText);
  if (aggressiveSpeech && hasBook) {
    normalizedText = normalizeSpaceSeparatedChapterVerse(normalizedText);
  }
  normalizedText = normalizeMissingBookChapterSpace(normalizedText);
  normalizedText = normalizeConcatenatedReferences(normalizedText);
  normalizedText = await normalizeCombinedChapterVerseInput(
    normalizedText,
    verses
  );

  const parsed = parseVerseReference(normalizedText) || [];
  return parsed.map((p) => p.displayRef).filter(Boolean);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Build flat { "Book c:v": "text" } from .svjson books structure. */
function versesFromBooks(books) {
  const out = {};
  for (const [bookName, chapters] of Object.entries(books)) {
    if (!isRecord(chapters)) continue;
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      if (!isRecord(verses)) continue;
      for (const [verseKey, verseValue] of Object.entries(verses)) {
        const text =
          typeof verseValue === "string"
            ? verseValue
            : isRecord(verseValue) && typeof verseValue.t === "string"
              ? verseValue.t
              : "";
        if (text) out[`${bookName} ${chapterKey}:${verseKey}`] = text;
      }
    }
  }
  return out;
}

async function loadVerses(versesPath) {
  const resolved = path.isAbsolute(versesPath)
    ? versesPath
    : path.resolve(process.cwd(), versesPath);
  const raw = await fs.readFile(resolved, "utf-8");
  const parsed = JSON.parse(raw);
  if (isRecord(parsed.books)) return versesFromBooks(parsed.books);
  return parsed;
}

// =============================================================================
// Main runner
// =============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = (args.mode || "both").toLowerCase();
  const runGroq = mode === "groq" || mode === "grok" || mode === "both";
  const runParse = mode === "parse" || mode === "both";

  // Only require --input when we actually need to run Groq (which needs chunk text input).
  // For parse-only runs, allow --groq-results to drive the evaluation.
  if (runGroq && !args.input) {
    console.error("Missing --input (required for --mode groq|both)");
    process.exit(1);
  }

  const inputPath = args.input
    ? path.isAbsolute(args.input)
      ? args.input
      : path.resolve(process.cwd(), args.input)
    : null;

  const data = runGroq ? await readJsonFile(inputPath) : [];
  const resolvedChunks = runGroq ? (Array.isArray(data) ? data : []) : [];

  const start = Number.isFinite(args.start) ? args.start : 0;
  const endExclusive = args.limit ? start + args.limit : resolvedChunks.length;
  const slice = resolvedChunks.slice(start, endExclusive);

  const baseNameSource = inputPath || args.groqResults || "input";
  const baseName = path.basename(baseNameSource, path.extname(baseNameSource));
  // Get the script directory (tools/scripture-eval/)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputDir = path.join(scriptDir, "output");

  // Ensure output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (err) {
    // Directory might already exist, ignore error
  }

  const defaultGroqOut = path.join(
    outputDir,
    `processed_${baseName}.groq.jsonl`
  );
  const defaultFailuresOut = path.join(
    outputDir,
    `processed_${baseName}.failed.jsonl`
  );
  const defaultParseOut = path.join(
    outputDir,
    `processed_${baseName}.parse.jsonl`
  );

  const groqOut = args.groqOut || defaultGroqOut;
  const failuresOut = args.failuresOut || defaultFailuresOut;
  const parseOut = args.parseOut ? args.parseOut : null;

  if (runGroq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("Missing GROQ_API_KEY in environment");
      process.exit(1);
    }

    await fs.writeFile(groqOut, "", "utf-8");
    console.log(`Writing Groq results to ${groqOut}`);
    console.log(`Batching chunks up to ~2000 tokens per request...`);

    const MAX_TOKENS_PER_REQUEST = 2000;
    const systemPromptTokens = estimateTokens(buildBatchedSystemPrompt());
    const chunkOverhead = 50; // For "---CHUNK N---" markers

    let batch = [];
    let batchTokens = systemPromptTokens;
    let batchIndices = [];

    const processBatch = async (batchTexts, batchIndices) => {
      try {
        const results = await callGroqBatched(batchTexts, {
          apiKey,
          model: DEFAULT_MODEL,
          baseUrl: DEFAULT_BASE_URL,
          retries: Math.max(args.retries, 0),
        });

        for (let j = 0; j < batchTexts.length; j++) {
          const index = batchIndices[j];
          const text = batchTexts[j];
          const result = results[j];
          await appendJsonLine(groqOut, {
            index,
            text,
            groq_has_reference: result.has_reference,
            groq_references: result.references,
            groq_error: null,
          });
        }
      } catch (err) {
        // On error, write error for all chunks in batch
        for (let j = 0; j < batchTexts.length; j++) {
          const index = batchIndices[j];
          const text = batchTexts[j];
          await appendJsonLine(groqOut, {
            index,
            text,
            groq_has_reference: false,
            groq_references: [],
            groq_error: String(err?.message || err),
          });
        }
      }
    };

    for (let i = 0; i < slice.length; i++) {
      const index = start + i;
      const text = slice[i]?.text || "";

      if (!text.trim()) {
        await appendJsonLine(groqOut, {
          index,
          text,
          groq_has_reference: false,
          groq_references: [],
          groq_error: null,
        });
        continue;
      }

      const textTokens = estimateTokens(text) + chunkOverhead;
      const wouldExceed = batchTokens + textTokens > MAX_TOKENS_PER_REQUEST;

      if (wouldExceed && batch.length > 0) {
        // Process current batch before adding new chunk
        console.log(
          `Processing batch of ${batch.length} chunks (~${batchTokens} tokens)...`
        );
        await processBatch(batch, batchIndices);

        if (args.delayMs > 0) {
          await sleep(args.delayMs);
        }

        // Reset batch
        batch = [];
        batchIndices = [];
        batchTokens = systemPromptTokens;
      }

      batch.push(text);
      batchIndices.push(index);
      batchTokens += textTokens;
    }

    // Process remaining batch
    if (batch.length > 0) {
      console.log(
        `Processing final batch of ${batch.length} chunks (~${batchTokens} tokens)...`
      );
      await processBatch(batch, batchIndices);
    }

    console.log(`Completed processing ${slice.length} chunks`);
  }

  if (runParse) {
    // Try to find Groq results file in multiple possible locations
    let groqResultsPath = args.groqResults;
    if (!groqResultsPath) {
      // Try new output directory first (.jsonl)
      const newLocationJsonl = path.join(
        outputDir,
        `processed_${baseName}.groq.jsonl`
      );
      // Try new output directory (.json - legacy)
      const newLocationJson = path.join(
        outputDir,
        `processed_${baseName}.groq.json`
      );
      // Try old location (same directory as input) - both .jsonl and .json
      const oldLocationJsonl = inputPath
        ? path.join(path.dirname(inputPath), `${baseName}.groq.jsonl`)
        : null;
      const oldLocationJson = inputPath
        ? path.join(path.dirname(inputPath), `${baseName}.groq.json`)
        : null;

      const locations = [
        newLocationJsonl,
        newLocationJson,
        ...(oldLocationJsonl ? [oldLocationJsonl] : []),
        ...(oldLocationJson ? [oldLocationJson] : []),
      ];
      let found = false;

      for (const loc of locations) {
        try {
          await fs.access(loc);
          groqResultsPath = loc;
          if (loc !== newLocationJsonl) {
            console.log(`Using Groq results from: ${loc}`);
          }
          found = true;
          break;
        } catch {
          continue;
        }
      }

      if (!found) {
        throw new Error(
          `Could not find Groq results file. Tried:\n` +
            locations.map((loc) => `  - ${loc}`).join("\n") +
            `\nRun with --mode both or --mode groq first, or specify --grok-results <path>`
        );
      }
    }

    // Read JSONL file (one JSON object per line)
    const groqContent = await fs.readFile(groqResultsPath, "utf-8");
    let groqLines;
    if (groqResultsPath.endsWith(".json")) {
      // Legacy JSON format - try parsing as array
      try {
        const parsed = JSON.parse(groqContent);
        groqLines = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // Fall back to JSONL format
        groqLines = groqContent
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
    } else {
      // JSONL format (default)
      groqLines = groqContent
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    const verses = await loadVerses(args.versesPath);
    resetContext();

    const failures = [];
    const falsePositives = [];
    const parseLines = [];
    let passCount = 0;
    let falsePositiveCount = 0;

    for (const line of groqLines) {
      const text = line.text || "";
      const expectedRefs = Array.isArray(line.groq_references)
        ? line.groq_references
        : Array.isArray(line.grok_references)
        ? line.grok_references
        : Array.isArray(line.expected_references)
        ? line.expected_references
        : [];
      const parsedRefs = await localParseReferences(text, {
        verses,
        aggressiveSpeech: true,
      });

      // Expand ranges to individual verses for comparison
      // e.g., "Isaiah 45:1-3" expands to ["isaiah 45:1", "isaiah 45:2", "isaiah 45:3"]
      const expectedExpanded = expandReferenceSet(expectedRefs);
      const parsedExpanded = expandReferenceSet(parsedRefs);

      // Check if all expected references are present in parsed references
      const expectedPass = Array.from(expectedExpanded).every((ref) =>
        parsedExpanded.has(ref)
      );

      // Also check the reverse - if parsed has extra references, that's still OK
      // (parser might be more comprehensive, but we require at least all expected ones)

      // Detect false positive: expected no references but parser found some
      const isFalsePositive =
        args.checkFalsePositives &&
        expectedExpanded.size === 0 &&
        parsedExpanded.size > 0;

      const pass =
        expectedExpanded.size === 0 ? parsedExpanded.size === 0 : expectedPass;

      // Set pass value: use "false_positive" string for false positives, otherwise boolean
      const passValue = isFalsePositive ? "false_positive" : pass;

      // Only count as pass if it's not a false positive
      if (pass && !isFalsePositive) passCount += 1;
      if (isFalsePositive) falsePositiveCount += 1;

      const record = {
        index: line.index ?? line.idx ?? null,
        text,
        expected_references: expectedRefs,
        parsed_references: parsedRefs,
        pass: passValue,
      };

      parseLines.push(record);

      if (isFalsePositive) {
        falsePositives.push(record);
        continue;
      }

      // Only add to failures if it contains at least one Bible book (skip non-reference chatter).
      if (!pass && containsBibleBook(text)) failures.push(record);
    }

    if (parseOut) {
      await writeJsonLines(parseOut, parseLines);
      console.log(`Writing parse results to ${parseOut}`);
    }

    const combinedFailures = [...failures, ...falsePositives].sort((a, b) => {
      const ai = Number.isFinite(a.index) ? a.index : 0;
      const bi = Number.isFinite(b.index) ? b.index : 0;
      return ai - bi;
    });
    await writeJsonLines(failuresOut, combinedFailures);
    // Calculate total excluding false positives if check is enabled
    const total = args.checkFalsePositives
      ? groqLines.length - falsePositiveCount || 1
      : groqLines.length || 1;
    const score = Math.round((passCount / total) * 10000) / 100;
    console.log(`Pass score: ${passCount}/${total} (${score}%)`);
    if (args.checkFalsePositives && falsePositiveCount > 0) {
      console.log(
        `⚠️  ${falsePositiveCount} false positive(s) detected and skipped (parser found references when none expected)`
      );
    }
    console.log(`Failures written to ${failuresOut}`);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

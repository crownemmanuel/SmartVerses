import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AIProviderType, AppSettings } from "../types";
import type { BibleConversionMetadata } from "../utils/bibleConversion";
import { getApiKey, getLLM } from "./smartVersesAIService";

type AIConfig = {
  provider: AIProviderType;
  apiKey: string;
  model?: string;
};

const BIBLE_BOOKS = [
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

type Segment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type AIConversionScriptResult = {
  code: string;
  format?: string;
  notes?: string;
  metadata?: Partial<BibleConversionMetadata>;
};

export type ConversionHelpers = {
  stripBom: (text: string) => string;
  parseJsonSafe: (text: string) => unknown | null;
  parseJson: (text: string) => unknown;
  parseCsv: (text: string, delimiter?: string) => string[][];
  parseTsv: (text: string) => string[][];
  splitLines: (text: string) => string[];
  normalizeWhitespace: (text: string) => string;
};

export type ConversionInput = {
  rawText: string;
  fileName?: string;
  json?: unknown;
};

type AIResponse =
  | {
      status: "need_more";
      segmentIds?: number[];
      reason?: string;
    }
  | {
      status: "ready";
      format?: string;
      metadata?: Partial<BibleConversionMetadata>;
      code: string;
      notes?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tryParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function resolveAIConfig(appSettings: AppSettings): AIConfig | null {
  const defaultProvider = appSettings.defaultAIProvider ?? null;
  if (defaultProvider) {
    const apiKey = getApiKey(defaultProvider, appSettings);
    if (apiKey) {
      return {
        provider: defaultProvider,
        apiKey,
        model: appSettings.defaultAIModel,
      };
    }
  }

  if (appSettings.openAIConfig?.apiKey) {
    return {
      provider: "openai",
      apiKey: appSettings.openAIConfig.apiKey,
      model: appSettings.defaultAIModel ?? "gpt-4o-mini",
    };
  }
  if (appSettings.geminiConfig?.apiKey) {
    return {
      provider: "gemini",
      apiKey: appSettings.geminiConfig.apiKey,
      model: appSettings.defaultAIModel ?? "gemini-1.5-flash-latest",
    };
  }
  if (appSettings.groqConfig?.apiKey) {
    return {
      provider: "groq",
      apiKey: appSettings.groqConfig.apiKey,
      model: appSettings.defaultAIModel ?? "llama-3.3-70b-versatile",
    };
  }
  return null;
}

function buildSegments(rawText: string, segmentChars: number): Segment[] {
  if (!rawText) return [];
  const segments: Segment[] = [];
  let id = 0;
  for (let start = 0; start < rawText.length; start += segmentChars) {
    const end = Math.min(rawText.length, start + segmentChars);
    segments.push({
      id,
      start,
      end,
      text: rawText.slice(start, end),
    });
    id += 1;
  }
  return segments;
}

function formatSegmentIndex(segments: Segment[]): string {
  if (segments.length === 0) return "No segments available.";
  const head = segments.slice(0, 3);
  const tail = segments.length > 6 ? segments.slice(-3) : segments.slice(3);
  const lines = [
    `Total segments: ${segments.length} (ids 0..${segments.length - 1})`,
    ...head.map(
      (segment) => `- [${segment.id}] chars ${segment.start}-${segment.end}`
    ),
  ];
  if (segments.length > 6) {
    lines.push("- ...");
  }
  tail.forEach((segment) => {
    lines.push(`- [${segment.id}] chars ${segment.start}-${segment.end}`);
  });
  return lines.join("\n");
}

function formatSegments(segments: Segment[]): string {
  return segments
    .map(
      (segment) =>
        `\n[Segment ${segment.id} | chars ${segment.start}-${segment.end}]\n${segment.text}`
    )
    .join("\n");
}

function extractCodeFallback(rawText: string): string | null {
  const fnIndex = rawText.indexOf("function convertBible");
  if (fnIndex === -1) return null;
  return rawText.slice(fnIndex).trim();
}

function stripBomText(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBookPatterns(): Array<{ name: string; regex: RegExp }> {
  return [...BIBLE_BOOKS]
    .sort((a, b) => b.length - a.length)
    .map((name) => {
      const escaped = escapeRegex(name).replace(/\s+/g, "\\s+");
      return { name, regex: new RegExp(`\\b${escaped}\\b`, "i") };
    });
}

const BOOK_PATTERNS = buildBookPatterns();

function truncateSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function extractJsonKeySamples(
  rawText: string,
  options?: { maxKeys?: number; maxDepth?: number }
): { topLevel: string[]; paths: string[]; sampleStructure?: string } {
  const maxKeys = options?.maxKeys ?? 20;
  const maxDepth = options?.maxDepth ?? 5;
  const parsed = tryParseJson<unknown>(rawText);
  if (!parsed || !isRecord(parsed)) {
    return { topLevel: [], paths: [] };
  }

  const topLevel = Object.keys(parsed).slice(0, maxKeys);
  const paths: string[] = [];
  let sampleStructure: string | undefined;

  // Get a sample book structure
  const firstBookKey = topLevel[0];
  if (firstBookKey && isRecord(parsed[firstBookKey])) {
    const firstBook = parsed[firstBookKey] as Record<string, unknown>;
    const firstChapterKey = Object.keys(firstBook)[0];
    if (firstChapterKey && isRecord(firstBook[firstChapterKey])) {
      const firstChapter = firstBook[firstChapterKey] as Record<string, unknown>;
      const firstVerseKey = Object.keys(firstChapter)[0];
      const firstVerseValue = firstChapter[firstVerseKey];
      const verseType = typeof firstVerseValue === "string" ? "string" : "object";
      sampleStructure = `${firstBookKey}.${firstChapterKey}.${firstVerseKey} = ${verseType}`;
    }
  }

  const queue: Array<{ value: unknown; path: string[]; depth: number }> = [
    { value: parsed, path: [], depth: 0 },
  ];

  while (queue.length > 0 && paths.length < maxKeys) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth > maxDepth) continue;

    if (isRecord(current.value)) {
      for (const key of Object.keys(current.value)) {
        if (paths.length >= maxKeys) break;
        const nextPath = [...current.path, key];
        paths.push(nextPath.join("."));
        queue.push({
          value: (current.value as Record<string, unknown>)[key],
          path: nextPath,
          depth: current.depth + 1,
        });
      }
    } else if (Array.isArray(current.value)) {
      const first = current.value[0];
      const nextPath = [...current.path, "[0]"];
      paths.push(nextPath.join("."));
      queue.push({ value: first, path: nextPath, depth: current.depth + 1 });
    }
  }

  return { topLevel, paths, sampleStructure };
}

function formatJsonKeySamples(rawText: string): string {
  const samples = extractJsonKeySamples(rawText);
  if (samples.paths.length === 0 && samples.topLevel.length === 0) {
    return "No JSON key samples available (file may not be JSON).";
  }
  const lines = [];
  if (samples.topLevel.length > 0) {
    lines.push(`Top-level keys (books): ${samples.topLevel.slice(0, 10).join(", ")}${samples.topLevel.length > 10 ? ` ... (${samples.topLevel.length} total)` : ""}`);
  }
  if (samples.sampleStructure) {
    lines.push(`Sample structure: ${samples.sampleStructure}`);
    lines.push("This shows: book.chapter.verse = value type");
  }
  if (samples.paths.length > 0) {
    lines.push("Sample key paths (showing nesting):");
    samples.paths.slice(0, 15).forEach((key) => lines.push(`- ${key}`));
    if (samples.paths.length > 15) {
      lines.push(`... (${samples.paths.length} total paths sampled)`);
    }
  }
  return lines.join("\n");
}

function extractBookSnippets(
  rawText: string,
  options?: { maxSnippets?: number; lineWindow?: number; maxChars?: number }
): Array<{ book: string; snippet: string }> {
  const maxSnippets = options?.maxSnippets ?? 6;
  const lineWindow = options?.lineWindow ?? 3;
  const maxChars = options?.maxChars ?? 600;
  const snippets: Array<{ book: string; snippet: string }> = [];
  const seenBooks = new Set<string>();
  if (!rawText) return snippets;

  const lines = rawText.split(/\r?\n/);
  const hasMultipleLines = lines.length > 1;

  if (hasMultipleLines) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      for (const pattern of BOOK_PATTERNS) {
        if (seenBooks.has(pattern.name)) continue;
        if (pattern.regex.test(line)) {
          const start = Math.max(0, i - lineWindow);
          const end = Math.min(lines.length, i + lineWindow + 1);
          const snippet = lines.slice(start, end).join("\n").trim();
          snippets.push({
            book: pattern.name,
            snippet: truncateSnippet(snippet, maxChars),
          });
          seenBooks.add(pattern.name);
          break;
        }
      }
      if (snippets.length >= maxSnippets) break;
    }
  }

  if (snippets.length < maxSnippets) {
    for (const pattern of BOOK_PATTERNS) {
      if (snippets.length >= maxSnippets) break;
      if (seenBooks.has(pattern.name)) continue;
      const match = pattern.regex.exec(rawText);
      if (!match || match.index == null) continue;
      const start = Math.max(0, match.index - 220);
      const end = Math.min(rawText.length, match.index + 380);
      const snippet = rawText.slice(start, end).trim();
      snippets.push({
        book: pattern.name,
        snippet: truncateSnippet(snippet, maxChars),
      });
      seenBooks.add(pattern.name);
    }
  }

  return snippets;
}

function formatBookSnippets(rawText: string): string {
  const snippets = extractBookSnippets(rawText);
  if (snippets.length === 0) return "No book name samples detected.";
  return snippets
    .map(
      (entry) =>
        `\n[Book sample: ${entry.book}]\n${entry.snippet}`
    )
    .join("\n");
}

export const conversionHelpers: ConversionHelpers = {
  stripBom: (text: string) => stripBomText(text),
  parseJsonSafe: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
  parseJson: (text: string) => {
    const cleaned = text == null ? "" : stripBomText(String(text));
    const parsed = tryParseJson<unknown>(cleaned);
    if (parsed !== null) return parsed;
    throw new Error("Invalid JSON");
  },
  parseCsv: (text: string, delimiter = ",") =>
    text
      .split(/\r?\n/)
      .map((line) => line.split(delimiter).map((part) => part.trim())),
  parseTsv: (text: string) =>
    text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((part) => part.trim())),
  splitLines: (text: string) => text.split(/\r?\n/),
  normalizeWhitespace: (text: string) => text.replace(/\s+/g, " ").trim(),
};

export function runConversionScript(
  code: string,
  input: ConversionInput
): { books: unknown; metadata?: Partial<BibleConversionMetadata> } {
  const runner = new Function(
    "input",
    "helpers",
    `${code}\nreturn convertBible(input, helpers);`
  ) as (input: ConversionInput, helpers: ConversionHelpers) => unknown;

  const result = runner(input, conversionHelpers);
  if (!result) {
    throw new Error("Conversion script returned no result.");
  }
  if (isRecord(result) && "books" in result) {
    return result as { books: unknown; metadata?: Partial<BibleConversionMetadata> };
  }
  if (isRecord(result)) {
    return { books: result as unknown };
  }
  throw new Error("Conversion script returned an invalid result.");
}

export async function generateConversionScript(
  rawText: string,
  fileName: string,
  appSettings: AppSettings,
  options?: {
    onProgress?: (message: string) => void;
    maxIterations?: number;
    segmentChars?: number;
  }
): Promise<AIConversionScriptResult> {
  const config = resolveAIConfig(appSettings);
  if (!config) {
    throw new Error("AI provider is not configured.");
  }

  const segmentChars = options?.segmentChars ?? 4000;
  const segments = buildSegments(rawText, segmentChars);
  if (segments.length === 0) {
    throw new Error("File is empty.");
  }

  const requestedSegments = new Set<number>([
    0,
    1,
    Math.max(segments.length - 1, 0),
  ]);
  const maxIterations = options?.maxIterations ?? 4;

  for (let attempt = 0; attempt < maxIterations; attempt += 1) {
    options?.onProgress?.(
      attempt === 0
        ? "Understanding file structure"
        : "Checking additional sections"
    );

    const selectedSegments = Array.from(requestedSegments)
      .filter((id) => id >= 0 && id < segments.length)
      .sort((a, b) => a - b)
      .map((id) => segments[id])
      .slice(0, 5);

    const systemPrompt = `You are a data conversion agent for Bible files.
You must respond with JSON only (no markdown, no code fences).

If you need more file data, respond with:
{ "status": "need_more", "segmentIds": [0, 3], "reason": "short explanation" }

If you have enough data, respond with:
{
  "status": "ready",
  "format": "short description of the source format",
  "metadata": { "shortName": "", "fullName": "", "language": "", "source": "", "aliases": [""] },
  "code": "function convertBible(input, helpers) { /* return { books, metadata? } */ }",
  "notes": "any caveats or assumptions"
}

CRITICAL: The output must have this exact structure:
{
  "books": {
    "Genesis": {
      "1": {
        "1": { "v": 1, "t": "verse text here" },
        "2": { "v": 2, "t": "verse text here" }
      },
      "2": { ... }
    },
    "Exodus": { ... }
  }
}

Rules for the code:
- Must define function convertBible(input, helpers)
- Must return { books } where books is an object with book names as keys
- Each book contains chapter numbers (as strings) as keys
- Each chapter contains verse numbers (as strings) as keys  
- Each verse must be { v: number, t: string } where v is the verse number and t is the text
- If input.json exists, use it directly (it's already parsed JSON)
- Otherwise, parse input.rawText using helpers.parseJsonSafe() or helpers.parseJson()
- Do not use imports, require, fetch, or external libraries
- Use helpers: stripBom, parseJsonSafe, parseJson, parseCsv, parseTsv, splitLines, normalizeWhitespace
- Input shape: input.rawText (string), input.fileName (string), input.json (object if JSON parsed, otherwise undefined)
- The JSON key samples show you the exact structure - use them to understand book -> chapter -> verse mapping
- ALWAYS iterate through all books, chapters, and verses - do not return empty books object`;

    const userPrompt = `File: ${fileName}
Total length: ${rawText.length} chars
Available segments:
${formatSegmentIndex(segments)}

Segments provided:${formatSegments(selectedSegments)}

Book samples (context around known book names):
${formatBookSnippets(rawText)}

JSON key samples (first 20):
${formatJsonKeySamples(rawText)}

Remember: respond with JSON only.`;

    const llm = getLLM(config.provider, config.apiKey, 0.1, config.model);
    let response;
    try {
      response = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = /429|rate limit|rate_limit/i.test(errorMessage);
      if (isRateLimit && config.provider === "groq" && attempt < maxIterations - 1) {
        // Wait 2 seconds and retry for Groq rate limits
        options?.onProgress?.("Rate limit hit, waiting and retrying...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      throw error;
    }
    const rawContent = (response as { content?: string | Array<{ text?: string }> })
      ?.content;
    const responseText = typeof rawContent === "string"
      ? rawContent
      : (rawContent as Array<{ text?: string }>)?.[0]?.text ?? "";

    const parsed = tryParseJson<AIResponse>(responseText.trim());
    if (parsed?.status === "need_more") {
      const nextIds = Array.isArray(parsed.segmentIds)
        ? parsed.segmentIds
        : [];
      if (nextIds.length > 0) {
        nextIds.forEach((id) => requestedSegments.add(id));
        continue;
      }
    }

    if (parsed?.status === "ready" && parsed.code) {
      options?.onProgress?.("Generating conversion code");
      return {
        code: parsed.code,
        format: parsed.format,
        notes: parsed.notes,
        metadata: parsed.metadata,
      };
    }

    const fallbackCode = extractCodeFallback(responseText);
    if (fallbackCode) {
      options?.onProgress?.("Generating conversion code");
      return { code: fallbackCode };
    }
  }

  throw new Error("AI could not generate conversion code.");
}

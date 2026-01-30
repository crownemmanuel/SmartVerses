#!/usr/bin/env node
/**
 * Bible Conversion AI prompt test harness.
 *
 * Usage:
 *   OPENAI_API_KEY=... OPENAI_MODEL="gpt-4o-latest" node tools/bible-conversion-ai-test.mjs [path/to/ESV_bible.json]
 */
import fs from "fs";
import path from "path";

const filePath =
  process.argv[2] || path.resolve(process.cwd(), "ESV_bible.json");
const configPath = path.resolve(process.cwd(), "tools", ".config");

function parseConfigFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf-8");
  const config = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key) config[key] = value;
  });
  return config;
}

const config = parseConfigFile(configPath);
const apiKey = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || config.OPENAI_MODEL || "gpt-4o-latest";
const maxAttempts = Number(process.env.MAX_ATTEMPTS || config.MAX_ATTEMPTS || 3);

if (!apiKey) {
  console.error("Missing OPENAI_API_KEY.");
  console.error("Config file path:", configPath);
  console.error("Config keys found:", Object.keys(config));
  process.exit(1);
}

console.log("API Key loaded:", apiKey ? "[REDACTED]" : "NOT FOUND");
console.log("Model:", model);

const rawText = fs.readFileSync(filePath, "utf-8");
const fileName = path.basename(filePath);

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

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tryParseJson(raw) {
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBookPatterns() {
  return [...BIBLE_BOOKS]
    .sort((a, b) => b.length - a.length)
    .map((name) => {
      const escaped = escapeRegex(name).replace(/\s+/g, "\\s+");
      return { name, regex: new RegExp(`\\b${escaped}\\b`, "i") };
    });
}

const BOOK_PATTERNS = buildBookPatterns();

function truncateSnippet(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function extractBookSnippets(raw, options = {}) {
  const maxSnippets = options.maxSnippets ?? 6;
  const lineWindow = options.lineWindow ?? 3;
  const maxChars = options.maxChars ?? 600;
  const snippets = [];
  const seenBooks = new Set();
  if (!raw) return snippets;

  const lines = raw.split(/\r?\n/);
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
      const match = pattern.regex.exec(raw);
      if (!match || match.index == null) continue;
      const start = Math.max(0, match.index - 220);
      const end = Math.min(raw.length, match.index + 380);
      const snippet = raw.slice(start, end).trim();
      snippets.push({
        book: pattern.name,
        snippet: truncateSnippet(snippet, maxChars),
      });
      seenBooks.add(pattern.name);
    }
  }

  return snippets;
}

function formatBookSnippets(raw) {
  const snippets = extractBookSnippets(raw);
  if (snippets.length === 0) return "No book name samples detected.";
  return snippets
    .map((entry) => `\n[Book sample: ${entry.book}]\n${entry.snippet}`)
    .join("\n");
}

function extractJsonKeySamples(raw, options = {}) {
  const maxKeys = options.maxKeys ?? 20;
  const maxDepth = options.maxDepth ?? 5;
  const parsed = tryParseJson(raw);
  if (!parsed || !isRecord(parsed)) {
    return { topLevel: [], paths: [], sampleStructure: undefined };
  }

  const topLevel = Object.keys(parsed).slice(0, maxKeys);
  const paths = [];
  let sampleStructure;

  // Get a sample book structure
  const firstBookKey = topLevel[0];
  if (firstBookKey && isRecord(parsed[firstBookKey])) {
    const firstBook = parsed[firstBookKey];
    const firstChapterKey = Object.keys(firstBook)[0];
    if (firstChapterKey && isRecord(firstBook[firstChapterKey])) {
      const firstChapter = firstBook[firstChapterKey];
      const firstVerseKey = Object.keys(firstChapter)[0];
      const firstVerseValue = firstChapter[firstVerseKey];
      const verseType = typeof firstVerseValue === "string" ? "string" : "object";
      sampleStructure = `${firstBookKey}.${firstChapterKey}.${firstVerseKey} = ${verseType}`;
    }
  }

  const queue = [{ value: parsed, path: [], depth: 0 }];

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
          value: current.value[key],
          path: nextPath,
          depth: current.depth + 1,
        });
      }
    } else if (Array.isArray(current.value)) {
      const nextPath = [...current.path, "[0]"];
      paths.push(nextPath.join("."));
      queue.push({
        value: current.value[0],
        path: nextPath,
        depth: current.depth + 1,
      });
    }
  }

  return { topLevel, paths, sampleStructure };
}

function formatJsonKeySamples(raw) {
  const samples = extractJsonKeySamples(raw);
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

function buildSegments(text, segmentChars) {
  if (!text) return [];
  const segments = [];
  let id = 0;
  for (let start = 0; start < text.length; start += segmentChars) {
    const end = Math.min(text.length, start + segmentChars);
    segments.push({ id, start, end, text: text.slice(start, end) });
    id += 1;
  }
  return segments;
}

function formatSegmentIndex(segments) {
  if (segments.length === 0) return "No segments available.";
  const head = segments.slice(0, 3);
  const tail = segments.length > 6 ? segments.slice(-3) : segments.slice(3);
  const lines = [
    `Total segments: ${segments.length} (ids 0..${segments.length - 1})`,
    ...head.map((segment) => `- [${segment.id}] chars ${segment.start}-${segment.end}`),
  ];
  if (segments.length > 6) lines.push("- ...");
  tail.forEach((segment) => {
    lines.push(`- [${segment.id}] chars ${segment.start}-${segment.end}`);
  });
  return lines.join("\n");
}

function formatSegments(segments) {
  return segments
    .map(
      (segment) =>
        `\n[Segment ${segment.id} | chars ${segment.start}-${segment.end}]\n${segment.text}`
    )
    .join("\n");
}

function buildPrompts(text, name, segments, selectedSegments, extraHint) {
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

  const userPrompt = `File: ${name}
Total length: ${text.length} chars
Available segments:
${formatSegmentIndex(segments)}

Segments provided:${formatSegments(selectedSegments)}

Book samples (context around known book names):
${formatBookSnippets(text)}

JSON key samples (first 20):
${formatJsonKeySamples(text)}

${extraHint ? `Extra hint: ${extraHint}\n` : ""}Remember: respond with JSON only.`;

  return { systemPrompt, userPrompt };
}

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${text}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function extractCodeFallback(raw) {
  const idx = raw.indexOf("function convertBible");
  if (idx === -1) return null;
  return raw.slice(idx).trim();
}

function runConversionScript(code, input) {
  const helpers = {
    stripBom: (text) => String(text || "").replace(/^\uFEFF/, ""),
    parseJsonSafe: (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    parseJson: (text) => {
      const cleaned = String(text || "").replace(/^\uFEFF/, "");
      const parsed = tryParseJson(cleaned);
      if (parsed !== null) return parsed;
      throw new Error("Invalid JSON");
    },
    parseCsv: (text, delimiter = ",") =>
      String(text || "")
        .split(/\r?\n/)
        .map((line) => line.split(delimiter).map((part) => part.trim())),
    parseTsv: (text) =>
      String(text || "")
        .split(/\r?\n/)
        .map((line) => line.split("\t").map((part) => part.trim())),
    splitLines: (text) => String(text || "").split(/\r?\n/),
    normalizeWhitespace: (text) => String(text || "").replace(/\s+/g, " ").trim(),
  };

  const runner = new Function(
    "input",
    "helpers",
    `${code}\nreturn convertBible(input, helpers);`
  );
  const result = runner(input, helpers);
  if (!result || !isRecord(result)) {
    throw new Error("Conversion script returned invalid result.");
  }
  return result;
}

function evaluateResult(result) {
  const books = result.books;
  if (!books || !isRecord(books)) {
    return { ok: false, reason: "No books object in result." };
  }
  const keys = Object.keys(books);
  if (keys.length === 0) {
    return { ok: false, reason: "Books object is empty." };
  }
  const knownMatches = keys.filter((key) =>
    BIBLE_BOOKS.some((book) => book.toLowerCase() === key.toLowerCase())
  );
  if (knownMatches.length === 0) {
    return { ok: false, reason: "No known Bible book keys detected." };
  }
  return { ok: true, keys, knownMatches };
}

async function main() {
  console.log(`Testing AI conversion prompt on ${fileName}`);
  const segmentChars = 4000;
  const segments = buildSegments(rawText, segmentChars);
  const requested = new Set([0, 1, Math.max(segments.length - 1, 0)]);
  let extraHint = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const selected = Array.from(requested)
      .filter((id) => id >= 0 && id < segments.length)
      .sort((a, b) => a - b)
      .map((id) => segments[id])
      .slice(0, 5);

    const { systemPrompt, userPrompt } = buildPrompts(
      rawText,
      fileName,
      segments,
      selected,
      extraHint
    );

    console.log(`\nAttempt ${attempt}/${maxAttempts}: calling OpenAI...`);
    const responseText = await callOpenAI(systemPrompt, userPrompt);
    const parsed = tryParseJson(responseText);

    if (parsed?.status === "need_more" && Array.isArray(parsed.segmentIds)) {
      parsed.segmentIds.forEach((id) => requested.add(id));
      extraHint = parsed.reason || "Provide more segments if needed.";
      console.log("AI requested more segments. Retrying...");
      continue;
    }

    if (!parsed?.code) {
      const fallback = extractCodeFallback(responseText);
      if (!fallback) {
        extraHint = "Return status: ready with valid conversion code.";
        console.log("No valid code returned. Retrying...");
        continue;
      }
      parsed.code = fallback;
    }

    try {
      const inputJson = tryParseJson(rawText) ?? undefined;
      const result = runConversionScript(parsed.code, {
        rawText,
        fileName,
        json: inputJson,
      });
      const evaluation = evaluateResult(result);
      if (evaluation.ok) {
        console.log("Conversion looks good.");
        console.log(`Books detected: ${evaluation.keys.length}`);
        console.log(`Known books: ${evaluation.knownMatches.join(", ")}`);
        return;
      }
      console.log(`Conversion failed validation: ${evaluation.reason}`);
      extraHint = `Previous attempt failed: ${evaluation.reason} Use JSON key samples and book samples to map books -> chapter -> verse.`;
    } catch (error) {
      console.error("Conversion script failed:", error?.message || error);
      extraHint =
        "Conversion script threw an error. Ensure it handles this file format safely.";
    }
  }

  console.error("Max attempts reached without a valid conversion.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

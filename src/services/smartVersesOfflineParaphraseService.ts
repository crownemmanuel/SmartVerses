/**
 * SmartVerses Offline Paraphrase Service
 *
 * Provides offline paraphrase detection by combining:
 * - Keyword candidate retrieval (FlexSearch)
 * - Lexical overlap scoring
 * - Optional local embedding similarity (transformers.js)
 */

import { ParaphrasedVerse, TranscriptAnalysisResult } from "../types/smartVerses";
import { searchBibleText } from "./bibleTextSearchService";
import { configureTransformersEnv } from "../utils/transformersEnv";
import { supportsWebGPU } from "./offlineModelService";

const DEFAULT_EMBEDDING_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_MIN_WORDS = 4;
const DEFAULT_MAX_RESULTS = 3;
const DEFAULT_CANDIDATE_LIMIT = 120;
const DEFAULT_MAX_WINDOWS = 16;
const WINDOW_MIN_WORDS = 4;
const WINDOW_MAX_WORDS = 18;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so", "than", "that", "this",
  "these", "those", "is", "are", "was", "were", "be", "been", "being", "to", "of",
  "in", "on", "for", "with", "as", "at", "by", "from", "into", "over", "under",
  "about", "after", "before", "between", "through", "during", "without", "within",
  "not", "no", "nor", "too", "very", "can", "could", "should", "would", "will",
  "just", "only", "also", "even", "still", "yet", "him", "his", "her", "hers",
  "them", "their", "theirs", "you", "your", "yours", "we", "our", "ours", "i",
  "me", "my", "mine", "he", "she", "they", "it", "its", "us", "our", "ours",
]);

type TextWindow = {
  text: string;
  tokens: string[];
  bigrams: string[];
  embedding?: Float32Array | null;
};

let embedder: unknown | null = null;
let embedderPromise: Promise<unknown | null> | null = null;

const verseEmbeddingCache = new Map<string, Float32Array>();
const verseTokenCache = new Map<string, { tokens: string[]; bigrams: string[] }>();
const embeddingInFlight = new Map<string, Promise<Float32Array | null>>();

function isDebugOfflineParaphrase(): boolean {
  try {
    return localStorage.getItem("smartverses_debug_offline_paraphrase") === "1";
  } catch {
    return false;
  }
}

function normalizeText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[\u2013\u2014]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lightStem(token: string): string {
  if (token.length <= 4) return token;
  if (token.endsWith("ing") && token.length > 6) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("ly") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => lightStem(token))
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function buildBigrams(tokens: string[]): string[] {
  if (tokens.length < 2) return [];
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

function buildTextWindows(text: string): TextWindow[] {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  const sentences = trimmed
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const windows: TextWindow[] = [];
  const allCandidates = sentences.length > 0 ? sentences : [trimmed];

  for (const sentence of allCandidates) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= WINDOW_MAX_WORDS) {
      const tokens = tokenize(sentence);
      if (tokens.length >= WINDOW_MIN_WORDS) {
        windows.push({ text: sentence, tokens, bigrams: buildBigrams(tokens) });
      }
      continue;
    }

    const step = Math.max(4, Math.floor(WINDOW_MAX_WORDS / 3));
    for (let i = 0; i < words.length; i += step) {
      const slice = words.slice(i, i + WINDOW_MAX_WORDS);
      if (slice.length < WINDOW_MIN_WORDS) break;
      const windowText = slice.join(" ");
      const tokens = tokenize(windowText);
      if (tokens.length >= WINDOW_MIN_WORDS) {
        windows.push({ text: windowText, tokens, bigrams: buildBigrams(tokens) });
      }
    }
  }

  const fullTokens = tokenize(trimmed);
  if (fullTokens.length >= WINDOW_MIN_WORDS) {
    windows.unshift({
      text: trimmed,
      tokens: fullTokens,
      bigrams: buildBigrams(fullTokens),
    });
  }

  const deduped: TextWindow[] = [];
  const seen = new Set<string>();
  for (const window of windows) {
    const key = window.tokens.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(window);
    if (deduped.length >= DEFAULT_MAX_WINDOWS) break;
  }

  return deduped;
}

function buildKeywordQuery(tokens: string[], maxTokens = 8): string {
  if (!tokens.length) return "";
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  });
  return sorted.slice(0, maxTokens).map(([token]) => token).join(" ");
}

function buildKeywordQueryByLength(tokens: string[], maxTokens = 6): string {
  if (!tokens.length) return "";
  const unique = Array.from(new Set(tokens));
  const sorted = unique.sort((a, b) => b.length - a.length);
  return sorted.slice(0, maxTokens).join(" ");
}

function buildBigramQuery(bigrams: string[], maxBigrams = 3): string {
  if (!bigrams.length) return "";
  const counts = new Map<string, number>();
  for (const bigram of bigrams) {
    counts.set(bigram, (counts.get(bigram) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, maxBigrams).map(([bigram]) => bigram).join(" ");
}

function getTokenDataForVerse(reference: string, text: string): { tokens: string[]; bigrams: string[] } {
  const cached = verseTokenCache.get(reference);
  if (cached) return cached;
  const cleaned = text.replace(/^#\s*/, "").replace(/\[([^\]]+)\]/g, "$1");
  const tokens = tokenize(cleaned);
  const bigrams = buildBigrams(tokens);
  const data = { tokens, bigrams };
  verseTokenCache.set(reference, data);
  return data;
}

function overlapCount(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let count = 0;
  for (const token of setA) {
    if (setB.has(token)) count += 1;
  }
  return count;
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const token of setA) {
    if (setB.has(token)) overlap += 1;
  }
  return (2 * overlap) / (setA.size + setB.size);
}

function f1Score(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function getEmbedder(): Promise<unknown | null> {
  if (embedder) return embedder;
  if (embedderPromise) return embedderPromise;

  embedderPromise = (async () => {
    try {
      const [{ pipeline }] = await Promise.all([import("@huggingface/transformers")]);
      configureTransformersEnv();
      const hasWebGPU = await supportsWebGPU();
      const device = hasWebGPU ? "webgpu" : "wasm";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractor = await (pipeline as any)("feature-extraction", DEFAULT_EMBEDDING_MODEL_ID, {
        device,
        dtype: "fp32",
      });
      return extractor;
    } catch (error) {
      console.error("[SmartVerses][OfflineParaphrase] Failed to load embedder:", error);
      return null;
    }
  })();

  embedder = await embedderPromise;
  return embedder;
}

async function embedText(text: string): Promise<Float32Array | null> {
  const extractor = await getEmbedder();
  if (!extractor) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (extractor as any)(text, { pooling: "mean", normalize: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (result as any)?.data ?? (Array.isArray(result) ? (result[0] as any)?.data : null);
    if (!data) return null;
    return new Float32Array(data as Float32Array);
  } catch (error) {
    console.error("[SmartVerses][OfflineParaphrase] Embedding failed:", error);
    return null;
  }
}

async function getVerseEmbedding(reference: string, text: string): Promise<Float32Array | null> {
  const cached = verseEmbeddingCache.get(reference);
  if (cached) return cached;

  const inflight = embeddingInFlight.get(reference);
  if (inflight) return inflight;

  const promise = (async () => {
    const embedding = await embedText(text);
    if (embedding) {
      verseEmbeddingCache.set(reference, embedding);
    }
    embeddingInFlight.delete(reference);
    return embedding;
  })();

  embeddingInFlight.set(reference, promise);
  return promise;
}

async function collectCandidates(
  windows: TextWindow[],
  limit: number
): Promise<Map<string, Awaited<ReturnType<typeof searchBibleText>>[number]>> {
  const candidates = new Map<string, Awaited<ReturnType<typeof searchBibleText>>[number]>();
  const queries = new Map<string, { suggest: boolean }>();
  const maxCandidates = Math.max(30, limit);
  const perQueryLimit = Math.max(20, Math.floor(limit / 4));

  for (const window of windows) {
    const freqQuery = buildKeywordQuery(window.tokens);
    if (freqQuery) {
      queries.set(freqQuery, { suggest: false });
    }

    const lengthQuery = buildKeywordQueryByLength(window.tokens);
    if (lengthQuery) {
      queries.set(lengthQuery, { suggest: true });
    }

    const bigramQuery = buildBigramQuery(window.bigrams);
    if (bigramQuery) {
      queries.set(bigramQuery, { suggest: true });
    }
  }

  for (const [query, meta] of queries.entries()) {
    if (candidates.size >= maxCandidates) break;
    const results = await searchBibleText(query, perQueryLimit, { suggest: meta.suggest });
    for (const result of results) {
      if (!candidates.has(result.reference)) {
        candidates.set(result.reference, result);
        if (candidates.size >= maxCandidates) break;
      }
    }
  }

  return candidates;
}

function normalizeScore(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export async function analyzeTranscriptChunkOffline(
  transcriptChunk: string,
  options?: {
    minConfidence?: number;
    maxResults?: number;
    minWords?: number;
    useEmbeddings?: boolean;
    candidateLimit?: number;
  }
): Promise<TranscriptAnalysisResult> {
  const trimmed = transcriptChunk.trim();
  if (!trimmed) return { paraphrasedVerses: [], keyPoints: [] };

  const wordCount = trimmed.split(/\s+/).length;
  const minWords = options?.minWords ?? DEFAULT_MIN_WORDS;
  if (wordCount < minWords) {
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  const windows = buildTextWindows(trimmed);
  if (windows.length === 0) {
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  let embeddingEnabled = options?.useEmbeddings !== false;
  if (embeddingEnabled) {
    const probe = await getEmbedder();
    if (!probe) embeddingEnabled = false;
  }

  if (embeddingEnabled) {
    await Promise.all(
      windows.map(async (window) => {
        window.embedding = await embedText(window.text);
      })
    );
  }

  const candidateLimit = options?.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const candidates = await collectCandidates(windows, candidateLimit);

  const minConfidence = options?.minConfidence ?? 0.6;
  const matches: ParaphrasedVerse[] = [];

  for (const [reference, result] of candidates.entries()) {
    const verseText = result.text || "";
    const { tokens: verseTokens, bigrams: verseBigrams } =
      getTokenDataForVerse(reference, verseText);

    if (verseTokens.length === 0) continue;

    let bestScore = 0;
    let bestPhrase = "";
    let bestSemantic = 0;

    const verseEmbedding = embeddingEnabled ? await getVerseEmbedding(reference, verseText) : null;

    for (const window of windows) {
      const overlap = overlapCount(window.tokens, verseTokens);
      const windowTokenCount = new Set(window.tokens).size;
      const verseTokenCount = new Set(verseTokens).size;
      const precision = overlap / Math.max(windowTokenCount, 1);
      const recall = overlap / Math.max(verseTokenCount, 1);
      const f1 = f1Score(precision, recall);
      const bigramScore = diceCoefficient(window.bigrams, verseBigrams);
      const lexicalScore = normalizeScore(0.6 * f1 + 0.4 * bigramScore);

      let semanticScore = 0;
      if (embeddingEnabled && verseEmbedding && window.embedding) {
        const cosine = cosineSimilarity(window.embedding, verseEmbedding);
        semanticScore = normalizeScore((cosine + 1) / 2);
      }

      const score = embeddingEnabled
        ? normalizeScore(0.7 * semanticScore + 0.3 * lexicalScore)
        : lexicalScore;

      const overlapGate = overlap >= 2 || bigramScore >= 0.15;
      const semanticGate = embeddingEnabled ? semanticScore >= 0.62 : false;
      if (!overlapGate && !semanticGate) continue;

      if (score > bestScore) {
        bestScore = score;
        bestPhrase = window.text;
        bestSemantic = semanticScore;
      }
    }

    const lengthPenalty = verseTokens.length < 6 ? 0.85 : 1;
    const finalScore = normalizeScore(bestScore * lengthPenalty);

    if (finalScore >= minConfidence) {
      matches.push({
        reference,
        confidence: finalScore,
        matchedPhrase: bestPhrase || trimmed,
        verseText: verseText,
      });
    } else if (isDebugOfflineParaphrase() && bestScore > 0) {
      console.log("[SmartVerses][OfflineParaphrase] candidate", reference, {
        bestScore,
        bestSemantic,
        finalScore,
      });
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);

  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  return {
    paraphrasedVerses: matches.slice(0, maxResults),
    keyPoints: [],
  };
}

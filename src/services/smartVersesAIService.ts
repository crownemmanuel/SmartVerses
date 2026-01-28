/**
 * SmartVerses AI Service
 * 
 * Provides AI-powered Bible analysis capabilities:
 * - Paraphrase detection (detecting when someone paraphrases Bible verses)
 * - AI Bible search (natural language queries for Bible verses)
 * - Key point extraction from sermons
 * 
 * Uses the same AI infrastructure as the main app (OpenAI, Gemini, Groq).
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppSettings, AIProviderType } from "../types";
import {
  ParaphrasedVerse,
  TranscriptAnalysisResult,
  DetectedBibleReference,
} from "../types/smartVerses";
import { lookupVerse, parseVerseReference } from "./smartVersesBibleService";

// =============================================================================
// TYPES
// =============================================================================

interface AIBibleSearchResponse {
  verses: Array<{
    reference: string;
    highlight?: string[];
  }>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const GROQ_RATE_LIMIT_EVENT = "ai-rate-limit";
let groqRateLimitUntil = 0;
let groqRateLimitMessage = "";
let groqRateLimitDetail = "";

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const nestedMessage =
    (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message;
  if (nestedMessage) return nestedMessage;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function extractRetryAfterMs(message: string): number | null {
  const match = message.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = match[2] ? Number(match[2]) : 0;
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return (minutes * 60 + seconds) * 1000;
}

function emitGroqRateLimitStatus() {
  if (typeof window === "undefined") return;
  if (groqRateLimitUntil <= Date.now()) return;
  window.dispatchEvent(
    new CustomEvent(GROQ_RATE_LIMIT_EVENT, {
      detail: {
        provider: "groq",
        until: groqRateLimitUntil,
        message: groqRateLimitMessage,
        detail: groqRateLimitDetail,
      },
    })
  );
}

function markGroqRateLimit(untilMs: number, detail: string) {
  groqRateLimitUntil = untilMs;
  groqRateLimitMessage = "Groq limit — paraphrase & keywords paused";
  groqRateLimitDetail = detail;
  emitGroqRateLimitStatus();
}

/**
 * Get the appropriate LLM instance based on provider
 */
function getLLM(
  provider: AIProviderType,
  apiKey: string,
  temperature: number = 0.7,
  model?: string
) {
  switch (provider) {
    case "openai":
      return new ChatOpenAI({
        apiKey,
        modelName: model || "gpt-4o-mini",
        temperature,
      });
    case "gemini":
      return new ChatGoogleGenerativeAI({
        apiKey,
        model: model || "gemini-1.5-flash-latest",
        temperature,
      });
    case "groq":
      return new ChatGroq({
        apiKey,
        model: model || "llama-3.3-70b-versatile",
        temperature,
      });
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Get the API key for a provider from app settings
 */
function getApiKey(provider: AIProviderType, appSettings: AppSettings): string | undefined {
  switch (provider) {
    case "openai":
      return appSettings.openAIConfig?.apiKey;
    case "gemini":
      return appSettings.geminiConfig?.apiKey;
    case "groq":
      return appSettings.groqConfig?.apiKey;
    default:
      return undefined;
  }
}

/**
 * Try to parse JSON from a string, handling various formats
 */
function tryParseJson<T>(raw: string): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON object from the string
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        // Fall through
      }
    }
  }
  return null;
}

// =============================================================================
// TRANSCRIPT ANALYSIS (PARAPHRASE DETECTION)
// =============================================================================

/**
 * Analyze a transcript chunk to detect paraphrased Bible verses and extract key points
 */
export async function analyzeTranscriptChunk(
  transcriptChunk: string,
  appSettings: AppSettings,
  detectParaphrases: boolean = true,
  extractKeyPoints: boolean = false,
  options?: {
    keyPointInstructions?: string;
    overrideProvider?: AIProviderType;
    overrideModel?: string;
    minWords?: number;
  }
): Promise<TranscriptAnalysisResult> {
  const debugAI =
    typeof window !== "undefined" &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("smartverses_debug_ai") === "1";

  if (debugAI) {
    console.log("[SmartVerses][AI] analyzeTranscriptChunk input:", transcriptChunk);
  } else {
    console.log("🤖 Analyzing transcript chunk:", transcriptChunk.substring(0, 100) + "...");
  }

  // Return empty results if nothing to analyze or both options disabled
  if (!transcriptChunk.trim() || (!detectParaphrases && !extractKeyPoints)) {
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  // Skip very short chunks (less than 10 words)
  const wordCount = transcriptChunk.trim().split(/\s+/).length;
  // NOTE: In practice, many recognizable paraphrases are short (e.g., "For God so loved the world").
  // We keep a guard to control cost, but allow slightly shorter chunks.
  const minWords = Math.max(1, Math.floor(options?.minWords ?? 6));
  if (wordCount < minWords) {
    console.log(
      "⚠️ Skipping AI analysis - chunk too short:",
      wordCount,
      "words. (min=" + minWords + ")",
      "chunk=",
      transcriptChunk
    );
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  // Get the default AI provider and key
  const provider = (options?.overrideProvider ?? appSettings.defaultAIProvider) as
    | AIProviderType
    | null
    | undefined;
  if (!provider) {
    console.error("No AI provider configured");
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  const apiKey = getApiKey(provider, appSettings);
  if (!apiKey) {
    console.error(`No API key configured for ${provider}`);
    return { paraphrasedVerses: [], keyPoints: [] };
  }

  const defaultModel =
    provider === appSettings.defaultAIProvider ? appSettings.defaultAIModel : undefined;

  if (provider === "groq") {
    if (groqRateLimitUntil > Date.now()) {
      emitGroqRateLimitStatus();
      return { paraphrasedVerses: [], keyPoints: [] };
    }
  }

  const keyPointInstructions =
    (options?.keyPointInstructions ?? "").trim();

  const tasks: string[] = [];
  if (detectParaphrases) {
    tasks.push(
      `DETECT PARAPHRASED BIBLE VERSES: Identify when the speaker is paraphrasing or alluding to specific Bible verses without directly quoting them. Be conservative - only identify clear paraphrases, not vague thematic connections.`
    );
  }
  if (extractKeyPoints) {
    tasks.push(
      `EXTRACT KEY POINTS: Identify quotable, actionable, or memorable statements that would make good lower-thirds or slides. Be selective - only extract truly quotable content, not generic statements.`
    );
  }

  const keyPointGuidelines = extractKeyPoints
    ? `
Key point categories:
- "quote": A memorable, shareable statement
- "action": An actionable step or call to action
- "principle": A life principle or teaching point
- "encouragement": An encouraging or uplifting statement
`
    : "";

  const keyPointCustom = extractKeyPoints && keyPointInstructions
    ? `
FOLLOW THESE KEY POINT INSTRUCTIONS:
${keyPointInstructions}
`
    : "";

  const rules: string[] = [];
  if (detectParaphrases) {
    rules.push(`- For paraphrased verses, only return up to 3 most confident matches`);
    rules.push(`- Only include paraphrased verses with confidence >= 0.6`);
  }
  if (extractKeyPoints) {
    rules.push(`- For key points, only extract genuinely quotable content (max 2 per chunk)`);
  }
  rules.push(`- If nothing is found, return empty arrays`);
  rules.push(`- Always use proper Bible reference format (e.g., "John 3:16", "Romans 8:28-30")`);

  const systemPrompt = `You are an expert Bible scholar and sermon analyst. Your task is to analyze sermon transcripts to:

${tasks.map((t, i) => `${i + 1}. ${t}`).join("\n\n")}
${keyPointGuidelines}
${keyPointCustom}
IMPORTANT RULES:
${rules.join("\n")}

Return your response as valid JSON with this exact structure:
{
  "paraphrasedVerses": [
    {
      "reference": "John 3:16",
      "confidence": 0.85,
      "matchedPhrase": "the portion of text that matches"
    }
  ],
  "keyPoints": [
    {
      "text": "The quotable statement",
      "category": "quote"
    }
  ]
}`;

  const userPrompt = `Analyze this sermon transcript chunk:

"${transcriptChunk}"

${detectParaphrases ? "Detect any paraphrased Bible verses." : ""}
${extractKeyPoints ? "Extract any quotable key points." : ""}

Return ONLY valid JSON, no other text.`;

  try {
    const llm = getLLM(
      provider,
      apiKey,
      0.7,
      options?.overrideModel ?? defaultModel
    );
    if (debugAI) {
      console.log("[SmartVerses][AI] provider:", provider);
      console.log("[SmartVerses][AI] systemPrompt chars:", systemPrompt.length);
      console.log("[SmartVerses][AI] userPrompt:", userPrompt);
    }
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    const res = await llm.invoke(messages);
    const rawContent = (res as { content?: string | Array<{ text?: string }> })?.content;
    const rawText =
      typeof rawContent === "string" 
        ? rawContent 
        : (rawContent as Array<{ text?: string }>)?.[0]?.text ?? "";

    if (debugAI) {
      console.log("[SmartVerses][AI] raw response:", rawText);
    }

    const parsed = tryParseJson<TranscriptAnalysisResult>(rawText.trim());
    
    if (parsed) {
      const result: TranscriptAnalysisResult = {
        paraphrasedVerses: detectParaphrases 
          ? (parsed.paraphrasedVerses || [])
              .filter((v: ParaphrasedVerse) => v.confidence >= 0.6)
              .slice(0, 3)
          : [],
        keyPoints: extractKeyPoints 
          ? (parsed.keyPoints || []).slice(0, 2)
          : [],
      };

      console.log("📤 Analysis result:", result);
      if (debugAI) {
        console.log("[SmartVerses][AI] keyPoints count:", result.keyPoints.length);
        console.log("[SmartVerses][AI] keyPoints:", result.keyPoints);
      }
      return result;
    }

    console.error("Failed to parse AI response:", rawText);
    return { paraphrasedVerses: [], keyPoints: [] };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const isRateLimit =
      /rate limit/i.test(errorMessage) ||
      /rate_limit_exceeded/i.test(errorMessage) ||
      /429/.test(errorMessage);

    if (provider === "groq" && isRateLimit) {
      const retryAfterMs = extractRetryAfterMs(errorMessage) ?? 60_000;
      markGroqRateLimit(Date.now() + retryAfterMs, errorMessage);
    }

    console.error("Error analyzing transcript:", error);
    return { paraphrasedVerses: [], keyPoints: [] };
  }
}

// =============================================================================
// AI BIBLE SEARCH
// =============================================================================

/**
 * Search for Bible verses using natural language query via AI
 * 
 * @param query - The user's search query
 * @param appSettings - App settings containing API keys
 * @param overrideProvider - Optional provider override (for SmartVerses settings)
 * @param overrideModel - Optional model override (for SmartVerses settings)
 */
export async function searchBibleWithAI(
  query: string,
  appSettings: AppSettings,
  overrideProvider?: 'openai' | 'gemini' | 'groq',
  overrideModel?: string
): Promise<DetectedBibleReference[]> {
  console.log("🔍 AI Bible search:", query);

  const provider = overrideProvider || appSettings.defaultAIProvider;
  if (!provider) {
    console.error("No AI provider configured");
    return [];
  }

  const apiKey = getApiKey(provider as AIProviderType, appSettings);
  if (!apiKey) {
    console.error(`No API key configured for ${provider}`);
    return [];
  }

  const defaultModel =
    provider === appSettings.defaultAIProvider ? appSettings.defaultAIModel : undefined;

  if (provider === "groq") {
    if (groqRateLimitUntil > Date.now()) {
      emitGroqRateLimitStatus();
      return [];
    }
  }

  const systemPrompt = `You are an expert Bible verse finder. Your task is to find Bible verses from the user's query.

INSTRUCTIONS:
1. Analyze the user's query to identify any Bible references or verses being referenced
2. Return ALL matching Bible verses (could be multiple, like "John 3:16, Romans 3:3")
3. For partial quotes or paraphrases, identify the original verse(s)
4. For themes or topics, return the most relevant verses (max 5)

Return your response as valid JSON with this exact structure:
{
  "verses": [
    {
      "reference": "John 3:16",
      "highlight": ["love", "world", "gave"]
    },
    {
      "reference": "Romans 3:23",
      "highlight": ["sinned", "glory"]
    }
  ]
}

RULES:
- The "reference" MUST be in format "Book Chapter:Verse" or "Book Chapter:StartVerse-EndVerse"
- Use full book names (e.g., "Genesis" not "Gen", "1 Corinthians" not "1 Cor")
- The "highlight" array should contain key words from the query that appear in the verse
- Return ONLY valid JSON, no other text or explanation
- If no Bible verse can be identified, return: {"verses": []}`;

  try {
    const llm = getLLM(
      provider as AIProviderType,
      apiKey,
      0.3,
      overrideModel ?? defaultModel
    );
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(query),
    ];

    const res = await llm.invoke(messages);
    const rawContent = (res as { content?: string | Array<{ text?: string }> })?.content;
    const rawText =
      typeof rawContent === "string" 
        ? rawContent 
        : (rawContent as Array<{ text?: string }>)?.[0]?.text ?? "";

    const parsed = tryParseJson<AIBibleSearchResponse>(rawText.trim());
    
    if (parsed && parsed.verses && Array.isArray(parsed.verses)) {
      const results: DetectedBibleReference[] = [];
      
      for (const verse of parsed.verses) {
        // Parse and look up the verse
        const parsedRef = parseVerseReference(verse.reference);
        if (parsedRef && parsedRef.length > 0) {
          const verseText = await lookupVerse(parsedRef[0]);
          
          if (verseText) {
            results.push({
              id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              reference: parsedRef[0].displayRef,
              displayRef: parsedRef[0].displayRef,
              verseText,
              source: 'direct',
              timestamp: Date.now(),
              // Include components for navigation
              book: parsedRef[0].book,
              chapter: parsedRef[0].chapter,
              verse: parsedRef[0].startVerse,
              // Extract highlights from AI response
              highlight: verse.highlight && Array.isArray(verse.highlight) ? verse.highlight : undefined,
            });
          }
        }
      }
      
      console.log("📤 AI search results:", results.length, "verses found");
      return results;
    }

    console.error("Failed to parse AI search response:", rawText);
    return [];
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const isRateLimit =
      /rate limit/i.test(errorMessage) ||
      /rate_limit_exceeded/i.test(errorMessage) ||
      /429/.test(errorMessage);

    if (provider === "groq" && isRateLimit) {
      const retryAfterMs = extractRetryAfterMs(errorMessage) ?? 60_000;
      markGroqRateLimit(Date.now() + retryAfterMs, errorMessage);
    }

    console.error("Error in AI Bible search:", error);
    return [];
  }
}

// =============================================================================
// PARAPHRASED VERSE LOOKUP
// =============================================================================

/**
 * Look up verse text for paraphrased verses detected by AI
 */
export async function resolveParaphrasedVerses(
  paraphrasedVerses: ParaphrasedVerse[]
): Promise<DetectedBibleReference[]> {
  const results: DetectedBibleReference[] = [];

  for (const verse of paraphrasedVerses) {
    const parsedRef = parseVerseReference(verse.reference);
    if (parsedRef && parsedRef.length > 0) {
      const verseText = await lookupVerse(parsedRef[0]);
      
      if (verseText) {
        results.push({
          id: `paraphrase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          reference: parsedRef[0].displayRef,
          displayRef: parsedRef[0].displayRef,
          verseText,
          source: 'paraphrase',
          confidence: verse.confidence,
          matchedPhrase: verse.matchedPhrase,
          timestamp: Date.now(),
          // Include components for navigation
          book: parsedRef[0].book,
          chapter: parsedRef[0].chapter,
          verse: parsedRef[0].startVerse,
        });
      }
    }
  }

  return results;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  getLLM,
  getApiKey,
};

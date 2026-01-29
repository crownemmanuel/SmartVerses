import { AppSettings, Template, LayoutType, Slide } from "../types";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";

interface AISlide {
  text: string;
  layout: LayoutType;
}

/**
 * Generates slides from input text using an AI model based on the selected template and app settings.
 *
 * @param inputText The raw text to be processed into slides.
 * @param template The template guiding the AI, including the custom prompt and available layouts.
 * @param appSettings The application settings containing AI provider configurations and API keys.
 * @returns A promise that resolves to an array of objects, each representing a slide with `text` and `layout`.
 *          Returns an empty array if AI processing is not applicable or fails.
 */
export const generateSlidesFromText = async (
  inputText: string,
  template: Template,
  appSettings: AppSettings
): Promise<Pick<Slide, "text" | "layout">[]> => {
  const shouldUseAI =
    template.processingType === "ai" || !!template.processWithAI;
  const userPrompt = (template.aiPrompt || template.logic || "").trim();

  if (!shouldUseAI || userPrompt.length === 0) {
    console.warn(
      "Template is not configured for AI processing or AI prompt is missing."
    );
    return [];
  }

  // Use provider from template, fallback to appSettings default, then error if none
  const provider = template.aiProvider || appSettings.defaultAIProvider;
  const modelName =
    template.aiModel ||
    (!template.aiProvider && provider === appSettings.defaultAIProvider
      ? appSettings.defaultAIModel
      : undefined);

  if (!provider) {
    console.error(
      "AI provider is not configured in the template or app settings."
    );
    alert(
      "AI provider is not configured for this template. Please edit the template or check global AI settings."
    );
    return [];
  }

  if (template.aiProvider && !modelName) {
    console.error(
      `AI model is not specified in the template ('${template.name}') for the selected provider '${provider}'.`
    );
    alert(
      `AI model not specified for template '${template.name}'. Please edit the template to select a model for '${provider}'.`
    );
    return [];
  }

  let apiKey: string | undefined;
  if (provider === "openai") {
    apiKey = appSettings.openAIConfig?.apiKey;
  } else if (provider === "gemini") {
    apiKey = appSettings.geminiConfig?.apiKey;
  } else if (provider === "groq") {
    apiKey = appSettings.groqConfig?.apiKey;
  }

  if (!provider || !apiKey) {
    console.error("AI provider or API key is not configured.");
    alert(
      "AI provider or API key is not configured. Please check AI settings."
    );
    return [];
  }

  let llm;
  try {
    if (provider === "openai") {
      llm = new ChatOpenAI({
        apiKey: apiKey,
        modelName: modelName || "gpt-4o-mini", // Fallback to a default OpenAI model if somehow not set
        temperature: 0.7,
      });
    } else if (provider === "gemini") {
      llm = new ChatGoogleGenerativeAI({
        apiKey: apiKey,
        model: modelName || "gemini-1.5-flash-latest", // Fallback to a default Gemini model
        temperature: 0.7,
      });
    } else if (provider === "groq") {
      llm = new ChatGroq({
        apiKey: apiKey,
        model: modelName || "llama-3.3-70b-versatile", // Fallback to a default Groq model
        temperature: 0.7,
      });
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
  } catch (error) {
    console.error("Error initializing LLM:", error);
    alert(
      `Error initializing LLM: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }

  const outputParser = new JsonOutputFunctionsParser<{ slides: AISlide[] }>();
  const runnable = llm
    .bind({
      functions: [
        {
          name: "slide_generator",
          description:
            "Generates an array of slides based on the input text and available layouts.",
          parameters: {
            type: "object",
            properties: {
              slides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description:
                        "The content/text for the slide. Each line of text should be separated by a newline character (\\n).",
                    },
                    layout: {
                      type: "string",
                      enum: template.availableLayouts,
                      description:
                        "The layout type to be applied to this slide.",
                    },
                  },
                  required: ["text", "layout"],
                },
              },
            },
            required: ["slides"],
          },
        },
      ],
      function_call: { name: "slide_generator" },
    })
    .pipe(outputParser);

  const systemPrompt = `You are an assistant that helps create presentation slides. Your goal is to take the user's raw text and their specific instructions, then break it down into well-structured slides.
\nFor each slide, choose an appropriate layout from the provided list: ${template.availableLayouts.join(
    ", "
  )}.
\nCrucially, the text provided for a slide MUST match the capacity of the chosen layout:
- If you choose a 'one-line' layout, the text must contain exactly one line.
- If you choose a 'two-line' layout, the text must contain exactly two lines separated by a single \\n.
- If you choose a 'three-line' layout, the text must contain exactly three lines, each separated by \\n.
- Continue this pattern for four-line through six-line.
\nAdditional user instructions you must follow: "${userPrompt}".
\nSTRICT OUTPUT REQUIREMENTS:
- Return ONLY valid JSON (no prose, no backticks, no extra keys).
- The JSON must be an object with a single key 'slides' whose value is an array.
- Each array item must be an object: { "text": string, "layout": one of [${template.availableLayouts.join(
    ", "
  )} ] }.`;

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(inputText),
  ];

  try {
    console.log(
      "Invoking AI with prompt:",
      systemPrompt,
      "Input text:",
      inputText
    );
    const result = await runnable.invoke(messages);
    console.log("AI Result:", result);

    if (
      result &&
      (result as any).slides &&
      Array.isArray((result as any).slides)
    ) {
      return (result as any).slides.map((s: any) => ({
        text: s.text,
        layout: s.layout,
      }));
    }

    // Fallback: try a plain text JSON response without function calling
    console.warn(
      "AI response did not match expected structure; attempting JSON fallback.",
      result
    );
    const plainRes: any = await (llm as any).invoke([
      new SystemMessage(
        systemPrompt +
          "\nReturn ONLY valid JSON for { slides: { text: string, layout: string }[] } with no extra commentary."
      ),
      new HumanMessage(inputText),
    ]);

    const rawContent = (plainRes as any)?.content;
    const rawText =
      typeof rawContent === "string" ? rawContent : rawContent?.[0]?.text ?? "";

    const parsed = tryParseSlidesJson(rawText);
    if (parsed) {
      return parsed;
    }

    console.error("Fallback JSON parse failed. Raw:", rawText);
    alert("AI response structure was unexpected. Check console for details.");
    return [];
  } catch (error) {
    // As a last resort, attempt the same plain JSON prompt if function-call failed
    try {
      console.error(
        "Function-call path failed, trying plain JSON prompt:",
        error
      );
      const plainRes: any = await (llm as any).invoke([
        new SystemMessage(
          systemPrompt +
            "\nReturn ONLY valid JSON for { slides: { text: string, layout: string }[] } with no extra commentary."
        ),
        new HumanMessage(inputText),
      ]);
      const rawContent = (plainRes as any)?.content;
      const rawText =
        typeof rawContent === "string"
          ? rawContent
          : rawContent?.[0]?.text ?? "";
      const parsed = tryParseSlidesJson(rawText);
      if (parsed) return parsed;
      console.error("Final fallback JSON parse failed. Raw:", rawText);
      alert("AI processing failed and fallback parsing did not succeed.");
      return [];
    } catch (err2) {
      console.error("Plain JSON prompt also failed:", err2);
      alert(
        `Error from AI: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }
};

function tryParseSlidesJson(
  raw: string
): Pick<Slide, "text" | "layout">[] | null {
  if (!raw) return null;
  const attempt = (s: string) => {
    try {
      const obj = JSON.parse(s);
      if (obj && Array.isArray(obj.slides)) {
        return obj.slides
          .map((x: any) => ({
            text: String(x.text || "").trim(),
            layout: x.layout,
          }))
          .filter(
            (x: any) => x.text.length > 0 && typeof x.layout === "string"
          );
      }
    } catch {}
    return null;
  };

  // First, try the whole string
  let parsed = attempt(raw);
  if (parsed) return parsed;

  // Next, try to extract the first JSON object substring
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    parsed = attempt(raw.slice(firstBrace, lastBrace + 1));
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Generate a JavaScript or regex snippet from a natural-language description.
 * Returns raw code only (no fencing/explanations) or an empty string on error.
 */
export const generateLogicSnippet = async (
  description: string,
  outputType: "regex" | "javascript",
  providerFromUser: "openai" | "gemini" | "groq" | undefined,
  modelFromUser: string | undefined,
  appSettings: AppSettings
): Promise<string> => {
  const provider =
    providerFromUser || appSettings.defaultAIProvider || undefined;
  if (!provider) return "";

  let apiKey: string | undefined;
  if (provider === "openai") apiKey = appSettings.openAIConfig?.apiKey;
  if (provider === "gemini") apiKey = appSettings.geminiConfig?.apiKey;
  if (provider === "groq") apiKey = appSettings.groqConfig?.apiKey;
  if (!apiKey) return "";

  try {
    const system =
      outputType === "regex"
        ? "You are a JavaScript regex expert. STRICT FORMAT: Return ONLY a valid JavaScript regex literal in the form /pattern/flags. No prose, no code fences, no explanation. The regex will be used to split or capture sections from a single string variable named 'input'."
        : "You are a senior JavaScript engineer. STRICT FORMAT: Return ONLY a minimal JavaScript snippet (no backticks, no comments, no prose) that, when executed as a function body, returns either string[] or { text: string, layout?: string }[]. Assume there is a single input string variable named 'input'. The snippet must end with a return statement.";

    if (provider === "openai") {
      const llm = new ChatOpenAI({
        apiKey,
        modelName: modelFromUser || "gpt-4o-mini",
        temperature: 0.3,
      });
      const messages = [
        new SystemMessage(system),
        new HumanMessage(description),
      ];
      const res = await llm.invoke(messages);
      const text =
        (res as any)?.content?.[0]?.text ?? (res as any)?.content ?? "";
      return typeof text === "string" ? text.trim() : "";
    }
    if (provider === "gemini") {
      const llm = new ChatGoogleGenerativeAI({
        apiKey,
        model: modelFromUser || "gemini-1.5-flash-latest",
        temperature: 0.3,
      });
      const messages = [
        new SystemMessage(system),
        new HumanMessage(description),
      ];
      const res = await llm.invoke(messages);
      const text =
        (res as any)?.content?.[0]?.text ?? (res as any)?.content ?? "";
      return typeof text === "string" ? text.trim() : "";
    }
    if (provider === "groq") {
      const llm = new ChatGroq({
        apiKey,
        model: modelFromUser || "llama-3.3-70b-versatile",
        temperature: 0.3,
      });
      const messages = [
        new SystemMessage(system),
        new HumanMessage(description),
      ];
      const res = await llm.invoke(messages);
      const text =
        (res as any)?.content?.[0]?.text ?? (res as any)?.content ?? "";
      return typeof text === "string" ? text.trim() : "";
    }
  } catch (err) {
    console.error("generateLogicSnippet error:", err);
    return "";
  }
  return "";
};

/**
 * Fetch available model ids from OpenAI (v1/models). Filters to common chat models.
 */
export const fetchOpenAIModels = async (apiKey: string): Promise<string[]> => {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ids: string[] = (data?.data || []).map((m: any) => m.id);
    // keep likely chat/gen models
    return ids
      .filter((id) => /gpt|o\d|^gpt-4|^gpt-3|^o3|^o1|^gpt-4o/.test(id))
      .sort();
  } catch (err) {
    console.error("fetchOpenAIModels failed:", err);
    return [];
  }
};

/**
 * Fetch available Gemini model ids.
 */
export const fetchGeminiModels = async (apiKey: string): Promise<string[]> => {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ids: string[] = (data?.models || []).map(
      (m: any) => m.name || m.displayName || m.id
    );
    return ids.sort();
  } catch (err) {
    console.error("fetchGeminiModels failed:", err);
    return [];
  }
};

/**
 * Fetch available Groq model ids.
 * Groq uses an OpenAI-compatible API at https://api.groq.com/openai/v1/models
 */
export const fetchGroqModels = async (apiKey: string): Promise<string[]> => {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ids: string[] = (data?.data || []).map((m: any) => m.id);
    // Filter to chat/text models (exclude whisper, etc.)
    return ids
      .filter((id) => !id.includes("whisper") && !id.includes("tool-use") && !id.includes("guard"))
      .sort();
  } catch (err) {
    console.error("fetchGroqModels failed:", err);
    return [];
  }
};

/**
 * Proofread and fix grammatical/spelling errors in slide texts.
 * Returns an array of corrected texts in the same order as input.
 *
 * @param slideTexts Array of slide text strings to proofread
 * @param provider The AI provider to use
 * @param modelName The model to use for proofreading
 * @param appSettings The app settings containing API keys
 * @returns Promise resolving to array of corrected texts
 */
export const proofreadSlideTexts = async (
  slideTexts: string[],
  provider: "openai" | "gemini" | "groq",
  modelName: string,
  appSettings: AppSettings
): Promise<string[]> => {
  if (slideTexts.length === 0) return [];

  let apiKey: string | undefined;
  if (provider === "openai") {
    apiKey = appSettings.openAIConfig?.apiKey;
  } else if (provider === "gemini") {
    apiKey = appSettings.geminiConfig?.apiKey;
  } else if (provider === "groq") {
    apiKey = appSettings.groqConfig?.apiKey;
  }

  if (!apiKey) {
    throw new Error(`API key not configured for ${provider}`);
  }

  let llm;
  if (provider === "openai") {
    llm = new ChatOpenAI({
      apiKey,
      modelName: modelName || "gpt-4o-mini",
      temperature: 0, // Low temperature for precise corrections
    });
  } else if (provider === "gemini") {
    llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: modelName || "gemini-1.5-flash-latest",
      temperature: 0,
    });
  } else {
    llm = new ChatGroq({
      apiKey,
      model: modelName || "llama-3.3-70b-versatile",
      temperature: 0,
    });
  }

  const systemPrompt = `You are a professional proofreader. Your ONLY task is to fix spelling and grammatical errors in the provided texts.

STRICT RULES:
1. ONLY fix spelling mistakes and grammatical errors
2. DO NOT change the meaning, tone, or style of the text
3. DO NOT add or remove content
4. DO NOT rephrase or rewrite sentences
5. Preserve all line breaks (\\n) exactly as they appear
6. Preserve capitalization style (if text uses specific capitalization, keep it)
7. If text is already correct, return it unchanged

You will receive a JSON array of slide texts. Return ONLY a JSON array of the corrected texts in the exact same order.

Example Input: ["Helo world\\nThis is a tset", "Anther slide"]
Example Output: ["Hello world\\nThis is a test", "Another slide"]

Return ONLY the JSON array, no other text or explanation.`;

  const inputJson = JSON.stringify(slideTexts);
  
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(inputJson),
  ];

  try {
    const res = await llm.invoke(messages);
    const rawContent = (res as any)?.content;
    const rawText =
      typeof rawContent === "string" ? rawContent : rawContent?.[0]?.text ?? "";

    // Try to parse the JSON array from the response
    const parsed = tryParseJsonArray(rawText.trim());
    if (parsed && parsed.length === slideTexts.length) {
      return parsed;
    }

    // If parsing failed or lengths don't match, return original texts
    console.error("Proofread response parsing failed or length mismatch:", rawText);
    return slideTexts;
  } catch (error) {
    console.error("Proofreading error:", error);
    throw error;
  }
};

/**
 * Helper to parse a JSON array from a string, handling edge cases
 */
function tryParseJsonArray(raw: string): string[] | null {
  if (!raw) return null;
  
  try {
    // Try direct parse first
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // Try to extract JSON array from the string
    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        const parsed = JSON.parse(raw.slice(firstBracket, lastBracket + 1));
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item));
        }
      } catch {
        // Fall through
      }
    }
  }
  return null;
}

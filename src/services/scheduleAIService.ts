/**
 * Schedule AI Service
 *
 * Uses the existing AI infrastructure (Gemini/GPT) to parse schedules from
 * images or text input.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ScheduleItem, AIScheduleResponse } from "../types/propresenter";
import { AIProvider } from "../types";
import { getAppSettings } from "../utils/aiConfig";
import { loadSmartAutomations } from "../utils/testimoniesStorage";

/**
 * Build the complete system prompt including smart automations
 */
function buildSystemPrompt(currentSchedule?: ScheduleItem[]): string {
  const contextPrompt = currentSchedule
    ? `\n\nCurrent schedule: ${JSON.stringify(currentSchedule)}`
    : "";

  // Include smart automations in context
  const smartAutomations = loadSmartAutomations();
  const automationsContext =
    smartAutomations.length > 0
      ? `\n\nSaved ProPresenter automations that can be attached to schedule items:\n${JSON.stringify(
          smartAutomations.map((r) => ({
            pattern: r.sessionNamePattern,
            matchType: r.isExactMatch ? "exact" : "contains",
            automations: r.automations,
          })),
          null,
          2
        )}`
      : "";

  let finalPrompt = SYSTEM_PROMPT;

  if (automationsContext) {
    finalPrompt = finalPrompt + automationsContext;
  }

  if (contextPrompt) {
    finalPrompt = finalPrompt + contextPrompt;
  }

  return finalPrompt;
}

/**
 * Get AI configuration from app settings
 * @param preferredProvider Optional provider to use. If not provided, uses default from settings.
 */
function getAIConfig(
  preferredProvider?: AIProvider
): { provider: AIProvider; apiKey: string; model: string } | null {
  // Get from the main app settings using the utility function
  const appSettings = getAppSettings();

  // Check if timer assistant model is configured
  const timerAssistantSettings = appSettings.timerAssistantModel;

  // Determine provider: prefer configured timer assistant, then preferred, then default
  let provider: AIProvider;
  let model: string;

  if (timerAssistantSettings?.provider && timerAssistantSettings?.model) {
    provider = timerAssistantSettings.provider;
    model = timerAssistantSettings.model;
  } else if (preferredProvider) {
    provider = preferredProvider;
    model =
      preferredProvider === appSettings.defaultAIProvider && appSettings.defaultAIModel
        ? appSettings.defaultAIModel
        : preferredProvider === "openai"
        ? "gpt-4o"
        : preferredProvider === "groq"
        ? "llama-3.3-70b-versatile"
        : "gemini-1.5-flash-latest";
  } else {
    provider = appSettings.defaultAIProvider || null;
    model =
      appSettings.defaultAIModel ||
      (provider === "openai"
        ? "gpt-4o"
        : provider === "groq"
        ? "llama-3.3-70b-versatile"
        : "gemini-1.5-flash-latest");
  }

  if (!provider) {
    // Try any available provider
    if (appSettings.openAIConfig?.apiKey) {
      return {
        provider: "openai",
        apiKey: appSettings.openAIConfig.apiKey,
        model: "gpt-4o",
      };
    }
    if (appSettings.geminiConfig?.apiKey) {
      return {
        provider: "gemini",
        apiKey: appSettings.geminiConfig.apiKey,
        model: "gemini-1.5-flash-latest",
      };
    }
    if (appSettings.groqConfig?.apiKey) {
      return {
        provider: "groq",
        apiKey: appSettings.groqConfig.apiKey,
        model: "llama-3.3-70b-versatile",
      };
    }
    return null;
  }

  // Get API key for the chosen provider
  const apiKey =
    provider === "openai"
      ? appSettings.openAIConfig?.apiKey
      : provider === "groq"
      ? appSettings.groqConfig?.apiKey
      : appSettings.geminiConfig?.apiKey;

  if (!apiKey) {
    // Try fallback to other provider
    if (provider === "openai" && appSettings.geminiConfig?.apiKey) {
      return {
        provider: "gemini",
        apiKey: appSettings.geminiConfig.apiKey,
        model: "gemini-1.5-flash-latest",
      };
    }
    if (provider === "openai" && appSettings.groqConfig?.apiKey) {
      return {
        provider: "groq",
        apiKey: appSettings.groqConfig.apiKey,
        model: "llama-3.3-70b-versatile",
      };
    }
    if (provider === "gemini" && appSettings.openAIConfig?.apiKey) {
      return {
        provider: "openai",
        apiKey: appSettings.openAIConfig.apiKey,
        model: "gpt-4o",
      };
    }
    if (provider === "gemini" && appSettings.groqConfig?.apiKey) {
      return {
        provider: "groq",
        apiKey: appSettings.groqConfig.apiKey,
        model: "llama-3.3-70b-versatile",
      };
    }
    if (provider === "groq" && appSettings.openAIConfig?.apiKey) {
      return {
        provider: "openai",
        apiKey: appSettings.openAIConfig.apiKey,
        model: "gpt-4o",
      };
    }
    if (provider === "groq" && appSettings.geminiConfig?.apiKey) {
      return {
        provider: "gemini",
        apiKey: appSettings.geminiConfig.apiKey,
        model: "gemini-1.5-flash-latest",
      };
    }
    return null;
  }

  return { provider, apiKey, model };
}

/**
 * Get list of available AI providers based on configured API keys
 */
export function getAvailableProviders(): AIProvider[] {
  const appSettings = getAppSettings();
  const providers: AIProvider[] = [];

  if (appSettings.openAIConfig?.apiKey) {
    providers.push("openai");
  }
  if (appSettings.geminiConfig?.apiKey) {
    providers.push("gemini");
  }
  if (appSettings.groqConfig?.apiKey) {
    providers.push("groq");
  }

  return providers;
}

const SYSTEM_PROMPT = `You are an AI assistant helping to manage a church service timer application. 
You can control timers and modify schedules. Your responses must be in JSON format with the following structure:
{
  "action": "none" | "SetCountDown" | "CountDownToTime" | "UpdateSchedule",
  "actionValue": <value based on action>,
  "responseText": "message to show user"
}

Actions:
- "SetCountDown": Start a countdown timer. actionValue should be duration in seconds (number).
- "CountDownToTime": Start a countdown to a specific time. actionValue should be time in format "HH:MM AM/PM" (string).
- "UpdateSchedule": Update the schedule. actionValue should be an array of schedule items (array).
- "none": No action needed, just respond to the user. actionValue is optional.

For UpdateSchedule, actionValue should be an array of schedule items with this structure:
[
  {
    "id": number,
    "session": "Session Name",
    "startTime": "HH:MM AM/PM",
    "endTime": "HH:MM AM/PM",
    "duration": "XXmins",
    "minister": "Optional Minister Name",
    "automation": {
      "type": "slide" | "stageLayout",
      // For slide type:
      "presentationUuid": "UUID of ProPresenter presentation",
      "slideIndex": number,
      "presentationName": "Optional presentation name",
      "activationClicks": number (optional, default 1)
      // OR for stageLayout type:
      "screenUuid": "UUID of stage screen",
      "screenName": "Optional screen name",
      "screenIndex": number,
      "layoutUuid": "UUID of stage layout",
      "layoutName": "Optional layout name",
      "layoutIndex": number
    }
  }
]

The "automation" field is optional and is used to trigger a ProPresenter action when the session starts.
Automation can be either:
- "slide": Triggers a specific slide in a presentation
- "stageLayout": Changes the stage layout for a specific screen
If you have saved automations in context, you can attach them to matching schedule items.

When creating or modifying a schedule:
1. Extract all session/event names
2. Parse start and end times (convert to 12-hour format with AM/PM)
3. Calculate durations in minutes (format as "XXmins" with two digits)
4. Include minister/speaker names if available
5. Assign sequential IDs starting from 1
6. Ensure times are sequential (each session's startTime should match the previous session's endTime)
7. If saved automations are available and match a session name, include the automation field

You will receive the current schedule and any saved ProPresenter automations (slides or stage layouts) as context. 
When modifying the schedule, preserve existing IDs and structure where possible.
When matching automations to sessions, use case-insensitive matching.`;

/**
 * Parse a schedule from an image using AI vision
 */
export async function parseScheduleFromImage(
  imageBase64: string,
  additionalInstructions?: string,
  currentSchedule?: ScheduleItem[],
  preferredProvider?: AIProvider
): Promise<AIScheduleResponse> {
  const config = getAIConfig(preferredProvider);

  if (!config) {
    return {
      action: "none",
      responseText:
        "AI is not configured. Please add your API key in Settings > AI Configuration.",
    };
  }

  try {
    const currentPeriod = new Date().getHours() >= 12 ? "PM" : "AM";
    const userMessage =
      additionalInstructions ||
      `Create the schedule based on the provided image. If a time does not specify AM or PM, use ${currentPeriod}.`;

    if (config.provider === "openai") {
      const llm = new ChatOpenAI({
        apiKey: config.apiKey,
        modelName: "gpt-4o", // Vision model
        temperature: 0.3,
      });

      const response = await llm.invoke([
        new SystemMessage(buildSystemPrompt(currentSchedule)),
        new HumanMessage({
          content: [
            { type: "text", text: userMessage },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        }),
      ]);

      return parseAIResponse(response);
    } else if (config.provider === "gemini") {
      const llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: "gemini-1.5-flash-latest",
        temperature: 0.3,
      });

      const response = await llm.invoke([
        new SystemMessage(buildSystemPrompt(currentSchedule)),
        new HumanMessage({
          content: [
            { type: "text", text: userMessage },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        }),
      ]);

      return parseAIResponse(response);
    } else if (config.provider === "groq") {
      // Groq now supports vision models with Llama 4 Scout
      const llm = new ChatGroq({
        apiKey: config.apiKey,
        model: "meta-llama/llama-4-scout-17b-16e-instruct", // Vision model
        temperature: 0.3,
      });

      const response = await llm.invoke([
        new SystemMessage(buildSystemPrompt(currentSchedule)),
        new HumanMessage({
          content: [
            { type: "text", text: userMessage },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        }),
      ]);

      return parseAIResponse(response);
    }

    return {
      action: "none",
      responseText: "Unsupported AI provider.",
    };
  } catch (error) {
    console.error("Error parsing schedule from image:", error);
    return {
      action: "none",
      responseText: `Error parsing schedule: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Parse a schedule from text input using AI
 */
export async function parseScheduleFromText(
  text: string,
  currentSchedule?: ScheduleItem[],
  preferredProvider?: AIProvider
): Promise<AIScheduleResponse> {
  const config = getAIConfig(preferredProvider);

  if (!config) {
    return {
      action: "none",
      responseText:
        "AI is not configured. Please add your API key in Settings > AI Configuration.",
    };
  }

  try {
    let llm;
    if (config.provider === "openai") {
      llm = new ChatOpenAI({
        apiKey: config.apiKey,
        modelName: config.model,
        temperature: 0.3,
      });
    } else if (config.provider === "gemini") {
      llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0.3,
      });
    } else {
      llm = new ChatGroq({
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0.3,
      });
    }

    const response = await llm.invoke([
      new SystemMessage(buildSystemPrompt(currentSchedule)),
      new HumanMessage(text),
    ]);

    return parseAIResponse(response);
  } catch (error) {
    console.error("Error parsing schedule from text:", error);
    return {
      action: "none",
      responseText: `Error processing request: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * Parse the AI response to extract the structured data
 */
function parseAIResponse(response: any): AIScheduleResponse {
  try {
    const content = response.content;
    let text = "";

    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content) && content[0]?.text) {
      text = content[0].text;
    } else if (content?.text) {
      text = content.text;
    }

    // Try to find and parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || "none",
        actionValue: parsed.actionValue,
        responseText: parsed.responseText || "Schedule processed successfully.",
      };
    }

    return {
      action: "none",
      responseText: text || "Could not parse AI response.",
    };
  } catch (error) {
    console.error("Error parsing AI response:", error);
    return {
      action: "none",
      responseText: "Failed to parse AI response.",
    };
  }
}

/**
 * Process an AI chat message for the Stage Assist AI Assistant
 */
export async function processAIChatMessage(
  message: string,
  image?: string,
  currentSchedule?: ScheduleItem[],
  preferredProvider?: AIProvider
): Promise<AIScheduleResponse> {
  if (image) {
    return parseScheduleFromImage(
      image,
      message,
      currentSchedule,
      preferredProvider
    );
  }
  return parseScheduleFromText(message, currentSchedule, preferredProvider);
}

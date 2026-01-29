/**
 * Global AI Orchestration Service
 * 
 * The main AI service for the comprehensive chat assistant.
 * Handles routing between internal app actions and ProPresenter actions.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  GlobalAIResponse,
  AIAssistantContext,
  ExecutedAction,
  CreateSlidesParams,
  CreatePlaylistParams,
  SetTimerParams,
  TriggerSlideParams,
  SlideNavigationParams,
  ChangeStageLayoutParams,
  DisplayMessageParams,
  DisplayWithAITemplateParams,
  SetProPresenterTimerParams,
  ClearLayerParams,
  UpdateCurrentSlidesParams,
} from "../types/globalChat";
import { Template, Playlist, Slide, AIProvider } from "../types";
import { ScheduleItem } from "../types/propresenter";
import { getAppSettings } from "../utils/aiConfig";
import { loadProPresenterAITemplates } from "../utils/proPresenterAITemplates";
import { loadProPresenterConnections, getEnabledConnections } from "./propresenterService";
import { loadSmartAutomations } from "../utils/testimoniesStorage";

// Import action handlers
import * as appActions from "./appActionService";
import * as ppActions from "./propresenterAIService";

// Storage key for global chat settings
const GLOBAL_CHAT_SETTINGS_KEY = "proassist-global-chat-settings";

// Context modes for the AI assistant
export type AIContextMode = "auto" | "timer" | "slides" | "currentSlide" | "all";

// ============================================
// ProPresenter Detection
// ============================================

/**
 * Keywords that indicate the user wants to interact with ProPresenter
 * Includes variations with/without spaces and common abbreviations
 */
const PROPRESENTER_KEYWORDS = [
  "propresenter",
  "pro presenter",
  "pro-presenter",
  "pp ",  // "pp " with space to avoid false positives like "happy"
  " pp",  // " pp" with leading space
  "on pp",
  "in pp",
  "presentation",
  "stage display",
  "stage layout",
  "lower third",
  "lower-third",
  "clear layer",
  "clear all",
  "trigger slide",
  "next slide",
  "previous slide",
  "display message",
  "display on screen",
  "show on screen",
  "on screen",
  "bible verse",
  "scripture",
];

/**
 * Check if a user message mentions ProPresenter or related actions
 * This is used to determine if we should include ProPresenter context
 */
function messageRequiresProPresenterContext(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return PROPRESENTER_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// ============================================
// System Prompt
// ============================================

/**
 * Build a context-aware system prompt based on the selected context mode
 * This optimizes the prompt by only including relevant context
 * 
 * @param context - The full AI assistant context
 * @param contextMode - The selected context mode
 * @param userMessage - The user's message (used to detect if ProPresenter context is needed)
 */
function buildSystemPrompt(
  context: AIAssistantContext, 
  contextMode: AIContextMode = "auto",
  userMessage: string = ""
): string {
  // Get current time for AM/PM context
  const currentPeriod = new Date().getHours() >= 12 ? "PM" : "AM";

  // Base actions available in all contexts
  const basePrompt = `You are an AI assistant for SmartVerses, a church presentation management application.

## RESPONSE FORMAT
You MUST respond with valid JSON in this format:
{
  "action": "internal" | "propresenter" | "combined" | "none",
  "internalAction": {
    "type": string,
    "params": { ... action-specific parameters ... }
  },
  "propresenterAction": {
    "type": string,
    "params": { ... action-specific parameters ... }
  },
  "responseText": "User-friendly message about what was done or will happen"
}

Always return valid JSON - never include markdown or explanations outside the JSON.
`;

  // Timer/Schedule focused context
  const timerContext = () => {
    const smartAutomationsContext = context.smartAutomations?.length
      ? `\n### Smart Automations (auto-attach to schedule items):\n${JSON.stringify(
          context.smartAutomations.map((r) => ({
            pattern: r.sessionNamePattern,
            matchType: r.isExactMatch ? "exact" : "contains",
            automations: r.automations,
          })),
          null,
          2
        )}`
      : "";

    return `## TIMER & SCHEDULE ACTIONS
- **setTimer**: Start a countdown timer
  - { "type": "countdown", "value": 300, "sessionName": "Prayer" } // seconds
  - { "type": "countdownToTime", "value": "10:30 AM", "sessionName": "Service" }
- **stopTimer**: Stop the current running timer ({} no params)
- **updateSchedule**: Modify the schedule
  - IMPORTANT: params must be the COMPLETE schedule array with ALL items (modified + unchanged)
  - Copy the current schedule, apply the requested changes, and return the full array
  - Example: { "type": "updateSchedule", "params": [full schedule array here] }

### Schedule Item Format:
{
  "id": number,
  "session": "Session Name",
  "startTime": "HH:MM AM/PM",
  "endTime": "HH:MM AM/PM",
  "duration": "XXmins",
  "minister": "Optional Minister Name"
}

### Current Schedule (you MUST include all these items in your response when updating):
${context.currentSchedule?.length ? JSON.stringify(context.currentSchedule, null, 2) : "No schedule loaded"}
${smartAutomationsContext}

### Schedule Rules:
- When updating, ALWAYS return the COMPLETE schedule with all items
- If user asks to change one item, copy the entire schedule and modify only that item
- Preserve all unchanged items exactly as they are (same id, times, etc.)
- If a time doesn't specify AM/PM, assume ${currentPeriod}
- Ensure times are sequential (each startTime matches previous endTime)
- Format durations as "XXmins"
`;
  };

  // Slides focused context
  const slidesContext = () => {
    const templatesList = context.availableTemplates
      .map((t) => `- "${t.name}" (${t.processingType})`)
      .join("\n");

    return `## SLIDE ACTIONS
- **createSlides**: Generate slides from text
  - { "text": "Content for slides", "templateName": "Template Name", "addToPlaylist": true }
- **createPlaylist**: Create a new playlist
  - { "name": "Playlist Name", "items": [...] }
- **addToPlaylist**: Add slides to existing playlist

### Available Templates:
${templatesList || "No templates configured"}

### Current Playlist: ${context.currentPlaylist ? `"${context.currentPlaylist.name}" (${context.currentPlaylist.itemCount} items)` : "None"}
`;
  };

  // Current slides focused context (for editing the currently open slides)
  const currentSlidesContext = () => {
    if (!context.currentSlides || context.currentSlides.length === 0) {
      return `## CURRENT SLIDES
No slides currently selected. The user needs to select a playlist item to edit slides.
`;
    }

    // Check if any slides are auto-scripture
    const hasAutoScripture = context.currentSlides.some((s: any) => s.isAutoScripture);
    const autoScriptureNote = hasAutoScripture ? `
### IMPORTANT: Auto-Scripture Slides
Some slides are marked as "isAutoScripture": true. These are Bible verse slides auto-generated from KJV.
- The format is: "Verse text\\nReference" (e.g., "For God so loved the world...\\nJohn 3:16")
- For these slides, you can ONLY change the REFERENCE (the last line, e.g., "John 3:16" → "John 3:17")
- DO NOT modify the verse text - only update the reference line
- The system will automatically re-fetch the correct verse text from the KJV Bible
- If user asks to change a scripture, update the reference to the new verse/chapter they want
- Example: To change from John 3:16 to John 3:17, set text to: "placeholder\\nJohn 3:17" (the verse text will be auto-replaced)
` : "";

    return `## CURRENT SLIDES ACTIONS
- **updateCurrentSlides**: Modify the currently open slides
  - IMPORTANT: params must be an object with "slides" array containing ALL slides (modified + unchanged)
  - Copy the current slides, apply the requested changes, and return the full array
  - Preserve slide IDs exactly as they are
  - Example: { "type": "updateCurrentSlides", "params": { "slides": [full slides array here] } }

### Slide Format:
{
  "id": "slide-id",  // PRESERVE the original ID exactly
  "text": "Slide text content\\nSecond line\\nThird line",  // Newline-separated content
  "layout": "three-line",  // one-line, two-line, three-line, four-line, five-line, six-line
  "order": 1,  // Position in the list (1-based)
  "isAutoScripture": false  // true if this is an auto-generated Bible verse slide
}
${autoScriptureNote}
### Current Slides (you MUST include all these slides in your response when updating):
${JSON.stringify(context.currentSlides, null, 2)}

### Current Slides Rules:
- When updating, ALWAYS return the COMPLETE slides array with all slides
- If user asks to change one slide, copy the entire array and modify only that slide
- Preserve all unchanged slides exactly as they are (same id, order, layout, etc.)
- NEVER change slide IDs - they are used to track updates
- The "text" field uses \\n for line breaks within a slide
- The "layout" determines how many lines are displayed (one-line = 1, two-line = 2, etc.)
- Match the layout to the number of lines in the text when adding/modifying slides
- If editing text, try to keep the same layout unless the user specifically asks to change it
- For isAutoScripture slides, ONLY modify the reference (last line) - verse text is auto-fetched
`;
  };

  // ProPresenter context
  const proPresenterContext = () => {
    const hasAITemplates = context.proPresenter.aiTemplates.length > 0;
    const ppTemplatesList = context.proPresenter.aiTemplates
      .map((t) => `- id: "${t.id}" | name: "${t.name}" | ${t.description} (max ${t.maxLines} lines, useCase: ${t.useCase})`)
      .join("\n");

    const connectionsList = context.proPresenter.connections
      .filter((c) => c.isEnabled)
      .map((c) => `- "${c.name}"`)
      .join("\n");

    // Only include displayWithAITemplate action if templates are configured
    const displayWithTemplateAction = hasAITemplates 
      ? `- **displayWithAITemplate**: { "templateId": "template id or name", "text": "Content to display", "reference": "Optional reference" }
  
  **How content is written to files:**
  - Each line in "text" (separated by \\n) becomes a separate file: prefix_1.txt, prefix_2.txt, etc.
  - If "reference" is provided, it becomes the LAST file (useful for scripture references like "John 3:16")
  - Unused files are automatically cleared (blank)
  
  **Smart content splitting - YOU decide how to format:**
  - You do NOT have to use all available lines. Use only what makes sense for the content.
  - "maxLines" is the MAXIMUM supported, not a requirement
  - For SHORT content (e.g., a name, a single phrase): put it all on ONE line
  - For BIBLE VERSES: verse text on line 1, reference in "reference" field
  - For LONGER content (e.g., song lyrics, multi-line quotes): split naturally at logical breaks
  - Consider readability: don't split mid-sentence unless necessary
  
  **Examples:**
  - Name display: \`{ "text": "Pastor John Smith" }\` → 1 file
  - Bible verse: \`{ "text": "For God so loved the world...", "reference": "John 3:16" }\` → 2 files  
  - Song lyric: \`{ "text": "Amazing grace\\nHow sweet the sound" }\` → 2 files
  - 3-point sermon: \`{ "text": "Point 1: Faith\\nPoint 2: Hope\\nPoint 3: Love" }\` → 3 files
  
  - IMPORTANT: You MUST use one of the template IDs or names listed below`
      : `- **displayWithAITemplate**: NOT AVAILABLE - No AI templates configured. User must first configure a template in Settings > AI Configuration > ProPresenter AI Templates.`;

    // Templates section - only show if templates exist
    const templatesSection = hasAITemplates
      ? `### Available AI Templates (use these with displayWithAITemplate):
${ppTemplatesList}`
      : `### AI Templates:
⚠️ No AI templates configured. To display content on ProPresenter, the user must first create a template in Settings > AI Configuration > ProPresenter AI Templates.
If user asks to display something on ProPresenter and no templates exist, tell them they need to configure a template first.`;

    return `## PROPRESENTER ACTIONS
- **triggerSlide**: { "presentationUuid": "uuid", "slideIndex": 0 }
- **triggerNextSlide**: Advance to next slide. Use { "count": N } to advance N slides
  - Examples: "go to slide 3" → { "count": 3 }, "next slide" → {} or { "count": 1 }
  - If user says "go to the 5th slide", trigger next slide 5 times: { "count": 5 }
- **triggerPreviousSlide**: Go back. Use { "count": N } to go back N slides
  - Example: "go back 2 slides" → { "count": 2 }
- **changeStageLayout**: { "screenIndex": 0, "layoutIndex": 1 }
- **displayMessage**: { "messageId": "id", "tokens": {...} }
- **clearMessage**: { "messageId": "id" }
${displayWithTemplateAction}
- **triggerMacro**: { "macroId": "id" }
- **triggerLook**: { "lookId": "id" }
- **clearLayer**: { "layer": "slide" | "media" | "props" | "announcements" | "messages" | "audio" | "video_input" }
- **clearAll**: Clear all layers
- **setProPresenterTimer**: { "timerId": "0", "operation": "start" | "stop" | "reset", "duration": 300 }

### Status: ${context.proPresenter.isConnected ? "Connected" : "Not connected"}
### Enabled Connections:
${connectionsList || "No connections enabled"}

${templatesSection}
`;
  };

  // Determine if ProPresenter context should be included
  // Only include if: mode is "all" OR user message mentions ProPresenter
  const includeProPresenterContext = 
    contextMode === "all" || 
    messageRequiresProPresenterContext(userMessage);
  
  console.log(`[Global AI] Context mode: ${contextMode}, Include ProPresenter: ${includeProPresenterContext}${
    includeProPresenterContext && contextMode !== "all" ? ` (detected keywords in: "${userMessage.substring(0, 50)}...")` : ""
  }`);

  // Build prompt based on context mode
  let contextSpecificPrompt = "";

  if (contextMode === "timer") {
    contextSpecificPrompt = timerContext();
    if (includeProPresenterContext) {
      contextSpecificPrompt += "\n" + proPresenterContext();
    }
  } else if (contextMode === "slides") {
    contextSpecificPrompt = slidesContext();
    if (includeProPresenterContext) {
      contextSpecificPrompt += "\n" + proPresenterContext();
    }
  } else if (contextMode === "currentSlide") {
    // Current slide context - focused on editing the currently selected slides
    contextSpecificPrompt = currentSlidesContext();
    if (includeProPresenterContext) {
      contextSpecificPrompt += "\n" + proPresenterContext();
    }
  } else if (contextMode === "all") {
    // Include everything when mode is "all"
    contextSpecificPrompt = timerContext() + "\n" + slidesContext() + "\n" + currentSlidesContext() + "\n" + proPresenterContext();
  } else if (contextMode === "auto") {
    // For auto mode, include timer and slides by default
    // Only add ProPresenter if user message indicates they need it
    contextSpecificPrompt = timerContext() + "\n" + slidesContext();
    if (includeProPresenterContext) {
      contextSpecificPrompt += "\n" + proPresenterContext();
    }
  }

  // Add page context hint
  const pageHint = context.currentPage === "stageAssist" 
    ? "\n**Note:** User is on the Timer page - prioritize timer/schedule actions if request is ambiguous."
    : context.currentPage === "main"
    ? "\n**Note:** User is on the main Slides page - prioritize slide actions if request is ambiguous."
    : "";

  // Build the rules section - only include ProPresenter rules if that context is loaded
  const rulesSection = includeProPresenterContext
    ? `
## IMPORTANT RULES
1. Do NOT interact with Live Testimonies - excluded from AI control
2. For ambiguous requests, ask for clarification
3. If user says "on ProPresenter", use ProPresenter actions
4. Timer actions affect both the app and ProPresenter (if connected)
`
    : `
## IMPORTANT RULES
1. Do NOT interact with Live Testimonies - excluded from AI control
2. For ambiguous requests, ask for clarification
`;

  return basePrompt + contextSpecificPrompt + pageHint + rulesSection;
}

// ============================================
// AI Configuration
// ============================================

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

function getAIConfig(): AIConfig | null {
  const appSettings = getAppSettings();
  
  // First check if globalAssistantModel is configured
  if (appSettings.globalAssistantModel?.provider && appSettings.globalAssistantModel?.model) {
    const provider = appSettings.globalAssistantModel.provider;
    const model = appSettings.globalAssistantModel.model;
    
    // Get the API key for the configured provider
    let apiKey: string | undefined;
    if (provider === "openai") {
      apiKey = appSettings.openAIConfig?.apiKey;
    } else if (provider === "gemini") {
      apiKey = appSettings.geminiConfig?.apiKey;
    } else if (provider === "groq") {
      apiKey = appSettings.groqConfig?.apiKey;
    }
    
    if (apiKey) {
      return { provider, apiKey, model };
    }
  }
  
  // Fall back to default provider or first available
  if (appSettings.defaultAIProvider) {
    const provider = appSettings.defaultAIProvider;
    let apiKey: string | undefined;
    let model: string;
    
    if (provider === "openai" && appSettings.openAIConfig?.apiKey) {
      apiKey = appSettings.openAIConfig.apiKey;
      model = appSettings.defaultAIModel || "gpt-4o";
    } else if (provider === "gemini" && appSettings.geminiConfig?.apiKey) {
      apiKey = appSettings.geminiConfig.apiKey;
      model = appSettings.defaultAIModel || "gemini-1.5-flash-latest";
    } else if (provider === "groq" && appSettings.groqConfig?.apiKey) {
      apiKey = appSettings.groqConfig.apiKey;
      model = appSettings.defaultAIModel || "llama-3.3-70b-versatile";
    }
    
    if (apiKey) {
      return { provider, apiKey, model: model! };
    }
  }
  
  // Last resort: check for any configured provider
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

// ============================================
// Context Building
// ============================================

export function buildContext(
  currentPage: AIAssistantContext["currentPage"],
  templates: Template[],
  currentPlaylist?: { id: string; name: string; items: any[] },
  currentSchedule?: ScheduleItem[],
  currentSlides?: Slide[]
): AIAssistantContext {
  const connections = loadProPresenterConnections();
  const enabledConnections = getEnabledConnections();
  const aiTemplates = loadProPresenterAITemplates();
  const smartAutomations = loadSmartAutomations();
  
  console.log(`[Global AI] Building context - ProPresenter AI Templates found: ${aiTemplates.length}`, 
    aiTemplates.map(t => ({ id: t.id, name: t.name })));

  return {
    currentPage,
    availableTemplates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      processingType: t.processingType,
      availableLayouts: t.availableLayouts,
    })),
    currentPlaylist: currentPlaylist
      ? {
          id: currentPlaylist.id,
          name: currentPlaylist.name,
          itemCount: currentPlaylist.items?.length || 0,
        }
      : undefined,
    currentSlides: currentSlides?.map((s) => ({
      id: s.id,
      text: s.text,
      layout: s.layout,
      order: s.order,
      isAutoScripture: s.isAutoScripture || false,
    })),
    currentSchedule,
    smartAutomations,
    proPresenter: {
      isConnected: enabledConnections.length > 0,
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        isEnabled: c.isEnabled,
      })),
      aiTemplates: aiTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        useCase: t.useCase,
        maxLines: t.maxLines,
        outputPath: t.outputPath,
        outputFileNamePrefix: t.outputFileNamePrefix,
        presentationUuid: t.presentationUuid,
        slideIndex: t.slideIndex,
      })),
    },
    availableActions: [
      "createSlides",
      "createPlaylist",
      "setTimer",
      "updateSchedule",
      "updateCurrentSlides",
      "triggerSlide",
      "triggerNextSlide",
      "triggerPreviousSlide",
      "changeStageLayout",
      "displayMessage",
      "clearMessage",
      "displayWithAITemplate",
      "triggerMacro",
      "triggerLook",
      "clearLayer",
      "clearAll",
      "setProPresenterTimer",
    ],
  };
}

// ============================================
// Main Chat Processing
// ============================================

export async function processGlobalChatMessage(
  userMessage: string,
  context: AIAssistantContext,
  image?: string,
  contextMode: AIContextMode = "auto"
): Promise<GlobalAIResponse> {
  const config = getAIConfig();
  
  if (!config) {
    return {
      action: "none",
      responseText: "AI is not configured. Please add your API key in Settings > AI Configuration.",
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

    const systemPrompt = buildSystemPrompt(context, contextMode, userMessage);
    
    let messages;
    if (image) {
      messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage({
          content: [
            { type: "text", text: userMessage },
            { type: "image_url", image_url: { url: image } },
          ],
        }),
      ];
    } else {
      messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ];
    }

    const response = await llm.invoke(messages);
    return parseAIResponse(response);
  } catch (error) {
    console.error("Error processing chat message:", error);
    return {
      action: "none",
      responseText: `Error: ${error instanceof Error ? error.message : "Failed to process request"}`,
    };
  }
}

function parseAIResponse(response: any): GlobalAIResponse {
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
        internalAction: parsed.internalAction,
        propresenterAction: parsed.propresenterAction,
        responseText: parsed.responseText || "Action completed.",
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
      responseText: "Failed to parse AI response. Please try again.",
    };
  }
}

// ============================================
// Action Execution
// ============================================

export interface ActionCallbacks {
  onSlidesCreated?: (slides: Slide[], templateId: string) => void;
  onPlaylistCreated?: (playlist: Playlist) => void;
  onTimerSet?: (params: SetTimerParams) => void;
  onScheduleUpdated?: (schedule: ScheduleItem[]) => void;
  onCurrentSlidesUpdated?: (slides: Slide[]) => void;
}

export async function executeActions(
  response: GlobalAIResponse,
  templates: Template[],
  callbacks: ActionCallbacks
): Promise<ExecutedAction[]> {
  const results: ExecutedAction[] = [];

  // Execute internal action
  if (
    (response.action === "internal" || response.action === "combined") &&
    response.internalAction
  ) {
    const action = response.internalAction;

    switch (action.type) {
      case "createSlides":
        const slidesResult = await appActions.createSlides(
          action.params as CreateSlidesParams,
          templates,
          callbacks.onSlidesCreated
        );
        results.push(slidesResult);
        break;

      case "createPlaylist":
        const playlistResult = await appActions.createPlaylist(
          action.params as CreatePlaylistParams,
          templates,
          callbacks.onPlaylistCreated
        );
        results.push(playlistResult);
        break;

      case "setTimer":
        const timerResult = await appActions.setTimer(
          action.params as SetTimerParams,
          callbacks.onTimerSet
        );
        results.push(timerResult);
        break;

      case "stopTimer":
        const stopTimerResult = await appActions.stopTimer();
        results.push(stopTimerResult);
        break;

      case "updateSchedule":
        const scheduleResult = await appActions.updateSchedule(
          action.params as ScheduleItem[],
          callbacks.onScheduleUpdated
        );
        results.push(scheduleResult);
        break;

      case "updateCurrentSlides":
        const currentSlidesResult = await appActions.updateCurrentSlides(
          action.params as UpdateCurrentSlidesParams,
          callbacks.onCurrentSlidesUpdated
        );
        results.push(currentSlidesResult);
        break;
    }
  }

  // Execute ProPresenter action
  if (
    (response.action === "propresenter" || response.action === "combined") &&
    response.propresenterAction
  ) {
    const action = response.propresenterAction;

    switch (action.type) {
      case "triggerSlide":
        const triggerResult = await ppActions.triggerSlide(
          action.params as TriggerSlideParams
        );
        results.push(triggerResult);
        break;

      case "triggerNextSlide":
        const nextParams = action.params as SlideNavigationParams | undefined;
        const nextResult = await ppActions.triggerNextSlide(nextParams?.count || 1);
        results.push(nextResult);
        break;

      case "triggerPreviousSlide":
        const prevParams = action.params as SlideNavigationParams | undefined;
        const prevResult = await ppActions.triggerPreviousSlide(prevParams?.count || 1);
        results.push(prevResult);
        break;

      case "changeStageLayout":
        const layoutResult = await ppActions.changeStageLayout(
          action.params as ChangeStageLayoutParams
        );
        results.push(layoutResult);
        break;

      case "displayMessage":
        const msgResult = await ppActions.displayMessage(
          action.params as DisplayMessageParams
        );
        results.push(msgResult);
        break;

      case "clearMessage":
        const clearMsgResult = await ppActions.clearMessage(
          (action.params as { messageId: string }).messageId
        );
        results.push(clearMsgResult);
        break;

      case "displayWithAITemplate":
        const aiTplResult = await ppActions.displayWithAITemplate(
          action.params as DisplayWithAITemplateParams
        );
        results.push(aiTplResult);
        break;

      case "triggerMacro":
        const macroResult = await ppActions.triggerMacro(
          (action.params as { macroId: string }).macroId
        );
        results.push(macroResult);
        break;

      case "triggerLook":
        const lookResult = await ppActions.triggerLook(
          (action.params as { lookId: string }).lookId
        );
        results.push(lookResult);
        break;

      case "clearLayer":
        const clearLayerResult = await ppActions.clearLayer(
          action.params as ClearLayerParams
        );
        results.push(clearLayerResult);
        break;

      case "clearAll":
        const clearAllResult = await ppActions.clearAll();
        results.push(clearAllResult);
        break;

      case "setProPresenterTimer":
        const ppTimerResult = await ppActions.setProPresenterTimer(
          action.params as SetProPresenterTimerParams
        );
        results.push(ppTimerResult);
        break;
    }
  }

  return results;
}

// ============================================
// Settings Management
// ============================================

export interface GlobalChatSettings {
  enabled: boolean;
  customSystemPrompt?: string;
}

export function loadGlobalChatSettings(): GlobalChatSettings {
  try {
    const stored = localStorage.getItem(GLOBAL_CHAT_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load global chat settings:", error);
  }
  return { enabled: true };
}

export function saveGlobalChatSettings(settings: GlobalChatSettings): void {
  try {
    localStorage.setItem(GLOBAL_CHAT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save global chat settings:", error);
  }
}

// ============================================
// Helper: Check if AI is configured
// ============================================

export function isAIConfigured(): boolean {
  return getAIConfig() !== null;
}

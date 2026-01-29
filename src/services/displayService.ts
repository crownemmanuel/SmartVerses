import { emit } from "@tauri-apps/api/event";
import { Monitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_DISPLAY_LAYOUT,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_SLIDES_LAYOUT,
  DISPLAY_SCRIPTURE_KEY,
  DISPLAY_SLIDES_KEY,
  DISPLAY_SETTINGS_KEY,
  DISPLAY_TIMER_KEY,
  DisplayScripture,
  DisplaySettings,
  DisplaySlides,
  DisplayTimerState,
  DisplayLayoutRect,
  SlideLineStyle,
} from "../types/display";

const DISPLAY_WINDOW_LABEL = "audience-display";
const EMPTY_SCRIPTURE: DisplayScripture = { verseText: "", reference: "" };
const EMPTY_SLIDES: DisplaySlides = { lines: [] };
const DEFAULT_TIMER_STATE: DisplayTimerState = {
  isRunning: false,
  timeLeft: 0,
  sessionName: "",
  isOverrun: false,
};

let displayWindow: WebviewWindow | null = null;

function mergeLayout(
  base: typeof DEFAULT_DISPLAY_LAYOUT,
  incoming?: Partial<typeof DEFAULT_DISPLAY_LAYOUT>
) {
  return {
    text: { ...base.text, ...(incoming?.text || {}) },
    reference: { ...base.reference, ...(incoming?.reference || {}) },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect: DisplayLayoutRect): DisplayLayoutRect {
  const width = clamp(rect.width, 0.05, 1);
  const height = clamp(rect.height, 0.05, 1);
  return {
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  };
}

function mergeSlidesLayout(
  base: DisplayLayoutRect[],
  incoming?: DisplayLayoutRect[]
): DisplayLayoutRect[] {
  if (!incoming || !Array.isArray(incoming)) {
    return base.map((rect) => ({ ...rect }));
  }

  const next = incoming
    .slice(0, 6)
    .map((rect, index) => {
      const fallback = base[index] || base[base.length - 1];
      return normalizeRect({ ...fallback, ...rect });
    });

  while (next.length < 2) {
    const fallback = base[next.length] || base[base.length - 1];
    next.push({ ...fallback });
  }

  return next;
}

function normalizeSlideLineStyles(incoming: unknown): SlideLineStyle[] {
  if (!Array.isArray(incoming)) {
    return [];
  }

  return incoming.slice(0, 6).map((style) => {
    if (style && typeof style === "object" && !Array.isArray(style)) {
      return { ...(style as SlideLineStyle) };
    }
    return {};
  });
}

export function loadDisplaySettings(): DisplaySettings {
  try {
    const stored = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DisplaySettings>;
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        ...parsed,
        layout: mergeLayout(DEFAULT_DISPLAY_LAYOUT, parsed.layout),
        slidesLayout: mergeSlidesLayout(DEFAULT_SLIDES_LAYOUT, parsed.slidesLayout),
        slidesLineStyles: normalizeSlideLineStyles(parsed.slidesLineStyles),
      };
      
      // Backward compatibility: if textStyle/referenceStyle don't exist, create them
      if (!parsed.textStyle) {
        settings.textStyle = {
          color: "#ffffff",
          bold: false,
          italic: false,
        };
      }
      if (!parsed.referenceStyle) {
        settings.referenceStyle = {
          color: "#ffffff",
          bold: false,
          italic: false,
        };
      }
      
      // Backward compatibility: if webEnabled doesn't exist, default to false
      if (parsed.webEnabled === undefined) {
        settings.webEnabled = false;
      }
      if (parsed.windowAudienceScreen === undefined) {
        settings.windowAudienceScreen = false;
      }
      if (parsed.showTimer === undefined) {
        settings.showTimer = false;
      }
      if (typeof parsed.timerFontSize !== "number" || Number.isNaN(parsed.timerFontSize)) {
        settings.timerFontSize = DEFAULT_DISPLAY_SETTINGS.timerFontSize;
      }

      // Guard against invalid values from older/local data
      if (typeof parsed.enabled !== "boolean") {
        settings.enabled = false;
      }
      if (typeof parsed.monitorIndex !== "number" || Number.isNaN(parsed.monitorIndex)) {
        settings.monitorIndex = null;
      }
      if (settings.monitorIndex === null) {
        settings.enabled = false;
      }
      
      return settings;
    }
  } catch (error) {
    console.error("[Display] Failed to load display settings:", error);
  }
  return DEFAULT_DISPLAY_SETTINGS;
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
    void emit("display:settings", settings);
  } catch (error) {
    console.error("[Display] Failed to save display settings:", error);
  }
}

export function loadDisplayScripture(): DisplayScripture {
  try {
    const stored = localStorage.getItem(DISPLAY_SCRIPTURE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DisplayScripture>;
      return {
        verseText: parsed.verseText ?? "",
        reference: parsed.reference ?? "",
      };
    }
  } catch (error) {
    console.error("[Display] Failed to load display scripture:", error);
  }
  return EMPTY_SCRIPTURE;
}

export function saveDisplayScripture(payload: DisplayScripture): void {
  try {
    localStorage.setItem(DISPLAY_SCRIPTURE_KEY, JSON.stringify(payload));
    void emit("display:scripture", payload);
  } catch (error) {
    console.error("[Display] Failed to save display scripture:", error);
  }
}

export function clearDisplayScripture(): void {
  try {
    localStorage.setItem(DISPLAY_SCRIPTURE_KEY, JSON.stringify(EMPTY_SCRIPTURE));
    void emit("display:scripture", EMPTY_SCRIPTURE);
  } catch (error) {
    console.error("[Display] Failed to clear display scripture:", error);
  }
}

export function loadDisplaySlides(): DisplaySlides {
  try {
    const stored = localStorage.getItem(DISPLAY_SLIDES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DisplaySlides>;
      const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
      return { lines: lines.slice(0, 6) };
    }
  } catch (error) {
    console.error("[Display] Failed to load display slides:", error);
  }
  return EMPTY_SLIDES;
}

export function saveDisplaySlides(payload: DisplaySlides): void {
  try {
    const normalized = {
      lines: Array.isArray(payload.lines) ? payload.lines.slice(0, 6) : [],
    };
    localStorage.setItem(DISPLAY_SLIDES_KEY, JSON.stringify(normalized));
    void emit("display:slides", normalized);
  } catch (error) {
    console.error("[Display] Failed to save display slides:", error);
  }
}

export function clearDisplaySlides(): void {
  try {
    localStorage.setItem(DISPLAY_SLIDES_KEY, JSON.stringify(EMPTY_SLIDES));
    void emit("display:slides", EMPTY_SLIDES);
  } catch (error) {
    console.error("[Display] Failed to clear display slides:", error);
  }
}

export function loadDisplayTimerState(): DisplayTimerState {
  try {
    const stored = localStorage.getItem(DISPLAY_TIMER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DisplayTimerState>;
      return {
        isRunning: parsed.isRunning ?? false,
        timeLeft: typeof parsed.timeLeft === "number" ? parsed.timeLeft : 0,
        sessionName: parsed.sessionName ?? "",
        isOverrun: parsed.isOverrun ?? false,
      };
    }
  } catch (error) {
    console.error("[Display] Failed to load display timer state:", error);
  }
  return DEFAULT_TIMER_STATE;
}

export function saveDisplayTimerState(payload: DisplayTimerState): void {
  try {
    const normalized: DisplayTimerState = {
      isRunning: !!payload.isRunning,
      timeLeft: typeof payload.timeLeft === "number" ? payload.timeLeft : 0,
      sessionName: payload.sessionName ?? "",
      isOverrun: payload.isOverrun ?? false,
    };
    localStorage.setItem(DISPLAY_TIMER_KEY, JSON.stringify(normalized));
    void emit("display:timer", normalized);
  } catch (error) {
    console.error("[Display] Failed to save display timer state:", error);
  }
}

// Safe monitor info structure matching Rust SafeMonitorInfo
interface SafeMonitorInfo {
  name: string | null;
  position: [number, number];
  size: [number, number];
  scale_factor: number;
}

// Convert SafeMonitorInfo to Monitor-like format for compatibility
// Note: workArea is omitted as it's not available and was causing serialization errors
function convertToMonitor(info: SafeMonitorInfo): Monitor {
  return {
    name: info.name,
    position: {
      x: info.position[0],
      y: info.position[1],
    },
    size: {
      width: info.size[0],
      height: info.size[1],
    },
    scaleFactor: info.scale_factor,
    // workArea is intentionally omitted - it was causing serialization errors
    // when it was None/undefined in the original Monitor objects
  } as Monitor;
}

export async function getAvailableMonitors(): Promise<Monitor[]> {
  try {
    // Use our safe Rust command that handles optional workArea
    const safeMonitors = await invoke<SafeMonitorInfo[]>("get_available_monitors_safe");
    return safeMonitors.map((info) => convertToMonitor(info));
  } catch (error) {
    console.error("[Display] Failed to load monitors:", error);
    // Log more details about the error for debugging
    if (error instanceof Error) {
      console.error("[Display] Error details:", error.message, error.stack);
    }
    return [];
  }
}

export async function openDisplayWindow(settings: DisplaySettings): Promise<void> {
  try {
    console.log("[Display] Opening audience display window via Rust command", settings.monitorIndex);
    
    // Call the Rust command to create or show the window
    // The parent_window parameter is automatically injected by Tauri (it's the window calling this command)
    await invoke("open_audience_display_window", { monitorIndex: settings.monitorIndex });
    
    // Try to get the window reference for future operations
    try {
      displayWindow = await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
      console.log("[Display] Window opened successfully");
      
      // Emit current settings to the newly opened window
      // Add a small delay to ensure the window is ready to receive events
      setTimeout(() => {
        emit("display:settings", settings);
      }, 100);
    } catch (error) {
      console.warn("[Display] Could not get window reference, but window may still be open:", error);
      // Still try to emit settings even if we can't get the window reference
      setTimeout(() => {
        emit("display:settings", settings);
      }, 100);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Display] Failed to open display window:", error);
    throw new Error(`Failed to open display window: ${errorMsg}`);
  }
}

export async function closeDisplayWindow(): Promise<void> {
  try {
    // Try to get the window if we don't have a reference
    if (!displayWindow) {
      try {
        displayWindow = await WebviewWindow.getByLabel(DISPLAY_WINDOW_LABEL);
      } catch (error) {
        // Window doesn't exist, nothing to close
        console.log("[Display] Window doesn't exist, nothing to close");
        return;
      }
    }
    
    if (displayWindow) {
      await displayWindow.close();
      console.log("[Display] Window closed successfully");
    }
  } catch (error) {
    console.warn("[Display] Failed to close window:", error);
  } finally {
    displayWindow = null;
  }
}

// Helper to load a local file as base64 data URL
async function loadImageAsDataUrl(imagePath: string): Promise<string> {
  if (!imagePath) return "";
  
  // If already a data URL or HTTP URL, return as-is
  if (imagePath.startsWith("data:") || imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    return imagePath;
  }
  
  try {
    const base64 = await invoke<string>("read_file_as_base64", {
      filePath: imagePath,
    });
    
    // Determine MIME type from file extension
    const path = imagePath.toLowerCase();
    let mimeType = "image/png"; // default
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
      mimeType = "image/jpeg";
    } else if (path.endsWith(".webp")) {
      mimeType = "image/webp";
    } else if (path.endsWith(".gif")) {
      mimeType = "image/gif";
    }
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("[Display] Failed to load image as base64:", error);
    return "";
  }
}

export async function sendScriptureToDisplay(
  payload: DisplayScripture
): Promise<void> {
  try {
    // Emit to local Tauri window (for native audience display window)
    saveDisplayScripture(payload);
    if (payload.verseText || payload.reference) {
      clearDisplaySlides();
    }
    
    // Also broadcast to web server if enabled
    const settings = loadDisplaySettings();
    if (settings.webEnabled) {
      try {
        // For web display, convert background image to data URL
        let backgroundImageDataUrl = "";
        if (settings.backgroundImagePath) {
          backgroundImageDataUrl = await loadImageAsDataUrl(settings.backgroundImagePath);
        }
        
        // Create settings with data URL for web display
        const webSettings = {
          ...settings,
          // Replace file path with data URL for web compatibility
          backgroundImageDataUrl,
        };
        const slides = loadDisplaySlides();
        
        // Convert settings to JSON value for Rust
        const settingsJson = JSON.parse(JSON.stringify(webSettings));
        await invoke("update_display_state", {
          verseText: payload.verseText,
          reference: payload.reference,
          slides: slides.lines,
          settings: settingsJson,
        });
      } catch (error) {
        console.error("[Display] Failed to update web display state:", error);
      }
    }
  } catch (error) {
    console.error("[Display] Failed to emit scripture:", error);
  }
}

export async function sendSlidesToDisplay(lines: string[]): Promise<void> {
  try {
    const normalizedLines = Array.isArray(lines) ? lines.slice(0, 6) : [];
    saveDisplaySlides({ lines: normalizedLines });
    if (normalizedLines.some((line) => line.trim())) {
      clearDisplayScripture();
    }

    const settings = loadDisplaySettings();
    if (settings.webEnabled) {
      try {
        let backgroundImageDataUrl = "";
        if (settings.backgroundImagePath) {
          backgroundImageDataUrl = await loadImageAsDataUrl(settings.backgroundImagePath);
        }

        const webSettings = {
          ...settings,
          backgroundImageDataUrl,
        };
        const scripture = loadDisplayScripture();
        const settingsJson = JSON.parse(JSON.stringify(webSettings));
        await invoke("update_display_state", {
          verseText: scripture.verseText,
          reference: scripture.reference,
          slides: normalizedLines,
          settings: settingsJson,
        });
      } catch (error) {
        console.error("[Display] Failed to update web display slides:", error);
      }
    }
  } catch (error) {
    console.error("[Display] Failed to emit slides:", error);
  }
}

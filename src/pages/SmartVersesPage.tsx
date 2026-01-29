/**
 * SmartVerses Page
 * 
 * AI-powered Bible lookup page with:
 * - Left column: Bible search chatbox
 * - Right column: Live transcription panel
 * 
 * Features:
 * - Direct Bible reference parsing (John 3:16)
 * - AI-powered paraphrase detection
 * - Live transcription with Bible verse detection
 * - Go Live functionality to ProPresenter
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { FaMicrophone, FaStop, FaPaperPlane, FaRobot, FaPlay, FaSearch, FaChevronDown, FaChevronUp, FaTrash, FaStopCircle, FaExternalLinkAlt, FaDownload, FaSpinner, FaCog } from "react-icons/fa";
import {
  SmartVersesSettings,
  SmartVersesChatMessage,
  DetectedBibleReference,
  KeyPoint,
  ParaphrasedVerse,
  TranscriptionStatus,
  TranscriptionSegment,
  DEFAULT_SMART_VERSES_SETTINGS,
  SMART_VERSES_SETTINGS_KEY,
  SMART_VERSES_CHAT_HISTORY_KEY,
} from "../types/smartVerses";
import { AppSettings } from "../types";
import {
  detectAndLookupReferences,
  resetParseContext,
  getVerseNavigation,
  loadVerseByComponents,
  parseVerseReference,
  lookupVerse,
} from "../services/smartVersesBibleService";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
  createTranscriptionService,
  ITranscriptionService,
} from "../services/transcriptionService";
import { isModelDownloaded } from "../services/offlineModelService";
import { isNativeWhisperModelDownloaded } from "../services/nativeWhisperModelService";
import { getOfflineModelPreloadStatus } from "../services/offlineModelPreloadService";
import {
  analyzeTranscriptChunk,
  searchBibleWithAI,
  resolveParaphrasedVerses,
} from "../services/smartVersesAIService";
import { searchBibleTextAsReferences } from "../services/bibleTextSearchService";
import {
  loadDisplaySettings,
  openDisplayWindow,
  sendScriptureToDisplay,
} from "../services/displayService";
import { triggerPresentationOnConnections } from "../services/propresenterService";
import { broadcastTranscriptionStreamMessage } from "../services/transcriptionBroadcastService";
import { LiveSlidesWebSocket, getLiveSlidesServerInfo } from "../services/liveSlideService";
import { getAssemblyAITemporaryToken } from "../services/assemblyaiTokenService";
import { WsTranscriptionStream } from "../types/liveSlides";
import { mapAudioLevel } from "../utils/audioMeter";
import { saveTranscriptFile } from "../utils/transcriptDownload";
import TranscriptOptionsMenu from "../components/transcription/TranscriptOptionsMenu";
import "../App.css";

// =============================================================================
// STORAGE HELPERS
// =============================================================================

function loadAppSettings(): AppSettings {
  try {
    // Use the correct storage key that matches aiConfig.ts
    const stored = localStorage.getItem("proassist_app_settings");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error("Failed to load app settings:", err);
  }
  return { theme: "dark" };
}

function loadChatHistory(): SmartVersesChatMessage[] {
  try {
    const stored = localStorage.getItem(SMART_VERSES_CHAT_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error("Failed to load chat history:", err);
  }
  return [];
}

function saveChatHistory(history: SmartVersesChatMessage[]): void {
  try {
    // Keep only last 100 messages
    const trimmed = history.slice(-100);
    localStorage.setItem(SMART_VERSES_CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error("Failed to save chat history:", err);
  }
}

const SMART_VERSES_TRANSCRIPT_DISPLAY_KEY = "proassist-smartverses-transcript-display";

type TranscriptDisplayOptions = {
  showTranscript: boolean;
  showScriptureRefs: boolean;
  showKeyPoints: boolean;
};

const DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS: TranscriptDisplayOptions = {
  showTranscript: true,
  showScriptureRefs: true,
  showKeyPoints: false,
};

const normalizeTranscriptMarker = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[\[(]+/, "")
    .replace(/[\])]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

function loadTranscriptDisplayOptions(): TranscriptDisplayOptions {
  try {
    const stored = localStorage.getItem(SMART_VERSES_TRANSCRIPT_DISPLAY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<TranscriptDisplayOptions>;
      return {
        showTranscript:
          typeof parsed.showTranscript === "boolean"
            ? parsed.showTranscript
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showTranscript,
        showScriptureRefs:
          typeof parsed.showScriptureRefs === "boolean"
            ? parsed.showScriptureRefs
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showScriptureRefs,
        showKeyPoints:
          typeof parsed.showKeyPoints === "boolean"
            ? parsed.showKeyPoints
            : DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS.showKeyPoints,
      };
    }
  } catch (err) {
    console.error("Failed to load transcript display options:", err);
  }
  return DEFAULT_TRANSCRIPT_DISPLAY_OPTIONS;
}

function saveTranscriptDisplayOptions(options: TranscriptDisplayOptions): void {
  try {
    localStorage.setItem(
      SMART_VERSES_TRANSCRIPT_DISPLAY_KEY,
      JSON.stringify(options)
    );
  } catch (err) {
    console.error("Failed to save transcript display options:", err);
  }
}

async function resolveReferencesFromList(
  references: string[],
  transcriptText: string
): Promise<DetectedBibleReference[]> {
  const results: DetectedBibleReference[] = [];
  const now = Date.now();

  for (const reference of references) {
    const parsed = parseVerseReference(reference);
    if (!parsed || parsed.length === 0) continue;
    const verseText = await lookupVerse(parsed[0]);
    if (!verseText) continue;

    results.push({
      id: `ref-${now}-${Math.random().toString(36).slice(2, 10)}`,
      reference: parsed[0].displayRef,
      displayRef: parsed[0].displayRef,
      verseText,
      source: "direct",
      transcriptText,
      timestamp: now,
      book: parsed[0].book,
      chapter: parsed[0].chapter,
      verse: parsed[0].startVerse,
    });
  }

  return results;
}

/**
 * Renders verse text with highlighted words in bold light yellow
 * @param verseText - The verse text to render
 * @param highlightWords - Array of words to highlight (case-insensitive)
 * @returns JSX element with highlighted words
 */
function renderHighlightedVerseText(
  verseText: string,
  highlightWords?: string[]
): React.ReactNode {
  if (!highlightWords || highlightWords.length === 0) {
    return verseText;
  }

  // Create a regex pattern that matches any of the highlight words (case-insensitive, whole word)
  const wordsPattern = highlightWords
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .map((word) => `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    .join('|');

  if (!wordsPattern) {
    return verseText;
  }

  const regex = new RegExp(`(${wordsPattern})`, 'gi');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex lastIndex to ensure we start from the beginning
  regex.lastIndex = 0;

  while ((match = regex.exec(verseText)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(verseText.substring(lastIndex, match.index));
    }

    // Add the highlighted match
    parts.push(
      <span
        key={`highlight-${match.index}`}
        style={{
          fontWeight: 'bold',
          color: '#fef08a', // Light yellow
        }}
      >
        {match[0]}
      </span>
    );

    lastIndex = regex.lastIndex;
  }

  // Add remaining text after the last match
  if (lastIndex < verseText.length) {
    parts.push(verseText.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : verseText;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================


const SmartVersesPage: React.FC = () => {
  // Settings
  const [settings, setSettings] = useState<SmartVersesSettings>(DEFAULT_SMART_VERSES_SETTINGS);
  const [appSettings, setAppSettings] = useState<AppSettings>({ theme: "dark" });
  const autoTriggerOnDetectionRef = useRef<boolean>(
    DEFAULT_SMART_VERSES_SETTINGS.autoTriggerOnDetection
  );

  // Chat state
  const [chatHistory, setChatHistory] = useState<SmartVersesChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAISearchEnabled, setIsAISearchEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Transcription state
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
  const [isStopping, setIsStopping] = useState(false);
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptionSegment[]>([]);
  const [detectedReferences, setDetectedReferences] = useState<DetectedBibleReference[]>([]);
  const [transcriptKeyPoints, setTranscriptKeyPoints] = useState<Record<string, KeyPoint[]>>({});
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelRef = useRef(0);
  const [transcriptionElapsedMs, setTranscriptionElapsedMs] = useState(0);
  const [showTranscriptionLimitPrompt, setShowTranscriptionLimitPrompt] = useState(false);
  const transcriptionServiceRef = useRef<ITranscriptionService | null>(null);
  const detectedReferencesRef = useRef<DetectedBibleReference[]>([]);
  const transcriptionStartRef = useRef<number | null>(null);
  const transcriptionNextPromptAtRef = useRef<number | null>(null);
  const transcriptionPromptTimeoutRef = useRef<number | null>(null);
  const transcriptionPromptReasonRef = useRef<"limit" | "snooze" | null>(null);
  const transcriptionStatusRef = useRef<TranscriptionStatus>("idle");
  const isStoppingRef = useRef(false);
  
  // Browser transcription WebSocket
  const browserTranscriptionWsRef = useRef<LiveSlidesWebSocket | null>(null);
  const remoteTranscriptionWsRef = useRef<LiveSlidesWebSocket | null>(null);
  const remoteTranscriptionStatusUnsubRef = useRef<(() => void) | null>(null);
  const remoteRebroadcastAllowedRef = useRef<boolean>(true);
  
  // Interim direct-reference parsing (fast local parser; avoids AI)
  const latestInterimTextRef = useRef<string>("");
  const lastInterimDirectSignatureRef = useRef<string>("");
  const lastInterimParseAtRef = useRef<number>(0);
  const interimParseInFlightRef = useRef<boolean>(false);
  const lastInterimWordCountRef = useRef<number>(0);
  const pendingInterimUiTextRef = useRef<string>("");
  const interimUiTimerRef = useRef<number | null>(null);

  // Compact detected references UI state
  const [detectedPanelCollapsed, setDetectedPanelCollapsed] = useState(false);
  const [expandedDetectedIds, setExpandedDetectedIds] = useState<Set<string>>(() => new Set());

  // Transcript panel UX state
  const transcriptScrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);
  const [expandedInlineRefIds, setExpandedInlineRefIds] = useState<Set<string>>(() => new Set());
  const [transcriptMenuOpen, setTranscriptMenuOpen] = useState(false);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const transcriptMenuRef = useRef<HTMLDivElement | null>(null);
  const [transcriptDisplayOptions, setTranscriptDisplayOptions] = useState<TranscriptDisplayOptions>(
    () => loadTranscriptDisplayOptions()
  );

  // Live state - tracks which reference is currently live (only one at a time)
  const [liveReferenceId, setLiveReferenceId] = useState<string | null>(null);
  // Auto-clear timer (if enabled)
  const autoClearTimeoutRef = useRef<number | null>(null);

  // UI refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // =============================================================================
  // TRANSCRIPTION EVENT BRIDGE (for Slides page)
  // =============================================================================
  const emitTranscriptionStream = useCallback((message: WsTranscriptionStream) => {
    window.dispatchEvent(
      new CustomEvent("transcription-stream", {
        detail: message,
      })
    );
  }, []);

  const emitTranscriptionStatus = useCallback(
    (status: TranscriptionStatus, stopping: boolean) => {
      window.dispatchEvent(
        new CustomEvent("transcription-status-changed", {
          detail: { status, isStopping: stopping },
        })
      );
    },
    []
  );

  useEffect(() => {
    emitTranscriptionStatus(transcriptionStatus, isStopping);
  }, [emitTranscriptionStatus, transcriptionStatus, isStopping]);

  useEffect(() => {
    const handleStatusRequest = () => {
      emitTranscriptionStatus(transcriptionStatus, isStopping);
    };

    window.addEventListener(
      "transcription-status-request",
      handleStatusRequest
    );
    return () => {
      window.removeEventListener(
        "transcription-status-request",
        handleStatusRequest
      );
    };
  }, [emitTranscriptionStatus, transcriptionStatus, isStopping]);

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  // Function to reload all settings
  const reloadSettings = useCallback(() => {
    const smartVersesSettings = loadSmartVersesSettings();
    const appSettingsData = loadAppSettings();
    
    // Debug: Log the actual settings
    console.log("[SmartVerses] SmartVerses Settings:", JSON.stringify({
      provider: smartVersesSettings.bibleSearchProvider,
      model: smartVersesSettings.bibleSearchModel,
      enableAISearch: smartVersesSettings.enableAISearch,
    }));
    console.log("[SmartVerses] App Settings:", JSON.stringify({
      defaultProvider: appSettingsData.defaultAIProvider,
      hasOpenAIKey: !!appSettingsData.openAIConfig?.apiKey,
      hasGeminiKey: !!appSettingsData.geminiConfig?.apiKey,
      hasGroqKey: !!appSettingsData.groqConfig?.apiKey,
    }));
    
    setSettings(smartVersesSettings);
    setAppSettings(appSettingsData);
  }, []);

  useEffect(() => {
    // Load settings
    reloadSettings();
    setChatHistory(loadChatHistory());

    // Listen for settings changes from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SMART_VERSES_SETTINGS_KEY || e.key === "proassist_app_settings") {
        reloadSettings();
      }
    };
    
    // Listen for custom settings changed event (from same tab)
    const handleSettingsChanged = () => {
      console.log("[SmartVerses] Settings changed event received");
      reloadSettings();
    };
    
    // Reload settings when window regains focus (catches same-tab settings changes)
    const handleFocus = () => {
      reloadSettings();
    };
    
    // Also reload when visibility changes (tab becomes visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadSettings();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("smartverses-settings-changed", handleSettingsChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("smartverses-settings-changed", handleSettingsChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Cleanup transcription on unmount
      if (transcriptionServiceRef.current) {
        transcriptionServiceRef.current.stopTranscription();
        // Call destroy() to properly terminate workers and release resources
        transcriptionServiceRef.current.destroy?.();
      }
      // Cleanup browser transcription WebSocket on unmount
      if (browserTranscriptionWsRef.current) {
        browserTranscriptionWsRef.current.disconnect();
      }
      if (remoteTranscriptionWsRef.current) {
        remoteTranscriptionWsRef.current.disconnect();
      }
      if (remoteTranscriptionStatusUnsubRef.current) {
        remoteTranscriptionStatusUnsubRef.current();
        remoteTranscriptionStatusUnsubRef.current = null;
      }
    };
  }, [reloadSettings]);

  useEffect(() => {
    const win = window as Window & { __smartVersesActive?: boolean };
    win.__smartVersesActive = true;
    return () => {
      win.__smartVersesActive = false;
    };
  }, []);

  // Keep a ref to the latest detected references so we can de-dupe reliably inside async callbacks
  useEffect(() => {
    detectedReferencesRef.current = detectedReferences;
  }, [detectedReferences]);

  useEffect(() => {
    transcriptionStatusRef.current = transcriptionStatus;
  }, [transcriptionStatus]);

  useEffect(() => {
    autoTriggerOnDetectionRef.current = settings.autoTriggerOnDetection;
  }, [settings.autoTriggerOnDetection]);

  useEffect(() => {
    isStoppingRef.current = isStopping;
  }, [isStopping]);

  const shouldAttemptDirectParse = useCallback((text: string): boolean => {
    const t = text.trim();
    if (!t) return false;

    // Most reliable signal: chapter:verse appears.
    if (/\b\d{1,3}\s*:\s*\d{1,3}\b/.test(t)) return true;

    // Spoken ASR often comes through as: "John 3 16" (space-separated numbers).
    // Require 2 numbers after some letters so we don't trigger on "John 3" prematurely.
    if (/\b[1-3]?\s?[A-Za-z]{3,}\s+\d{1,3}\s+\d{1,3}\b/i.test(t)) return true;

    // "chapter X verse Y" form (often appears in interim before punctuation)
    if (/\bchapter\b[\s,]+.+?\bverse\b/i.test(t)) return true;

    return false;
  }, []);

  const getInterimTailForParsing = useCallback((text: string): string => {
    // TEMP: parse the full current interim chunk so references are found ASAP.
    return text.trim();
  }, []);

  const scheduleInterimDirectParse = useCallback(
    (text: string) => {
      latestInterimTextRef.current = text;

      // TEMP: parse aggressively on every ~2 words (no early-guard) for real-time pickup.
      const now = Date.now();
      const minIntervalMs = 150;
      if (now - lastInterimParseAtRef.current < minIntervalMs) return;
      if (interimParseInFlightRef.current) return;

      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount - lastInterimWordCountRef.current < 2) return;
      lastInterimWordCountRef.current = wordCount;

      lastInterimParseAtRef.current = now;
      interimParseInFlightRef.current = true;

      (async () => {
        const latest = latestInterimTextRef.current;
        const tail = getInterimTailForParsing(latest);
        try {
        const refs = await detectAndLookupReferences(tail, {
          aggressiveSpeechNormalization: true,
        });
          if (!refs.length) return;

          // De-dupe against existing refs, and avoid re-adding the same interim result repeatedly.
          const sig = refs
            .map((r) => (r.displayRef || "").trim().toLowerCase())
            .filter(Boolean)
            .sort()
            .join("|");
          if (!sig || sig === lastInterimDirectSignatureRef.current) return;
          lastInterimDirectSignatureRef.current = sig;

          const existing = new Set(
            detectedReferencesRef.current
              .map((r) => (r.displayRef || "").trim().toLowerCase())
              .filter(Boolean)
          );
          const newRefs = refs.filter(
            (r) => !existing.has((r.displayRef || "").trim().toLowerCase())
          );
          if (newRefs.length) {
            // Important: we do NOT auto-trigger on interim to avoid false positives.
            setDetectedReferences((prev) => [...prev, ...newRefs]);
          }
        } catch (e) {
          // Silent: interim parsing should never break transcription UX.
          console.debug("[SmartVerses] Interim direct-parse failed:", e);
        }
      })()
        .finally(() => {
          interimParseInFlightRef.current = false;
        });
    },
    [getInterimTailForParsing, shouldAttemptDirectParse]
  );

  const queueInterimUiUpdate = useCallback(
    (text: string) => {
      pendingInterimUiTextRef.current = text;
      if (interimUiTimerRef.current) return;

      interimUiTimerRef.current = window.setTimeout(() => {
        interimUiTimerRef.current = null;
        const latest = pendingInterimUiTextRef.current;
        setInterimTranscript(latest);

        emitTranscriptionStream({
          type: "transcription_stream",
          kind: "interim",
          timestamp: Date.now(),
          engine: settings.transcriptionEngine,
          text: latest,
          audio_level: audioLevelRef.current,
        });

        if (settings.streamTranscriptionsToWebSocket) {
          broadcastTranscriptionStreamMessage({
            type: "transcription_stream",
            kind: "interim",
            timestamp: Date.now(),
            engine: settings.transcriptionEngine,
            text: latest,
            audio_level: audioLevelRef.current,
          }).catch(() => {
            // If Live Slides server isn't running, silently ignore.
          });
        }
      }, 250);
    },
    [
      emitTranscriptionStream,
      settings.streamTranscriptionsToWebSocket,
      settings.transcriptionEngine,
    ]
  );

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (!transcriptMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!transcriptMenuRef.current) return;
      if (!transcriptMenuRef.current.contains(event.target as Node)) {
        setTranscriptMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTranscriptMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [transcriptMenuOpen]);

  useEffect(() => {
    saveTranscriptDisplayOptions(transcriptDisplayOptions);
  }, [transcriptDisplayOptions]);

  const handleToggleTranscriptOption = useCallback(
    (key: keyof TranscriptDisplayOptions) => {
      setTranscriptDisplayOptions((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    []
  );

  const handleOpenSmartVersesSettings = useCallback(() => {
    try {
      localStorage.setItem("proassist-settings-current-view", "smartVerses");
    } catch (err) {
      console.error("Failed to persist settings view:", err);
    }
    navigate("/settings");
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("navigate-to-settings", { detail: "smartVerses" })
      );
    }, 0);
    setTranscriptMenuOpen(false);
  }, [navigate]);

  const transcriptFilterPhrases = useMemo(() => {
    if (settings.transcriptFilterPhrases && settings.transcriptFilterPhrases.length > 0) {
      return settings.transcriptFilterPhrases;
    }
    return ["[BLANK_AUDIO]", "[INAUDIBLE]"];
  }, [settings.transcriptFilterPhrases]);

  const transcriptFilterSet = useMemo(() => {
    return new Set(
      transcriptFilterPhrases.map((phrase) => normalizeTranscriptMarker(phrase))
    );
  }, [transcriptFilterPhrases]);

  const isMusicMarker = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const isBracketed = /^\s*[\[(].*[\])]\s*\.?\s*$/.test(trimmed);
    if (!isBracketed) return false;
    return normalizeTranscriptMarker(trimmed).includes("music");
  }, []);

  const shouldHideTranscriptText = useCallback(
    (text: string): boolean => {
      if (!text.trim()) return false;
      const normalized = normalizeTranscriptMarker(text);
      return transcriptFilterSet.has(normalized);
    },
    [transcriptFilterSet]
  );

  const filteredTranscriptHistory = useMemo(() => {
    const query = transcriptSearchQuery.trim().toLowerCase();
    const results: TranscriptionSegment[] = [];
    let lastWasMusic = false;

    for (const segment of transcriptHistory) {
      const text = segment.text || "";
      if (shouldHideTranscriptText(text)) {
        continue;
      }

      const isMusic = isMusicMarker(text);
      if (isMusic && lastWasMusic) {
        continue;
      }
      lastWasMusic = isMusic;

      if (query && !text.toLowerCase().includes(query)) {
        continue;
      }
      results.push(segment);
    }

    return results;
  }, [
    transcriptHistory,
    transcriptSearchQuery,
    shouldHideTranscriptText,
    isMusicMarker,
  ]);

  const matchesInterimSearch = useMemo(() => {
    const query = transcriptSearchQuery.trim().toLowerCase();
    if (!interimTranscript) return false;
    if (shouldHideTranscriptText(interimTranscript)) return false;
    if (
      isMusicMarker(interimTranscript) &&
      filteredTranscriptHistory.length > 0 &&
      isMusicMarker(filteredTranscriptHistory[filteredTranscriptHistory.length - 1].text)
    ) {
      return false;
    }
    if (!query) return true;
    return interimTranscript.toLowerCase().includes(query);
  }, [
    interimTranscript,
    transcriptSearchQuery,
    filteredTranscriptHistory,
    shouldHideTranscriptText,
    isMusicMarker,
  ]);

  const handleDownloadTranscript = useCallback(
    async (format: "text" | "json") => {
      const combined = [
        ...transcriptHistory.map((s) => s.text),
        ...(interimTranscript ? [interimTranscript] : []),
      ].filter(Boolean);

      const defaultBaseName = `transcript-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;

      if (format === "text") {
        const content = combined.join("\n\n");
        const result = await saveTranscriptFile({
          content,
          defaultBaseName,
          extension: "txt",
          mimeType: "text/plain;charset=utf-8",
          filterName: "Text",
        });
        if (result.status === "failed") {
          alert(`Could not save transcript: ${result.error}`);
        }
        return;
      }

      const directReferences = detectedReferences.filter(
        (ref) => ref.source === "direct"
      );
      const paraphraseReferences = detectedReferences.filter(
        (ref) => ref.source === "paraphrase"
      );
      const segments = transcriptHistory.map((segment) => {
        const segmentRefs = detectedReferences.filter(
          (ref) => ref.transcriptText === segment.text
        );
        const keyPoints = transcriptKeyPoints[segment.id];
        return {
          ...segment,
          references: segmentRefs.length ? segmentRefs : undefined,
          keyPoints: keyPoints?.length ? keyPoints : undefined,
        };
      });
      const payload = {
        generatedAt: new Date().toISOString(),
        segments,
        interim: interimTranscript || null,
        references: {
          direct: directReferences,
          paraphrase: paraphraseReferences,
        },
      };
      const result = await saveTranscriptFile({
        content: JSON.stringify(payload, null, 2),
        defaultBaseName,
        extension: "json",
        mimeType: "application/json;charset=utf-8",
        filterName: "JSON",
      });
      if (result.status === "failed") {
        alert(`Could not save transcript: ${result.error}`);
      }
    },
    [transcriptHistory, interimTranscript, detectedReferences, transcriptKeyPoints]
  );

  // Scroll to bottom of transcript
  useEffect(() => {
    if (autoScrollTranscript && !autoScrollPaused) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptHistory, interimTranscript, autoScrollTranscript, autoScrollPaused]);

  // Save chat history when it changes
  useEffect(() => {
    saveChatHistory(chatHistory);
  }, [chatHistory]);

  // =============================================================================
  // BIBLE SEARCH HANDLERS
  // =============================================================================

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return [];

    const queryMessage: SmartVersesChatMessage = {
      id: `query-${Date.now()}`,
      type: "query",
      content: query,
      timestamp: Date.now(),
    };

    setChatHistory(prev => [...prev, queryMessage]);
    setInputValue("");
    setIsSearching(true);

    // Add loading message
    const loadingId = `loading-${Date.now()}`;
    setChatHistory(prev => [...prev, {
      id: loadingId,
      type: "result",
      content: "Searching...",
      timestamp: Date.now(),
      isLoading: true,
    }]);

    let references: DetectedBibleReference[] = [];
    let searchMethod = "direct";

    try {
      // STEP 1: Try direct Bible reference parsing (bcv_parser)
      // This handles: "John 3:16", "John 3:1-4, Romans 3:3", etc.
      console.log("🔍 Step 1: Direct reference parsing for:", query);
      references = await detectAndLookupReferences(query);
      console.log("🔍 Direct parsing found:", references.length, "references");

      // STEP 2: If no direct references found, try secondary search
      if (references.length === 0) {
        if (isAISearchEnabled) {
          // Check if AI is properly configured
          const provider = settings.bibleSearchProvider || appSettings.defaultAIProvider;
          const model = settings.bibleSearchModel;
          
          // Check for API key based on provider
          let hasApiKey = false;
          if (provider === 'openai') hasApiKey = !!appSettings.openAIConfig?.apiKey;
          else if (provider === 'gemini') hasApiKey = !!appSettings.geminiConfig?.apiKey;
          else if (provider === 'groq') hasApiKey = !!appSettings.groqConfig?.apiKey;
          
          if (provider && hasApiKey) {
            // Use AI search with configured provider/model
            console.log("🤖 Step 2: AI search with", provider, model || "(default model)");
            searchMethod = "ai";
            references = await searchBibleWithAI(
              query, 
              appSettings,
              provider as 'openai' | 'gemini' | 'groq',
              model
            );
            console.log("🤖 AI search found:", references.length, "references");
          } else {
            console.warn("⚠️ AI search enabled but not configured. Provider:", provider, "Has API key:", hasApiKey);
            // Fall back to text search
            console.log("📝 Falling back to text search (AI not properly configured)");
            searchMethod = "text";
            references = await searchBibleTextAsReferences(query, 5);
            console.log("📝 Text search found:", references.length, "references");
          }
        } else {
          // Use text search (FlexSearch) as fallback
          console.log("📝 Step 2: Text search (AI disabled)");
          searchMethod = "text";
          references = await searchBibleTextAsReferences(query, 5);
          console.log("📝 Text search found:", references.length, "references");
        }
      }

      // Remove loading message and add result
      setChatHistory(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        if (references.length > 0) {
          return [...filtered, {
            id: `result-${Date.now()}`,
            type: "result",
            content: `Found ${references.length} verse${references.length > 1 ? "s" : ""}`,
            timestamp: Date.now(),
            references,
          }];
        } else {
          // Build helpful error message
          let errorMsg = "No verses found for your search.";
          if (!isAISearchEnabled) {
            errorMsg += " Try enabling AI Search below for better results.";
          } else if (searchMethod === "text") {
            errorMsg += " AI Search is enabled but not configured. Go to Settings → SmartVerses to configure your AI provider.";
          } else {
            errorMsg += " Try a different query or check the spelling.";
          }
          
          return [...filtered, {
            id: `result-${Date.now()}`,
            type: "result",
            content: errorMsg,
            timestamp: Date.now(),
            error: "No results",
          }];
        }
      });
      return references;
    } catch (error) {
      console.error("Search error:", error);
      setChatHistory(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: `error-${Date.now()}`,
          type: "result",
          content: "An error occurred while searching.",
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : "Unknown error",
        }];
      });
      return [];
    } finally {
      setIsSearching(false);
    }
  }, [isAISearchEnabled, appSettings, settings]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch(inputValue);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Clear all chat history?")) {
      setChatHistory([]);
      resetParseContext();
    }
  };

  // =============================================================================
  // GO LIVE FUNCTIONALITY
  // =============================================================================

  const handleGoLive = useCallback(async (reference: DetectedBibleReference) => {
    console.log("Going live with:", reference);
    console.log("Verse text:", reference.verseText);
    console.log("Display ref:", reference.displayRef);
    console.log("Settings:", {
      outputPath: settings.bibleOutputPath,
      textFileName: settings.bibleTextFileName,
      refFileName: settings.bibleReferenceFileName,
    });

    // Set this reference as live (clears any previous live reference)
    setLiveReferenceId(reference.id);

    try {
      // Cancel any pending auto-clear from a previous live verse
      if (autoClearTimeoutRef.current != null) {
        window.clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }

      const basePath = settings.bibleOutputPath?.replace(/\/?$/, "/") || "";
      const verseText = reference.verseText || "";
      const displayRef = reference.displayRef || "";
      
      // Update audience display if enabled (don't block on file output or ProPresenter)
      const displaySettings = loadDisplaySettings();
      const shouldUpdateDisplay =
        displaySettings.enabled ||
        displaySettings.webEnabled ||
        displaySettings.windowAudienceScreen;
      if (shouldUpdateDisplay) {
        if (displaySettings.enabled) {
          try {
            await openDisplayWindow(displaySettings);
          } catch (error) {
            console.warn("[Display] Failed to open audience screen:", error);
          }
        }
        try {
          await sendScriptureToDisplay({
            verseText,
            reference: displayRef,
          });
        } catch (error) {
          console.warn("[Display] Failed to update audience screen:", error);
        }
      }

      // Write verse text to file
      if (basePath && settings.bibleTextFileName) {
        const textFilePath = `${basePath}${settings.bibleTextFileName}`;
        console.log(`Writing verse text to: ${textFilePath}, Content: "${verseText}"`);
        try {
          await invoke("write_text_to_file", {
            filePath: textFilePath,
            content: verseText,
          });
        } catch (error) {
          console.warn("[SmartVerses] Failed to write verse text file:", error);
        }
      }

      // Write reference to file
      if (basePath && settings.bibleReferenceFileName) {
        const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
        console.log(`Writing reference to: ${refFilePath}, Content: "${displayRef}"`);
        try {
          await invoke("write_text_to_file", {
            filePath: refFilePath,
            content: displayRef,
          });
        } catch (error) {
          console.warn("[SmartVerses] Failed to write reference file:", error);
        }
      }

      // Trigger ProPresenter if configured
      if (settings.proPresenterActivation) {
        const { presentationUuid, slideIndex, activationClicks } = settings.proPresenterActivation;
        const clicks = activationClicks ?? 1;
        console.log(`Triggering ProPresenter: ${presentationUuid}, slide ${slideIndex}, clicks: ${clicks}`);
        try {
          await triggerPresentationOnConnections(
            { presentationUuid, slideIndex },
            settings.proPresenterConnectionIds,
            clicks,
            100
          );
        } catch (error) {
          console.warn("[SmartVerses] Failed to trigger ProPresenter:", error);
        }
      }

      // Add system message
      setChatHistory(prev => [...prev, {
        id: `live-${Date.now()}`,
        type: "system",
        content: `📺 Went live: ${reference.displayRef}`,
        timestamp: Date.now(),
      }]);

      // Auto-clear text AFTER a delay (do NOT clear immediately at 0ms; that causes blank files)
      const clearDelay = settings.clearTextDelay ?? 0;
      if (settings.clearTextAfterLive && basePath && clearDelay > 0) {
        autoClearTimeoutRef.current = window.setTimeout(async () => {
          try {
            if (settings.bibleTextFileName) {
              const textFilePath = `${basePath}${settings.bibleTextFileName}`;
              try {
                await invoke("write_text_to_file", { filePath: textFilePath, content: "" });
              } catch (error) {
                console.warn("[SmartVerses] Failed to auto-clear verse text file:", error);
              }
            }
            if (settings.bibleReferenceFileName) {
              const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
              try {
                await invoke("write_text_to_file", { filePath: refFilePath, content: "" });
              } catch (error) {
                console.warn("[SmartVerses] Failed to auto-clear reference file:", error);
              }
            }
            const displaySettings = loadDisplaySettings();
            const shouldUpdateDisplay =
              displaySettings.enabled ||
              displaySettings.webEnabled ||
              displaySettings.windowAudienceScreen;
            if (shouldUpdateDisplay) {
              try {
                await sendScriptureToDisplay({ verseText: "", reference: "" });
              } catch (error) {
                console.warn("[Display] Failed to auto-clear audience screen:", error);
              }
            }
          } finally {
            setLiveReferenceId(null);
            autoClearTimeoutRef.current = null;
          }
        }, clearDelay);
      }
    } catch (error) {
      console.error("Error going live:", error);
    }
  }, [settings]);

  // Handle taking a verse off live
  const handleOffLive = useCallback(async () => {
    console.log("Taking off live");

    try {
      // Cancel any pending auto-clear
      if (autoClearTimeoutRef.current != null) {
        window.clearTimeout(autoClearTimeoutRef.current);
        autoClearTimeoutRef.current = null;
      }

      const basePath = settings.bibleOutputPath?.replace(/\/?$/, "/") || "";
      
      // Clear text files if configured
      if (settings.proPresenterActivation?.clearTextFileOnTakeOff !== false) {
        if (basePath && settings.bibleTextFileName) {
          const textFilePath = `${basePath}${settings.bibleTextFileName}`;
          console.log(`Clearing verse text file: ${textFilePath}`);
          try {
            await invoke("write_text_to_file", {
              filePath: textFilePath,
              content: "",
            });
          } catch (error) {
            console.warn("[SmartVerses] Failed to clear verse text file:", error);
          }
        }

        if (basePath && settings.bibleReferenceFileName) {
          const refFilePath = `${basePath}${settings.bibleReferenceFileName}`;
          console.log(`Clearing reference file: ${refFilePath}`);
          try {
            await invoke("write_text_to_file", {
              filePath: refFilePath,
              content: "",
            });
          } catch (error) {
            console.warn("[SmartVerses] Failed to clear reference file:", error);
          }
        }
      }

      const displaySettings = loadDisplaySettings();
      const shouldUpdateDisplay =
        displaySettings.enabled ||
        displaySettings.webEnabled ||
        displaySettings.windowAudienceScreen;
      if (shouldUpdateDisplay) {
        try {
          await sendScriptureToDisplay({ verseText: "", reference: "" });
        } catch (error) {
          console.warn("[Display] Failed to clear audience screen:", error);
        }
      }

      // Trigger ProPresenter take off if configured
      if (settings.proPresenterActivation) {
        const { presentationUuid, slideIndex, takeOffClicks } = settings.proPresenterActivation;
        const clicks = takeOffClicks ?? 0;
        
        if (clicks > 0) {
          console.log(`Triggering ProPresenter take off: ${presentationUuid}, slide ${slideIndex}, clicks: ${clicks}`);
          try {
            await triggerPresentationOnConnections(
              { presentationUuid, slideIndex },
              settings.proPresenterConnectionIds,
              clicks,
              100
            );
          } catch (error) {
            console.warn("[SmartVerses] Failed to trigger ProPresenter take off:", error);
          }
        }
      }

      // Clear live state
      setLiveReferenceId(null);

      // Add system message
      setChatHistory(prev => [...prev, {
        id: `offlive-${Date.now()}`,
        type: "system",
        content: `⬛ Cleared live verse`,
        timestamp: Date.now(),
      }]);
    } catch (error) {
      console.error("Error taking off live:", error);
    }
  }, [settings]);

  useEffect(() => {
    const handleApiGoLive: EventListener = (event) => {
      const detail = (event as CustomEvent<{ reference?: string }>).detail;
      const reference = String(detail?.reference ?? "").trim();
      if (!reference) return;
      void (async () => {
        setInputValue(reference);
        const references = await handleSearch(reference);
        if (references[0]) {
          await handleGoLive(references[0]);
        }
      })();
    };

    window.addEventListener("smartverses-api-go-live", handleApiGoLive);
    return () => {
      window.removeEventListener("smartverses-api-go-live", handleApiGoLive);
    };
  }, [handleGoLive, handleSearch]);

  // =============================================================================
  // BROWSER TRANSCRIPTION
  // =============================================================================

  // Open browser-based transcription page
  const openBrowserTranscription = useCallback(async () => {
    try {
      const opener = await import("@tauri-apps/plugin-opener");

      // Try to get server info
      let wsHost = "localhost";
      let wsPort = 9876;

      try {
        const serverInfo = await getLiveSlidesServerInfo();
        if (serverInfo) {
          wsHost = serverInfo.local_ip;
          wsPort = serverInfo.server_port;
        }
      } catch {
        // Use defaults if server info not available
      }

      // Generate a temporary token using the Tauri backend (avoids CORS issues in browser)
      let tempToken = "";
      if (settings.assemblyAIApiKey) {
        try {
          tempToken = await getAssemblyAITemporaryToken(settings.assemblyAIApiKey, 3600);
          console.log("[SmartVerses] Generated temporary AssemblyAI token for browser");
        } catch (tokenErr) {
          console.error("[SmartVerses] Failed to generate token:", tokenErr);
          // Continue without token - user will see an error in browser
        }
      }

      // Construct the URL with parameters
      // Pass the temporary token (not the API key) to avoid CORS issues
      const params = new URLSearchParams({
        wsHost,
        wsPort: String(wsPort),
        ...(tempToken ? { token: tempToken } : {}),
      });

      // The browser transcription page URL
      // When running dev, use localhost:1420 (Vite dev server port)
      // In production, use the Tauri server which embeds the static files
      const baseUrl = import.meta.env.DEV
        ? `http://localhost:1420/browser-transcription.html`
        : `http://${wsHost}:${wsPort}/browser-transcription.html`;

      const url = `${baseUrl}?${params.toString()}`;

      // Open in default browser
      await opener.openUrl(url);
    } catch (error) {
      console.error("Failed to open browser transcription:", error);
      // Fallback: try window.open
      const params = new URLSearchParams({
        wsHost: "localhost",
        wsPort: "9876",
      });
      window.open(`/browser-transcription.html?${params.toString()}`, "_blank");
    }
  }, [settings.assemblyAIApiKey]);

  // Connect to WebSocket to receive transcriptions from browser
  const connectToBrowserTranscriptionWs = useCallback(async () => {
    try {
      const serverInfo = await getLiveSlidesServerInfo();
      if (!serverInfo.server_running) {
        console.warn("[SmartVerses] Live Slides server not running, cannot receive browser transcriptions");
        return;
      }

      const wsUrl = `ws://${serverInfo.local_ip}:${serverInfo.server_port}/ws`;
      const ws = new LiveSlidesWebSocket(wsUrl, "browser-transcription", "viewer");
      browserTranscriptionWsRef.current = ws;

      await ws.connect();
      console.log("[SmartVerses] Connected to WebSocket for browser transcriptions");

      // Listen for transcription messages from the browser
      ws.onMessage((message) => {
        if (message.type !== "transcription_stream") return;

        const m = message as WsTranscriptionStream;
        const normalized: WsTranscriptionStream = {
          ...m,
          type: "transcription_stream",
          kind: m.kind,
          timestamp: m.timestamp || Date.now(),
          engine: m.engine || settings.transcriptionEngine,
          text: m.text || "",
        };
        if (
          normalized.kind === "interim" ||
          (normalized.kind === "final" && normalized.text)
        ) {
          emitTranscriptionStream(normalized);
        }

        if (m.kind === "interim") {
          setInterimTranscript(m.text || "");
          scheduleInterimDirectParse(m.text || "");
          // Update status to recording when we receive first transcription
          setTranscriptionStatus((prev) => prev === "waiting_for_browser" ? "recording" : prev);
        } else if (m.kind === "final" && m.text) {
          setInterimTranscript("");
          // Update status to recording when we receive first transcription
          setTranscriptionStatus((prev) => prev === "waiting_for_browser" ? "recording" : prev);
          
          const segment: TranscriptionSegment = m.segment || {
            id: `segment-${Date.now()}`,
            text: m.text,
            timestamp: Date.now(),
            isFinal: true,
          };
          
          setTranscriptHistory(prev => [...prev, segment]);

          if (m.key_points?.length) {
            const normalizedKeyPoints: KeyPoint[] = m.key_points.map((point) => ({
              text: point.text,
              category: point.category as KeyPoint["category"],
            }));
            if (normalizedKeyPoints.length > 0) {
              setTranscriptKeyPoints((prev) => ({
                ...prev,
                [segment.id]: normalizedKeyPoints,
              }));
            }
          }
          
          // Detect Bible references in the transcript
          detectAndLookupReferences(m.text, {
            aggressiveSpeechNormalization: true,
          }).then(async (directRefs) => {
            if (directRefs.length > 0) {
              setDetectedReferences(prev => [...prev, ...directRefs]);
              
              // Add to chat history if enabled
              if (settings.autoAddDetectedToHistory) {
                setChatHistory(prev => [...prev, {
                  id: `transcript-${Date.now()}`,
                  type: "result",
                  content: `Detected from transcription`,
                  timestamp: Date.now(),
                  references: directRefs,
                }]);
              }

              // Auto-trigger if enabled
              if (autoTriggerOnDetectionRef.current && directRefs.length > 0) {
                handleGoLive(directRefs[0]);
              }
            }
          });
        }
      });
    } catch (error) {
      console.error("[SmartVerses] Failed to connect to browser transcription WebSocket:", error);
    }
  }, [
    emitTranscriptionStream,
    handleGoLive,
    scheduleInterimDirectParse,
    settings.autoAddDetectedToHistory,
    settings.transcriptionEngine,
  ]);

  const disconnectRemoteTranscriptionWs = useCallback(() => {
    if (remoteTranscriptionWsRef.current) {
      remoteTranscriptionWsRef.current.disconnect();
      remoteTranscriptionWsRef.current = null;
    }
    if (remoteTranscriptionStatusUnsubRef.current) {
      remoteTranscriptionStatusUnsubRef.current();
      remoteTranscriptionStatusUnsubRef.current = null;
    }
  }, []);

  const connectToRemoteTranscriptionWs = useCallback(async () => {
    const host = (settings.remoteTranscriptionHost || "").trim();
    const port = settings.remoteTranscriptionPort || 9876;
    if (!host) {
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage(
        "Remote transcription host is missing. Configure it in Settings → Transcription."
      );
      return;
    }

    try {
      setTranscriptionErrorMessage(null);
      disconnectRemoteTranscriptionWs();
      const wsUrl = `ws://${host}:${port}/ws`;
      const ws = new LiveSlidesWebSocket(wsUrl, "remote-transcription", "viewer");
      remoteTranscriptionWsRef.current = ws;
      if (remoteTranscriptionStatusUnsubRef.current) {
        remoteTranscriptionStatusUnsubRef.current();
        remoteTranscriptionStatusUnsubRef.current = null;
      }
      remoteTranscriptionStatusUnsubRef.current = ws.onStatus((status) => {
        if (status.status === "connected") {
          setTranscriptionErrorMessage(null);
          if (transcriptionStatusRef.current === "error") {
            setTranscriptionStatus("connecting");
          }
          return;
        }
        if (status.status === "error" || status.status === "disconnected") {
          if (isStoppingRef.current || transcriptionStatusRef.current === "idle") {
            return;
          }
          const detail =
            status.status === "disconnected" && status.reason
              ? ` (${status.reason})`
              : "";
          setTranscriptionStatus("error");
          setTranscriptionErrorMessage(
            `Remote transcription connection ${
              status.status === "error" ? "failed" : "closed"
            }${detail}.`
          );
        }
      });

      // Check if we should rebroadcast to local Live Slides server (avoid loops).
      try {
        const localInfo = await getLiveSlidesServerInfo();
        const sameTarget =
          localInfo?.server_running &&
          localInfo.local_ip === host &&
          localInfo.server_port === port;
        remoteRebroadcastAllowedRef.current = !sameTarget;
      } catch {
        remoteRebroadcastAllowedRef.current = true;
      }

      await ws.connect();
      console.log("[SmartVerses] Connected to remote transcription source:", wsUrl);

      ws.onMessage((message) => {
        if (message.type !== "transcription_stream") return;

        const m = message as WsTranscriptionStream;
        const normalized: WsTranscriptionStream = {
          ...m,
          type: "transcription_stream",
          kind: m.kind,
          timestamp: m.timestamp || Date.now(),
          engine: m.engine || settings.transcriptionEngine,
          text: m.text || "",
        };
        if (
          normalized.kind === "interim" ||
          (normalized.kind === "final" && normalized.text)
        ) {
          emitTranscriptionStream(normalized);
        }
        if (m.kind === "interim") {
          setInterimTranscript(m.text || "");
          setTranscriptionStatus((prev) => (prev === "connecting" ? "recording" : prev));
        } else if (m.kind === "final" && m.text) {
          setInterimTranscript("");
          setTranscriptionStatus((prev) => (prev === "connecting" ? "recording" : prev));

          const segment: TranscriptionSegment = m.segment || {
            id: `segment-${Date.now()}`,
            text: m.text,
            timestamp: Date.now(),
            isFinal: true,
          };

          setTranscriptHistory((prev) => [...prev, segment]);

          if (m.key_points?.length) {
            const normalizedKeyPoints: KeyPoint[] = m.key_points.map((point) => ({
              text: point.text,
              category: point.category as KeyPoint["category"],
            }));
            if (normalizedKeyPoints.length > 0) {
              setTranscriptKeyPoints((prev) => ({
                ...prev,
                [segment.id]: normalizedKeyPoints,
              }));
            }
          }

          (async () => {
            const scriptureReferences = m.scripture_references || [];
            const keyPoints: KeyPoint[] = (m.key_points as KeyPoint[]) || [];
            const paraphrasedVerses = m.paraphrased_verses || [];

            if (keyPoints.length > 0) {
              setTranscriptKeyPoints((prev) => ({
                ...prev,
                [segment.id]: keyPoints,
              }));
            }

            if (scriptureReferences.length > 0) {
              const resolvedDirect = await resolveReferencesFromList(
                scriptureReferences,
                m.text
              );
              if (resolvedDirect.length > 0) {
                setDetectedReferences((prev) => [...prev, ...resolvedDirect]);

                if (settings.autoAddDetectedToHistory) {
                  setChatHistory((prev) => [
                    ...prev,
                    {
                      id: `transcript-${Date.now()}`,
                      type: "result",
                      content: `Detected from transcription`,
                      timestamp: Date.now(),
                      references: resolvedDirect,
                    },
                  ]);
                }

                if (autoTriggerOnDetectionRef.current) {
                  handleGoLive(resolvedDirect[0]);
                }
              }
            }

            if (paraphrasedVerses.length > 0) {
              const resolvedRefs = await resolveParaphrasedVerses(paraphrasedVerses);
              if (resolvedRefs.length > 0) {
                const resolvedWithTranscript = resolvedRefs.map((r) => ({
                  ...r,
                  transcriptText: m.text,
                }));

                // De-dupe against the most recent refs to avoid repeated paraphrase entries.
                const recent = detectedReferencesRef.current.slice(-5);
                const recentKeys = new Set(
                  recent.map((r) => (r.displayRef || "").trim().toLowerCase())
                );
                const deduped = resolvedWithTranscript.filter(
                  (r) => !recentKeys.has((r.displayRef || "").trim().toLowerCase())
                );

                if (deduped.length > 0) {
                  setDetectedReferences((prev) => [...prev, ...deduped]);
                }

                if (settings.autoAddDetectedToHistory) {
                  if (deduped.length > 0) {
                    setChatHistory((prev) => [
                      ...prev,
                      {
                        id: `paraphrase-${Date.now()}`,
                        type: "result",
                        content: `Paraphrase detected (${Math.round((deduped[0].confidence || 0) * 100)}% confidence)`,
                        timestamp: Date.now(),
                        references: deduped,
                      },
                    ]);
                  }
                }

                if (autoTriggerOnDetectionRef.current) {
                  if (deduped.length > 0) {
                    handleGoLive(deduped[0]);
                  }
                }
              }
            }

            // Re-broadcast to local Live Slides server if enabled and safe.
            if (
              settings.streamTranscriptionsToWebSocket &&
              remoteRebroadcastAllowedRef.current
            ) {
              const wsKeyPoints = keyPoints.length > 0
                ? keyPoints.map((kp) => ({ text: kp.text, category: kp.category }))
                : undefined;

              broadcastTranscriptionStreamMessage({
                type: "transcription_stream",
                kind: m.kind,
                timestamp: m.timestamp || Date.now(),
                engine: m.engine || settings.transcriptionEngine,
                text: m.text,
                audio_level: m.audio_level ?? audioLevelRef.current,
                segment: m.segment as TranscriptionSegment | undefined,
                scripture_references: scriptureReferences.length ? scriptureReferences : undefined,
                key_points: wsKeyPoints,
                paraphrased_verses: paraphrasedVerses.length ? paraphrasedVerses : undefined,
              }).catch(() => {});
            }
          })();
        }
      });
    } catch (error) {
      console.error("[SmartVerses] Failed to connect to remote transcription WS:", error);
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to connect to remote transcription source."
      );
    }
  }, [
    disconnectRemoteTranscriptionWs,
    emitTranscriptionStream,
    settings.remoteTranscriptionHost,
    settings.remoteTranscriptionPort,
    settings.transcriptionEngine,
    settings.streamTranscriptionsToWebSocket,
    settings.autoAddDetectedToHistory,
    handleGoLive,
    scheduleInterimDirectParse,
  ]);

  // Disconnect browser transcription WebSocket
  const disconnectBrowserTranscriptionWs = useCallback(() => {
    if (browserTranscriptionWsRef.current) {
      browserTranscriptionWsRef.current.disconnect();
      browserTranscriptionWsRef.current = null;
    }
  }, []);

  const handleStartTranscription = useCallback(async () => {
    setTranscriptionErrorMessage(null);
    // Reset interim parse state for a fresh session
    latestInterimTextRef.current = "";
    lastInterimDirectSignatureRef.current = "";
    lastInterimParseAtRef.current = 0;
    lastInterimWordCountRef.current = 0;

    // Remote transcription uses an external source - skip local engine validation.
    if (settings.remoteTranscriptionEnabled) {
      setTranscriptionStatus("connecting");
      await connectToRemoteTranscriptionWs();
      return;
    }

    // Validate API keys based on selected engine
    if (settings.transcriptionEngine === "assemblyai" && !settings.assemblyAIApiKey) {
      alert("Please configure your AssemblyAI API key in Settings → Transcription");
      return;
    }

    if (settings.transcriptionEngine === "groq" && !settings.groqApiKey) {
      alert("Please configure your Groq API key in Settings → Transcription");
      return;
    }

    // Validate offline models are downloaded
    const preloadStatus = getOfflineModelPreloadStatus();
    if (settings.transcriptionEngine === "offline-whisper") {
      const modelId =
        settings.offlineWhisperModel || "onnx-community/whisper-base";
      if (!isModelDownloaded(modelId)) {
        if (
          preloadStatus?.modelId === modelId &&
          preloadStatus.phase !== "ready"
        ) {
          const progressLabel = preloadStatus.progress
            ? ` (${Math.round(preloadStatus.progress)}%)`
            : "";
          alert(
            `The selected Whisper model is still downloading${progressLabel}. Please wait for it to finish.`
          );
        } else {
          alert(
            "The selected Whisper model is not downloaded yet. Go to Settings → Transcription and select it to start the download."
          );
        }
        return;
      }
    }

    if (settings.transcriptionEngine === "offline-whisper-native") {
      const fileName =
        settings.offlineWhisperNativeModel || "ggml-small.en-q5_1.bin";
      const isDownloaded = await isNativeWhisperModelDownloaded(fileName);
      if (!isDownloaded) {
        alert(
          "The selected native Whisper model is not downloaded yet. Go to Settings → Transcription and download it first."
        );
        return;
      }
    }

    if (settings.transcriptionEngine === "offline-moonshine") {
      const modelId =
        settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX";
      if (!isModelDownloaded(modelId)) {
        if (
          preloadStatus?.modelId === modelId &&
          preloadStatus.phase !== "ready"
        ) {
          const progressLabel = preloadStatus.progress
            ? ` (${Math.round(preloadStatus.progress)}%)`
            : "";
          alert(
            `The selected Moonshine model is still downloading${progressLabel}. Please wait for it to finish.`
          );
        } else {
          alert(
            "The selected Moonshine model is not downloaded yet. Go to Settings → Transcription and select it to start the download."
          );
        }
        return;
      }
    }

    // If browser transcription mode is enabled, open browser and wait for transcriptions
    if (settings.runTranscriptionInBrowser) {
      setTranscriptionStatus("waiting_for_browser");
      await connectToBrowserTranscriptionWs();
      await openBrowserTranscription();
      return;
    }

    setTranscriptionStatus("connecting");

    try {
      const service = createTranscriptionService(
        settings,
        {
          onInterimTranscript: (text) => {
            const isLocalEngine =
              settings.transcriptionEngine === "offline-whisper-native" ||
              settings.transcriptionEngine === "offline-whisper" ||
              settings.transcriptionEngine === "offline-moonshine";

            // Fast local parsing for direct references (no AI) so refs can appear sooner.
            scheduleInterimDirectParse(text);

            if (isLocalEngine) {
              queueInterimUiUpdate(text);
              return;
            }

            setInterimTranscript(text);

            emitTranscriptionStream({
              type: "transcription_stream",
              kind: "interim",
              timestamp: Date.now(),
              engine: settings.transcriptionEngine,
              text,
              audio_level: audioLevelRef.current,
            });

            if (settings.streamTranscriptionsToWebSocket) {
              broadcastTranscriptionStreamMessage({
                type: "transcription_stream",
                kind: "interim",
                timestamp: Date.now(),
                engine: settings.transcriptionEngine,
                text,
                audio_level: audioLevelRef.current,
              }).catch(() => {
                // If Live Slides server isn't running, silently ignore.
              });
            }
          },
          onFinalTranscript: async (text, segment) => {
            setTranscriptHistory(prev => [...prev, segment]);
            setInterimTranscript("");

            // Detect Bible references in the transcript
            const directRefs = await detectAndLookupReferences(text, {
              aggressiveSpeechNormalization: true,
            });
            let keyPoints: KeyPoint[] = [];
            let scriptureReferences: string[] = [];
            let paraphrasedVersesForWs: ParaphrasedVerse[] = [];
            
            if (directRefs.length > 0) {
              setDetectedReferences(prev => [...prev, ...directRefs]);
              scriptureReferences = Array.from(
                new Set(directRefs.map((r) => (r.displayRef || "").trim()).filter(Boolean))
              );
              
              // Add to chat history if enabled
              if (settings.autoAddDetectedToHistory) {
                setChatHistory(prev => [...prev, {
                  id: `transcript-${Date.now()}`,
                  type: "result",
                  content: `Detected from transcription`,
                  timestamp: Date.now(),
                  references: directRefs,
                }]);
              }

              // Auto-trigger if enabled
              if (autoTriggerOnDetectionRef.current && directRefs.length > 0) {
                handleGoLive(directRefs[0]);
              }
            } else if (settings.enableParaphraseDetection || settings.enableKeyPointExtraction) {
              // Try AI analysis (paraphrase detection and/or key point extraction)
              console.log("[SmartVerses][AI] No direct refs found; invoking AI analysis...");
              const analysis = await analyzeTranscriptChunk(
                text,
                appSettings,
                settings.enableParaphraseDetection,
                settings.enableKeyPointExtraction,
                {
                  keyPointInstructions: settings.keyPointExtractionInstructions,
                  overrideProvider: settings.bibleSearchProvider,
                  overrideModel: settings.bibleSearchModel,
                  minWords: settings.aiMinWordCount,
                }
              );
              keyPoints = analysis.keyPoints || [];
              if (keyPoints.length > 0) {
                setTranscriptKeyPoints((prev) => ({
                  ...prev,
                  [segment.id]: keyPoints,
                }));
              }

              console.log(
                "[SmartVerses][Paraphrase] AI analysis returned:",
                analysis.paraphrasedVerses.length,
                "paraphrased verse(s)"
              );

              if (analysis.paraphrasedVerses.length > 0) {
                paraphrasedVersesForWs = analysis.paraphrasedVerses;
              }

              if (settings.enableParaphraseDetection && analysis.paraphrasedVerses.length > 0) {
                const resolvedRefs = await resolveParaphrasedVerses(analysis.paraphrasedVerses);
                if (resolvedRefs.length > 0) {
                  console.log("[SmartVerses][Paraphrase] Resolved refs:", resolvedRefs.map(r => r.displayRef));
                  // Attach paraphrase-detected refs to the same transcript segment so the UI can
                  // display them inline under that segment (same behavior as direct refs).
                  const resolvedWithTranscript = resolvedRefs.map((r) => ({
                    ...r,
                    transcriptText: text,
                  }));

                  // De-dupe: if the last few detected references already include this same verse,
                  // don't show it again as a paraphrase (common when someone says the ref, then reads it).
                  const recent = detectedReferencesRef.current.slice(-5);
                  const recentKeys = new Set(
                    recent.map((r) => (r.displayRef || "").trim().toLowerCase())
                  );
                  const deduped = resolvedWithTranscript.filter(
                    (r) => !recentKeys.has((r.displayRef || "").trim().toLowerCase())
                  );

                  if (deduped.length !== resolvedWithTranscript.length) {
                    console.log(
                      "[SmartVerses][Paraphrase] De-duped paraphrase refs:",
                      resolvedWithTranscript.length - deduped.length,
                      "filtered out"
                    );
                  }

                  if (deduped.length > 0) {
                    setDetectedReferences(prev => [...prev, ...deduped]);
                  }
                  
                  if (settings.autoAddDetectedToHistory) {
                    if (deduped.length > 0) {
                      setChatHistory(prev => [...prev, {
                        id: `paraphrase-${Date.now()}`,
                        type: "result",
                        content: `Paraphrase detected (${Math.round((deduped[0].confidence || 0) * 100)}% confidence)`,
                        timestamp: Date.now(),
                        references: deduped,
                      }]);
                    }
                  }

                  if (autoTriggerOnDetectionRef.current && deduped.length > 0) {
                    handleGoLive(deduped[0]);
                  }
                }
              }
            }

            const wsKeyPoints =
              keyPoints.length > 0
                ? keyPoints.map((kp) => ({
                    text: kp.text,
                    category: kp.category,
                  }))
                : undefined;

            emitTranscriptionStream({
              type: "transcription_stream",
              kind: "final",
              timestamp: Date.now(),
              engine: settings.transcriptionEngine,
              text,
              audio_level: audioLevelRef.current,
              segment,
              scripture_references: scriptureReferences.length
                ? scriptureReferences
                : undefined,
              key_points: wsKeyPoints,
              paraphrased_verses: paraphrasedVersesForWs.length
                ? paraphrasedVersesForWs
                : undefined,
            });

            if (settings.streamTranscriptionsToWebSocket) {
              broadcastTranscriptionStreamMessage({
                type: "transcription_stream",
                kind: "final",
                timestamp: Date.now(),
                engine: settings.transcriptionEngine,
                text,
                audio_level: audioLevelRef.current,
                segment,
                scripture_references: scriptureReferences.length ? scriptureReferences : undefined,
                key_points: keyPoints.length ? keyPoints : undefined,
                paraphrased_verses: paraphrasedVersesForWs.length
                  ? paraphrasedVersesForWs
                  : undefined,
              }).catch(() => {
                // If Live Slides server isn't running, silently ignore.
              });
            }
          },
          onError: (error) => {
            console.error("Transcription error:", error);
            setTranscriptionStatus("error");
            setTranscriptionErrorMessage(
              error instanceof Error ? error.message : "Transcription error."
            );
          },
          onStatusChange: (status) => {
            setTranscriptionStatus(status);
            if (status === "recording") {
              setTranscriptionErrorMessage(null);
            }
            if (status !== "recording") {
              setAudioLevel(0);
            }
          },
          onConnectionClose: () => {
            setTranscriptionStatus("idle");
            setAudioLevel(0);
          },
          onAudioLevel: (level) => {
            const mapped = mapAudioLevel(level);
            audioLevelRef.current = mapped;
            setAudioLevel((prev) => prev * 0.65 + mapped * 0.35);
          },
        }
      );

      // Configure audio capture mode (WebRTC vs Native)
      service.setAudioCaptureMode?.(settings.audioCaptureMode === "native" ? "native" : "webrtc");
      if (settings.audioCaptureMode === "native") {
        service.setNativeMicrophoneDeviceId?.(settings.selectedNativeMicrophoneId || null);
      }

      if (settings.selectedMicrophoneId) {
        service.setMicrophone(settings.selectedMicrophoneId);
      }

      await service.startTranscription();
      transcriptionServiceRef.current = service;
    } catch (error) {
      console.error("Failed to start transcription:", error);
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage(
        error instanceof Error ? error.message : "Failed to start transcription."
      );
      alert(
        `Failed to start transcription: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }, [
    settings,
    appSettings,
    connectToRemoteTranscriptionWs,
    handleGoLive,
    emitTranscriptionStream,
    queueInterimUiUpdate,
    scheduleInterimDirectParse,
  ]);

  const handleStopTranscription = useCallback(async () => {
    setIsStopping(true);
    isStoppingRef.current = true;
    try {
      if (transcriptionServiceRef.current) {
        await transcriptionServiceRef.current.stopTranscription();
        // Call destroy() to properly terminate workers and release resources
        // This is especially important for offline transcription services that use web workers
        transcriptionServiceRef.current.destroy?.();
        transcriptionServiceRef.current = null;
      }
      // Also disconnect browser transcription WebSocket if connected
      disconnectBrowserTranscriptionWs();
    disconnectRemoteTranscriptionWs();
      latestInterimTextRef.current = "";
      pendingInterimUiTextRef.current = "";
      lastInterimDirectSignatureRef.current = "";
      lastInterimParseAtRef.current = 0;
      lastInterimWordCountRef.current = 0;
      if (interimUiTimerRef.current) {
        clearTimeout(interimUiTimerRef.current);
        interimUiTimerRef.current = null;
      }
      setTranscriptionStatus("idle");
      setInterimTranscript("");
      setTranscriptionErrorMessage(null);
    } finally {
      setIsStopping(false);
      isStoppingRef.current = false;
    }
  }, [disconnectBrowserTranscriptionWs, disconnectRemoteTranscriptionWs]);

  const transcriptionTimeLimitMinutes = Math.max(
    1,
    settings.transcriptionTimeLimitMinutes ?? 120
  );
  const transcriptionTimeLimitMs = transcriptionTimeLimitMinutes * 60 * 1000;

  const formatElapsedTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, []);

  const formatSnoozeLabel = useCallback((minutes: number) => {
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hr${hours === 1 ? "" : "s"}`;
    }
    return `${minutes} min`;
  }, []);

  const formattedElapsedTime = useMemo(
    () => formatElapsedTime(transcriptionElapsedMs),
    [formatElapsedTime, transcriptionElapsedMs]
  );
  const canStartTranscription =
    transcriptionStatus === "idle" || transcriptionStatus === "error";
  const transcriptionLimitLabel = useMemo(
    () => formatSnoozeLabel(transcriptionTimeLimitMinutes),
    [formatSnoozeLabel, transcriptionTimeLimitMinutes]
  );

  const clearTranscriptionPromptTimeout = useCallback(() => {
    if (transcriptionPromptTimeoutRef.current) {
      window.clearTimeout(transcriptionPromptTimeoutRef.current);
      transcriptionPromptTimeoutRef.current = null;
    }
  }, []);

  const resetTranscriptionTimer = useCallback(() => {
    transcriptionStartRef.current = null;
    transcriptionNextPromptAtRef.current = null;
    transcriptionPromptReasonRef.current = null;
    setTranscriptionElapsedMs(0);
    setShowTranscriptionLimitPrompt(false);
    clearTranscriptionPromptTimeout();
  }, [clearTranscriptionPromptTimeout]);

  const openTranscriptionLimitPrompt = useCallback(() => {
    if (showTranscriptionLimitPrompt) return;
    setShowTranscriptionLimitPrompt(true);
    clearTranscriptionPromptTimeout();
    transcriptionPromptTimeoutRef.current = window.setTimeout(() => {
      if (transcriptionStatusRef.current !== "idle") {
        handleStopTranscription();
      }
      setShowTranscriptionLimitPrompt(false);
    }, 60 * 1000);
  }, [clearTranscriptionPromptTimeout, handleStopTranscription, showTranscriptionLimitPrompt]);

  const handleTranscriptionSnooze = useCallback(
    (minutes: number) => {
      transcriptionNextPromptAtRef.current = Date.now() + minutes * 60 * 1000;
      transcriptionPromptReasonRef.current = "snooze";
      setShowTranscriptionLimitPrompt(false);
      clearTranscriptionPromptTimeout();
    },
    [clearTranscriptionPromptTimeout]
  );

  const handleTranscriptionPromptStop = useCallback(() => {
    setShowTranscriptionLimitPrompt(false);
    clearTranscriptionPromptTimeout();
    handleStopTranscription();
  }, [clearTranscriptionPromptTimeout, handleStopTranscription]);

  useEffect(() => {
    if (transcriptionStatus === "idle" || transcriptionStatus === "error") {
      resetTranscriptionTimer();
      return;
    }

    if (transcriptionStatus !== "recording") {
      return;
    }

    if (!transcriptionStartRef.current) {
      const now = Date.now();
      transcriptionStartRef.current = now;
      transcriptionNextPromptAtRef.current = now + transcriptionTimeLimitMs;
      transcriptionPromptReasonRef.current = "limit";
      setTranscriptionElapsedMs(0);
    }

    const intervalId = window.setInterval(() => {
      if (!transcriptionStartRef.current) return;
      const now = Date.now();
      setTranscriptionElapsedMs(now - transcriptionStartRef.current);

      const nextPromptAt = transcriptionNextPromptAtRef.current;
      if (nextPromptAt && now >= nextPromptAt && !showTranscriptionLimitPrompt) {
        openTranscriptionLimitPrompt();
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [
    transcriptionStatus,
    transcriptionTimeLimitMs,
    showTranscriptionLimitPrompt,
    openTranscriptionLimitPrompt,
    resetTranscriptionTimer,
  ]);

  useEffect(() => {
    if (transcriptionStatus !== "recording") return;
    if (!transcriptionStartRef.current) return;
    if (transcriptionPromptReasonRef.current !== "limit") return;

    transcriptionNextPromptAtRef.current =
      transcriptionStartRef.current + transcriptionTimeLimitMs;

    if (
      transcriptionNextPromptAtRef.current &&
      Date.now() >= transcriptionNextPromptAtRef.current &&
      !showTranscriptionLimitPrompt
    ) {
      openTranscriptionLimitPrompt();
    }
  }, [
    transcriptionStatus,
    transcriptionTimeLimitMs,
    openTranscriptionLimitPrompt,
  ]);

  useEffect(() => {
    const handleStartRequest = () => {
      if (transcriptionStatus !== "idle") return;
      handleStartTranscription();
    };
    const handleStopRequest = () => {
      if (transcriptionStatus === "idle") return;
      handleStopTranscription();
    };

    window.addEventListener("transcription-start-request", handleStartRequest);
    window.addEventListener("transcription-stop-request", handleStopRequest);
    return () => {
      window.removeEventListener(
        "transcription-start-request",
        handleStartRequest
      );
      window.removeEventListener(
        "transcription-stop-request",
        handleStopRequest
      );
    };
  }, [handleStartTranscription, handleStopTranscription, transcriptionStatus]);

  const handleClearTranscript = () => {
    setTranscriptHistory([]);
    setDetectedReferences([]);
    setTranscriptKeyPoints({});
    setInterimTranscript("");
  };

  const handleAutoTriggerToggle = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, autoTriggerOnDetection: enabled };
      saveSmartVersesSettings(next);
      window.dispatchEvent(
        new CustomEvent("smartverses-settings-changed", { detail: next })
      );
      return next;
    });
  }, []);

  const toggleDetectedExpanded = useCallback((id: string) => {
    setExpandedDetectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleInlineExpanded = useCallback((id: string) => {
    setExpandedInlineRefIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptScrollContainerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const atBottom = distanceFromBottom < 60;

    // If the user scrolls up, pause auto-scroll (but keep the checkbox enabled).
    if (!atBottom && autoScrollTranscript) {
      setAutoScrollPaused(true);
      return;
    }

    // If the user scrolls back to the bottom, resume.
    if (atBottom && autoScrollPaused) {
      setAutoScrollPaused(false);
    }
  }, [autoScrollTranscript, autoScrollPaused]);

  const setAutoScrollFromCheckbox = useCallback((enabled: boolean) => {
    setAutoScrollTranscript(enabled);
    setAutoScrollPaused(false);
    if (enabled) {
      // Jump to bottom immediately when re-enabled
      requestAnimationFrame(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);

  // Smart resume: if auto-scroll is enabled but paused because the user scrolled up,
  // resume when they click outside the transcript area.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!autoScrollTranscript || !autoScrollPaused) return;
      const el = transcriptScrollContainerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;

      setAutoScrollPaused(false);
      requestAnimationFrame(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [autoScrollTranscript, autoScrollPaused]);

  const recentDetectedReferences = useMemo(() => {
    // Show most recent first (allow full scroll list)
    return detectedReferences.slice().reverse();
  }, [detectedReferences]);

  // =============================================================================
  // VERSE NAVIGATION STATE
  // =============================================================================

  const [verseNavigation, setVerseNavigation] = useState<Record<string, {
    hasPrevious: boolean;
    hasNext: boolean;
    previous: { book: string; chapter: number; verse: number; displayRef: string } | null;
    next: { book: string; chapter: number; verse: number; displayRef: string } | null;
  }>>({});

  // Load navigation info when a reference is displayed
  const loadNavigationInfo = useCallback(async (ref: DetectedBibleReference) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    
    const navKey = `${ref.book}-${ref.chapter}-${ref.verse}`;
    if (verseNavigation[navKey]) return; // Already loaded
    
    const nav = await getVerseNavigation(ref.book, ref.chapter, ref.verse);
    setVerseNavigation(prev => ({
      ...prev,
      [navKey]: nav,
    }));
  }, [verseNavigation]);

  // Handle navigating to previous verse - prepends to the same message's references
  const handlePreviousVerse = useCallback(async (ref: DetectedBibleReference, messageId: string) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    
    const navKey = `${ref.book}-${ref.chapter}-${ref.verse}`;
    const nav = verseNavigation[navKey];
    if (!nav?.previous) return;
    
    const prevVerse = await loadVerseByComponents(
      nav.previous.book,
      nav.previous.chapter,
      nav.previous.verse
    );
    
    if (prevVerse) {
      const newRef: DetectedBibleReference = {
        id: `nav-prev-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        reference: prevVerse.displayRef,
        displayRef: prevVerse.displayRef,
        verseText: prevVerse.verseText,
        source: 'direct',
        timestamp: Date.now(),
        book: prevVerse.book,
        chapter: prevVerse.chapter,
        verse: prevVerse.verse,
        isNavigationResult: true, // Mark as navigation result - no nav buttons
      };
      
      // Prepend to the same message's references
      setChatHistory(prev => prev.map(msg => {
        if (msg.id === messageId && msg.references) {
          return {
            ...msg,
            references: [newRef, ...msg.references],
          };
        }
        return msg;
      }));
    }
  }, [verseNavigation]);

  // Handle navigating to next verse - appends to the same message's references
  const handleNextVerse = useCallback(async (ref: DetectedBibleReference, messageId: string) => {
    if (!ref.book || !ref.chapter || !ref.verse) return;
    
    const navKey = `${ref.book}-${ref.chapter}-${ref.verse}`;
    const nav = verseNavigation[navKey];
    if (!nav?.next) return;
    
    const nextVerse = await loadVerseByComponents(
      nav.next.book,
      nav.next.chapter,
      nav.next.verse
    );
    
    if (nextVerse) {
      const newRef: DetectedBibleReference = {
        id: `nav-next-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        reference: nextVerse.displayRef,
        displayRef: nextVerse.displayRef,
        verseText: nextVerse.verseText,
        source: 'direct',
        timestamp: Date.now(),
        book: nextVerse.book,
        chapter: nextVerse.chapter,
        verse: nextVerse.verse,
        isNavigationResult: true, // Mark as navigation result - no nav buttons
      };
      
      // Append to the same message's references
      setChatHistory(prev => prev.map(msg => {
        if (msg.id === messageId && msg.references) {
          return {
            ...msg,
            references: [...msg.references, newRef],
          };
        }
        return msg;
      }));
    }
  }, [verseNavigation]);

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  // Render a single verse card (no navigation buttons - those are at container level)
  const renderVerseCard = (ref: DetectedBibleReference, showGoLive: boolean = true) => {
    const isParaphrase = ref.source === "paraphrase";
    const borderColor = isParaphrase 
      ? settings.paraphraseReferenceColor 
      : settings.directReferenceColor;
    const isLive = liveReferenceId === ref.id;

    return (
      <div
        key={ref.id}
        style={{
          padding: "var(--spacing-3)",
          borderRadius: "8px",
          backgroundColor: "var(--app-header-bg)",
          border: `2px solid ${isLive ? "#22c55e" : borderColor}`,
          marginBottom: "var(--spacing-2)",
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--spacing-2)",
        }}>
          <div style={{
            fontWeight: 600,
            color: isLive ? "#22c55e" : borderColor,
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
          }}>
            {ref.displayRef}
            {isParaphrase && ref.confidence && (
              <span style={{
                fontSize: "0.75rem",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                color: settings.paraphraseReferenceColor,
              }}>
                {Math.round(ref.confidence * 100)}%
              </span>
            )}
          </div>
          {showGoLive && (
            <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
              <button
                onClick={() => !isLive && handleGoLive(ref)}
                className={isLive ? "" : "primary"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: isLive ? "default" : "pointer",
                  backgroundColor: isLive ? "#22c55e" : undefined,
                  color: isLive ? "white" : undefined,
                  border: isLive ? "none" : undefined,
                }}
              >
                {isLive ? (
                  <>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "white",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                    Live
                  </>
                ) : (
                  <>
                    <FaPlay size={10} />
                    Go Live
                  </>
                )}
              </button>
              {isLive && (
                <button
                  onClick={handleOffLive}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                  }}
                >
                  <FaStopCircle size={10} />
                  Off Live
                </button>
              )}
            </div>
          )}
        </div>
        <p style={{
          margin: 0,
          fontSize: "0.9rem",
          lineHeight: 1.5,
          color: "var(--app-text-color)",
        }}>
          {renderHighlightedVerseText(ref.verseText, ref.highlight)}
        </p>
        {isParaphrase && ref.matchedPhrase && (
          <p style={{
            margin: "var(--spacing-2) 0 0",
            fontSize: "0.8rem",
            fontStyle: "italic",
            color: "var(--app-text-color-secondary)",
          }}>
            Matched: "{ref.matchedPhrase}"
          </p>
        )}
      </div>
    );
  };

  const renderDetectedReferenceRow = (ref: DetectedBibleReference) => {
    const isExpanded = expandedDetectedIds.has(ref.id);
    const isParaphrase = ref.source === "paraphrase";
    const borderColor = isParaphrase ? settings.paraphraseReferenceColor : settings.directReferenceColor;
    const isLive = liveReferenceId === ref.id;

    return (
      <div
        key={ref.id}
        style={{
          border: `1px solid ${isExpanded ? borderColor : "var(--app-border-color)"}`,
          borderRadius: "10px",
          backgroundColor: "var(--app-header-bg)",
          overflow: "hidden",
          marginBottom: "var(--spacing-2)",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleDetectedExpanded(ref.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleDetectedExpanded(ref.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--spacing-2)",
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span style={{ color: "var(--app-text-color-secondary)", flex: "0 0 auto" }}>
              {isExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </span>
            <span
              style={{
                fontWeight: 700,
                color: isLive ? "#22c55e" : borderColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={ref.displayRef}
            >
              {ref.displayRef}
            </span>
            {isParaphrase && ref.confidence != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 6px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(59, 130, 246, 0.15)",
                  color: settings.paraphraseReferenceColor,
                  flex: "0 0 auto",
                }}
              >
                {Math.round(ref.confidence * 100)}%
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "6px", flex: "0 0 auto" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isLive) handleGoLive(ref);
              }}
              className={isLive ? "" : "primary"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: isLive ? "default" : "pointer",
                backgroundColor: isLive ? "#22c55e" : undefined,
                color: isLive ? "white" : undefined,
                border: isLive ? "none" : undefined,
              }}
            >
              <FaPlay size={10} />
              Go Live
            </button>
            {isLive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOffLive();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                }}
              >
                <FaStopCircle size={10} />
                Off
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 12px 12px 34px" }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--app-bg-color)",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
                {renderHighlightedVerseText(ref.verseText, ref.highlight)}
              </p>
              {isParaphrase && ref.matchedPhrase && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "0.8rem",
                    fontStyle: "italic",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  Matched: "{ref.matchedPhrase}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render a group of references with navigation at top and bottom
  const renderReferencesWithNavigation = (
    references: DetectedBibleReference[],
    messageId: string,
    showGoLive: boolean = true
  ) => {
    if (!references || references.length === 0) return null;

    const firstRef = references[0];
    const lastRef = references[references.length - 1];

    // Load navigation info for first and last verses
    if (firstRef.book && firstRef.chapter && firstRef.verse) {
      loadNavigationInfo(firstRef);
    }
    if (lastRef.book && lastRef.chapter && lastRef.verse && lastRef.id !== firstRef.id) {
      loadNavigationInfo(lastRef);
    }

    const firstNavKey = firstRef.book && firstRef.chapter && firstRef.verse 
      ? `${firstRef.book}-${firstRef.chapter}-${firstRef.verse}` 
      : null;
    const lastNavKey = lastRef.book && lastRef.chapter && lastRef.verse 
      ? `${lastRef.book}-${lastRef.chapter}-${lastRef.verse}` 
      : null;

    const firstNav = firstNavKey ? verseNavigation[firstNavKey] : null;
    const lastNav = lastNavKey ? verseNavigation[lastNavKey] : null;

    const borderColor = settings.directReferenceColor;

    return (
      <div>
        {/* Previous Verse Navigation - based on first verse */}
        {firstNav?.hasPrevious && (
          <button
            onClick={() => handlePreviousVerse(firstRef, messageId)}
            style={{
              width: "100%",
              padding: "var(--spacing-2)",
              marginBottom: "var(--spacing-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-2)",
              backgroundColor: "transparent",
              border: "1px dashed var(--app-border-color)",
              borderRadius: "8px",
              color: "var(--app-text-color-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--app-header-bg)";
              e.currentTarget.style.borderColor = borderColor;
              e.currentTarget.style.color = borderColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "var(--app-border-color)";
              e.currentTarget.style.color = "var(--app-text-color-secondary)";
            }}
          >
            <FaChevronUp size={12} />
            <span>Previous Verse</span>
          </button>
        )}

        {/* All verse cards */}
        {references.map((ref) => renderVerseCard(ref, showGoLive))}

        {/* Next Verse Navigation - based on last verse */}
        {lastNav?.hasNext && (
          <button
            onClick={() => handleNextVerse(lastRef, messageId)}
            style={{
              width: "100%",
              padding: "var(--spacing-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--spacing-2)",
              backgroundColor: "transparent",
              border: "1px dashed var(--app-border-color)",
              borderRadius: "8px",
              color: "var(--app-text-color-secondary)",
              cursor: "pointer",
              fontSize: "0.85rem",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--app-header-bg)";
              e.currentTarget.style.borderColor = borderColor;
              e.currentTarget.style.color = borderColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "var(--app-border-color)";
              e.currentTarget.style.color = "var(--app-text-color-secondary)";
            }}
          >
            <FaChevronDown size={12} />
            <span>Next Verse</span>
          </button>
        )}
      </div>
    );
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div style={{
      display: "flex",
      height: "calc(100vh - 60px)",
      gap: "var(--spacing-4)",
      padding: "var(--spacing-4)",
      position: "relative",
    }}>
      <div
        style={{
          position: "absolute",
          top: "var(--spacing-3)",
          left: "50%",
          transform: showTranscriptionLimitPrompt
            ? "translate(-50%, 0)"
            : "translate(-50%, -140%)",
          transition: "transform 0.25s ease, opacity 0.25s ease",
          opacity: showTranscriptionLimitPrompt ? 1 : 0,
          pointerEvents: showTranscriptionLimitPrompt ? "auto" : "none",
          zIndex: 50,
          width: "min(720px, calc(100% - 32px))",
        }}
        aria-hidden={!showTranscriptionLimitPrompt}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--spacing-3)",
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid var(--app-border-color)",
            backgroundColor: "var(--app-header-bg)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ flex: 1, minWidth: "220px" }}>
            <div style={{ fontWeight: 600 }}>
              Continue transcribing?
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
              You've been transcribing for {formattedElapsedTime}. Auto-stop in 1 minute.
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={() => handleTranscriptionSnooze(30)}
              className="secondary btn-sm"
            >
              Snooze 30 min
            </button>
            <button
              onClick={() => handleTranscriptionSnooze(transcriptionTimeLimitMinutes)}
              className="secondary btn-sm"
            >
              Snooze {transcriptionLimitLabel}
            </button>
            <button
              onClick={handleTranscriptionPromptStop}
              style={{
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontWeight: 600,
                backgroundColor: "rgb(220, 38, 38)",
                color: "white",
                cursor: "pointer",
              }}
            >
              Stop
            </button>
          </div>
        </div>
      </div>
      {/* LEFT COLUMN - Bible Search Chat */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color)",
        borderRadius: "12px",
        border: "1px solid var(--app-border-color)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          borderBottom: "1px solid var(--app-border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--app-header-bg)",
        }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <FaSearch />
            Bible Search
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", position: "relative" }}>
            {liveReferenceId && (
              <button
                onClick={handleOffLive}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                }}
              >
                <FaStopCircle size={10} />
                Off Live
              </button>
            )}
            <button
              onClick={handleClearHistory}
              className="icon-button"
              title="Clear history"
              style={{ padding: "6px" }}
            >
              <FaTrash size={12} />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-4)",
        }}>
          {chatHistory.length === 0 ? (
            <div style={{
              textAlign: "center",
              color: "var(--app-text-color-secondary)",
              padding: "var(--spacing-8)",
            }}>
              <FaSearch size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.5 }} />
              <p>Search for Bible verses</p>
              <p style={{ fontSize: "0.85rem" }}>
                Type a reference like "John 3:16" or a phrase like "For God so loved"
              </p>
            </div>
          ) : (
            chatHistory.map((message) => (
              <div
                key={message.id}
                style={{
                  marginBottom: "var(--spacing-3)",
                }}
              >
                {message.type === "query" && (
                  <div style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginBottom: "var(--spacing-2)",
                  }}>
                    <div style={{
                      backgroundColor: "var(--app-primary-color)",
                      color: "white",
                      padding: "var(--spacing-2) var(--spacing-3)",
                      borderRadius: "12px 12px 0 12px",
                      maxWidth: "80%",
                    }}>
                      {message.content}
                    </div>
                  </div>
                )}
                {message.type === "result" && (
                  <div>
                    {message.isLoading ? (
                      <div style={{
                        padding: "var(--spacing-3)",
                        color: "var(--app-text-color-secondary)",
                        fontStyle: "italic",
                      }}>
                        {message.content}
                      </div>
                    ) : message.references && message.references.length > 0 ? (
                      <>
                        <p style={{
                          fontSize: "0.8rem",
                          color: "var(--app-text-color-secondary)",
                          marginBottom: "var(--spacing-2)",
                        }}>
                          {message.content}
                        </p>
                        {renderReferencesWithNavigation(message.references, message.id, true)}
                      </>
                    ) : (
                      <div style={{
                        padding: "var(--spacing-3)",
                        color: message.error ? "var(--error)" : "var(--app-text-color-secondary)",
                      }}>
                        {message.content}
                      </div>
                    )}
                  </div>
                )}
                {message.type === "system" && (
                  <div style={{
                    textAlign: "center",
                    fontSize: "0.8rem",
                    color: "var(--app-text-color-secondary)",
                    padding: "var(--spacing-2)",
                  }}>
                    {message.content}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          borderTop: "1px solid var(--app-border-color)",
          backgroundColor: "var(--app-header-bg)",
        }}>
          <div style={{
            display: "flex",
            gap: "var(--spacing-2)",
            marginBottom: "var(--spacing-2)",
          }}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search Bible reference or phrase..."
              disabled={isSearching}
              style={{
                flex: 1,
                padding: "var(--spacing-3)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                fontSize: "1rem",
              }}
            />
            <button
              onClick={() => handleSearch(inputValue)}
              disabled={!inputValue.trim() || isSearching}
              className="primary"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "var(--spacing-3) var(--spacing-4)",
              }}
            >
              <FaPaperPlane />
            </button>
          </div>
          {/* AI Search Toggle */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.85rem",
              cursor: "pointer",
              color: isAISearchEnabled ? "var(--app-primary-color)" : "var(--app-text-color-secondary)",
            }}>
              <input
                type="checkbox"
                checked={isAISearchEnabled}
                onChange={(e) => setIsAISearchEnabled(e.target.checked)}
                style={{ cursor: "pointer" }}
              />
              <FaRobot size={12} />
              AI Search
            </label>
            {(() => {
              if (!isAISearchEnabled) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--app-text-color-secondary)",
                  }}>
                    Using text search
                  </span>
                );
              }
              
              // Check if AI is configured
              const provider = settings.bibleSearchProvider || appSettings.defaultAIProvider;
              let hasApiKey = false;
              if (provider === 'openai') hasApiKey = !!appSettings.openAIConfig?.apiKey;
              else if (provider === 'gemini') hasApiKey = !!appSettings.geminiConfig?.apiKey;
              else if (provider === 'groq') hasApiKey = !!appSettings.groqConfig?.apiKey;
              
              if (provider && hasApiKey) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--success)",
                  }}>
                    ✓ {provider} {settings.bibleSearchModel ? `(${settings.bibleSearchModel.split('/').pop()})` : ''}
                  </span>
                );
              } else if (provider && !hasApiKey) {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--warning)",
                  }}>
                    ⚠ {provider} API key missing - Settings → AI Config
                  </span>
                );
              } else {
                return (
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--warning)",
                  }}>
                    ⚠ Select provider in Settings → SmartVerses
                  </span>
                );
              }
            })()}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Live Transcription */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--app-bg-color)",
        borderRadius: "12px",
        border: "1px solid var(--app-border-color)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          borderBottom: "1px solid var(--app-border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--app-header-bg)",
        }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <FaMicrophone />
            Live Transcription
            {transcriptionStatus === "recording" && (
              <span style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "rgb(239, 68, 68)",
                animation: "pulse 1s infinite",
              }} />
            )}
            {transcriptionStatus === "waiting_for_browser" && (
              <span style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: "var(--warning)",
                color: "white",
                fontWeight: 600,
              }}>
                Browser
              </span>
            )}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px",
                borderRadius: "6px",
                border: "1px solid var(--app-border-color)",
                backgroundColor: "var(--app-bg-color)",
                fontSize: "0.8rem",
                color:
                  transcriptionStatus === "recording"
                    ? "var(--success)"
                    : "var(--app-text-color-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Transcription elapsed time"
            >
              {formattedElapsedTime}
            </div>
            {canStartTranscription ? (
              <button
                onClick={handleStartTranscription}
                className="primary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FaMicrophone />
                {transcriptionStatus === "error" ? "Retry" : "Start"}
                {settings.runTranscriptionInBrowser && (
                  <FaExternalLinkAlt style={{ fontSize: "0.75rem" }} />
                )}
              </button>
            ) : transcriptionStatus === "connecting" ? (
              <button disabled className="secondary">
                Connecting...
              </button>
            ) : transcriptionStatus === "waiting_for_browser" ? (
              <button
                onClick={handleStopTranscription}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "var(--warning)",
                  color: "white",
                  border: "none",
                  padding: "var(--spacing-2) var(--spacing-3)",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
                title="Click to cancel and close the browser transcription"
              >
                <FaExternalLinkAlt />
                Waiting for browser...
              </button>
            ) : (
              <button
                onClick={handleStopTranscription}
                disabled={isStopping}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: isStopping ? "rgb(156, 163, 175)" : "rgb(220, 38, 38)",
                  color: "white",
                  border: "none",
                  padding: "var(--spacing-2) var(--spacing-3)",
                  borderRadius: "8px",
                  cursor: isStopping ? "not-allowed" : "pointer",
                  opacity: isStopping ? 0.7 : 1,
                }}
              >
                {isStopping ? (
                  <>
                    <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
                    Stopping...
                  </>
                ) : (
                  <>
                    <FaStop />
                    Stop
                  </>
                )}
              </button>
            )}
            <TranscriptOptionsMenu
              isOpen={transcriptMenuOpen}
              onToggle={() => setTranscriptMenuOpen((v) => !v)}
              menuRef={transcriptMenuRef}
              searchQuery={transcriptSearchQuery}
              onSearchChange={setTranscriptSearchQuery}
              onClearSearch={() => setTranscriptSearchQuery("")}
              options={[
                {
                  id: "show-transcript",
                  label: "Transcript",
                  checked: transcriptDisplayOptions.showTranscript,
                  onToggle: () => handleToggleTranscriptOption("showTranscript"),
                },
                {
                  id: "show-scripture",
                  label: "Scripture refs",
                  checked: transcriptDisplayOptions.showScriptureRefs,
                  onToggle: () => handleToggleTranscriptOption("showScriptureRefs"),
                },
                {
                  id: "show-key-points",
                  label: "Key points",
                  checked: transcriptDisplayOptions.showKeyPoints,
                  onToggle: () => handleToggleTranscriptOption("showKeyPoints"),
                },
              ]}
              actions={[
                {
                  id: "delete",
                  label: "Delete transcript",
                  icon: <FaTrash size={12} />,
                  onClick: () => {
                    handleClearTranscript();
                    setTranscriptMenuOpen(false);
                  },
                },
                {
                  id: "download-text",
                  label: "Download as text",
                  icon: <FaDownload size={12} />,
                  onClick: () => {
                    handleDownloadTranscript("text");
                    setTranscriptMenuOpen(false);
                  },
                },
                {
                  id: "download-json",
                  label: "Download as JSON",
                  icon: <FaDownload size={12} />,
                  onClick: () => {
                    handleDownloadTranscript("json");
                    setTranscriptMenuOpen(false);
                  },
                },
                { id: "divider", kind: "separator" },
                {
                  id: "settings",
                  label: "SmartVerses settings",
                  icon: <FaCog size={12} />,
                  onClick: () => {
                    handleOpenSmartVersesSettings();
                    setTranscriptMenuOpen(false);
                  },
                },
              ]}
              triggerClassName="icon-button"
              triggerStyle={{ padding: "6px" }}
              showSearch={false}
            />
          </div>
        </div>

        {transcriptionErrorMessage && (
          <div
            role="alert"
            style={{
              margin: "var(--spacing-2) var(--spacing-4) 0",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(239, 68, 68, 0.45)",
              backgroundColor: "rgba(239, 68, 68, 0.08)",
              color: "var(--error)",
              fontSize: "0.85rem",
            }}
          >
            {transcriptionErrorMessage}
          </div>
        )}

        <div style={{
          height: "8px",
          backgroundColor: "var(--app-bg-color)",
          borderBottom: "1px solid var(--app-border-color)",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.max(2, Math.round((transcriptionStatus === "recording" ? audioLevel : 0) * 100))}%`,
            backgroundColor:
              transcriptionStatus === "recording"
                ? audioLevel > 0.85
                  ? "rgb(220, 38, 38)"
                  : audioLevel > 0.7
                  ? "rgb(234, 179, 8)"
                  : "rgb(34, 197, 94)"
                : "rgba(148, 163, 184, 0.5)",
            transition: "width 80ms linear, background-color 150ms ease",
          }} />
        </div>

        <div style={{ padding: "var(--spacing-2) var(--spacing-4)", borderBottom: "1px solid var(--app-border-color)" }}>
          <input
            type="text"
            value={transcriptSearchQuery}
            onChange={(e) => setTranscriptSearchQuery(e.target.value)}
            placeholder="Search transcript..."
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "6px",
              border: "1px solid var(--app-border-color)",
              background: "var(--app-input-bg-color)",
              color: "var(--app-input-text-color)",
              fontSize: "0.85rem",
              marginBottom: "var(--spacing-2)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "var(--app-text-color-secondary)",
                userSelect: "none",
                cursor: "pointer",
              }}
              title="When enabled, the transcript will stay scrolled to the latest line. Scrolling up pauses it."
            >
              <input
                type="checkbox"
                checked={autoScrollTranscript}
                onChange={(e) => setAutoScrollFromCheckbox(e.target.checked)}
              />
              Auto-scroll
              {autoScrollTranscript && autoScrollPaused && (
                <span style={{ color: "var(--warning)", fontWeight: 700, marginLeft: "4px" }}>(paused)</span>
              )}
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "var(--app-text-color-secondary)",
                userSelect: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="When enabled, detected verses go live automatically."
            >
              <input
                type="checkbox"
                checked={settings.autoTriggerOnDetection}
                onChange={(e) => handleAutoTriggerToggle(e.target.checked)}
              />
              Auto-trigger
            </label>
          </div>
        </div>

        {/* Transcript Display */}
        <div
          ref={transcriptScrollContainerRef}
          onScroll={handleTranscriptScroll}
          style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--spacing-4)",
        }}
        >
          {transcriptHistory.length === 0 && !interimTranscript ? (
            <div style={{
              textAlign: "center",
              color: "var(--app-text-color-secondary)",
              padding: "var(--spacing-8)",
            }}>
              {transcriptionStatus === "waiting_for_browser" ? (
                <>
                  <FaExternalLinkAlt size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.7, color: "var(--warning)" }} />
                  <p style={{ color: "var(--warning)", fontWeight: 600 }}>Waiting for browser transcription...</p>
                  <p style={{ fontSize: "0.85rem" }}>
                    A browser window has been opened. Select your microphone and click "Start Transcription" there.
                    <br />
                    Transcriptions will appear here automatically.
                  </p>
                </>
              ) : (
                <>
                  <FaMicrophone size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.5 }} />
                  <p>Live transcription</p>
                  <p style={{ fontSize: "0.85rem" }}>
                    Click Start to begin transcribing. Bible references will be detected automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Final transcripts */}
              {filteredTranscriptHistory.length === 0 && transcriptSearchQuery.trim() ? (
                <div style={{ color: "var(--app-text-color-secondary)", fontStyle: "italic", marginBottom: "var(--spacing-3)" }}>
                  No transcript matches "{transcriptSearchQuery}"
                </div>
              ) : null}
              {filteredTranscriptHistory.map((segment, index) => {
                // Check if this segment contains any detected references
                const segmentRefs = detectedReferences.filter(
                  ref => ref.transcriptText === segment.text
                );
                const segmentKeyPoints = transcriptKeyPoints[segment.id] || [];
                const showTranscriptText = transcriptDisplayOptions.showTranscript;
                const showRefs = transcriptDisplayOptions.showScriptureRefs;
                const showKeyPoints = transcriptDisplayOptions.showKeyPoints;
                const hasRefsToShow = showRefs && segmentRefs.length > 0;
                const hasKeyPointsToShow = showKeyPoints && segmentKeyPoints.length > 0;
                const shouldRenderSegment =
                  (showTranscriptText && segment.text) ||
                  hasRefsToShow ||
                  hasKeyPointsToShow;

                if (!shouldRenderSegment) {
                  return null;
                }
                
                return (
                  <div
                    key={`${segment.id}-${segment.timestamp}-${index}`}
                    style={{
                      marginBottom: "var(--spacing-3)",
                      padding: "var(--spacing-3)",
                      borderRadius: "10px",
                      backgroundColor: "var(--app-header-bg)",
                      border: "1px solid var(--app-border-color)",
                    }}
                  >
                    {showTranscriptText && (
                      <p
                        style={{
                          margin: 0,
                          lineHeight: 1.6,
                          color: "var(--app-text-color)",
                        }}
                      >
                        {segment.text}
                      </p>
                    )}
                    {hasRefsToShow && (
                      <div style={{ marginTop: "var(--spacing-2)" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {segmentRefs.map((ref) => {
                            const isParaphrase = ref.source === "paraphrase";
                            const borderColor = isParaphrase
                              ? settings.paraphraseReferenceColor
                              : settings.directReferenceColor;
                            const isLive = liveReferenceId === ref.id;
                            const isExpanded = expandedInlineRefIds.has(ref.id);

                            return (
                              <button
                                key={ref.id}
                                onClick={() => !isLive && handleGoLive(ref)}
                                title={ref.verseText}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  border: `1px solid ${isLive ? "#22c55e" : borderColor}`,
                                  backgroundColor: "transparent",
                                  color: isLive ? "#22c55e" : borderColor,
                                  cursor: isLive ? "default" : "pointer",
                                  fontWeight: 700,
                                  fontSize: "0.8rem",
                                }}
                              >
                                <FaPlay size={10} />
                                <span>{ref.displayRef}</span>
                                {isParaphrase && ref.confidence != null && (
                                  <span
                                    style={{
                                      fontSize: "0.75rem",
                                      padding: "2px 6px",
                                      borderRadius: "999px",
                                      backgroundColor: "rgba(59, 130, 246, 0.15)",
                                      color: settings.paraphraseReferenceColor,
                                    }}
                                  >
                                    {Math.round(ref.confidence * 100)}%
                                  </span>
                                )}
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleInlineExpanded(ref.id);
                                  }}
                                  title={isExpanded ? "Collapse verse text" : "Expand verse text"}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "18px",
                                    height: "18px",
                                    borderRadius: "999px",
                                    border: `1px solid ${borderColor}`,
                                    cursor: "pointer",
                                  }}
                                >
                                  {isExpanded ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Expanded verse text blocks */}
                        {segmentRefs.some((r) => expandedInlineRefIds.has(r.id)) && (
                          <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                            {segmentRefs
                              .filter((r) => expandedInlineRefIds.has(r.id))
                              .map((ref) => {
                                const isParaphrase = ref.source === "paraphrase";
                                const borderColor = isParaphrase
                                  ? settings.paraphraseReferenceColor
                                  : settings.directReferenceColor;
                                return (
                                  <div
                                    key={`expanded-${ref.id}`}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: `1px solid ${borderColor}`,
                                      backgroundColor: "var(--app-header-bg)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "10px",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      <div style={{ fontWeight: 800, color: borderColor }}>
                                        {ref.displayRef}
                                      </div>
                                      <button
                                        onClick={() => handleGoLive(ref)}
                                        className="primary"
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          padding: "6px 10px",
                                          borderRadius: "8px",
                                          fontSize: "0.8rem",
                                          fontWeight: 800,
                                        }}
                                      >
                                        <FaPlay size={10} />
                                        Go Live
                                      </button>
                                    </div>

                                    <p style={{ margin: 0, lineHeight: 1.5 }}>
                                      {renderHighlightedVerseText(ref.verseText, ref.highlight)}
                                    </p>

                                    {isParaphrase && ref.matchedPhrase && (
                                      <p
                                        style={{
                                          margin: "8px 0 0",
                                          fontSize: "0.8rem",
                                          fontStyle: "italic",
                                          color: "var(--app-text-color-secondary)",
                                        }}
                                      >
                                        Matched: "{ref.matchedPhrase}"
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                    {hasKeyPointsToShow && (
                      <div
                        style={{
                          marginTop:
                            showTranscriptText || hasRefsToShow ? "var(--spacing-2)" : 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--app-text-color-secondary)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: "6px",
                          }}
                        >
                          Key points
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          {segmentKeyPoints.map((point, index) => (
                            <div
                              key={`${segment.id}-key-point-${index}`}
                              style={{
                                border: "1px solid #f59e0b",
                                borderLeft: "4px solid #f59e0b",
                                borderRadius: "8px",
                                padding: "8px 10px",
                                backgroundColor: "rgba(245, 158, 11, 0.12)",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "10px",
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                                {point.category && (
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      letterSpacing: "0.04em",
                                      color: "#f59e0b",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {point.category}
                                  </span>
                                )}
                                <span
                                  style={{
                                    fontSize: "0.85rem",
                                    lineHeight: "1.4",
                                    color: "var(--app-text-color)",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {point.text}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Interim transcript */}
              {transcriptDisplayOptions.showTranscript && matchesInterimSearch && (
                <div
                  style={{
                    marginBottom: "var(--spacing-3)",
                    padding: "var(--spacing-3)",
                    borderRadius: "10px",
                    backgroundColor: "var(--app-header-bg)",
                    border: "1px dashed var(--app-border-color)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.6,
                      color: "var(--app-text-color-secondary)",
                      fontStyle: "italic",
                    }}
                  >
                    {interimTranscript}
                  </p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Detected References Panel (compact + expandable rows) */}
        {detectedReferences.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--app-border-color)",
              maxHeight: detectedPanelCollapsed ? "52px" : "320px",
              overflowY: detectedPanelCollapsed ? "hidden" : "auto",
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetectedPanelCollapsed((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setDetectedPanelCollapsed((v) => !v);
              }}
              style={{
                padding: "var(--spacing-2) var(--spacing-4)",
                backgroundColor: "var(--app-header-bg)",
                fontSize: "0.85rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                {detectedPanelCollapsed ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                <span>Detected References ({detectedReferences.length})</span>
              </div>
              <span style={{ color: "var(--app-text-color-secondary)", fontWeight: 500 }}>
                {detectedPanelCollapsed ? "Expand" : "Collapse"}
              </span>
            </div>

            {!detectedPanelCollapsed && (
              <div style={{ padding: "var(--spacing-3) var(--spacing-4)" }}>
                {recentDetectedReferences.map((ref) => renderDetectedReferenceRow(ref))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default SmartVersesPage;

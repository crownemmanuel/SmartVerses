import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  FaSun,
  FaMoon,
  FaQuestionCircle,
  FaMicrophone,
  FaPlus,
  FaListUl,
  FaObjectGroup,
} from "react-icons/fa";
import { LiveSlidesWebSocket } from "../services/liveSlideService";
import { SlideBoundary } from "../utils/liveSlideParser";
import { LiveSlide, WsTranscriptionStream } from "../types/liveSlides";
import "../App.css";

// Theme-aware styles factory
const getNotepadStyles = (isDark: boolean) => {
  const bg = isDark ? "#0d0d0d" : "#ffffff";
  const bgSecondary = isDark ? "#1a1a1a" : "#f5f5f5";
  const border = isDark ? "#2a2a2a" : "#e0e0e0";
  const text = isDark ? "#e0e0e0" : "#1a1a1a";
  const textSecondary = isDark ? "#666" : "#888";
  const textMuted = isDark ? "#555" : "#999";
  const buttonBg = isDark ? "#2a2a2a" : "#e8e8e8";
  const buttonBorder = isDark ? "#3a3a3a" : "#d0d0d0";

  return {
    container: {
      height: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column" as const,
      backgroundColor: bg,
      color: text,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      overflow: "hidden",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 20px",
      backgroundColor: bgSecondary,
      borderBottom: `1px solid ${border}`,
      flexShrink: 0,
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    headerRight: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    toolbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 20px",
      backgroundColor: bgSecondary,
      borderBottom: `1px solid ${border}`,
      gap: "12px",
      flexShrink: 0,
      fontSize: "0.8rem",
      color: textSecondary,
    },
    toolbarLeft: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap" as const,
    },
    toolbarButton: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "6px 12px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.8rem",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap" as const,
    },
    toolbarButtonActive: {
      backgroundColor: "#3B82F6",
      color: "white",
      border: "1px solid #3B82F6",
    },
    toolbarHint: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap" as const,
      fontSize: "0.78rem",
      color: textSecondary,
    },
    sessionBadge: {
      backgroundColor: "#3B82F6",
      color: "white",
      padding: "4px 10px",
      borderRadius: "12px",
      fontSize: "0.75rem",
      fontWeight: 600,
      letterSpacing: "0.02em",
    },
    connectionStatus: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "0.8rem",
      color: textSecondary,
    },
    statusDot: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      animation: "pulse 2s infinite",
    },
    copyButton: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "8px 16px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.85rem",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      transition: "all 0.2s ease",
    },
    helpButton: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "8px 12px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.9rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      minWidth: "40px",
    },
    transcriptionToggleButton: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "8px 12px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.85rem",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap" as const,
    },
    themeToggle: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "8px 12px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.9rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
      minWidth: "40px",
    },
    helpPopup: {
      position: "absolute" as const,
      top: "60px",
      right: "20px",
      backgroundColor: bgSecondary,
      border: `1px solid ${border}`,
      borderRadius: "8px",
      padding: "16px",
      maxWidth: "400px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      zIndex: 1000,
    },
    helpTitle: {
      fontSize: "1rem",
      fontWeight: 600,
      marginBottom: "12px",
      color: text,
    },
    helpText: {
      fontSize: "0.85rem",
      lineHeight: "1.6",
      color: textSecondary,
      marginBottom: "8px",
    },
    helpExample: {
      fontSize: "0.8rem",
      fontFamily: "monospace",
      backgroundColor: bg,
      padding: "8px",
      borderRadius: "4px",
      marginTop: "8px",
      color: text,
      whiteSpace: "pre-wrap" as const,
    },
    helpButtonAction: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "8px 16px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.85rem",
      marginTop: "12px",
      width: "100%",
      transition: "all 0.2s ease",
    },
    editorWrapper: {
      flex: 1,
      display: "flex",
      overflow: "hidden",
      position: "relative" as const,
    },
    lineNumbers: {
      width: "50px",
      padding: "16px 8px",
      backgroundColor: bg,
      borderRight: `1px solid ${border}`,
      textAlign: "right" as const,
      fontSize: "0.85rem",
      lineHeight: "1.6",
      color: textMuted,
      overflow: "hidden",
      userSelect: "none" as const,
      flexShrink: 0,
    },
    colorIndicators: {
      width: "6px",
      backgroundColor: bg,
      flexShrink: 0,
      position: "relative" as const,
      overflow: "hidden",
    },
    textareaWrapper: {
      flex: 1,
      position: "relative" as const,
      overflow: "hidden",
    },
    textarea: {
      width: "100%",
      height: "100%",
      padding: "16px",
      backgroundColor: "transparent",
      color: text,
      border: "none",
      outline: "none",
      resize: "none" as const,
      fontFamily: "inherit",
      fontSize: "1rem",
      lineHeight: "1.6",
      caretColor: "#3B82F6",
    },
    transcriptionPanel: {
      width: "30%",
      minWidth: "280px",
      maxWidth: "520px",
      borderLeft: `1px solid ${border}`,
      backgroundColor: bgSecondary,
      display: "flex",
      flexDirection: "column" as const,
      overflow: "hidden",
    },
    transcriptionPanelHeader: {
      padding: "12px",
      borderBottom: `1px solid ${border}`,
      display: "flex",
      flexDirection: "column" as const,
      gap: "10px",
    },
    transcriptionHeaderTopRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
    },
    transcriptionTitle: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "0.9rem",
      fontWeight: 600,
      color: text,
    },
    transcriptionFilters: {
      display: "flex",
      gap: "10px",
      flexWrap: "wrap" as const,
      fontSize: "0.8rem",
      color: textSecondary,
    },
    transcriptionFilterLabel: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      cursor: "pointer",
      userSelect: "none" as const,
    },
    transcriptionScroll: {
      flex: 1,
      overflowY: "auto" as const,
      padding: "12px",
      display: "flex",
      flexDirection: "column" as const,
      gap: "10px",
    },
    transcriptionInterim: {
      padding: "10px",
      borderRadius: "8px",
      border: `1px dashed ${border}`,
      backgroundColor: bg,
      color: textSecondary,
      fontSize: "0.85rem",
      lineHeight: "1.4",
    },
    transcriptionChunkCard: {
      padding: "10px",
      borderRadius: "10px",
      border: `1px solid ${border}`,
      backgroundColor: bg,
      display: "flex",
      flexDirection: "column" as const,
      gap: "8px",
    },
    transcriptionChunkTopRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
    },
    transcriptionChunkMeta: {
      fontSize: "0.75rem",
      color: textMuted,
    },
    transcriptionAddButton: {
      backgroundColor: buttonBg,
      color: text,
      border: `1px solid ${buttonBorder}`,
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "0.8rem",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      whiteSpace: "nowrap" as const,
    },
    transcriptionChunkText: {
      fontSize: "0.9rem",
      color: text,
      lineHeight: "1.45",
      whiteSpace: "pre-wrap" as const,
      wordBreak: "break-word" as const,
    },
    transcriptionSubsection: {
      borderTop: `1px solid ${border}`,
      paddingTop: "8px",
      fontSize: "0.82rem",
      color: textSecondary,
      lineHeight: "1.35",
      display: "flex",
      flexDirection: "column" as const,
      gap: "6px",
    },
    footer: {
      padding: "8px 20px",
      backgroundColor: bgSecondary,
      borderTop: `1px solid ${border}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: "0.8rem",
      color: textSecondary,
      flexShrink: 0,
    },
    slidesPreview: {
      display: "flex",
      gap: "8px",
      alignItems: "center",
    },
    slideIndicator: {
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "0.75rem",
      fontWeight: 500,
    },
    border: border,
    input: {
      background: bg,
      color: text,
    },
  };
};

const SOFT_BREAK_MARKER = "\u200B";
const BULLET_SYMBOL = "•";
const BULLET_PREFIX = `  ${BULLET_SYMBOL} `;
const SLIDE_COLORS = [
  "#3B82F6", // Blue
  "#F59E0B", // Yellow/Amber
  "#EC4899", // Pink
  "#10B981", // Green
  "#8B5CF6", // Purple
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

const stripSoftBreakMarker = (line: string) => {
  let idx = 0;
  while (line[idx] === SOFT_BREAK_MARKER) idx += 1;
  return line.slice(idx);
};

const splitSoftBreakMarker = (line: string) => {
  let idx = 0;
  while (line[idx] === SOFT_BREAK_MARKER) idx += 1;
  return {
    marker: line.slice(0, idx),
    content: line.slice(idx),
  };
};

const isRawIndentedLine = (line: string) =>
  line.startsWith("\t") || line.startsWith("    ");

const isDisplayIndentedLine = (line: string) =>
  isRawIndentedLine(stripSoftBreakMarker(line));

const buildRawTextFromDisplay = (displayText: string) => {
  const displayLines = displayText.split("\n");
  const rawLines: string[] = [];
  const rawLineMap: Array<number | null> = [];
  let hasContent = false;

  displayLines.forEach((line, index) => {
    const cleanedLine = stripSoftBreakMarker(line);
    if (cleanedLine.trim() === "") return;

    const isSoftBreak = line.startsWith(SOFT_BREAK_MARKER);
    const isIndented = isDisplayIndentedLine(line);

    if (hasContent && !(isSoftBreak || isIndented)) {
      rawLines.push("");
      rawLineMap.push(null);
    }

    rawLines.push(cleanedLine);
    rawLineMap.push(index);
    hasContent = true;
  });

  return { rawText: rawLines.join("\n"), rawLineMap, rawLines };
};

const calculateEditorBoundariesFromRaw = (rawText: string): SlideBoundary[] => {
  const boundaries: SlideBoundary[] = [];
  const lines = rawText.split("\n");
  let colorIndex = 0;
  let slideIndex = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (isRawIndentedLine(line)) {
      boundaries.push({
        startLine: i,
        endLine: i,
        color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        slideIndex,
      });
      colorIndex += 1;
      slideIndex += 1;
      i += 1;
      continue;
    }

    let j = i + 1;
    let hasChildren = false;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "") break;
      if (isRawIndentedLine(nextLine)) {
        hasChildren = true;
        j += 1;
        continue;
      }
      break;
    }

    if (!hasChildren) {
      let k = i;
      while (k < lines.length) {
        const currentLine = lines[k];
        if (currentLine.trim() === "") break;
        if (isRawIndentedLine(currentLine)) break;
        k += 1;
      }

      boundaries.push({
        startLine: i,
        endLine: k - 1,
        color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        slideIndex,
      });
      colorIndex += 1;
      slideIndex += 1;
      i = k;
      continue;
    }

    boundaries.push({
      startLine: i,
      endLine: i,
      color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
      slideIndex,
    });
    colorIndex += 1;
    slideIndex += 1;

    for (let childIdx = i + 1; childIdx < j; childIdx += 1) {
      if (!isRawIndentedLine(lines[childIdx])) continue;
      boundaries.push({
        startLine: i,
        endLine: childIdx,
        color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        slideIndex,
      });
      colorIndex += 1;
      slideIndex += 1;
    }

    i = j;
  }

  return boundaries;
};

const mapRawBoundariesToDisplay = (
  rawBoundaries: SlideBoundary[],
  rawLineMap: Array<number | null>
) =>
  rawBoundaries
    .map((boundary) => {
      const startLine = rawLineMap[boundary.startLine];
      const endLine = rawLineMap[boundary.endLine];
      if (startLine == null || endLine == null) return null;
      return { ...boundary, startLine, endLine };
    })
    .filter((boundary): boundary is SlideBoundary => boundary !== null);

const convertRawTextToDisplay = (rawText: string) => {
  const lines = rawText.split("\n");
  const displayLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (isRawIndentedLine(line)) {
      displayLines.push(line);
      i += 1;
      continue;
    }

    let j = i + 1;
    let hasChildren = false;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "") break;
      if (isRawIndentedLine(nextLine)) {
        hasChildren = true;
        j += 1;
        continue;
      }
      break;
    }

    if (hasChildren) {
      displayLines.push(line);
      for (let k = i + 1; k < j; k += 1) {
        if (lines[k].trim() !== "") {
          displayLines.push(lines[k]);
        }
      }
      i = j;
      continue;
    }

    let k = i;
    while (k < lines.length) {
      const currentLine = lines[k];
      if (currentLine.trim() === "") break;
      if (isRawIndentedLine(currentLine)) break;
      const prefix = k === i ? "" : SOFT_BREAK_MARKER;
      displayLines.push(prefix + currentLine);
      k += 1;
    }
    i = k;
  }

  return displayLines.join("\n");
};

const getLineRangeAt = (value: string, pos: number) => {
  const lineStart = value.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nextBreak = value.indexOf("\n", pos);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd };
};

const getLineIndexAt = (value: string, pos: number) =>
  value.slice(0, Math.max(0, pos)).split("\n").length - 1;

const getLineStartIndices = (value: string) => {
  const indices = [0];
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "\n") indices.push(i + 1);
  }
  return indices;
};

const lineHasBulletPrefix = (line: string) =>
  stripSoftBreakMarker(line).startsWith(BULLET_PREFIX);


const LiveSlidesNotepad: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();

  // Theme state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("liveSlidesNotepadTheme");
    return saved === "light" ? false : true; // Default to dark
  });

  const [displayText, setDisplayText] = useState("");
  const [slides, setSlides] = useState<LiveSlide[]>([]);
  const [boundaries, setBoundaries] = useState<SlideBoundary[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState("");
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [showLiveTranscription, setShowLiveTranscription] = useState(false);
  const [liveInterimTranscript, setLiveInterimTranscript] = useState("");
  const [liveTranscriptChunks, setLiveTranscriptChunks] = useState<WsTranscriptionStream[]>([]);
  const [filterTranscript, setFilterTranscript] = useState(true);
  const [filterReferences, setFilterReferences] = useState(false);
  const [filterKeyPoints, setFilterKeyPoints] = useState(false);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const [isBulletMode, setIsBulletMode] = useState(false);
  const [canGroupSelection, setCanGroupSelection] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const colorIndicatorsRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<LiveSlidesWebSocket | null>(null);
  // Avoid stale closures in WS handlers (we intentionally do NOT re-bind on every keystroke).
  const rawTextRef = useRef<string>("");
  const lastLocalEditAtRef = useRef<number>(0);

  // Get WebSocket connection info from URL params
  // The server now serves both HTTP and WebSocket on the same port, with WS at /ws path
  const wsHost = searchParams.get("wsHost") || "localhost";
  const wsPort = parseInt(searchParams.get("wsPort") || "9876", 10);
  const wsUrl = `ws://${wsHost}:${wsPort}/ws`;

  // Get theme-aware styles
  const notepadStyles = useMemo(
    () => getNotepadStyles(isDarkMode),
    [isDarkMode]
  );

  const normalizedTranscriptQuery = transcriptSearchQuery.trim().toLowerCase();

  // Toggle theme
  const toggleTheme = useCallback(() => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem("liveSlidesNotepadTheme", newTheme ? "dark" : "light");
  }, [isDarkMode]);

  // Connect to WebSocket
  useEffect(() => {
    if (!sessionId) return;

    const ws = new LiveSlidesWebSocket(wsUrl, sessionId, "notepad");
    wsRef.current = ws;

    ws.connect()
      .then(() => {
        setIsConnected(true);
      })
      .catch((err) => {
        console.error("Failed to connect:", err);
        setIsConnected(false);
      });

    // Listen for slides updates (from other notepads or initial state)
    const unsubscribe = ws.onSlidesUpdate((update) => {
      if (update.session_id === sessionId) {
        setSlides(update.slides);
        const currentRawText = rawTextRef.current;
        const focused = document.activeElement === textareaRef.current;
        const recentlyEditedLocally =
          Date.now() - lastLocalEditAtRef.current < 800;

        // Update if different and we're not actively typing.
        // This improves main-app -> web reliability even when the textarea is focused,
        // while still preventing overwrites during active local edits.
        const shouldUpdate =
          update.raw_text !== currentRawText &&
          (!focused || !recentlyEditedLocally || !currentRawText.trim().length);

        if (shouldUpdate) {
          const nextDisplayText = convertRawTextToDisplay(update.raw_text);
          const { rawLineMap } = buildRawTextFromDisplay(nextDisplayText);
          const rawBoundaries = calculateEditorBoundariesFromRaw(update.raw_text);
          setDisplayText(nextDisplayText);
          setBoundaries(mapRawBoundariesToDisplay(rawBoundaries, rawLineMap));
          rawTextRef.current = update.raw_text;
        }
      }
    });

    const unsubscribeTranscription = ws.onMessage((message) => {
      if (message.type !== "transcription_stream") return;

      const m = message as WsTranscriptionStream;
      if (m.kind === "interim") {
        setLiveInterimTranscript(m.text || "");
        return;
      }

      if (m.kind === "final") {
        setLiveInterimTranscript("");
        setLiveTranscriptChunks((prev) => {
          const next = [...prev, m].slice(-150);
          return next;
        });
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTranscription();
      ws.disconnect();
    };
  }, [sessionId, wsUrl]);

  const applyDisplayTextUpdate = useCallback(
    (newDisplayText: string, selectionStart?: number, selectionEnd?: number) => {
      lastLocalEditAtRef.current = Date.now();
      setDisplayText(newDisplayText);

      const { rawText, rawLineMap } = buildRawTextFromDisplay(newDisplayText);
      rawTextRef.current = rawText;
      const rawBoundaries = calculateEditorBoundariesFromRaw(rawText);
      setBoundaries(mapRawBoundariesToDisplay(rawBoundaries, rawLineMap));

      if (wsRef.current && wsRef.current.isConnected) {
        wsRef.current.sendTextUpdate(rawText);
      }

      if (
        textareaRef.current &&
        typeof selectionStart === "number" &&
        typeof selectionEnd === "number"
      ) {
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.selectionStart = selectionStart;
          textareaRef.current.selectionEnd = selectionEnd;
        });
      }
    },
    []
  );

  // Update boundaries when text changes
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      applyDisplayTextUpdate(e.target.value);
    },
    [applyDisplayTextUpdate]
  );

  const insertTranscriptChunkIntoNotepad = useCallback(
    (chunkText: string) => {
      const cleaned = (chunkText || "").trim();
      if (!cleaned) return;

      const el = textareaRef.current;
      const current = displayText;

      const safeStart = el?.selectionStart ?? current.length;
      const safeEnd = el?.selectionEnd ?? current.length;

      const before = current.slice(0, safeStart);
      const after = current.slice(safeEnd);

      const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";

      const nextValue = before + prefix + cleaned + suffix + after;
      const nextPos = (before + prefix + cleaned).length;

      applyDisplayTextUpdate(nextValue, nextPos, nextPos);
      el?.focus();
    },
    [applyDisplayTextUpdate, displayText]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const el = e.currentTarget;
      const value = el.value;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;

      if (e.key === "Enter") {
        e.preventDefault();

        const { lineStart, lineEnd } = getLineRangeAt(value, start);
        const line = value.slice(lineStart, lineEnd);
        const { marker, content } = splitSoftBreakMarker(line);
        const hasBullet = content.startsWith(BULLET_PREFIX);
        const isBulletEmpty =
          hasBullet && content.slice(BULLET_PREFIX.length).trim().length === 0;

        if (isBulletMode) {
          if (isBulletEmpty) {
            const cleanedLine = `${marker}${content.slice(BULLET_PREFIX.length)}`;
            const updatedValue =
              value.slice(0, lineStart) + cleanedLine + value.slice(lineEnd);
            const insert = "\n";
            const insertPos = lineStart + cleanedLine.length;
            const nextValue =
              updatedValue.slice(0, insertPos) +
              insert +
              updatedValue.slice(insertPos);
            const nextPos = insertPos + insert.length;
            setIsBulletMode(false);
            applyDisplayTextUpdate(nextValue, nextPos, nextPos);
            return;
          }

          const insert = `\n${SOFT_BREAK_MARKER}${BULLET_PREFIX}`;
          const nextValue = value.slice(0, start) + insert + value.slice(end);
          const nextPos = start + insert.length;
          applyDisplayTextUpdate(nextValue, nextPos, nextPos);
          return;
        }

        const insert = e.shiftKey ? `\n${SOFT_BREAK_MARKER}` : "\n";
        const nextValue = value.slice(0, start) + insert + value.slice(end);
        const nextPos = start + insert.length;
        applyDisplayTextUpdate(nextValue, nextPos, nextPos);
        return;
      }

      if (e.key === "Backspace" && isBulletMode && start === end) {
        const { lineStart, lineEnd } = getLineRangeAt(value, start);
        const line = value.slice(lineStart, lineEnd);
        const { marker, content } = splitSoftBreakMarker(line);

        if (content.startsWith(BULLET_PREFIX)) {
          const prefixLength = marker.length + BULLET_PREFIX.length;
          if (start === lineStart + prefixLength) {
            e.preventDefault();
            const cleanedLine = `${marker}${content.slice(BULLET_PREFIX.length)}`;
            const nextValue =
              value.slice(0, lineStart) + cleanedLine + value.slice(lineEnd);
            const nextPos = lineStart + marker.length;
            setIsBulletMode(false);
            applyDisplayTextUpdate(nextValue, nextPos, nextPos);
          }
        }
      }

      // Browsers use Tab for focus navigation. Intercept it so users can create
      // sub-items (lines starting with Tab) inside the notepad.
      if (e.key !== "Tab") return;

      e.preventDefault();

      const TAB = "\t"; // matches parsing rules (also supports 4 spaces)

      const lineStartIdx = (idx: number) => {
        const i = value.lastIndexOf("\n", Math.max(0, idx - 1));
        return i === -1 ? 0 : i + 1;
      };

      const hasMultilineSelection =
        start !== end && value.slice(start, end).includes("\n");

      const outdentLine = (line: string) => {
        const { marker, content } = splitSoftBreakMarker(line);
        if (content.startsWith("\t")) return `${marker}${content.slice(1)}`;
        if (content.startsWith("    ")) return `${marker}${content.slice(4)}`;
        return line;
      };

      const indentLine = (line: string) => {
        const { marker, content } = splitSoftBreakMarker(line);
        if (content.length === 0) return line;
        return `${marker}${TAB}${content}`;
      };

      if (hasMultilineSelection || e.shiftKey) {
        const blockStart = lineStartIdx(start);
        const blockEndNewline = value.indexOf("\n", end);
        const blockEnd =
          blockEndNewline === -1 ? value.length : blockEndNewline;

        const block = value.slice(blockStart, blockEnd);
        const lines = block.split("\n");

        const nextLines = e.shiftKey ? lines.map(outdentLine) : lines.map(indentLine);
        const newBlock = nextLines.join("\n");
        const newValue =
          value.slice(0, blockStart) + newBlock + value.slice(blockEnd);

        applyDisplayTextUpdate(newValue, blockStart, blockStart + newBlock.length);
        return;
      }

      const newValue = value.slice(0, start) + TAB + value.slice(end);
      const newPos = start + TAB.length;
      applyDisplayTextUpdate(newValue, newPos, newPos);
    },
    [applyDisplayTextUpdate, isBulletMode]
  );

  const handleSelectionChange = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.currentTarget;
      const value = target.value;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const lineStarts = getLineStartIndices(value);
      let startLine = getLineIndexAt(value, start);
      let endLine = getLineIndexAt(value, end);

      if (end > start && lineStarts[endLine] === end) {
        endLine = Math.max(startLine, endLine - 1);
      }

      setCanGroupSelection(endLine > startLine);

      const { lineStart, lineEnd } = getLineRangeAt(value, start);
      const line = value.slice(lineStart, lineEnd);
      setIsBulletMode(lineHasBulletPrefix(line));
    },
    []
  );

  const handleGroupSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    const value = displayText;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;

    const lineStarts = getLineStartIndices(value);
    let startLine = getLineIndexAt(value, start);
    let endLine = getLineIndexAt(value, end);

    if (end > start && lineStarts[endLine] === end) {
      endLine = Math.max(startLine, endLine - 1);
    }

    if (endLine <= startLine) return;

    const lines = value.split("\n");
    for (let i = startLine + 1; i <= endLine; i += 1) {
      const current = lines[i] ?? "";
      const cleaned = stripSoftBreakMarker(current);
      if (cleaned.trim().length === 0) continue;
      if (!current.startsWith(SOFT_BREAK_MARKER)) {
        lines[i] = `${SOFT_BREAK_MARKER}${current}`;
      }
    }

    const nextValue = lines.join("\n");
    const nextLineStarts = getLineStartIndices(nextValue);
    const safeEndLine = Math.min(endLine, nextLineStarts.length - 1);
    const newStart = nextLineStarts[startLine] ?? 0;
    const newEnd =
      (nextLineStarts[safeEndLine] ?? 0) + (lines[safeEndLine]?.length ?? 0);

    applyDisplayTextUpdate(nextValue, newStart, newEnd);
  }, [applyDisplayTextUpdate, displayText]);

  const handleToggleBulletMode = useCallback(() => {
    const el = textareaRef.current;
    if (!el) {
      setIsBulletMode((prev) => !prev);
      return;
    }

    const value = displayText;
    const start = el.selectionStart ?? 0;
    const { lineStart, lineEnd } = getLineRangeAt(value, start);
    const line = value.slice(lineStart, lineEnd);
    const { marker, content } = splitSoftBreakMarker(line);

    if (!isBulletMode) {
      if (content.startsWith(BULLET_PREFIX)) {
        setIsBulletMode(true);
        return;
      }

      const nextLine = `${marker}${BULLET_PREFIX}${content}`;
      const nextValue = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
      const insertionIndex = lineStart + marker.length;
      const nextPos =
        start >= insertionIndex
          ? start + BULLET_PREFIX.length
          : insertionIndex + BULLET_PREFIX.length;
      setIsBulletMode(true);
      applyDisplayTextUpdate(nextValue, nextPos, nextPos);
      return;
    }

    if (content.startsWith(BULLET_PREFIX)) {
      const nextLine = `${marker}${content.slice(BULLET_PREFIX.length)}`;
      const nextValue = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
      const nextPos = Math.max(lineStart + marker.length, start - BULLET_PREFIX.length);
      setIsBulletMode(false);
      applyDisplayTextUpdate(nextValue, nextPos, nextPos);
      return;
    }

    setIsBulletMode(false);
  }, [applyDisplayTextUpdate, displayText, isBulletMode]);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;

    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = target.scrollTop;
    }
    if (colorIndicatorsRef.current) {
      colorIndicatorsRef.current.scrollTop = target.scrollTop;
    }
  }, []);

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    const lines = displayText.split("\n");
    return lines.map((_, i) => i + 1);
  }, [displayText]);

  // Copy URL to clipboard
  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      setCopyFeedback("Failed to copy");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  }, []);

  // Calculate line height for color indicators
  const lineHeight = 1.6 * 16; // 1.6rem at 16px base

  return (
    <div style={notepadStyles.container}>
      {/* Header */}
      <div style={notepadStyles.header}>
        <div style={notepadStyles.headerLeft}>
          <h1 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 600 }}>
            Live Slides
          </h1>
          <span style={notepadStyles.sessionBadge}>
            {sessionId?.slice(0, 8)}...
          </span>
          <div style={notepadStyles.connectionStatus}>
            <span
              style={{
                ...notepadStyles.statusDot,
                backgroundColor: isConnected ? "#10B981" : "#EF4444",
              }}
            />
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
        <div style={notepadStyles.headerRight}>
          <button
            onClick={() => setShowHelpPopup(!showHelpPopup)}
            style={notepadStyles.helpButton}
            title="How slides work"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDarkMode
                ? "#3a3a3a"
                : "#d8d8d8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDarkMode
                ? "#2a2a2a"
                : "#e8e8e8";
            }}
          >
            <FaQuestionCircle />
          </button>
          <button
            onClick={() => setShowLiveTranscription((v) => !v)}
            style={{
              ...notepadStyles.transcriptionToggleButton,
              backgroundColor: showLiveTranscription
                ? "#3B82F6"
                : notepadStyles.transcriptionToggleButton.backgroundColor,
              color: showLiveTranscription
                ? "white"
                : notepadStyles.transcriptionToggleButton.color,
              border: showLiveTranscription
                ? "1px solid #3B82F6"
                : notepadStyles.transcriptionToggleButton.border,
            }}
            title="Toggle live transcription panel"
            onMouseEnter={(e) => {
              if (!showLiveTranscription) {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? "#3a3a3a"
                  : "#d8d8d8";
              }
            }}
            onMouseLeave={(e) => {
              if (!showLiveTranscription) {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? "#2a2a2a"
                  : "#e8e8e8";
              }
            }}
          >
            <FaMicrophone />
            Live Transcription
          </button>
          {showHelpPopup && (
            <div style={notepadStyles.helpPopup}>
              <div style={notepadStyles.helpTitle}>How Slides Work</div>
              <div style={notepadStyles.helpText}>
                <strong>Enter</strong> = New slide (each line is a slide)
              </div>
              <div style={notepadStyles.helpText}>
                <strong>Shift + Enter</strong> or <strong>Group</strong> = Keep
                lines on the same slide
              </div>
              <div style={notepadStyles.helpText}>
                <strong>Blank lines</strong> are ignored
              </div>
              <div style={notepadStyles.helpText}>
                <strong>Tab/Indent</strong> = Title + subtitle slides (unchanged)
              </div>
              <div style={notepadStyles.helpText}>
                <strong>Bullets</strong> button starts a list; Enter continues;
                Enter twice or Backspace exits.
              </div>
              <div style={notepadStyles.helpExample}>
                {`Slide one (new slide)
Slide two (new slide)

Grouped lines (Shift+Enter or Group)
Grouped line A
Grouped line B

Title (Tab example)
	Subtitle 1
	Subtitle 2`}
              </div>
              <button
                onClick={() => {
                  const exampleText = `Slide one (new slide)
Slide two (new slide)

Grouped line A
${SOFT_BREAK_MARKER}Grouped line B

Title
	Subtitle 1
	Subtitle 2

Bullets example
${BULLET_PREFIX}First point
${SOFT_BREAK_MARKER}${BULLET_PREFIX}Second point`;
                  applyDisplayTextUpdate(exampleText, exampleText.length, exampleText.length);
                  setShowHelpPopup(false);
                  if (textareaRef.current) {
                    textareaRef.current.focus();
                  }
                }}
                style={notepadStyles.helpButtonAction}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkMode
                    ? "#3a3a3a"
                    : "#d8d8d8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkMode
                    ? "#2a2a2a"
                    : "#e8e8e8";
                }}
              >
                Use This as Template
              </button>
            </div>
          )}
          <button
            onClick={toggleTheme}
            style={notepadStyles.themeToggle}
            title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDarkMode
                ? "#3a3a3a"
                : "#d8d8d8";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDarkMode
                ? "#2a2a2a"
                : "#e8e8e8";
            }}
          >
            {isDarkMode ? <FaSun /> : <FaMoon />}
          </button>
          <button
            style={{
              ...notepadStyles.copyButton,
              backgroundColor: copyFeedback ? "#10B981" : undefined,
            }}
            onClick={handleCopyUrl}
            onMouseEnter={(e) => {
              if (!copyFeedback) {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? "#3a3a3a"
                  : "#d8d8d8";
              }
            }}
            onMouseLeave={(e) => {
              if (!copyFeedback) {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? "#2a2a2a"
                  : "#e8e8e8";
              }
            }}
          >
            📋 {copyFeedback || "Copy URL"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={notepadStyles.toolbar}>
        <div style={notepadStyles.toolbarLeft}>
          <button
            onClick={handleGroupSelection}
            disabled={!canGroupSelection}
            style={{
              ...notepadStyles.toolbarButton,
              opacity: canGroupSelection ? 1 : 0.5,
              cursor: canGroupSelection ? "pointer" : "not-allowed",
            }}
            title="Group selected lines into one slide"
          >
            <FaObjectGroup />
            Group
          </button>
          <button
            onClick={handleToggleBulletMode}
            style={{
              ...notepadStyles.toolbarButton,
              ...(isBulletMode ? notepadStyles.toolbarButtonActive : {}),
            }}
            title="Toggle bullet list"
          >
            <FaListUl />
            Bullets
          </button>
        </div>
        <div style={notepadStyles.toolbarHint}>
          <span>Enter = new slide</span>
          <span>Shift+Enter = same slide</span>
          <span>Blank lines ignored</span>
          <span>Tab = title/subtitle</span>
        </div>
      </div>

      {/* Editor */}
      <div style={notepadStyles.editorWrapper}>
        {/* Color indicators */}
        <div
          ref={colorIndicatorsRef}
          style={{
            ...notepadStyles.colorIndicators,
            paddingTop: "16px",
            overflowY: "hidden",
          }}
        >
          {lineNumbers.map((_, idx) => {
            const boundary = boundaries.find(
              (b) => idx >= b.startLine && idx <= b.endLine
            );
            return (
              <div
                key={idx}
                style={{
                  height: `${lineHeight}px`,
                  backgroundColor: boundary?.color || "transparent",
                  transition: "background-color 0.15s ease",
                }}
              />
            );
          })}
        </div>

        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          style={{
            ...notepadStyles.lineNumbers,
            overflowY: "hidden",
          }}
        >
          {lineNumbers.map((num) => (
            <div key={num} style={{ height: `${lineHeight}px` }}>
              {num}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <div style={notepadStyles.textareaWrapper}>
          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelectionChange}
            onScroll={handleScroll}
            style={notepadStyles.textarea}
            placeholder={`Start typing your slides here...

HOW IT WORKS:
• Enter = new slide (each line)
• Shift+Enter or Group = same slide
• Blank lines are ignored
• Tab/indent = title + subtitle slides
• Use Bullets for dotted lists

EXAMPLES:

New slide per line:
Line one
Line two

Grouped lines (same slide):
Line A
Line B

With tabs (title + subtitles):
Title
	Subtitle 1
	Subtitle 2`}
            spellCheck={false}
            autoFocus
          />
        </div>

        {/* Live transcription panel */}
        {showLiveTranscription && (
          <div style={notepadStyles.transcriptionPanel}>
            <div style={notepadStyles.transcriptionPanelHeader}>
              <div style={notepadStyles.transcriptionHeaderTopRow}>
                <div style={notepadStyles.transcriptionTitle}>
                  <FaMicrophone />
                  Live Transcriptions
                </div>
                <div style={{ fontSize: "0.75rem", color: notepadStyles.footer.color }}>
                  {isConnected ? "WS connected" : "WS disconnected"}
                </div>
              </div>

              <div style={notepadStyles.transcriptionFilters}>
                <div style={{ flex: 1, minWidth: "180px" }}>
                  <input
                    type="text"
                    value={transcriptSearchQuery}
                    onChange={(e) => setTranscriptSearchQuery(e.target.value)}
                    placeholder="Search transcript..."
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: `1px solid ${notepadStyles.border}`,
                      background: notepadStyles.input.background,
                      color: notepadStyles.input.color,
                      fontSize: "0.8rem",
                    }}
                  />
                </div>
                <label style={notepadStyles.transcriptionFilterLabel}>
                  <input
                    type="checkbox"
                    checked={filterTranscript}
                    onChange={(e) => setFilterTranscript(e.target.checked)}
                  />
                  Transcript
                </label>
                <label style={notepadStyles.transcriptionFilterLabel}>
                  <input
                    type="checkbox"
                    checked={filterReferences}
                    onChange={(e) => setFilterReferences(e.target.checked)}
                  />
                  Scripture refs
                </label>
                <label style={notepadStyles.transcriptionFilterLabel}>
                  <input
                    type="checkbox"
                    checked={filterKeyPoints}
                    onChange={(e) => setFilterKeyPoints(e.target.checked)}
                  />
                  Key points
                </label>
              </div>
            </div>

            <div style={notepadStyles.transcriptionScroll}>
              {filterTranscript &&
                liveInterimTranscript.trim().length > 0 &&
                (!normalizedTranscriptQuery ||
                  liveInterimTranscript.toLowerCase().includes(normalizedTranscriptQuery)) && (
                <div style={notepadStyles.transcriptionInterim}>
                  {liveInterimTranscript}
                </div>
              )}

              {liveTranscriptChunks.length === 0 ? (
                <div style={{ color: notepadStyles.footer.color, fontSize: "0.85rem" }}>
                  Waiting for transcription stream…
                  <div style={{ marginTop: "6px", fontSize: "0.78rem", opacity: 0.9 }}>
                    Enable streaming in SmartVerses Settings → Transcription Settings.
                  </div>
                </div>
              ) : (
                liveTranscriptChunks
                  .slice()
                  .reverse()
                  .map((m) => {
                    const showAny =
                      filterTranscript ||
                      (filterReferences && (m.scripture_references?.length || 0) > 0) ||
                      (filterKeyPoints && (m.key_points?.length || 0) > 0);

                    if (!showAny) return null;

                    const ts = new Date(m.timestamp).toLocaleTimeString();
                    const chunkText = m.segment?.text || m.text;
                    const matchesQuery =
                      !normalizedTranscriptQuery ||
                      chunkText.toLowerCase().includes(normalizedTranscriptQuery);

                    if (!matchesQuery) return null;

                    return (
                      <div
                        key={(m.segment?.id || `${m.timestamp}`) + m.kind}
                        style={notepadStyles.transcriptionChunkCard}
                      >
                        <div style={notepadStyles.transcriptionChunkTopRow}>
                          <div style={notepadStyles.transcriptionChunkMeta}>
                            {ts} · {m.engine}
                          </div>
                          {filterTranscript && (
                            <button
                              style={notepadStyles.transcriptionAddButton}
                              onClick={() => insertTranscriptChunkIntoNotepad(chunkText)}
                              title="Add this chunk to the notepad as a new slide"
                            >
                              <FaPlus /> Add
                            </button>
                          )}
                        </div>

                        {filterTranscript && (
                          <div style={notepadStyles.transcriptionChunkText}>{chunkText}</div>
                        )}

                        {filterReferences &&
                          (m.scripture_references?.length || 0) > 0 && (
                            <div style={notepadStyles.transcriptionSubsection}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: notepadStyles.footer.color,
                                }}
                              >
                                Scripture refs
                              </div>
                              <div>{m.scripture_references?.join(", ")}</div>
                            </div>
                          )}

                        {filterKeyPoints && (m.key_points?.length || 0) > 0 && (
                          <div style={notepadStyles.transcriptionSubsection}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: notepadStyles.footer.color,
                              }}
                            >
                              Key points
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                              }}
                            >
                              {m.key_points?.map((kp, i) => (
                                <div key={`${m.timestamp}-kp-${i}`}>
                                  <span style={{ opacity: 0.9 }}>
                                    [{kp.category}]
                                  </span>{" "}
                                  {kp.text}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={notepadStyles.footer}>
        <div>
          {displayText.split("\n").length} lines ·{" "}
          {slides.length || boundaries.length}{" "}
          slides
        </div>
        <div style={notepadStyles.slidesPreview}>
          {boundaries.slice(0, 8).map((boundary, idx) => (
            <div
              key={idx}
              style={{
                ...notepadStyles.slideIndicator,
                backgroundColor: boundary.color,
                color: "white",
              }}
            >
              {idx + 1}
            </div>
          ))}
          {boundaries.length > 8 && (
            <span style={{ color: notepadStyles.footer.color }}>
              +{boundaries.length - 8} more
            </span>
          )}
        </div>
        <div>
          WS: {wsHost}:{wsPort}
        </div>
      </div>

      {/* Pulse animation for status dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Click outside to close help popup */}
      {showHelpPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={() => setShowHelpPopup(false)}
        />
      )}
    </div>
  );
};

export default LiveSlidesNotepad;

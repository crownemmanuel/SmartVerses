import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_SLIDES_LAYOUT,
  DisplayLayoutRect,
  DisplaySettings,
  SlideLineStyle,
} from "../types/display";
import { useAutoFontSize } from "../hooks/useAutoFontSize";

type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

type DragState = {
  index: number;
  mode: "move" | "resize";
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  startRect: DisplayLayoutRect;
};

interface SlidesLayoutEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (layout: DisplayLayoutRect[], lineStyles: SlideLineStyle[]) => void;
  initialLayout: DisplayLayoutRect[];
  initialLineStyles: SlideLineStyle[];
  backgroundColor: string;
  backgroundImagePath?: string;
  textFont: string;
  textStyle: DisplaySettings["textStyle"];
  fontOptions: Array<{ label: string; value: string }>;
}

const SAMPLE_LINES = [
  "Line 1 sample text",
  "Line 2 sample text",
  "Line 3 sample text",
  "Line 4 sample text",
  "Line 5 sample text",
  "Line 6 sample text",
];

const HANDLE_SIZE = 10;
const MIN_SIZE = 0.08;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clampRect = (rect: DisplayLayoutRect) => ({
  x: clamp(rect.x, 0, 1 - rect.width),
  y: clamp(rect.y, 0, 1 - rect.height),
  width: clamp(rect.width, MIN_SIZE, 1),
  height: clamp(rect.height, MIN_SIZE, 1),
});

const getRectStyle = (rect: DisplayLayoutRect): React.CSSProperties => ({
  position: "absolute",
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.width * 100}%`,
  height: `${rect.height * 100}%`,
});

const getFontStyle = (style: DisplaySettings["textStyle"]): React.CSSProperties => {
  const css: React.CSSProperties = {
    color: style.color,
    fontWeight: style.bold ? "bold" : "normal",
    fontStyle: style.italic ? "italic" : "normal",
  };

  if (style.stroke) {
    css.WebkitTextStroke = `${style.stroke.width}px ${style.stroke.color}`;
    // @ts-ignore - textStroke is a non-standard property but works in browsers
    css.textStroke = `${style.stroke.width}px ${style.stroke.color}`;
  }

  if (style.shadow) {
    css.textShadow = `${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color}`;
  }

  return css;
};

const resolveLineStyle = (
  base: DisplaySettings["textStyle"],
  override?: SlideLineStyle
): DisplaySettings["textStyle"] => ({
  color: override?.color ?? base.color,
  bold: override?.bold ?? base.bold,
  italic: override?.italic ?? base.italic,
  stroke: override?.stroke ?? base.stroke,
  shadow: override?.shadow ?? base.shadow,
});

const resolveLineFontFamily = (baseFont: string, override?: SlideLineStyle) =>
  override?.fontFamily || baseFont;

const normalizeLineStyles = (
  styles: SlideLineStyle[],
  length: number
): SlideLineStyle[] => {
  const next = styles.slice(0, length).map((style) => ({ ...(style || {}) }));
  while (next.length < length) {
    next.push({});
  }
  return next;
};

const HANDLE_POSITIONS: Record<
  ResizeHandle,
  { left: string; top: string; cursor: string }
> = {
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
};

const SlidesLayoutEditorModal: React.FC<SlidesLayoutEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialLayout,
  initialLineStyles,
  backgroundColor,
  backgroundImagePath,
  textFont,
  textStyle,
  fontOptions,
}) => {
  const [layout, setLayout] = useState<DisplayLayoutRect[]>(initialLayout);
  const [lineStyles, setLineStyles] = useState<SlideLineStyle[]>(() =>
    normalizeLineStyles(initialLineStyles, initialLayout.length || 0)
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dragStateRef = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("");

  const lineBoxRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ];
  const lineContentRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ];

  const lineFontSizes = [
    useAutoFontSize(
      lineBoxRefs[0],
      lineContentRefs[0],
      [
        layout,
        textFont,
        lineStyles[0]?.fontFamily,
        SAMPLE_LINES[0],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[0]?.bold,
        lineStyles[0]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
    useAutoFontSize(
      lineBoxRefs[1],
      lineContentRefs[1],
      [
        layout,
        textFont,
        lineStyles[1]?.fontFamily,
        SAMPLE_LINES[1],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[1]?.bold,
        lineStyles[1]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
    useAutoFontSize(
      lineBoxRefs[2],
      lineContentRefs[2],
      [
        layout,
        textFont,
        lineStyles[2]?.fontFamily,
        SAMPLE_LINES[2],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[2]?.bold,
        lineStyles[2]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
    useAutoFontSize(
      lineBoxRefs[3],
      lineContentRefs[3],
      [
        layout,
        textFont,
        lineStyles[3]?.fontFamily,
        SAMPLE_LINES[3],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[3]?.bold,
        lineStyles[3]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
    useAutoFontSize(
      lineBoxRefs[4],
      lineContentRefs[4],
      [
        layout,
        textFont,
        lineStyles[4]?.fontFamily,
        SAMPLE_LINES[4],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[4]?.bold,
        lineStyles[4]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
    useAutoFontSize(
      lineBoxRefs[5],
      lineContentRefs[5],
      [
        layout,
        textFont,
        lineStyles[5]?.fontFamily,
        SAMPLE_LINES[5],
        isOpen,
        textStyle.bold,
        textStyle.italic,
        lineStyles[5]?.bold,
        lineStyles[5]?.italic,
      ],
      { minFontSize: 10, maxFontSize: 300 }
    ),
  ];

  useEffect(() => {
    const loadBackgroundImage = async () => {
      if (!backgroundImagePath) {
        setBackgroundImageUrl("");
        return;
      }

      try {
        const convertedUrl = convertFileSrc(backgroundImagePath);
        if (
          convertedUrl &&
          (convertedUrl.startsWith("http://") ||
            convertedUrl.startsWith("https://") ||
            convertedUrl.startsWith("tauri://"))
        ) {
          setBackgroundImageUrl(convertedUrl);
          return;
        }

        const base64 = await invoke<string>("read_file_as_base64", {
          filePath: backgroundImagePath,
        });

        const path = backgroundImagePath.toLowerCase();
        let mimeType = "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
          mimeType = "image/jpeg";
        } else if (path.endsWith(".webp")) {
          mimeType = "image/webp";
        } else if (path.endsWith(".png")) {
          mimeType = "image/png";
        }

        const dataUrl = `data:${mimeType};base64,${base64}`;
        setBackgroundImageUrl(dataUrl);
      } catch (error) {
        console.error("[Display] Failed to load background preview:", error);
        setBackgroundImageUrl("");
      }
    };

    void loadBackgroundImage();
  }, [backgroundImagePath]);

  useEffect(() => {
    if (isOpen) {
      const initial = initialLayout.length >= 2 ? initialLayout : DEFAULT_SLIDES_LAYOUT;
      setLayout(initial.map((rect) => ({ ...rect })));
      setLineStyles(normalizeLineStyles(initialLineStyles, initial.length));
      setSelectedIndex(0);
    }
  }, [isOpen, initialLayout, initialLineStyles]);

  useEffect(() => {
    if (!isOpen) return;
    setLineStyles((prev) => normalizeLineStyles(prev, layout.length));
    setSelectedIndex((prev) => Math.min(prev, Math.max(layout.length - 1, 0)));
  }, [isOpen, layout.length]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    resizeObserver.observe(container);
    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return () => resizeObserver.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (containerSize.width === 0 || containerSize.height === 0) return;

      const dx = (event.clientX - dragState.startX) / containerSize.width;
      const dy = (event.clientY - dragState.startY) / containerSize.height;

      const startRect = dragState.startRect;
      let nextRect = { ...startRect };

      if (dragState.mode === "move") {
        nextRect = {
          ...startRect,
          x: clamp(startRect.x + dx, 0, 1 - startRect.width),
          y: clamp(startRect.y + dy, 0, 1 - startRect.height),
        };
      } else if (dragState.mode === "resize" && dragState.handle) {
        const handle = dragState.handle;
        if (handle.includes("e")) {
          nextRect.width = clamp(
            startRect.width + dx,
            MIN_SIZE,
            1 - startRect.x
          );
        }
        if (handle.includes("s")) {
          nextRect.height = clamp(
            startRect.height + dy,
            MIN_SIZE,
            1 - startRect.y
          );
        }
        if (handle.includes("w")) {
          const nextX = clamp(
            startRect.x + dx,
            0,
            startRect.x + startRect.width - MIN_SIZE
          );
          nextRect.width = startRect.width - (nextX - startRect.x);
          nextRect.x = nextX;
        }
        if (handle.includes("n")) {
          const nextY = clamp(
            startRect.y + dy,
            0,
            startRect.y + startRect.height - MIN_SIZE
          );
          nextRect.height = startRect.height - (nextY - startRect.y);
          nextRect.y = nextY;
        }
        nextRect = clampRect(nextRect);
      }

      setLayout((prev) => {
        const next = [...prev];
        next[dragState.index] = nextRect;
        return next;
      });
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [containerSize, isOpen]);

  if (!isOpen) return null;

  const startDrag = (index: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    dragStateRef.current = {
      index,
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      startRect: layout[index],
    };
    setSelectedIndex(index);
  };

  const startResize =
    (index: number, handle: ResizeHandle) =>
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        index,
        mode: "resize",
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startRect: layout[index],
      };
      setSelectedIndex(index);
    };

  const renderHandles = (index: number) =>
    (Object.keys(HANDLE_POSITIONS) as ResizeHandle[]).map((handle) => {
      const position = HANDLE_POSITIONS[handle];
      return (
        <div
          key={`${index}-${handle}`}
          onPointerDown={startResize(index, handle)}
          style={{
            position: "absolute",
            left: position.left,
            top: position.top,
            width: `${HANDLE_SIZE}px`,
            height: `${HANDLE_SIZE}px`,
            borderRadius: "2px",
            backgroundColor: "#ffffff",
            border: "1px solid #111827",
            transform: "translate(-50%, -50%)",
            cursor: position.cursor,
          }}
        />
      );
    });

  const handleAddLine = () => {
    if (layout.length >= 6) return;
    setLayout((prev) => {
      if (prev.length >= 6) return prev;
      const last = prev[prev.length - 1] || DEFAULT_SLIDES_LAYOUT[DEFAULT_SLIDES_LAYOUT.length - 1];
      const gap = 0.02;
      const proposedBelow = {
        ...last,
        y: last.y + last.height + gap,
      };
      const proposedAbove = {
        ...last,
        y: last.y - last.height - gap,
      };
      const nextRect =
        proposedBelow.y + proposedBelow.height <= 1
          ? proposedBelow
          : proposedAbove;
      return [...prev, clampRect(nextRect)];
    });
    const nextLength = Math.min(layout.length + 1, 6);
    setLineStyles((prev) => normalizeLineStyles(prev, nextLength));
    setSelectedIndex(nextLength - 1);
  };

  const updateLineStyle = (
    index: number,
    nextStyle: SlideLineStyle & { fontFamily?: string | null }
  ) => {
    setLineStyles((prev) => {
      const normalized = normalizeLineStyles(prev, layout.length);
      const merged: SlideLineStyle = { ...normalized[index], ...nextStyle };
      if (nextStyle.fontFamily === null) {
        delete merged.fontFamily;
      }
      normalized[index] = merged;
      return normalized;
    });
  };

  const resetLineStyle = (index: number) => {
    setLineStyles((prev) => {
      const normalized = normalizeLineStyles(prev, layout.length);
      normalized[index] = {};
      return normalized;
    });
  };

  const selectedLineStyle = lineStyles[selectedIndex] || {};
  const resolvedSelectedStyle = resolveLineStyle(textStyle, selectedLineStyle);
  const hasSelectedOverride = Object.keys(selectedLineStyle).length > 0;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-content"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: "860px", width: "100%" }}
      >
        <h2 style={{ marginTop: 0 }}>Edit Slides Layout</h2>
        <p style={{ color: "var(--app-text-color-secondary)" }}>
          Drag each line to reposition. Use the handles to resize each area.
        </p>

        <div
          ref={containerRef}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            backgroundColor,
            backgroundImage: backgroundImageUrl
              ? `url(${backgroundImageUrl})`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            border: "1px solid var(--app-border-color)",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {layout.map((rect, index) => (
            <div
              key={`line-${index}`}
              ref={lineBoxRefs[index]}
              onPointerDown={startDrag(index)}
              style={{
                ...getRectStyle(rect),
                border:
                  selectedIndex === index
                    ? "2px solid var(--accent)"
                    : "2px solid rgba(99, 102, 241, 0.6)",
                borderRadius: "8px",
                padding: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(15, 23, 42, 0.2)",
                color: "#ffffff",
                cursor: "move",
              }}
            >
              <div
                ref={lineContentRefs[index]}
                style={{
                  fontFamily: resolveLineFontFamily(textFont, lineStyles[index]),
                  fontSize: `${lineFontSizes[index]}px`,
                  lineHeight: 1.2,
                  textAlign: "center",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  pointerEvents: "none",
                  ...getFontStyle(resolveLineStyle(textStyle, lineStyles[index])),
                }}
              >
                {SAMPLE_LINES[index] || `Line ${index + 1}`}
              </div>
              {renderHandles(index)}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "10px",
            border: "1px solid var(--app-border-color)",
            display: "grid",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 600 }}>Line styling</div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.9rem" }}>Line</span>
              <select
                value={selectedIndex}
                onChange={(event) => setSelectedIndex(Number(event.target.value))}
                className="select-css"
              >
                {layout.map((_, index) => (
                  <option key={`line-select-${index}`} value={index}>
                    Line {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.9rem" }}>Font</span>
              <select
                value={selectedLineStyle.fontFamily ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  updateLineStyle(selectedIndex, {
                    fontFamily: value === "" ? undefined : value,
                  });
                }}
                className="select-css"
              >
                <option value="">Default (Slide font)</option>
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.9rem" }}>Color</span>
              <input
                type="color"
                value={resolvedSelectedStyle.color}
                onChange={(event) =>
                  updateLineStyle(selectedIndex, { color: event.target.value })
                }
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                checked={resolvedSelectedStyle.bold}
                onChange={(event) =>
                  updateLineStyle(selectedIndex, { bold: event.target.checked })
                }
              />
              <span style={{ fontSize: "0.9rem" }}>Bold</span>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => resetLineStyle(selectedIndex)}
              disabled={!hasSelectedOverride}
            >
              Use default style
            </button>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
            Lines without overrides use the global slide text styling.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "16px",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => setLayout(DEFAULT_SLIDES_LAYOUT.map((rect) => ({ ...rect })))}
              className="secondary"
            >
              Reset Layout
            </button>
            <button
              onClick={handleAddLine}
              className="secondary"
              disabled={layout.length >= 6}
            >
              Add another line
            </button>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose}>Cancel</button>
            <button
              onClick={() => onSave(layout, lineStyles)}
              className="primary"
            >
              Save Layout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlidesLayoutEditorModal;

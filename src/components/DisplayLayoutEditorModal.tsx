import React, { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_DISPLAY_LAYOUT,
  DisplayLayout,
  DisplayLayoutRect,
  DisplaySettings,
} from "../types/display";
import { useAutoFontSize } from "../hooks/useAutoFontSize";

type DragTarget = "text" | "reference";
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
  target: DragTarget;
  mode: "move" | "resize";
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  startRect: DisplayLayoutRect;
};

interface DisplayLayoutEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (layout: DisplayLayout) => void;
  initialLayout: DisplayLayout;
  backgroundColor: string;
  backgroundImagePath?: string;
  textFont: string;
  referenceFont: string;
  textStyle: DisplaySettings["textStyle"];
  referenceStyle: DisplaySettings["referenceStyle"];
}

const SAMPLE_TEXT =
  "For God so loved the world that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.";
const SAMPLE_REFERENCE = "John 3:16";

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

  // Text stroke (outline)
  if (style.stroke) {
    css.WebkitTextStroke = `${style.stroke.width}px ${style.stroke.color}`;
    // @ts-ignore - textStroke is a non-standard property but works in browsers
    css.textStroke = `${style.stroke.width}px ${style.stroke.color}`;
  }

  // Text shadow
  if (style.shadow) {
    css.textShadow = `${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color}`;
  }

  return css;
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

const DisplayLayoutEditorModal: React.FC<DisplayLayoutEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialLayout,
  backgroundColor,
  backgroundImagePath,
  textFont,
  referenceFont,
  textStyle,
  referenceStyle,
}) => {
  const [layout, setLayout] = useState<DisplayLayout>(initialLayout);
  const [activeTarget, setActiveTarget] = useState<DragTarget | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("");
  const textBoxRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);
  const referenceBoxRef = useRef<HTMLDivElement | null>(null);
  const referenceContentRef = useRef<HTMLDivElement | null>(null);

  // Load background image asynchronously
  useEffect(() => {
    const loadBackgroundImage = async () => {
      if (!backgroundImagePath) {
        setBackgroundImageUrl("");
        return;
      }

      try {
        // First try convertFileSrc (works for most cases)
        const convertedUrl = convertFileSrc(backgroundImagePath);
        // Verify it's actually a URL and not the raw path
        if (convertedUrl && (convertedUrl.startsWith("http://") || convertedUrl.startsWith("https://") || convertedUrl.startsWith("tauri://"))) {
          setBackgroundImageUrl(convertedUrl);
          return;
        }
        
        // Fallback: Read file as base64 and convert to data URL
        console.log("[Display] convertFileSrc returned non-URL, trying base64 fallback for:", backgroundImagePath);
        const base64 = await invoke<string>("read_file_as_base64", {
          filePath: backgroundImagePath,
        });
        
        // Determine MIME type from file extension
        const path = backgroundImagePath.toLowerCase();
        let mimeType = "image/png"; // default
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

  const textFontSize = useAutoFontSize(
    textBoxRef,
    textContentRef,
    [
      layout.text.x,
      layout.text.y,
      layout.text.width,
      layout.text.height,
      textFont,
      SAMPLE_TEXT,
      isOpen,
    ],
    { minFontSize: 10, maxFontSize: 140 }
  );

  const referenceFontSize = useAutoFontSize(
    referenceBoxRef,
    referenceContentRef,
    [
      layout.reference.x,
      layout.reference.y,
      layout.reference.width,
      layout.reference.height,
      referenceFont,
      SAMPLE_REFERENCE,
      isOpen,
    ],
    { minFontSize: 10, maxFontSize: 120 }
  );

  useEffect(() => {
    if (isOpen) {
      setLayout(initialLayout);
    }
  }, [isOpen, initialLayout]);

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

      setLayout((prev) => ({
        ...prev,
        [dragState.target]: nextRect,
      }));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setActiveTarget(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [containerSize, isOpen]);

  if (!isOpen) return null;

  const startDrag = (target: DragTarget) => (event: React.PointerEvent) => {
    event.preventDefault();
    dragStateRef.current = {
      target,
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      startRect: layout[target],
    };
    setActiveTarget(target);
  };

  const startResize =
    (target: DragTarget, handle: ResizeHandle) =>
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        target,
        mode: "resize",
        handle,
        startX: event.clientX,
        startY: event.clientY,
        startRect: layout[target],
      };
      setActiveTarget(target);
    };

  const renderHandles = (target: DragTarget) =>
    (Object.keys(HANDLE_POSITIONS) as ResizeHandle[]).map((handle) => {
      const position = HANDLE_POSITIONS[handle];
      return (
        <div
          key={`${target}-${handle}`}
          onPointerDown={startResize(target, handle)}
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

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-content"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: "860px", width: "100%" }}
      >
        <h2 style={{ marginTop: 0 }}>Edit Audience Display Layout</h2>
        <p style={{ color: "var(--app-text-color-secondary)" }}>
          Drag the text and reference boxes to reposition. Use the handles to
          resize each area.
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
          <div
            ref={textBoxRef}
            onPointerDown={startDrag("text")}
            style={{
              ...getRectStyle(layout.text),
              border:
                activeTarget === "text"
                  ? "2px solid var(--accent)"
                  : "2px solid rgba(99, 102, 241, 0.6)",
              borderRadius: "8px",
              padding: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(15, 23, 42, 0.2)",
              color: "#ffffff",
              cursor: "move",
            }}
          >
            <div
              ref={textContentRef}
              style={{
                fontFamily: textFont,
                fontSize: `${textFontSize}px`,
                lineHeight: 1.2,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                pointerEvents: "none",
                ...getFontStyle(textStyle),
              }}
            >
              {SAMPLE_TEXT}
            </div>
            {renderHandles("text")}
          </div>

          <div
            ref={referenceBoxRef}
            onPointerDown={startDrag("reference")}
            style={{
              ...getRectStyle(layout.reference),
              border:
                activeTarget === "reference"
                  ? "2px solid var(--accent)"
                  : "2px solid rgba(34, 197, 94, 0.6)",
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
              ref={referenceContentRef}
              style={{
                fontFamily: referenceFont,
                fontSize: `${referenceFontSize}px`,
                lineHeight: 1.1,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                pointerEvents: "none",
                ...getFontStyle(referenceStyle),
              }}
            >
              {SAMPLE_REFERENCE}
            </div>
            {renderHandles("reference")}
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
          <button
            onClick={() => setLayout(DEFAULT_DISPLAY_LAYOUT)}
            className="secondary"
          >
            Reset Layout
          </button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose}>Cancel</button>
            <button
              onClick={() => onSave(layout)}
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

export default DisplayLayoutEditorModal;

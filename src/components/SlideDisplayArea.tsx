import React, { useState, useEffect, useMemo } from "react";
import { PlaylistItem, Slide, LayoutType, Template } from "../types";
import {
  FaTrash,
  FaEdit,
  FaPlay,
  FaPlus,
  FaSearch,
  FaTimes,
  FaCopy,
  FaDesktop,
} from "react-icons/fa";
import "../App.css"; // Ensure global styles are applied
import ContextMenu from "./ContextMenu"; // Import the new component
import TimerDropdown from "./TimerDropdown";
import { useStageAssist } from "../contexts/StageAssistContext";
import ActivatePresentationModal from "./ActivatePresentationModal";
import { ProPresenterActivationConfig } from "../types/propresenter";

const MAX_LINES_FOR_EDIT = 6;

interface SlideDisplayAreaProps {
  playlistItem: PlaylistItem | undefined;
  template: Template | undefined;
  onUpdateSlide: (slideId: string, newText: string) => void;
  onMakeSlideLive: (slide: Slide) => void;
  onTakeOffSlide?: (slide: Slide) => void; // New prop for "Take Off" action
  onAddSlide: (layout: LayoutType) => void;
  onDeleteSlide: (slideId: string) => void;
  onChangeSlideLayout: (slideId: string, newLayout: LayoutType) => void; // New prop
  onChangeTimerSession?: (
    slideId: string,
    sessionIndex: number | undefined
  ) => void; // New prop for timer session
  onChangeProPresenterActivation?: (
    slideId: string,
    config: ProPresenterActivationConfig | undefined
  ) => void; // New prop for ProPresenter activation
  onDetachLiveSlides?: () => void;
  onBeginLiveSlideEdit?: (slide: Slide) => void;
  onEndLiveSlideEdit?: () => void;
  liveSlidesStatus?: {
    serverRunning: boolean;
    sessionExists: boolean;
    isCreating?: boolean;
    typingUrl?: string;
  };
  onResumeLiveSlidesSession?: () => void;
  proofreadCorrectedSlideIds?: string[]; // IDs of slides that were corrected by AI proofreading
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  slideId: string | null;
}

const SlideDisplayArea: React.FC<SlideDisplayAreaProps> = ({
  playlistItem,
  template,
  onUpdateSlide,
  onMakeSlideLive,
  onTakeOffSlide,
  onAddSlide,
  onDeleteSlide,
  onChangeSlideLayout, // New prop
  onChangeTimerSession, // New prop for timer session
  onChangeProPresenterActivation, // New prop for ProPresenter activation
  onDetachLiveSlides,
  onBeginLiveSlideEdit,
  onEndLiveSlideEdit,
  liveSlidesStatus,
  onResumeLiveSlidesSession,
  proofreadCorrectedSlideIds = [], // IDs of slides corrected by AI proofreading
}) => {
  const { startSession } = useStageAssist();
  const [
    activatePresentationModalSlideId,
    setActivatePresentationModalSlideId,
  ] = useState<string | null>(null);
  // Mark unused prop as intentionally unused to satisfy TypeScript
  void template;
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  // editText is now used as a temporary holder if needed, or can be removed if editingLines is sufficient
  // For simplicity, we'll manage lines directly.
  const [editingLines, setEditingLines] = useState<string[]>([]);
  const [liveSlideId, setLiveSlideId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    slideId: null,
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMode, setSearchMode] = useState<"first-line" | "all">(
    "first-line"
  );
  const [showSearchOptions, setShowSearchOptions] = useState<boolean>(false);
  const [hasFocusedSearch, setHasFocusedSearch] = useState<boolean>(false);

  useEffect(() => {
    setEditingSlideId(null);
    setEditingLines([]);
    setContextMenu({ isOpen: false, x: 0, y: 0, slideId: null }); // Close context menu on item change
  }, [playlistItem]);

  const getLayoutText = (layout: LayoutType): string => {
    switch (layout) {
      case "one-line":
        return "One Line";
      case "two-line":
        return "Two Lines";
      case "three-line":
        return "Three Lines";
      case "four-line":
        return "Four Lines";
      case "five-line":
        return "Five Lines";
      case "six-line":
        return "Six Lines";
      default:
        // This case should ideally not be reached if `layout` is always a valid LayoutType
        // and all LayoutTypes are handled above.
        // If layout can somehow be a string not in LayoutType, this will try to format it.
        const layoutStr = layout as string; // Type assertion
        return layoutStr
          .replace("-", " ")
          .replace(/\b\w/g, (l: string) => l.toUpperCase());
    }
  };

  const handleEdit = (slide: Slide) => {
    onBeginLiveSlideEdit?.(slide);
    setEditingSlideId(slide.id);

    const currentLines = slide.text.split("\n");
    const actualLinesCount = currentLines.length;

    let minLinesForLayout: number;
    switch (slide.layout) {
      case "one-line":
        minLinesForLayout = 1;
        break;
      case "two-line":
        minLinesForLayout = 2;
        break;
      case "three-line":
        minLinesForLayout = 3;
        break;
      case "four-line":
        minLinesForLayout = 4;
        break;
      case "five-line":
        minLinesForLayout = 5;
        break;
      case "six-line":
        minLinesForLayout = 6;
        break;
      default:
        // Fallback for any layout string not explicitly handled.
        // This ensures we always have a sensible minimum, defaulting to 1.
        // const _exhaustiveCheck: never = slide.layout; // For type checking if all cases are handled
        minLinesForLayout = 1;
    }

    // Determine the number of input fields:
    // Show at least the number of lines implied by minLinesForLayout.
    // If actualLinesCount is greater, show that many, up to MAX_LINES_FOR_EDIT.
    // If actualLinesCount is less, still show minLinesForLayout (padded with empty strings if they are edited).
    const numFields = Math.min(
      Math.max(minLinesForLayout, actualLinesCount),
      MAX_LINES_FOR_EDIT
    );

    setEditingLines(
      Array(numFields)
        .fill("")
        .map((_, i) => currentLines[i] || "")
    );
    closeContextMenu(); // Close context menu when edit starts
  };

  const handleEditingLineChange = (index: number, value: string) => {
    const newLines = [...editingLines];
    newLines[index] = value;
    setEditingLines(newLines);
  };

  const handleSave = (slideId: string) => {
    // Join lines, but trim trailing empty lines to avoid altering slide structure unnecessarily
    let lastNonEmptyIndex = editingLines.length - 1;
    while (
      lastNonEmptyIndex >= 0 &&
      editingLines[lastNonEmptyIndex].trim() === ""
    ) {
      lastNonEmptyIndex--;
    }
    const newText = editingLines.slice(0, lastNonEmptyIndex + 1).join("\n");
    onUpdateSlide(slideId, newText);
    setEditingSlideId(null);
    setEditingLines([]);
    onEndLiveSlideEdit?.();
  };

  const handleCancelEdit = () => {
    setEditingSlideId(null);
    setEditingLines([]);
    onEndLiveSlideEdit?.();
  };

  const handleMakeLive = async (slide: Slide) => {
    onMakeSlideLive(slide);
    setLiveSlideId(slide.id);

    // If a timer session is selected, start it
    if (slide.timerSessionIndex !== undefined && onChangeTimerSession) {
      try {
        await startSession(slide.timerSessionIndex);
      } catch (error) {
        console.error("Failed to start timer session:", error);
        // Don't block the "Go Live" action if timer fails
      }
    }
  };

  const handleOffLive = async (slide: Slide) => {
    // Trigger ProPresenter take off animations if handler is provided
    if (onTakeOffSlide) {
      await onTakeOffSlide(slide);
    }
    // Clear the live state - this will make "Go Live" button available again
    setLiveSlideId(null);
  };

  const handleRightClick = (event: React.MouseEvent, slideId: string) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      slideId,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, slideId: null });
  };

  const isLiveLinked =
    !!playlistItem?.liveSlidesSessionId &&
    (playlistItem?.liveSlidesLinked ?? true);

  // Note: currentEditingSlide is not used currently; keeping the lookup inline where needed avoids unused var.
  const currentContextMenuSlide = playlistItem?.slides.find(
    (s) => s.id === contextMenu.slideId
  );

  const allLayoutOptions: LayoutType[] = [
    "one-line",
    "two-line",
    "three-line",
    "four-line",
    "five-line",
    "six-line",
  ];

  // removed unused variable 'availableLayouts'

  const contextMenuItems = currentContextMenuSlide
    ? [
        { label: "Edit", onClick: () => handleEdit(currentContextMenuSlide) },
        {
          label: "Delete",
          onClick: () => {
            if (currentContextMenuSlide) {
              onDeleteSlide(currentContextMenuSlide.id);
            }
          },
        },
      ]
    : [];

  // Simple text area styling, can be moved to CSS if not already there
  // Individual input styling can also be added to App.css
  const singleInputStyle: React.CSSProperties = {
    width: "100%", // Inputs will take full width of their container
    padding: "0.7em 1em",
    marginBottom: "8px",
    fontSize: "0.9em",
    fontFamily: "inherit",
    color: "var(--app-input-text-color)",
    backgroundColor: "var(--app-input-bg-color)",
    border: "1px solid var(--app-border-color)",
    borderRadius: "6px",
    boxSizing: "border-box",
  };

  // Filter slides based on search query
  const filteredSlides = useMemo(() => {
    if (!playlistItem || !searchQuery.trim()) {
      return playlistItem?.slides || [];
    }

    const query = searchQuery.toLowerCase().trim();
    return playlistItem.slides.filter((slide) => {
      if (searchMode === "first-line") {
        // Search only the first line
        const firstLine = slide.text.split("\n")[0] || "";
        return firstLine.toLowerCase().includes(query);
      } else {
        // Search all text
        return slide.text.toLowerCase().includes(query);
      }
    });
  }, [playlistItem, searchQuery, searchMode]);

  // Highlight matching text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const parts = text.split(
      new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
    );
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark
          key={index}
          style={{ backgroundColor: "#FFD700", padding: "2px 0" }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (!playlistItem) {
    return (
      <p style={{ color: "var(--app-text-color-secondary)" }}>
        Select an item from a playlist to see its slides.
      </p>
    );
  }

  return (
    <div>
      {/* Search Bar */}
      <div
        style={{
          marginBottom: "16px",
          padding: "12px",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "8px",
          border: "1px solid var(--app-border-color)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          position: "relative",
        }}
      >
        <FaSearch
          style={{ color: "var(--app-text-color-secondary)", flexShrink: 0 }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search slides..."
          style={{
            flex: 1,
            padding: "8px 12px",
            fontSize: "0.9rem",
            backgroundColor: "var(--app-input-bg-color)",
            color: "var(--app-input-text-color)",
            border: "1px solid var(--app-border-color)",
            borderRadius: "6px",
            outline: "none",
          }}
          onFocus={() => {
            if (!hasFocusedSearch) {
              setShowSearchOptions(true);
              setHasFocusedSearch(true);
            }
          }}
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              setShowSearchOptions(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--app-text-color-secondary)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
            }}
            title="Clear search"
          >
            <FaTimes />
          </button>
        )}
        {searchQuery && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "12px",
              right: "12px",
              marginTop: "4px",
              backgroundColor: "var(--app-bg-color)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
              padding: "8px",
              fontSize: "0.85rem",
              color: "var(--app-text-color-secondary)",
              zIndex: 10,
            }}
          >
            Found {filteredSlides.length} of {playlistItem.slides.length} slides
          </div>
        )}
      </div>

      {/* Search Options Dropdown */}
      {showSearchOptions && (
        <div
          style={{
            marginBottom: "12px",
            padding: "8px 12px",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "6px",
            border: "1px solid var(--app-border-color)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "0.85rem",
          }}
        >
          <span style={{ color: "var(--app-text-color-secondary)" }}>
            Search in:
          </span>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              checked={searchMode === "first-line"}
              onChange={() => setSearchMode("first-line")}
            />
            First line only
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              checked={searchMode === "all"}
              onChange={() => setSearchMode("all")}
            />
            All slides
          </label>
        </div>
      )}
      {isLiveLinked && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
            backgroundColor: "var(--app-header-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div
            style={{
              color: "var(--app-text-color-secondary)",
              fontSize: "0.9em",
              flex: 1,
            }}
          >
            This item is <strong>Live Slides linked</strong>. It updates in
            real-time. Edits, adds, deletes, and layout changes sync back to the
            session.
            {liveSlidesStatus?.isCreating && (
              <>
                {" "}
                <span style={{ color: "#3b82f6" }}>(Creating session...)</span>
              </>
            )}
            {liveSlidesStatus &&
              !liveSlidesStatus.isCreating &&
              (!liveSlidesStatus.serverRunning ||
                !liveSlidesStatus.sessionExists) && (
                <>
                  {" "}
                  <span style={{ color: "#f59e0b" }}>
                    (Session not running — restart to resume typing)
                  </span>
                </>
              )}
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {liveSlidesStatus &&
              liveSlidesStatus.serverRunning &&
              liveSlidesStatus.sessionExists &&
              liveSlidesStatus.typingUrl && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        liveSlidesStatus.typingUrl!
                      );
                      // You could add a toast notification here if desired
                    } catch (err) {
                      console.error("Failed to copy URL:", err);
                    }
                  }}
                  className="primary btn-sm"
                  title="Copy typing URL to clipboard"
                >
                  <FaCopy /> Copy Link
                </button>
              )}
            {liveSlidesStatus &&
              !liveSlidesStatus.isCreating &&
              (!liveSlidesStatus.serverRunning ||
                !liveSlidesStatus.sessionExists) &&
              onResumeLiveSlidesSession && (
                <button
                  onClick={onResumeLiveSlidesSession}
                  className="primary btn-sm"
                >
                  Restart/Resume Session
                </button>
              )}
            {onDetachLiveSlides && (
              <button onClick={onDetachLiveSlides} className="secondary btn-sm">
                Detach (stop syncing)
              </button>
            )}
          </div>
        </div>
      )}
      {playlistItem.slides.length === 0 && (
        <p style={{ color: "var(--app-text-color-secondary)" }}>
          This item has no slides.
        </p>
      )}
      {searchQuery && filteredSlides.length === 0 && (
        <p
          style={{
            color: "var(--app-text-color-secondary)",
            fontStyle: "italic",
          }}
        >
          No slides found matching "{searchQuery}"
        </p>
      )}
      {(searchQuery ? filteredSlides : playlistItem.slides)
        .sort((a, b) => a.order - b.order)
        .map((slide) => (
          <div
            key={slide.id}
            className={`slide-item-card ${
              liveSlideId === slide.id ? "live" : ""
            } ${slide.isAutoScripture ? "auto-scripture" : ""}`}
            onContextMenu={(e) => handleRightClick(e, slide.id)}
          >
            <div className="slide-layout-picker-container">
              <select
                className="slide-layout-picker"
                value={slide.layout}
                onChange={(e) =>
                  onChangeSlideLayout(slide.id, e.target.value as LayoutType)
                }
                onClick={(e) => e.stopPropagation()} // Prevent card click-through
              >
                {allLayoutOptions.map((layout) => (
                  <option key={layout} value={layout}>
                    {getLayoutText(layout)}
                  </option>
                ))}
              </select>
            </div>
            {editingSlideId === slide.id ? (
              <div style={{ width: "100%", paddingTop: "20px" }}>
                {" "}
                {/* Added paddingTop to avoid badge overlap */}
                {editingLines.map((line, index) => (
                  <input
                    key={index}
                    type="text"
                    value={line}
                    onChange={(e) =>
                      handleEditingLineChange(index, e.target.value)
                    }
                    placeholder={`Line ${index + 1}`}
                    style={singleInputStyle}
                    autoFocus={index === 0} // Auto-focus first line on edit
                  />
                ))}
                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                  <button
                    onClick={() => handleSave(slide.id)}
                    className="primary"
                  >
                    Save
                  </button>
                  <button onClick={handleCancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ width: "100%", paddingTop: "20px" }}>
                {" "}
                {/* Added paddingBottom to ensure space for buttons if text is short*/}
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    marginBottom: "10px",
                    minHeight: "40px",
                  }}
                >
                  {slide.text ? (
                    searchQuery ? (
                      <div>
                        {slide.text.split("\n").map((line, idx) => (
                          <div key={idx}>
                            {highlightText(line, searchQuery)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      slide.text
                    )
                  ) : (
                    <span style={{ color: "var(--app-text-color-secondary)" }}>
                      (Empty Slide)
                    </span>
                  )}
                </div>
                <div
                  style={{ display: "flex", gap: "10px", marginTop: "auto" }}
                >
                  <button
                    className="secondary"
                    onClick={() => handleEdit(slide)}
                    disabled={liveSlideId === slide.id}
                    title={
                      liveSlideId === slide.id
                        ? "This slide is currently Live"
                        : undefined
                    }
                  >
                    <FaEdit />
                    Edit
                  </button>
                  <button
                    onClick={() => handleMakeLive(slide)}
                    className={
                      liveSlideId === slide.id ? "live-active" : "primary"
                    }
                    disabled={liveSlideId === slide.id}
                  >
                    <FaPlay />
                    {liveSlideId === slide.id ? "Live" : "Go Live"}
                  </button>
                  {liveSlideId === slide.id && (
                    <button
                      onClick={() => handleOffLive(slide)}
                      className="danger"
                      style={{
                        backgroundColor: "#991b1b",
                        color: "white",
                        borderColor: "#7f1d1d",
                      }}
                      title="Take slide off live and trigger exit animations on ProPresenter"
                    >
                      <FaTimes />
                      Off Live
                    </button>
                  )}
                  {onChangeTimerSession && (
                    <TimerDropdown
                      slideId={slide.id}
                      selectedSessionIndex={slide.timerSessionIndex}
                      onSelectSession={(sessionIndex) =>
                        onChangeTimerSession(slide.id, sessionIndex)
                      }
                      disabled={liveSlideId === slide.id || isLiveLinked}
                    />
                  )}
                  {onChangeProPresenterActivation && (
                    <button
                      onClick={() =>
                        setActivatePresentationModalSlideId(slide.id)
                      }
                      className="secondary"
                      disabled={liveSlideId === slide.id || isLiveLinked}
                      title={
                        slide.proPresenterActivation
                          ? `ProPresenter: ${
                              slide.proPresenterActivation.presentationName ||
                              slide.proPresenterActivation.presentationUuid
                            } (Slide ${
                              slide.proPresenterActivation.slideIndex
                            })`
                          : playlistItem?.defaultProPresenterActivation
                          ? `ProPresenter: Default (${
                              playlistItem.defaultProPresenterActivation
                                .presentationName ||
                              playlistItem.defaultProPresenterActivation
                                .presentationUuid
                            })`
                          : "Set ProPresenter activation (default: none)"
                      }
                      style={{
                        padding: "8px 10px",
                        fontSize: "0.85em",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FaDesktop />
                      <span>
                        {slide.proPresenterActivation
                          ? "Custom"
                          : playlistItem?.defaultProPresenterActivation
                          ? "Default"
                          : "None"}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteSlide(slide.id)}
                    className="icon-button"
                    title="Delete slide"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            )}
            {/* AI Proofread correction indicator */}
            {proofreadCorrectedSlideIds.includes(slide.id) && (
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  right: "8px",
                  backgroundColor: "#a855f7",
                  color: "white",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: "bold",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                }}
                title="This slide was corrected by AI proofreading"
              >
                ✓
              </div>
            )}
          </div>
        ))}
      {playlistItem && (
        <div
          style={{
            marginTop: "20px",
            borderTop: "1px solid var(--app-border-color)",
            paddingTop: "20px",
          }}
        >
          <h5
            style={{
              marginTop: 0,
              marginBottom: "10px",
              color: "var(--app-text-color-secondary)",
            }}
          >
            Add New Slide:
          </h5>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {allLayoutOptions.map((layout) => (
              <button
                key={layout}
                onClick={() => onAddSlide(layout)}
                className="secondary btn-sm"
                title={`Add ${getLayoutText(layout)} Slide`}
              >
                <FaPlus />
                {getLayoutText(layout)}
              </button>
            ))}
          </div>
        </div>
      )}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        menuItems={contextMenuItems}
        onClose={closeContextMenu}
      />
      {onChangeProPresenterActivation && activatePresentationModalSlideId && (
        <ActivatePresentationModal
          isOpen={!!activatePresentationModalSlideId}
          onClose={() => setActivatePresentationModalSlideId(null)}
          onSave={(config) => {
            const slideId = activatePresentationModalSlideId;
            onChangeProPresenterActivation(slideId, config);
            setActivatePresentationModalSlideId(null);
          }}
          currentConfig={
            playlistItem?.slides.find(
              (s) => s.id === activatePresentationModalSlideId
            )?.proPresenterActivation
          }
          title="Activate Presentation for This Slide"
        />
      )}
    </div>
  );
};

export default SlideDisplayArea;

import React, { useState, useRef, useEffect } from "react";
import type { Monitor } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { FaChevronDown, FaDesktop, FaEye } from "react-icons/fa";

interface MonitorSelectDropdownProps {
  monitors: Monitor[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onRefresh: () => void;
  disabled?: boolean;
}

const MonitorSelectDropdown: React.FC<MonitorSelectDropdownProps> = ({
  monitors,
  selectedIndex,
  onSelect,
  onRefresh,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [identifyingIndex, setIdentifyingIndex] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Tracks the current identify state synchronously to avoid stale closures between
  // onMouseDown/onMouseUp (or touchstart/touchend) before React re-renders.
  const identifyingIndexRef = useRef<number | null>(null);
  // Used to invalidate an in-flight "show" when identify ends quickly (prevents show-after-hide).
  const identifyRequestIdRef = useRef(0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Cleanup identify window on unmount
  useEffect(() => {
    return () => {
      invoke("hide_monitor_identify_window").catch((err) =>
        console.warn("[MonitorSelect] Cleanup failed:", err)
      );
    };
  }, []);

  const handleIdentifyStart = async (
    index: number,
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      identifyRequestIdRef.current += 1;
      const requestId = identifyRequestIdRef.current;

      identifyingIndexRef.current = index;
      setIdentifyingIndex(index);
      await invoke("show_monitor_identify_window", { monitorIndex: index });

      // If the user released before show completed, hide immediately.
      if (
        identifyRequestIdRef.current !== requestId ||
        identifyingIndexRef.current !== index
      ) {
        invoke("hide_monitor_identify_window").catch((err) =>
          console.warn("[MonitorSelect] Post-show hide failed:", err)
        );
      }
    } catch (error) {
      console.error("[MonitorSelect] Failed to show identify window:", error);
      identifyingIndexRef.current = null;
      setIdentifyingIndex(null);
    }
  };

  const handleIdentifyEnd = async () => {
    if (identifyingIndexRef.current === null) return;
    identifyingIndexRef.current = null;
    identifyRequestIdRef.current += 1;
    setIdentifyingIndex(null);

    try {
      await invoke("hide_monitor_identify_window");
    } catch (error) {
      console.error("[MonitorSelect] Failed to hide identify window:", error);
    }
  };

  const selectedMonitor =
    selectedIndex !== null ? monitors[selectedIndex] : null;

  const getMonitorLabel = (monitor: Monitor, index: number) => {
    const width = monitor.size?.width ?? 0;
    const height = monitor.size?.height ?? 0;
    const isPrimary =
      monitor.position?.x === 0 && monitor.position?.y === 0;
    const primaryLabel = isPrimary ? " (Primary)" : "";
    return `Monitor ${index + 1} - ${width}x${height}${primaryLabel}`;
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="select-css"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FaDesktop style={{ opacity: 0.7, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {selectedMonitor
              ? getMonitorLabel(selectedMonitor, selectedIndex!)
              : "Select a monitor"}
          </span>
        </span>
        <FaChevronDown
          style={{
            fontSize: "0.8em",
            opacity: 0.6,
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "var(--app-bg-color)",
            border: "1px solid var(--app-border-color)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {monitors.length === 0 ? (
            <div
              style={{
                padding: "12px",
                color: "var(--app-text-color-secondary)",
                textAlign: "center",
                fontSize: "0.9em",
              }}
            >
              No monitors detected
            </div>
          ) : (
            monitors.map((monitor, index) => {
              const isSelected = selectedIndex === index;
              const isIdentifying = identifyingIndex === index;

              return (
                <div
                  key={`monitor-${index}`}
                  style={{
                    padding: "10px 12px",
                    borderBottom:
                      index < monitors.length - 1
                        ? "1px solid var(--app-border-color)"
                        : "none",
                    backgroundColor: isSelected
                      ? "var(--app-header-bg)"
                      : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    {/* Monitor Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: isSelected ? 600 : 400,
                          fontSize: "0.9em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getMonitorLabel(monitor, index)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      {/* Identify Button - Press and Hold */}
                      <button
                        type="button"
                        onMouseDown={(e) => handleIdentifyStart(index, e)}
                        onMouseUp={handleIdentifyEnd}
                        onMouseLeave={handleIdentifyEnd}
                        onTouchStart={(e) => handleIdentifyStart(index, e)}
                        onTouchEnd={handleIdentifyEnd}
                        className="secondary"
                        style={{
                          padding: "6px 10px",
                          fontSize: "0.8em",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          backgroundColor: isIdentifying
                            ? "#dc2626"
                            : undefined,
                          color: isIdentifying ? "#ffffff" : undefined,
                          borderColor: isIdentifying ? "#dc2626" : undefined,
                        }}
                        title="Hold to identify this monitor"
                      >
                        <FaEye style={{ fontSize: "0.9em" }} />
                        Identify
                      </button>

                      {/* Select Button */}
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(index);
                          setIsOpen(false);
                        }}
                        className={isSelected ? "primary" : "secondary"}
                        style={{
                          padding: "6px 10px",
                          fontSize: "0.8em",
                        }}
                        disabled={isSelected}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Refresh Button */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--app-border-color)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              className="secondary"
              style={{
                fontSize: "0.85em",
                padding: "6px 12px",
              }}
            >
              Refresh Monitors
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitorSelectDropdown;

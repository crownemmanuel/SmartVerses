import React, { useEffect, useRef, useState } from "react";
import {
  getOfflineModelPreloadStatus,
  OfflineModelPreloadStatus,
  subscribeOfflineModelPreload,
} from "../services/offlineModelPreloadService";

const READY_HIDE_DELAY_MS = 2000;
const ERROR_HIDE_DELAY_MS = 6000;

const OfflineModelLoadingToast: React.FC = () => {
  const [status, setStatus] = useState<OfflineModelPreloadStatus | null>(() =>
    getOfflineModelPreloadStatus()
  );
  const [visible, setVisible] = useState<boolean>(!!status);
  const hideTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeOfflineModelPreload((nextStatus) => {
      setStatus(nextStatus);

      if (!nextStatus) {
        setVisible(false);
        return;
      }

      setVisible(true);

      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      if (nextStatus.phase === "ready") {
        hideTimeoutRef.current = window.setTimeout(
          () => setVisible(false),
          READY_HIDE_DELAY_MS
        );
      } else if (nextStatus.phase === "error") {
        hideTimeoutRef.current = window.setTimeout(
          () => setVisible(false),
          ERROR_HIDE_DELAY_MS
        );
      }
    });

    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
      }
      unsubscribe();
    };
  }, []);

  if (!status || !visible) {
    return null;
  }

  const isError = status.phase === "error";
  const isReady = status.phase === "ready";
  const progress = Math.max(0, Math.min(100, status.progress || 0));
  const label = isError
    ? `Failed to load ${status.modelName}`
    : isReady
    ? `${status.modelName} ready`
    : `Loading ${status.modelName}`;
  const subtext = isError
    ? status.error || "Failed to load offline model."
    : isReady
    ? "Cached and ready for offline transcription."
    : status.file || "Preparing offline model...";

  return (
    <div
      className={`toast ${isError ? "toast-error" : "toast-info"}`}
      style={{
        flexDirection: "column",
        alignItems: "stretch",
        gap: "var(--spacing-2)",
        minWidth: "280px",
        maxWidth: "420px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--spacing-2)",
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            fontSize: "1rem",
            padding: 0,
          }}
          aria-label="Dismiss"
        >
          x
        </button>
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)" }}>
        {subtext}
      </div>
      <div
        style={{
          height: "6px",
          backgroundColor: "var(--app-bg-color)",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            backgroundColor: isError ? "var(--danger)" : "var(--app-primary-color)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
};

export default OfflineModelLoadingToast;

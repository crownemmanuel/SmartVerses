import React, { useEffect, useMemo, useRef, useState } from "react";
import "../App.css";
import { getAppSettings } from "../utils/aiConfig";
import { formatTimer, writeProPresenterTimer } from "../utils/proPresenter";

const TimerPage: React.FC = () => {
  const [durationSeconds, setDurationSeconds] = useState<number>(300);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(300);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [writeLive, setWriteLive] = useState<boolean>(false);
  const [format, setFormat] = useState<"mm:ss" | "h:mm:ss">("mm:ss");
  const [warnThreshold, setWarnThreshold] = useState<number>(60);
  const [outputPath, setOutputPath] = useState<string>("");
  const [fileName, setFileName] = useState<string>("timer.txt");

  const targetTimestampRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Load settings
  useEffect(() => {
    const s = getAppSettings();
    const pp = s.proPresenter;
    if (pp) {
      setOutputPath(pp.timerOutputPath || "");
      setFileName(pp.timerFileName || "timer.txt");
      setFormat((pp.timerFormat as any) || "mm:ss");
      setWarnThreshold(pp.warnThresholdSeconds || 60);
    }
  }, []);

  const formattedTime = useMemo(
    () => formatTimer(remainingSeconds, format),
    [remainingSeconds, format]
  );

  const start = () => {
    if (isRunning) return;
    const now = Date.now();
    targetTimestampRef.current = now + remainingSeconds * 1000;
    setIsRunning(true);
  };

  const pause = () => {
    setIsRunning(false);
    targetTimestampRef.current = null;
  };

  const reset = () => {
    setIsRunning(false);
    targetTimestampRef.current = null;
    setRemainingSeconds(durationSeconds);
  };

  const adjust = (delta: number) => {
    setRemainingSeconds((prev) => prev + delta);
    if (isRunning && targetTimestampRef.current) {
      targetTimestampRef.current += delta * 1000;
    }
  };

  // Ticker
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        if (!targetTimestampRef.current) return;
        const now = Date.now();
        const diff = Math.round((targetTimestampRef.current - now) / 1000);
        setRemainingSeconds(diff);
      }, 250) as unknown as number;
    }
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  // Push to ProPresenter
  useEffect(() => {
    let writerInterval: number | null = null;
    if (writeLive && outputPath && fileName) {
      const writeOnce = async () => {
        try {
          await writeProPresenterTimer(outputPath, fileName, formattedTime);
        } catch (e) {
          console.error("Failed to write timer to ProPresenter:", e);
        }
      };
      writeOnce();
      writerInterval = window.setInterval(writeOnce, 1000) as unknown as number;
    }
    return () => {
      if (writerInterval) {
        window.clearInterval(writerInterval);
      }
    };
  }, [writeLive, outputPath, fileName, formattedTime]);

  const canWrite = Boolean(outputPath && fileName);
  const needsSetup = !canWrite;

  const handleDurationChange = (value: string) => {
    // Accept mm:ss or seconds
    const trimmed = value.trim();
    let seconds = 0;
    if (/^\d+:\d{1,2}$/.test(trimmed)) {
      const [m, s] = trimmed.split(":").map((v) => parseInt(v, 10));
      seconds = m * 60 + s;
    } else if (/^\d+$/.test(trimmed)) {
      seconds = parseInt(trimmed, 10);
    } else {
      return;
    }
    setDurationSeconds(seconds);
    setRemainingSeconds(seconds);
  };

  const timeStyle: React.CSSProperties = {
    fontSize: "6rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    color:
      remainingSeconds <= 0
        ? "var(--danger-color, #ff5252)"
        : warnThreshold && remainingSeconds <= warnThreshold
        ? "var(--warning-color, #ffb300)"
        : "var(--app-text-color)",
    textAlign: "center",
    userSelect: "none",
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Timer</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={writeLive}
              onChange={(e) => setWriteLive(e.target.checked)}
              disabled={!canWrite}
            />
            <span>Write to ProPresenter</span>
          </label>
          {needsSetup && (
            <a href="#/settings" onClick={(e) => { e.preventDefault(); window.location.href = "/settings"; }} className="link">
              Configure in Settings
            </a>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="duration-input">Duration</label>
          <input
            id="duration-input"
            type="text"
            onChange={(e) => handleDurationChange(e.target.value)}
            placeholder="mm:ss or seconds"
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label htmlFor="format-select">Format</label>
          <select
            id="format-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as any)}
          >
            <option value="mm:ss">mm:ss</option>
            <option value="h:mm:ss">h:mm:ss</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 48 }}>
          <button className="primary" onClick={start} disabled={isRunning}>
            ▶ Start
          </button>
          <button className="secondary" onClick={pause} disabled={!isRunning}>
            ⏸ Pause
          </button>
          <button onClick={reset}>↺ Reset</button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => adjust(30)}>+30s</button>
        <button onClick={() => adjust(60)}>+1m</button>
        <button onClick={() => adjust(-30)}>-30s</button>
        <button onClick={() => adjust(-60)}>-1m</button>
      </div>

      <div style={{ marginTop: 30 }}>
        <div style={timeStyle}>{formattedTime}</div>
      </div>

      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Output Path</label>
          <input type="text" value={outputPath} onChange={(e) => setOutputPath(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>File Name</label>
          <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} />
        </div>
      </div>

      <p style={{ marginTop: 8, color: "var(--app-text-color-secondary)", fontSize: "0.9em" }}>
        The timer value is written to the configured text file once per second when enabled.
      </p>
    </div>
  );
};

export default TimerPage;
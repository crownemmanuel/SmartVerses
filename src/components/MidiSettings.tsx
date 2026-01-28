import React, { useEffect, useState } from "react";
import { FaMusic, FaSpinner, FaCheck, FaTimes } from "react-icons/fa";
import { listMidiOutputDevices, sendMidiNote, type MidiDevice } from "../services/midiService";
import "../App.css";

const MIDI_SETTINGS_KEY = "proassist-midi-settings";

interface MidiSettings {
  selectedDeviceId: string | null;
  defaultChannel: number;
  defaultNote: number;
  defaultVelocity: number;
}

const DEFAULT_MIDI_SETTINGS: MidiSettings = {
  selectedDeviceId: null,
  defaultChannel: 1,
  defaultNote: 60, // Middle C
  defaultVelocity: 127,
};

const loadMidiSettings = (): MidiSettings => {
  try {
    const saved = localStorage.getItem(MIDI_SETTINGS_KEY);
    if (saved) {
      return { ...DEFAULT_MIDI_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.error("[MIDI Settings] Failed to load settings:", error);
  }
  return DEFAULT_MIDI_SETTINGS;
};

const saveMidiSettings = (settings: MidiSettings): void => {
  try {
    localStorage.setItem(MIDI_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("[MIDI Settings] Failed to save settings:", error);
  }
};

const MidiSettings: React.FC = () => {
  const [settings, setSettings] = useState<MidiSettings>(loadMidiSettings());
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    saveMidiSettings(settings);
  }, [settings]);

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const deviceList = await listMidiOutputDevices();
      setDevices(deviceList);
      
      // Auto-select first device if none selected
      if (!settings.selectedDeviceId && deviceList.length > 0) {
        setSettings((prev) => ({
          ...prev,
          selectedDeviceId: deviceList[0].id,
        }));
      }
    } catch (error) {
      console.error("[MIDI Settings] Failed to load devices:", error);
      setTestResult({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load MIDI devices",
      });
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleSettingChange = <K extends keyof MidiSettings>(
    key: K,
    value: MidiSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestNote = async () => {
    if (!settings.selectedDeviceId) {
      setTestResult({
        status: "error",
        message: "Please select a MIDI device first",
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: "idle", message: "" });

    try {
      await sendMidiNote(
        settings.selectedDeviceId,
        settings.defaultChannel,
        settings.defaultNote,
        settings.defaultVelocity
      );
      setTestResult({
        status: "success",
        message: "MIDI note sent successfully!",
      });
      setTimeout(() => {
        setTestResult({ status: "idle", message: "" });
      }, 3000);
    } catch (error) {
      setTestResult({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to send MIDI note",
      });
      setTimeout(() => {
        setTestResult({ status: "idle", message: "" });
      }, 5000);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>MIDI Settings</h2>
      <p
        style={{
          marginBottom: "var(--spacing-6)",
          color: "var(--app-text-color-secondary)",
        }}
      >
        Configure MIDI device settings for timer automations. MIDI notes can be
        triggered automatically when timer sessions start.
      </p>

      {/* MIDI Device Selection */}
      <div
        style={{
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-4)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--spacing-3)",
            fontSize: "1.25rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
          }}
        >
          <FaMusic />
          MIDI Device
        </h3>

        <div style={{ marginBottom: "var(--spacing-3)" }}>
          <label
            style={{
              display: "block",
              marginBottom: "var(--spacing-1)",
              fontWeight: 500,
            }}
          >
            Output Device
          </label>
          <div style={{ display: "flex", gap: "var(--spacing-2)", alignItems: "center" }}>
            <select
              value={settings.selectedDeviceId || ""}
              onChange={(e) =>
                handleSettingChange("selectedDeviceId", e.target.value || null)
              }
              disabled={isLoadingDevices}
              style={{
                flex: 1,
                padding: "var(--spacing-2)",
                fontSize: "0.9em",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "4px",
              }}
            >
              <option value="">Select a MIDI device...</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
            <button
              onClick={loadDevices}
              disabled={isLoadingDevices}
              className="secondary"
              style={{ minWidth: "100px" }}
            >
              {isLoadingDevices ? (
                <>
                  <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
                  Loading...
                </>
              ) : (
                "Refresh"
              )}
            </button>
          </div>
          <p
            style={{
              marginTop: "var(--spacing-1)",
              fontSize: "0.85em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            {devices.length === 0
              ? "No MIDI devices found. Make sure your MIDI device is connected and try refreshing."
              : `${devices.length} device${devices.length !== 1 ? "s" : ""} available`}
          </p>
        </div>
      </div>

      {/* Default MIDI Parameters */}
      <div
        style={{
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-4)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--spacing-3)",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Default MIDI Parameters
        </h3>
        <p
          style={{
            marginBottom: "var(--spacing-3)",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          These values are used as defaults when creating MIDI automations. You
          can override them for each automation.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--spacing-3)",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--spacing-1)",
                fontWeight: 500,
                fontSize: "0.9em",
              }}
            >
              Channel (1-16)
            </label>
            <input
              type="number"
              min="1"
              max="16"
              value={settings.defaultChannel}
              onChange={(e) =>
                handleSettingChange(
                  "defaultChannel",
                  Math.max(1, Math.min(16, parseInt(e.target.value) || 1))
                )
              }
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                fontSize: "0.9em",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "4px",
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--spacing-1)",
                fontWeight: 500,
                fontSize: "0.9em",
              }}
            >
              Note (0-127)
            </label>
            <input
              type="number"
              min="0"
              max="127"
              value={settings.defaultNote}
              onChange={(e) =>
                handleSettingChange(
                  "defaultNote",
                  Math.max(0, Math.min(127, parseInt(e.target.value) || 60))
                )
              }
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                fontSize: "0.9em",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "4px",
              }}
            />
            <p
              style={{
                marginTop: "var(--spacing-1)",
                fontSize: "0.75em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              {settings.defaultNote === 60
                ? "Middle C"
                : settings.defaultNote < 60
                  ? `C${Math.floor(settings.defaultNote / 12) - 1}`
                  : `C${Math.floor(settings.defaultNote / 12)}`}
            </p>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "var(--spacing-1)",
                fontWeight: 500,
                fontSize: "0.9em",
              }}
            >
              Velocity (0-127)
            </label>
            <input
              type="number"
              min="0"
              max="127"
              value={settings.defaultVelocity}
              onChange={(e) =>
                handleSettingChange(
                  "defaultVelocity",
                  Math.max(0, Math.min(127, parseInt(e.target.value) || 127))
                )
              }
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                fontSize: "0.9em",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                border: "1px solid var(--app-border-color)",
                borderRadius: "4px",
              }}
            />
          </div>
        </div>
      </div>

      {/* Test MIDI Note */}
      <div
        style={{
          marginBottom: "var(--spacing-5)",
          padding: "var(--spacing-4)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--spacing-3)",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Test MIDI Note
        </h3>
        <p
          style={{
            marginBottom: "var(--spacing-3)",
            fontSize: "0.9em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          Send a test MIDI note using the current device and default parameters.
        </p>

        <button
          onClick={handleTestNote}
          disabled={isTesting || !settings.selectedDeviceId}
          className="primary"
          style={{ minWidth: "200px" }}
        >
          {isTesting ? (
            <>
              <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
              Sending...
            </>
          ) : (
            <>
              <FaMusic />
              Send Test Note
            </>
          )}
        </button>

        {testResult.status !== "idle" && (
          <div
            style={{
              marginTop: "var(--spacing-3)",
              padding: "var(--spacing-2) var(--spacing-3)",
              backgroundColor:
                testResult.status === "success"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${
                testResult.status === "success"
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(239, 68, 68, 0.3)"
              }`,
              borderRadius: "6px",
              fontSize: "0.9em",
              color:
                testResult.status === "success" ? "#22c55e" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {testResult.status === "success" ? (
              <FaCheck />
            ) : (
              <FaTimes />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MidiSettings;

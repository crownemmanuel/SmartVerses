/**
 * Recorder Settings Component
 * 
 * Configuration panel for recorder settings including:
 * - Device selection (camera, microphone)
 * - Video settings (format, resolution)
 * - Audio settings (format, bitrate)
 * - Output settings (path, naming pattern)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  FaVideo,
  FaFolder,
  FaFileVideo,
  FaFileAudio,
  FaSync,
} from "react-icons/fa";
import {
  loadRecorderSettings,
  saveRecorderSettings,
  getVideoDevices,
  getAudioDevices,
  getNativeAudioDevices,
  NativeAudioDevice,
} from "../services/recorderService";
import {
  RecorderSettings as RecorderSettingsType,
  MediaDeviceOption,
  VideoFormat,
  VideoAudioCodec,
  VideoResolution,
  AudioFormat,
  AudioBitrate,
  NamingPattern,
} from "../types/recorder";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import { sectionStyle, sectionHeaderStyle } from "../utils/settingsSectionStyles";
import "../App.css";

const RecorderSettings: React.FC = () => {
  const [settings, setSettings] = useState<RecorderSettingsType | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [nativeAudioDevices, setNativeAudioDevices] = useState<NativeAudioDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: "success" | "error" | "" }>({
    text: "",
    type: "",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings and devices on mount
  useEffect(() => {
    const loaded = loadRecorderSettings();
    setSettings(loaded);
    setSettingsLoaded(true);
    loadDevices();
  }, []);

  const loadDevices = useCallback(async () => {
    setIsLoadingDevices(true);
    try {
      const [video, audio, nativeAudio] = await Promise.all([
        getVideoDevices(),
        getAudioDevices(),
        getNativeAudioDevices(),
      ]);
      setVideoDevices(video);
      setAudioDevices(audio);
      setNativeAudioDevices(nativeAudio);
    } catch (err) {
      console.error("Failed to load devices:", err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  // Auto-save settings with debounce
  useDebouncedEffect(
    () => {
      if (!settings) return;
      try {
        saveRecorderSettings(settings);
        setSaveMessage({ text: "All changes saved", type: "success" });
        setTimeout(() => setSaveMessage({ text: "", type: "" }), 2000);
      } catch (err) {
        setSaveMessage({ text: "Failed to save settings", type: "error" });
      }
    },
    [settings, settingsLoaded],
    { delayMs: 600, enabled: settingsLoaded, skipFirstRun: true }
  );

  const handleChange = <K extends keyof RecorderSettingsType>(
    key: K,
    value: RecorderSettingsType[K]
  ) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleVideoFormatChange = (format: VideoFormat) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        videoFormat: format,
        videoAudioCodec: format === "webm" ? "opus" : "aac",
      };
    });
  };

  const handleVideoAudioCodecChange = (_codec: VideoAudioCodec) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        videoAudioCodec: prev.videoFormat === "webm" ? "opus" : "aac",
      };
    });
  };

  if (!settings) {
    return <div>Loading settings...</div>;
  }

  const fieldStyle: React.CSSProperties = {
    marginBottom: "var(--spacing-4)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: "var(--spacing-2)",
    fontWeight: 500,
    fontSize: "0.9rem",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "var(--spacing-3)",
    borderRadius: "8px",
    border: "1px solid var(--app-border-color)",
    backgroundColor: "var(--app-input-bg-color)",
    color: "var(--app-input-text-color)",
    fontSize: "1rem",
  };

  const helpTextStyle: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "var(--app-text-color-secondary)",
    marginTop: "var(--spacing-1)",
  };

  const chipContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  };

  const chipStyle = (isActive: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    borderRadius: "8px",
    border: `1px solid ${isActive ? "var(--app-primary-color)" : "var(--app-border-color)"}`,
    backgroundColor: isActive ? "var(--app-primary-color)" : "var(--app-bg-color)",
    color: isActive ? "white" : "var(--app-text-color-secondary)",
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.85rem",
  });

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Recorder Settings</h2>
      <p
        style={{
          marginBottom: "var(--spacing-6)",
          color: "var(--app-text-color-secondary)",
        }}
      >
        Configure recording devices, formats, and output settings.
      </p>

      {/* Device Selection */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaVideo />
          <h3 style={{ margin: 0 }}>Device Selection</h3>
          <button
            onClick={loadDevices}
            disabled={isLoadingDevices}
            className="secondary btn-sm"
            style={{ marginLeft: "auto" }}
          >
            <FaSync style={{ marginRight: "6px", animation: isLoadingDevices ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Camera</label>
          <select
            value={settings.selectedVideoDeviceId || ""}
            onChange={(e) => handleChange("selectedVideoDeviceId", e.target.value || null)}
            style={inputStyle}
          >
            <option value="">Default Camera</option>
            {videoDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          <p style={helpTextStyle}>
            Select the camera to use for video recording.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Video Audio Input</label>
          <select
            value={settings.selectedVideoAudioDeviceId || ""}
            onChange={(e) => handleChange("selectedVideoAudioDeviceId", e.target.value || null)}
            style={inputStyle}
          >
            <option value="">Default System Microphone</option>
            {audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
          <p style={helpTextStyle}>
            Audio device to embed into the video recording (can be different from the audio-only recorder).
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Microphone</label>
          <select
            value={settings.selectedAudioDeviceId || ""}
            onChange={(e) => handleChange("selectedAudioDeviceId", e.target.value || null)}
            style={inputStyle}
          >
            <option value="">Default System Microphone</option>
            {nativeAudioDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} {device.is_default ? "(Default)" : ""}
              </option>
            ))}
          </select>
          <p style={helpTextStyle}>
            Select the microphone input for audio recording.
          </p>
        </div>
      </div>

      {/* Video Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaFileVideo />
          <h3 style={{ margin: 0 }}>Video Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Video Format</label>
          <div style={chipContainerStyle}>
            {(["mp4", "webm"] as VideoFormat[]).map((format) => (
              <span
                key={format}
                style={chipStyle(settings.videoFormat === format)}
                onClick={() => handleVideoFormatChange(format)}
              >
                {format.toUpperCase()}
              </span>
            ))}
          </div>
          <p style={helpTextStyle}>
            MP4 is more widely compatible. WebM offers better quality at smaller file sizes.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Video Audio Codec</label>
          <div style={chipContainerStyle}>
            {(["aac", "opus"] as VideoAudioCodec[]).map((codec) => {
              const isDisabled =
                (settings.videoFormat === "webm" && codec === "aac") ||
                (settings.videoFormat === "mp4" && codec === "opus");
              return (
                <span
                  key={codec}
                  style={{
                    ...chipStyle(settings.videoAudioCodec === codec),
                    opacity: isDisabled ? 0.5 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                  onClick={() => {
                    if (isDisabled) return;
                    handleVideoAudioCodecChange(codec);
                  }}
                  title={
                    isDisabled
                      ? settings.videoFormat === "webm"
                        ? "WebM uses Opus audio"
                        : "MP4 uses AAC audio"
                      : codec === "aac"
                      ? "Best for Windows / most players"
                      : "Higher quality, smaller files"
                  }
                >
                  {codec.toUpperCase()}
                </span>
              );
            })}
          </div>
          <p style={helpTextStyle}>
            AAC is the most compatible option for Windows players. Opus is higher quality but may not play in
            built-in Windows Media Player.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Resolution</label>
          <div style={chipContainerStyle}>
            {(["720p", "1080p", "1440p", "4k"] as VideoResolution[]).map((res) => (
              <span
                key={res}
                style={chipStyle(settings.videoResolution === res)}
                onClick={() => handleChange("videoResolution", res)}
              >
                {res}
              </span>
            ))}
          </div>
          <p style={helpTextStyle}>
            Higher resolutions provide better quality but require more storage space.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Video Audio Delay (ms)</label>
          <input
            type="number"
            min={0}
            max={2000}
            value={settings.videoAudioDelayMs}
            onChange={(e) =>
              handleChange(
                "videoAudioDelayMs",
                Math.max(0, Math.min(2000, Number(e.target.value || 0)))
              )
            }
            style={inputStyle}
          />
          <p style={helpTextStyle}>
            Use this when audio plays ahead of video. Positive values delay audio to sync with video.
          </p>
        </div>
      </div>

      {/* Audio Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaFileAudio />
          <h3 style={{ margin: 0 }}>Audio Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Audio Format</label>
          <div style={chipContainerStyle}>
            {(["mp3", "wav"] as AudioFormat[]).map((format) => (
              <span
                key={format}
                style={chipStyle(settings.audioFormat === format)}
                onClick={() => handleChange("audioFormat", format)}
              >
                {format.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        {settings.audioFormat === "mp3" ? (
          <div style={fieldStyle}>
            <label style={labelStyle}>MP3 Bitrate</label>
            <div style={chipContainerStyle}>
              {(["128k", "192k", "320k"] as AudioBitrate[]).map((bitrate) => (
                <span
                  key={bitrate}
                  style={chipStyle(settings.audioBitrate === bitrate)}
                  onClick={() => handleChange("audioBitrate", bitrate)}
                >
                  {bitrate}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p style={helpTextStyle}>
            WAV recordings are saved as 48kHz, 16-bit PCM.
          </p>
        )}
      </div>

      {/* Output Settings */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <FaFolder />
          <h3 style={{ margin: 0 }}>Output Settings</h3>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Output Folder</label>
          <input
            type="text"
            value={settings.outputBasePath}
            onChange={(e) => handleChange("outputBasePath", e.target.value)}
            placeholder="~/Documents/SmartVerses/Recordings"
            style={inputStyle}
          />
          <p style={helpTextStyle}>
            Base folder for recordings. Subfolders "video" and "audio" will be created automatically.
          </p>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Naming Pattern</label>
          <select
            value={settings.namingPattern}
            onChange={(e) => handleChange("namingPattern", e.target.value as NamingPattern)}
            style={inputStyle}
          >
            <option value="timestamp">Timestamp only (recording_2026-01-17_10-30-00)</option>
            <option value="session_timestamp">Session + Timestamp (worship_2026-01-17_10-30-00)</option>
            <option value="custom_timestamp">Custom prefix + Timestamp</option>
          </select>
          <p style={helpTextStyle}>
            Choose how recorded files should be named.
          </p>
        </div>

        {settings.namingPattern === "custom_timestamp" && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Custom Prefix</label>
            <input
              type="text"
              value={settings.customPrefix}
              onChange={(e) => handleChange("customPrefix", e.target.value)}
              placeholder="my_recording"
              style={inputStyle}
            />
          </div>
        )}

        {settings.namingPattern === "session_timestamp" && (
          <div style={fieldStyle}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={settings.includeSessionName}
                onChange={(e) => handleChange("includeSessionName", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>Include current schedule session name in filename</span>
            </label>
            <p style={helpTextStyle}>
              When enabled, the current session name from Stage Assist will be prepended to the filename.
            </p>
          </div>
        )}
      </div>

      {/* Example Output */}
      <div style={sectionStyle}>
        <h4 style={{ margin: "0 0 var(--spacing-3) 0", fontSize: "1rem" }}>
          Example Output
        </h4>
        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.85em",
            color: "var(--app-text-color-secondary)",
          }}
        >
          <div>{settings.outputBasePath}/video/</div>
          <div style={{ marginLeft: "20px" }}>
            {settings.namingPattern === "session_timestamp" && settings.includeSessionName
              ? "worship_2026-01-17_10-30-00"
              : settings.namingPattern === "custom_timestamp"
              ? `${settings.customPrefix}_2026-01-17_10-30-00`
              : "recording_2026-01-17_10-30-00"}
            .{settings.videoFormat}
          </div>
          <div style={{ marginTop: "8px" }}>{settings.outputBasePath}/audio/</div>
          <div style={{ marginLeft: "20px" }}>
            {settings.namingPattern === "session_timestamp" && settings.includeSessionName
              ? "worship_2026-01-17_10-30-00"
              : settings.namingPattern === "custom_timestamp"
              ? `${settings.customPrefix}_2026-01-17_10-30-00`
              : "recording_2026-01-17_10-30-00"}
            .{settings.audioFormat}
          </div>
        </div>
      </div>

      {/* Save Status */}
      <div
        style={{
          padding: "var(--spacing-3)",
          backgroundColor: "var(--app-header-bg)",
          borderRadius: "12px",
          border: "1px solid var(--app-border-color)",
        }}
      >
        {saveMessage.text && (
          <span
            style={{
              color: saveMessage.type === "success" ? "var(--success)" : "var(--error)",
              fontSize: "0.9em",
            }}
          >
            {saveMessage.text}
          </span>
        )}
      </div>
    </div>
  );
};

export default RecorderSettings;

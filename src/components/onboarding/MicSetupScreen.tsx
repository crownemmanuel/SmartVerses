/**
 * Screen 8: Microphone Setup
 */

import React, { useState, useEffect, useRef } from "react";
import { FaMicrophone, FaCheck, FaStop } from "react-icons/fa";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import { mapAudioLevel } from "../../utils/audioMeter";
import "./onboarding.css";

type NativeAudioInputDevice = {
  id: string;
  name: string;
  is_default: boolean;
};

const AUDIO_ACTIVE_THRESHOLD = 0.04;

const base64ToUint8Array = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const computeRmsFromInt16 = (samples: Int16Array): number => {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 32768;
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / samples.length);
};

interface MicSetupScreenProps {
  selectedMicId?: string;
  onMicSelect: (micId?: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const MicSetupScreen: React.FC<MicSetupScreenProps> = ({
  selectedMicId,
  onMicSelect,
  onNext,
  onBack,
  onSkip,
}) => {
  const [mics, setMics] = useState<NativeAudioInputDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // Mic test states
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioActive, setAudioActive] = useState(false);
  const [audioDetected, setAudioDetected] = useState(false);

  const audioLevelRef = useRef(0);
  const nativeUnlistenRef = useRef<null | (() => void)>(null);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const testTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadMicrophones();
    
    // Cleanup on unmount
    return () => {
      stopMicTest();
    };
  }, []);

  const loadMicrophones = async () => {
    setLoading(true);
    setError(null);

    try {
      const mod = await import("@tauri-apps/api/core");
      const devices = await mod.invoke<NativeAudioInputDevice[]>(
        "list_native_audio_input_devices"
      );
      setMics(devices || []);
      setPermissionGranted(true);

      // Auto-select default if nothing selected
      if (!selectedMicId && devices && devices.length > 0) {
        const defaultMic = devices[0];
        onMicSelect(defaultMic.id);

        // Save to settings
        const settings = loadSmartVersesSettings();
        settings.audioCaptureMode = "native";
        settings.selectedNativeMicrophoneId = defaultMic.id;
        settings.selectedMicrophoneId = undefined;
        saveSmartVersesSettings(settings);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to access microphone. Please grant permission."
      );
      setPermissionGranted(false);
    } finally {
      setLoading(false);
    }
  };

  const handleMicSelect = (micId: string) => {
    onMicSelect(micId);

    // Save to settings
    const settings = loadSmartVersesSettings();
    settings.audioCaptureMode = "native";
    settings.selectedNativeMicrophoneId = micId;
    settings.selectedMicrophoneId = undefined;
    saveSmartVersesSettings(settings);
    
    // Stop test if running
    if (isTesting) {
      stopMicTest();
    }
  };

  const startMicTest = async () => {
    if (!selectedMicId) return;
    
    try {
      setIsTesting(true);
      setAudioActive(false);
      setAudioDetected(false);
      setAudioLevel(0);
      audioLevelRef.current = 0;

      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }

      const events = await import("@tauri-apps/api/event");
      const core = await import("@tauri-apps/api/core");

      if (nativeUnlistenRef.current) {
        nativeUnlistenRef.current();
        nativeUnlistenRef.current = null;
      }

      nativeUnlistenRef.current = await events.listen<{ data_b64: string }>(
        "native_audio_chunk",
        (evt) => {
          const bytes = base64ToUint8Array(evt.payload.data_b64);
          if (bytes.byteLength < 2) return;

          const sampleCount = Math.floor(bytes.byteLength / 2);
          const int16 = new Int16Array(
            bytes.buffer,
            bytes.byteOffset,
            sampleCount
          );
          const rms = computeRmsFromInt16(int16);
          const nextLevel = audioLevelRef.current * 0.65 + rms * 0.35;
          audioLevelRef.current = nextLevel;
          setAudioLevel(mapAudioLevel(nextLevel));

          if (nextLevel > AUDIO_ACTIVE_THRESHOLD) {
            setAudioActive(true);
            setAudioDetected(true);
            if (activityTimeoutRef.current) {
              clearTimeout(activityTimeoutRef.current);
            }
            activityTimeoutRef.current = setTimeout(() => {
              setAudioActive(false);
            }, 1200);
          }
        }
      );

      await core.invoke("start_native_audio_stream", {
        deviceId: selectedMicId,
      });
      
      // Auto-stop after 10 seconds
      testTimerRef.current = setTimeout(() => {
        stopMicTest();
      }, 10000);
      
    } catch (err) {
      console.error("Failed to test microphone:", err);
      setError("Failed to test microphone. Please try again.");
      stopMicTest();
    }
  };

  const stopMicTest = () => {
    // Stop timer
    if (testTimerRef.current) {
      clearTimeout(testTimerRef.current);
      testTimerRef.current = null;
    }

    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = null;
    }

    if (nativeUnlistenRef.current) {
      nativeUnlistenRef.current();
      nativeUnlistenRef.current = null;
    }

    void import("@tauri-apps/api/core").then((core) => {
      return core.invoke("stop_native_audio_stream");
    });

    setIsTesting(false);
    setAudioLevel(0);
    audioLevelRef.current = 0;
    setAudioActive(false);
    setAudioDetected(false);
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">Select Microphone</h1>
        <p className="onboarding-body">
          Choose the microphone that will capture audio for transcription. This
          is typically the microphone that picks up your pastor or speaker.
        </p>

        {loading && (
          <div className="onboarding-message onboarding-message-info">
            <span className="onboarding-spinner"></span>
            Loading microphones...
          </div>
        )}

        {error && (
          <div className="onboarding-message onboarding-message-error">
            {error}
            <button
              onClick={loadMicrophones}
              className="onboarding-button onboarding-button-secondary"
              style={{ marginTop: "12px" }}
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && permissionGranted && (
          <>
            {mics.length === 0 ? (
              <div className="onboarding-message onboarding-message-warning">
                No microphones found. Please connect a microphone and try again.
              </div>
            ) : (
              <div className="onboarding-cards">
                {mics.map((mic) => (
                  <div
                    key={mic.id}
                    className={`onboarding-card ${
                      selectedMicId === mic.id ? "selected" : ""
                    }`}
                    onClick={() => handleMicSelect(mic.id)}
                  >
                    <h3 className="onboarding-card-title">
                      <FaMicrophone style={{ marginRight: "8px" }} />
                      {mic.name}
                      {mic.is_default ? " (Default)" : ""}
                      {selectedMicId === mic.id && (
                        <FaCheck
                          style={{ marginLeft: "8px", color: "var(--success)" }}
                        />
                      )}
                    </h3>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Mic Test Section */}
        {selectedMicId && !loading && !error && (
          <div style={{ marginTop: "2rem" }}>
            <button
              onClick={isTesting ? stopMicTest : startMicTest}
              className={`onboarding-button ${isTesting ? "onboarding-button-secondary" : "onboarding-button-primary"}`}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {isTesting ? (
                <>
                  <FaStop />
                  Stop Test
                </>
              ) : (
                <>
                  <FaMicrophone />
                  Test Microphone
                </>
              )}
            </button>
            
            {/* Waveform Visualization */}
            {isTesting && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.5rem",
                  background: "var(--onboarding-bg-card)",
                  border: "1px solid var(--onboarding-border-subtle)",
                  borderRadius: "12px",
                }}
              >
                <div style={{ marginBottom: "1rem", textAlign: "center" }}>
                  <p style={{ color: "var(--onboarding-text-secondary)", fontSize: "0.9rem" }}>
                    {audioActive ? "Audio detected!" : "Speak into your microphone..."}
                  </p>
                </div>
                
                <div style={{
                  height: "8px",
                  backgroundColor: "var(--onboarding-bg-dark)",
                  border: "1px solid var(--onboarding-border-subtle)",
                  borderRadius: "999px",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.max(2, Math.round((isTesting ? audioLevel : 0) * 100))}%`,
                    backgroundColor:
                      isTesting
                        ? audioLevel > 0.85
                          ? "rgb(220, 38, 38)"
                          : audioLevel > 0.7
                          ? "rgb(234, 179, 8)"
                          : "rgb(34, 197, 94)"
                        : "rgba(148, 163, 184, 0.5)",
                    transition: "width 80ms linear, background-color 150ms ease",
                  }} />
                </div>
                
                {/* Success indicator */}
                {audioDetected && (
                  <div
                    className="onboarding-message onboarding-message-success"
                    style={{
                      marginTop: "1rem",
                      animation: "fadeIn 0.3s ease",
                    }}
                  >
                    <FaCheck style={{ marginRight: "8px" }} />
                    Getting audio from your mic
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <p
          className="onboarding-body"
          style={{ fontSize: "0.9rem", marginTop: "1.5rem" }}
        >
          You can change this later in Settings → Transcription → Microphone.
        </p>

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
            disabled={!selectedMicId && !error}
            className="onboarding-button onboarding-button-primary"
          >
            Next
          </button>
          <button
            onClick={onBack}
            className="onboarding-button onboarding-button-secondary"
          >
            Back
          </button>
          <button
            onClick={onSkip}
            className="onboarding-button onboarding-button-tertiary"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};

export default MicSetupScreen;

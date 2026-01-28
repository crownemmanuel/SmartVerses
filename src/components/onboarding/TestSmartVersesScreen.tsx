/**
 * Screen 9: Test Smart Verses
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaCheck, FaPlay, FaStop } from "react-icons/fa";
import {
  DetectedBibleReference,
  KeyPoint,
  TranscriptionEngine,
  TranscriptionStatus,
  ModelLoadingProgress,
} from "../../types/smartVerses";
import {
  createTranscriptionService,
  ITranscriptionService,
  loadSmartVersesSettings,
} from "../../services/transcriptionService";
import { getAppSettings } from "../../utils/aiConfig";
import { detectAndLookupReferences, resetParseContext } from "../../services/smartVersesBibleService";
import {
  analyzeTranscriptChunk,
  resolveParaphrasedVerses,
} from "../../services/smartVersesAIService";
import "./onboarding.css";

interface TestSmartVersesScreenProps {
  transcriptionConfigured: boolean;
  micConfigured: boolean;
  transcriptionProvider?: TranscriptionEngine;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type TestMode = "scripture" | "paraphrase" | "keypoint";

const transcriptLimit = 6;

const TestSmartVersesScreen: React.FC<TestSmartVersesScreenProps> = ({
  transcriptionConfigured,
  micConfigured,
  transcriptionProvider,
  onNext,
  onBack,
  onSkip,
}) => {
  const [activeTest, setActiveTest] = useState<TestMode | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] =
    useState<TranscriptionStatus>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [scriptureResult, setScriptureResult] =
    useState<DetectedBibleReference | null>(null);
  const [paraphraseResult, setParaphraseResult] =
    useState<DetectedBibleReference | null>(null);
  const [keypointResult, setKeypointResult] = useState<KeyPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groqAvailable, setGroqAvailable] = useState(false);
  const [modelLoadingProgress, setModelLoadingProgress] = useState<ModelLoadingProgress | null>(null);

  const transcriptionServiceRef = useRef<ITranscriptionService | null>(null);
  const activeTestRef = useRef<TestMode | null>(null);

  const canTestScripture = transcriptionConfigured && micConfigured;

  useEffect(() => {
    const appSettings = getAppSettings();
    setGroqAvailable(!!appSettings.groqConfig?.apiKey);
  }, []);

  const stopTranscription = useCallback(async () => {
    if (transcriptionServiceRef.current) {
      try {
        await transcriptionServiceRef.current.stopTranscription();
      } finally {
        transcriptionServiceRef.current.destroy?.();
        transcriptionServiceRef.current = null;
      }
    }
    activeTestRef.current = null;
    setActiveTest(null);
    setTranscriptionStatus("idle");
    setModelLoadingProgress(null);
  }, []);

  useEffect(() => {
    return () => {
      void stopTranscription();
    };
  }, [stopTranscription]);

  const appendTranscriptLine = useCallback((text: string) => {
    setTranscriptLines((prev) => {
      const next = [...prev, text];
      return next.slice(-transcriptLimit);
    });
  }, []);

  const startTest = useCallback(
    async (mode: TestMode) => {
      setError(null);
      setInterimTranscript("");
      setTranscriptLines([]);

      await stopTranscription();
      activeTestRef.current = mode;
      setActiveTest(mode);

      const settings = loadSmartVersesSettings();
      if (mode === "scripture") {
        setScriptureResult(null);
        setParaphraseResult(null);
        setKeypointResult(null);
      }
      if (mode === "paraphrase") {
        setParaphraseResult(null);
      }
      if (mode === "keypoint") {
        setKeypointResult(null);
      }
      if (transcriptionProvider) {
        settings.transcriptionEngine = transcriptionProvider;
      }
      if (mode === "scripture") {
        resetParseContext();
      }

      const service = createTranscriptionService(settings, {
        onModelLoadingProgress: (progress) => {
          setModelLoadingProgress(progress);
        },
        onInterimTranscript: (text) => {
          if (activeTestRef.current) {
            setInterimTranscript(text);
          }
        },
        onFinalTranscript: async (text) => {
          if (!activeTestRef.current) return;
          setInterimTranscript("");
          appendTranscriptLine(text);

          const currentMode = activeTestRef.current;
          if (!currentMode) return;

          if (currentMode === "scripture") {
            const refs = await detectAndLookupReferences(text, {
              aggressiveSpeechNormalization: true,
            });
            if (refs.length > 0 && activeTestRef.current === "scripture") {
              setScriptureResult(refs[0]);
              await stopTranscription();
            }
          }

          if (currentMode === "paraphrase") {
            const appSettings = getAppSettings();
            const analysis = await analyzeTranscriptChunk(
              text,
              appSettings,
              true,
              false,
              {
                overrideProvider: "groq",
                minWords: settings.aiMinWordCount,
              }
            );
            if (!activeTestRef.current || activeTestRef.current !== "paraphrase") return;
            if (analysis.paraphrasedVerses.length > 0) {
              const resolved = await resolveParaphrasedVerses(
                analysis.paraphrasedVerses
              );
              if (resolved.length > 0 && activeTestRef.current === "paraphrase") {
                setParaphraseResult(resolved[0]);
                await stopTranscription();
              }
            }
          }

          if (currentMode === "keypoint") {
            const appSettings = getAppSettings();
            const analysis = await analyzeTranscriptChunk(
              text,
              appSettings,
              false,
              true,
              {
                keyPointInstructions: settings.keyPointExtractionInstructions,
                overrideProvider: "groq",
                minWords: settings.aiMinWordCount,
              }
            );
            if (!activeTestRef.current || activeTestRef.current !== "keypoint") return;
            if (analysis.keyPoints && analysis.keyPoints.length > 0) {
              setKeypointResult(analysis.keyPoints[0]);
              await stopTranscription();
            }
          }
        },
        onError: (err) => {
          console.error("Smart Verses test error:", err);
          setError(err.message);
          void stopTranscription();
        },
        onStatusChange: (status) => {
          setTranscriptionStatus(status);
          // Clear loading progress when status changes to recording (model is ready)
          if (status === "recording") {
            setTimeout(() => {
              setModelLoadingProgress(null);
            }, 500);
          }
        },
      });

      service.setAudioCaptureMode?.(
        settings.audioCaptureMode === "native" ? "native" : "webrtc"
      );
      if (settings.audioCaptureMode === "native") {
        service.setNativeMicrophoneDeviceId?.(
          settings.selectedNativeMicrophoneId || null
        );
      }
      if (settings.selectedMicrophoneId) {
        service.setMicrophone(settings.selectedMicrophoneId);
      }

      try {
        await service.startTranscription();
        transcriptionServiceRef.current = service;
      } catch (err) {
        console.error("Failed to start transcription:", err);
        setError(
          err instanceof Error ? err.message : "Failed to start transcription."
        );
        await stopTranscription();
      }
    },
    [appendTranscriptLine, stopTranscription]
  );

  const stopActiveTest = async () => {
    await stopTranscription();
  };

  const listening =
    transcriptionStatus === "connecting" || transcriptionStatus === "recording";

  const cardStyle: React.CSSProperties = {
    padding: "var(--spacing-4)",
    background: "var(--surface-2)",
    borderRadius: "12px",
    border: "1px solid var(--app-border-color)",
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-content">
        <h1 className="onboarding-title">Test Smart Verses</h1>
        <p className="onboarding-body">
          We'll listen to your mic and run the same Smart Verses detection you
          use during services.
        </p>

        {!canTestScripture ? (
          <div className="onboarding-message onboarding-message-warning">
            <strong>Testing is unavailable</strong>
            <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
              Smart Verses tests need transcription and microphone setup. You
              can finish this in Settings later.
            </p>
          </div>
        ) : (
          <>
            {/* Scripture Detection */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 var(--spacing-3)" }}>
                Scripture detection test
                {scriptureResult && (
                  <FaCheck style={{ marginLeft: "8px", color: "var(--success)" }} />
                )}
              </h3>
              <p style={{ margin: "0 0 var(--spacing-3)", fontSize: "0.9rem" }}>
                Try saying a reference like "John 3:3".
              </p>

              {modelLoadingProgress && activeTest === "scripture" && (
                <div
                  style={{
                    padding: "var(--spacing-3)",
                    background: "var(--surface-2)",
                    borderRadius: "8px",
                    border: "1px solid var(--app-border-color)",
                    marginBottom: "var(--spacing-3)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "var(--spacing-2)",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>
                      Loading model
                    </span>
                    <span style={{ fontSize: "0.9rem", color: "var(--app-text-color-secondary)" }}>
                      {Math.round(modelLoadingProgress.progress)}%
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      background: "var(--app-border-color)",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${modelLoadingProgress.progress}%`,
                        height: "100%",
                        background: "var(--onboarding-gradient-primary)",
                        borderRadius: "4px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: "var(--spacing-2)",
                      fontSize: "0.85rem",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    {modelLoadingProgress.stage}
                  </div>
                </div>
              )}

              {activeTest === "scripture" ? (
                <button
                  onClick={stopActiveTest}
                  className="onboarding-button onboarding-button-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <FaStop />
                  Stop test
                </button>
              ) : (
                <button
                  onClick={() => startTest("scripture")}
                  className="onboarding-button onboarding-button-primary"
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <FaPlay />
                  {scriptureResult ? "Retest" : "Start test"}
                </button>
              )}

              {listening && activeTest === "scripture" && !modelLoadingProgress && (
                <div className="onboarding-message onboarding-message-info">
                  <span className="onboarding-spinner"></span>
                  Listening for scripture...
                </div>
              )}

              {activeTest === "scripture" &&
                (transcriptLines.length > 0 || interimTranscript) && (
                  <div className="onboarding-message onboarding-message-info">
                    <div style={{ display: "grid", gap: "6px" }}>
                      {transcriptLines.map((line, index) => (
                        <div
                          key={`${index}-${line.slice(0, 8)}`}
                          style={{ fontSize: "0.9rem", color: "var(--onboarding-text-secondary)" }}
                        >
                          {line}
                        </div>
                      ))}
                      {interimTranscript && (
                        <div style={{ fontSize: "0.9rem", fontStyle: "italic" }}>
                          {interimTranscript}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {scriptureResult && (
                <div
                  style={{
                    marginTop: "var(--spacing-3)",
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    background: "var(--surface-3)",
                    border: "1px solid var(--app-border-color)",
                  }}
                >
                  <strong style={{ color: "var(--app-primary-color)" }}>
                    {scriptureResult.displayRef}
                  </strong>
                  <p style={{ margin: "8px 0 0" }}>{scriptureResult.verseText}</p>
                </div>
              )}
            </div>

            {/* Paraphrase Detection */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 var(--spacing-3)" }}>
                Paraphrase detection test
                {paraphraseResult && (
                  <FaCheck style={{ marginLeft: "8px", color: "var(--success)" }} />
                )}
              </h3>

              {!groqAvailable && (
                <div className="onboarding-message onboarding-message-warning">
                  For paraphrase detection, you have to set up Groq API. You can
                  do that later in Settings.
                </div>
              )}

              {groqAvailable && (
                <>
                  <p style={{ margin: "0 0 var(--spacing-3)", fontSize: "0.9rem" }}>
                    Try saying: "For God so loved the world, that he gave his only begotten Son."
                  </p>

                  {activeTest === "paraphrase" ? (
                    <button
                      onClick={stopActiveTest}
                      className="onboarding-button onboarding-button-secondary"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <FaStop />
                      Stop test
                    </button>
                  ) : (
                    <button
                      onClick={() => startTest("paraphrase")}
                      className="onboarding-button onboarding-button-primary"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                      disabled={!groqAvailable}
                    >
                      <FaPlay />
                      {paraphraseResult ? "Retest" : "Start test"}
                    </button>
                  )}

                  {listening && activeTest === "paraphrase" && (
                    <div className="onboarding-message onboarding-message-info">
                      <span className="onboarding-spinner"></span>
                      Listening for paraphrase...
                    </div>
                  )}

                  {activeTest === "paraphrase" &&
                    (transcriptLines.length > 0 || interimTranscript) && (
                      <div className="onboarding-message onboarding-message-info">
                        <div style={{ display: "grid", gap: "6px" }}>
                          {transcriptLines.map((line, index) => (
                            <div
                              key={`${index}-${line.slice(0, 8)}`}
                              style={{ fontSize: "0.9rem", color: "var(--onboarding-text-secondary)" }}
                            >
                              {line}
                            </div>
                          ))}
                          {interimTranscript && (
                            <div style={{ fontSize: "0.9rem", fontStyle: "italic" }}>
                              {interimTranscript}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </>
              )}

              {paraphraseResult && (
                <div
                  style={{
                    marginTop: "var(--spacing-3)",
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    background: "var(--surface-3)",
                    border: "1px solid var(--app-border-color)",
                  }}
                >
                  <strong style={{ color: "var(--app-primary-color)" }}>
                    {paraphraseResult.displayRef}
                  </strong>
                  <p style={{ margin: "8px 0 0" }}>{paraphraseResult.verseText}</p>
                </div>
              )}
            </div>

            {/* Keypoint Extraction */}
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 var(--spacing-3)" }}>
                Key point extraction test
                {keypointResult && (
                  <FaCheck style={{ marginLeft: "8px", color: "var(--success)" }} />
                )}
              </h3>

              {!groqAvailable && (
                <div className="onboarding-message onboarding-message-warning">
                  For key point extraction, you have to set up Groq API. You can
                  do that later in Settings.
                </div>
              )}

              {groqAvailable && (
                <>
                  <p style={{ margin: "0 0 var(--spacing-3)", fontSize: "0.9rem" }}>
                    Read this example aloud:
                    <span style={{ display: "block", marginTop: "6px", fontStyle: "italic" }}>
                      "Let me tell you something today. For there to be greatness outside of you, there has to be greatness inside of you."
                    </span>
                  </p>

                  {activeTest === "keypoint" ? (
                    <button
                      onClick={stopActiveTest}
                      className="onboarding-button onboarding-button-secondary"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <FaStop />
                      Stop test
                    </button>
                  ) : (
                    <button
                      onClick={() => startTest("keypoint")}
                      className="onboarding-button onboarding-button-primary"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                      disabled={!groqAvailable}
                    >
                      <FaPlay />
                      {keypointResult ? "Retest" : "Start test"}
                    </button>
                  )}

                  {listening && activeTest === "keypoint" && (
                    <div className="onboarding-message onboarding-message-info">
                      <span className="onboarding-spinner"></span>
                      Listening for key points...
                    </div>
                  )}

                  {activeTest === "keypoint" &&
                    (transcriptLines.length > 0 || interimTranscript) && (
                      <div className="onboarding-message onboarding-message-info">
                        <div style={{ display: "grid", gap: "6px" }}>
                          {transcriptLines.map((line, index) => (
                            <div
                              key={`${index}-${line.slice(0, 8)}`}
                              style={{ fontSize: "0.9rem", color: "var(--onboarding-text-secondary)" }}
                            >
                              {line}
                            </div>
                          ))}
                          {interimTranscript && (
                            <div style={{ fontSize: "0.9rem", fontStyle: "italic" }}>
                              {interimTranscript}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </>
              )}

              {keypointResult && (
                <div
                  style={{
                    marginTop: "var(--spacing-3)",
                    padding: "var(--spacing-3)",
                    borderRadius: "8px",
                    background: "var(--surface-3)",
                    border: "1px solid var(--app-border-color)",
                  }}
                >
                  <strong style={{ color: "var(--app-primary-color)" }}>
                    Detected key point
                  </strong>
                  <p style={{ margin: "8px 0 0" }}>{keypointResult.text}</p>
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div className="onboarding-message onboarding-message-error">
            {error}
          </div>
        )}

        <p className="onboarding-help-text">
          You can run more comprehensive tests from the Smart Verses page after
          onboarding.
        </p>

        <div className="onboarding-buttons">
          <button
            onClick={onNext}
            className="onboarding-button onboarding-button-primary"
          >
            Done
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

export default TestSmartVersesScreen;

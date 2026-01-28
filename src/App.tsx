import { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FaCog,
  FaQuestionCircle,
  FaSun,
  FaMoon,
  FaStickyNote,
  FaClock,
  FaBible,
  FaCircle,
  FaUser,
} from "react-icons/fa";
import "./App.css";
import { isOnboardingCompleted } from "./types/onboarding";
import OnboardingWizard from "./components/onboarding/OnboardingWizard";

// Import actual page components
import MainApplicationPage from "./pages/MainApplicationPage";
import SettingsPage from "./pages/SettingsPage";
import HelpPage from "./pages/HelpPage";
import MediaView from "./pages/MediaView";
import LiveSlidesNotepad from "./pages/LiveSlidesNotepad";
import StageAssistPage from "./pages/StageAssistPage";
import SmartVersesPage from "./pages/SmartVersesPage";
import RecorderPage from "./pages/RecorderPage";
import AudienceDisplayPage from "./pages/AudienceDisplayPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { loadEnabledFeatures } from "./services/recorderService";
import { clearDisplayScripture, clearDisplaySlides } from "./services/displayService";
import { EnabledFeatures } from "./types/recorder";
import {
  StageAssistProvider,
  useStageAssist,
  formatStageAssistTime,
} from "./contexts/StageAssistContext";
import {
  loadLiveSlidesSettings,
  startLiveSlidesServer,
} from "./services/liveSlideService";
import { goLiveScriptureReference } from "./services/smartVersesApiService";
import { loadNetworkSyncSettings } from "./services/networkSyncService";
import { setApiEnabled } from "./services/apiService";
import UpdateNotification from "./components/UpdateNotification";
import OfflineModelLoadingToast from "./components/OfflineModelLoadingToast";
import { preloadOfflineModel } from "./services/offlineModelPreloadService";
import { loadSmartVersesSettings } from "./services/transcriptionService";

// Global Chat Assistant imports
import GlobalChatButton from "./components/GlobalChatButton";
import GlobalChatDrawer from "./components/GlobalChatDrawer";
import { Template, Playlist, Slide } from "./types";
import { ScheduleItem } from "./types/propresenter";
import { SetTimerParams } from "./types/globalChat";

// Navigation component that uses useLocation
function Navigation({
  theme,
  toggleTheme,
  enabledFeatures,
}: {
  theme: string;
  toggleTheme: () => void;
  enabledFeatures: EnabledFeatures;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { timerState, getNextSession, goNextSession } = useStageAssist();
  const nextSession = getNextSession();

  // Hide navigation on the notepad page for a cleaner experience
  if (location.pathname.includes("/live-slides/notepad/")) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="app-nav">
      {enabledFeatures.slides && (
        <Link
          to="/"
          className={`nav-action-button ${isActive("/") ? "active" : ""}`}
        >
          <FaStickyNote />
          <span>Slides</span>
        </Link>
      )}
      {enabledFeatures.timer && (
        <Link
          to="/stage-assist"
          className={`nav-action-button ${
            isActive("/stage-assist") ? "active" : ""
          }`}
        >
          <FaClock />
          <span>Timer</span>
        </Link>
      )}
      {enabledFeatures.liveTestimonies && (
        <Link
          to="/live-testimonies"
          className={`nav-action-button ${
            isActive("/live-testimonies") ? "active" : ""
          }`}
        >
          <FaUser />
          <span>Live Testimonies</span>
        </Link>
      )}
      {enabledFeatures.smartVerses && (
        <Link
          to="/smartverses"
          className={`nav-action-button ${
            isActive("/smartverses") ? "active" : ""
          }`}
        >
          <FaBible />
          <span>SmartVerses</span>
        </Link>
      )}
      {enabledFeatures.recorder && (
        <Link
          to="/recorder"
          className={`nav-action-button ${isActive("/recorder") ? "active" : ""}`}
        >
          <FaCircle />
          <span>Recorder</span>
        </Link>
      )}
      <Link
        to="/settings"
        className={`nav-action-button ${isActive("/settings") ? "active" : ""}`}
      >
        <FaCog />
        <span>Settings</span>
      </Link>
      <Link
        to="/help"
        className={`nav-action-button ${isActive("/help") ? "active" : ""}`}
      >
        <FaQuestionCircle />
        <span>Help</span>
      </Link>

      {timerState.isRunning && (
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
          title="Current countdown"
        >
          <button
            onClick={() => navigate("/stage-assist")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              font: "inherit",
            }}
          >
            <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              {timerState.sessionName || "Timer"}:{" "}
              {formatStageAssistTime(timerState.timeLeft)}
            </span>
            {nextSession && (
              <span
                style={{
                  opacity: 0.8,
                  fontSize: "0.85em",
                  whiteSpace: "nowrap",
                }}
              >
                Next: {nextSession.session}
              </span>
            )}
          </button>
          <button
            onClick={async () => {
              const didGo = await goNextSession();
              if (didGo) navigate("/stage-assist");
            }}
            disabled={!nextSession}
            style={{
              padding: "6px 10px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.18)",
              background: nextSession
                ? "rgba(34,197,94,0.18)"
                : "rgba(255,255,255,0.06)",
              color: "inherit",
              cursor: nextSession ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
            title={nextSession ? "Start next session timer" : "No next session"}
          >
            Go Next
          </button>
        </div>
      )}

      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
        className="theme-toggle-button"
      >
        {theme === "light" ? <FaMoon /> : <FaSun />}
      </button>
    </nav>
  );
}

// Wrapper component that conditionally renders the container
function AppContent({
  theme,
  toggleTheme,
  enabledFeatures,
}: {
  theme: string;
  toggleTheme: () => void;
  enabledFeatures: EnabledFeatures;
}) {
  const location = useLocation();
  const { schedule, startCountdown, startCountdownToTime, stopTimer: _stopStageTimer } = useStageAssist();
  const isNotepadPage = location.pathname.includes("/live-slides/notepad/");

  // Enabled features state
  const [enabledFeaturesState, setEnabledFeatures] = useState<EnabledFeatures>(enabledFeatures);

  type AiRateLimitDetail = {
    provider: "groq";
    until: number;
    message: string;
    detail?: string;
  };

  const [groqRateLimit, setGroqRateLimit] = useState<AiRateLimitDetail | null>(null);
  const [rateLimitNow, setRateLimitNow] = useState(() => Date.now());

  const formatRateLimitRemaining = (remainingMs: number) => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
    }
    return `${seconds}s`;
  };

  useEffect(() => {
    const handleRateLimit = (event: CustomEvent<AiRateLimitDetail>) => {
      if (event.detail.provider !== "groq") return;
      if (!event.detail.until || event.detail.until <= Date.now()) {
        setGroqRateLimit(null);
        return;
      }
      setGroqRateLimit(event.detail);
      setRateLimitNow(Date.now());
    };

    window.addEventListener("ai-rate-limit", handleRateLimit as EventListener);
    return () => {
      window.removeEventListener("ai-rate-limit", handleRateLimit as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!groqRateLimit) return;
    const interval = window.setInterval(() => {
      setRateLimitNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [groqRateLimit]);

  useEffect(() => {
    if (!groqRateLimit) return;
    const remainingMs = groqRateLimit.until - Date.now();
    if (remainingMs <= 0) {
      setGroqRateLimit(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setGroqRateLimit(null);
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [groqRateLimit]);

  // Listen for features-updated events
  useEffect(() => {
    const handleFeaturesUpdated = (event: CustomEvent<EnabledFeatures>) => {
      setEnabledFeatures(event.detail);
    };
    window.addEventListener("features-updated", handleFeaturesUpdated as EventListener);
    return () => {
      window.removeEventListener("features-updated", handleFeaturesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    let unlisten: null | (() => void) = null;
    const isSmartVersesActive = () =>
      (window as Window & { __smartVersesActive?: boolean }).__smartVersesActive;

    (async () => {
      try {
        const events = await import("@tauri-apps/api/event");
        unlisten = await events.listen<{ reference?: string }>(
          "api-scripture-go-live",
          async (event) => {
            const reference = String(event.payload?.reference ?? "").trim();
            if (!reference) return;

            if (isSmartVersesActive()) {
              window.dispatchEvent(
                new CustomEvent("smartverses-api-go-live", {
                  detail: { reference },
                })
              );
              return;
            }

            try {
              const result = await goLiveScriptureReference(reference);
              if (!result) {
                console.warn("[API] No scripture match for:", reference);
              }
            } catch (error) {
              console.warn("[API] Failed to go live:", error);
            }
          }
        );
      } catch (error) {
        console.warn("[API] Failed to listen for scripture events:", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Global Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentSlides, setCurrentSlides] = useState<Slide[]>([]);

  // Load templates from localStorage
  const loadTemplates = useCallback(() => {
    try {
      const saved = localStorage.getItem("proassist-templates");
      if (saved) {
        setTemplates(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    }
  }, []);

  // Load templates on mount and listen for updates
  useEffect(() => {
    loadTemplates();

    const handleTemplatesUpdated = () => loadTemplates();
    window.addEventListener("templates-updated", handleTemplatesUpdated);
    window.addEventListener("storage", (e) => {
      if (e.key === "proassist-templates") loadTemplates();
    });

    return () => {
      window.removeEventListener("templates-updated", handleTemplatesUpdated);
    };
  }, [loadTemplates]);

  // Listen for current slides changes from MainApplicationPage
  useEffect(() => {
    const handleCurrentSlidesChanged = (event: CustomEvent<{ slides: Slide[] }>) => {
      setCurrentSlides(event.detail.slides || []);
    };

    window.addEventListener("current-slides-changed", handleCurrentSlidesChanged as EventListener);
    return () => {
      window.removeEventListener("current-slides-changed", handleCurrentSlidesChanged as EventListener);
    };
  }, []);

  // Determine current page for chat context
  const getCurrentPage = ():
    | "main"
    | "stageAssist"
    | "liveSlides"
    | "media"
    | "smartVerses"
    | "settings"
    | "help" => {
    if (location.pathname === "/") return "main";
    if (location.pathname === "/stage-assist") return "stageAssist";
    if (location.pathname.includes("/live-slides")) return "liveSlides";
    if (location.pathname === "/live-testimonies") return "media";
    if (location.pathname === "/smartverses") return "smartVerses";
    if (location.pathname === "/settings") return "settings";
    if (location.pathname === "/help") return "help";
    return "main";
  };

  // Chat action callbacks
  const handleSlidesCreated = useCallback(
    (slides: Slide[], templateId: string) => {
      // Dispatch event for MainApplicationPage to handle
      window.dispatchEvent(
        new CustomEvent("ai-slides-created", { detail: { slides, templateId } })
      );
    },
    []
  );

  const handlePlaylistCreated = useCallback((playlist: Playlist) => {
    // Dispatch event for MainApplicationPage to handle
    window.dispatchEvent(
      new CustomEvent("ai-playlist-created", { detail: { playlist } })
    );
  }, []);

  const handleTimerSet = useCallback(
    async (params: SetTimerParams) => {
      // Use the same timer logic as the StageAssist page
      // This ensures the nav bar timer display updates and ProPresenter timers are synced
      console.log("Timer set via AI:", params);

      if (params.type === "countdown" && typeof params.value === "number") {
        // Countdown timer with duration in seconds
        await startCountdown(params.value);
      } else if (params.type === "countdownToTime" && typeof params.value === "string") {
        // Countdown to specific time (e.g., "10:30 AM")
        const timeMatch = params.value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
          const time = `${timeMatch[1]}:${timeMatch[2]}`;
          const period = timeMatch[3].toUpperCase() as "AM" | "PM";
          await startCountdownToTime(time, period);
        }
      }
    },
    [startCountdown, startCountdownToTime]
  );

  const handleScheduleUpdated = useCallback((newSchedule: ScheduleItem[]) => {
    // Dispatch event for StageAssistPage to handle
    window.dispatchEvent(
      new CustomEvent("ai-schedule-updated", {
        detail: { schedule: newSchedule },
      })
    );
  }, []);

  const handleCurrentSlidesUpdated = useCallback((slides: Slide[]) => {
    // Dispatch event for MainApplicationPage to handle
    setCurrentSlides(slides);
    window.dispatchEvent(
      new CustomEvent("ai-current-slides-updated", {
        detail: { slides },
      })
    );
  }, []);

  if (isNotepadPage) {
    // Notepad page gets full viewport without navigation
    return (
      <Routes>
        <Route
          path="/live-slides/notepad/:sessionId"
          element={<LiveSlidesNotepad />}
        />
      </Routes>
    );
  }

  if (location.pathname === "/audience-display") {
    return (
      <Routes>
        <Route path="/audience-display" element={<AudienceDisplayPage />} />
      </Routes>
    );
  }

  // Determine which page is active based on route
  const isMainPage = location.pathname === "/";
  const isSettingsPage = location.pathname === "/settings";
  const isLiveTestimoniesPage = location.pathname === "/live-testimonies";
  const isSmartVersesPage = location.pathname === "/smartverses";
  const isStageAssistPage = location.pathname === "/stage-assist";
  const isRecorderPage = location.pathname === "/recorder";
  const isHelpPage = location.pathname === "/help";

  return (
    <>
      <div className="container">
        <Navigation theme={theme} toggleTheme={toggleTheme} enabledFeatures={enabledFeaturesState} />
        {groqRateLimit && groqRateLimit.until > rateLimitNow && (
          <div className="ai-rate-limit-row">
            <div
              className="ai-rate-limit-banner"
              title={groqRateLimit.detail || groqRateLimit.message}
            >
              {groqRateLimit.message}{" "}
              ({formatRateLimitRemaining(groqRateLimit.until - rateLimitNow)})
            </div>
          </div>
        )}
        {/* Keep all components mounted but show/hide based on route */}
        <div style={{ display: isMainPage ? "block" : "none" }}>
          <MainApplicationPage />
        </div>
        <div style={{ display: isSettingsPage ? "block" : "none" }}>
          <SettingsPage />
        </div>
        <div style={{ display: isLiveTestimoniesPage ? "block" : "none" }}>
          <ErrorBoundary>
            <MediaView />
          </ErrorBoundary>
        </div>
        <div style={{ display: isSmartVersesPage ? "block" : "none" }}>
          <SmartVersesPage />
        </div>
        <div style={{ display: isStageAssistPage ? "block" : "none" }}>
          <StageAssistPage />
        </div>
        {/* Only render RecorderPage when the feature is enabled to prevent camera access when disabled */}
        {enabledFeaturesState.recorder && (
          <div style={{ display: isRecorderPage ? "block" : "none" }}>
            <RecorderPage />
          </div>
        )}
        <div style={{ display: isHelpPage ? "block" : "none" }}>
          <HelpPage />
        </div>
      </div>

      {/* Global AI Chat Assistant */}
      {!isSmartVersesPage && (
        <GlobalChatButton
          onClick={() => setIsChatOpen(!isChatOpen)}
          isOpen={isChatOpen}
        />
      )}
      <GlobalChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentPage={getCurrentPage()}
        templates={templates}
        currentSchedule={schedule}
        currentSlides={currentSlides}
        onSlidesCreated={handleSlidesCreated}
        onPlaylistCreated={handlePlaylistCreated}
        onTimerSet={handleTimerSet}
        onScheduleUpdated={handleScheduleUpdated}
        onCurrentSlidesUpdated={handleCurrentSlidesUpdated}
      />
    </>
  );
}

function App() {
  const [windowLabel] = useState<string>(() => {
    try {
      return getCurrentWindow().label;
    } catch {
      console.warn("Failed to get initial window label");
      return "unknown";
    }
  });

  // Calculate isSecondScreen purely from initial state to prevent flash of main app
  const isSecondScreen = windowLabel.startsWith("dialog-");
  const isMainWindow = windowLabel === "main";

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    // Only show onboarding for the main window on first launch
    return isMainWindow && !isOnboardingCompleted();
  });

  const [theme, setTheme] = useState(
    localStorage.getItem("app-theme") || "dark"
  );

  // Apply theme immediately to body to prevent flash of unstyled content
  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  // Clear last scripture on main app startup so displays start blank.
  useEffect(() => {
    if (windowLabel !== "main") return;
    clearDisplayScripture();
    clearDisplaySlides();
  }, [windowLabel]);

  // Global shortcut to open DevTools / Inspector (useful on production machines to debug issues).
  useEffect(() => {
    if (isSecondScreen) return;
    const handler = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingContext =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (target?.isContentEditable ?? false);
      if (isTypingContext) return;

      const isF12 = e.key === "F12";
      const isMacInspector =
        (e.key === "I" || e.key === "i") && e.metaKey && e.altKey;
      const isWinInspector =
        (e.key === "I" || e.key === "i") && e.ctrlKey && e.shiftKey;

      if (!isF12 && !isMacInspector && !isWinInspector) return;

      e.preventDefault();
      try {
        const coreApi = await import("@tauri-apps/api/core");
        await coreApi.invoke("toggle_devtools");
      } catch (err) {
        console.warn("Failed to toggle devtools:", err);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSecondScreen]);

  // Auto-start Live Slides WebSocket server if enabled in settings.
  useEffect(() => {
    if (isSecondScreen) return;
    const liveSlidesSettings = loadLiveSlidesSettings();
    const syncSettings = loadNetworkSyncSettings();

    setApiEnabled(syncSettings.apiEnabled).catch((err) => {
      console.warn("[API] Failed to apply API toggle:", err);
    });

    if (!liveSlidesSettings.autoStartServer && !syncSettings.apiEnabled) {
      return;
    }

    // Best-effort: if it fails (already running / port in use), we'll let Settings/Import UI surface it.
    startLiveSlidesServer(liveSlidesSettings.serverPort).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("already running")) {
        console.warn("[LiveSlides] Auto-start server failed:", err);
      }
    });
  }, [isSecondScreen]);

  useEffect(() => {
    if (!isMainWindow) return;

    const settings = loadSmartVersesSettings();
    let modelId: string | null = null;

    if (settings.transcriptionEngine === "offline-whisper") {
      modelId = settings.offlineWhisperModel || "onnx-community/whisper-base";
    } else if (settings.transcriptionEngine === "offline-moonshine") {
      modelId =
        settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX";
    }

    if (!modelId) return;

    preloadOfflineModel({
      modelId,
      source: "startup",
      force: true,
    }).catch((error) => {
      console.warn("[OfflineModel] Startup preload failed:", error);
    });
  }, [isMainWindow]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
  };

  // If this is a secondary window, render ONLY that component.
  // CRITICAL: Do NOT render Router, StageAssistProvider, or any other main app context here.
  if (isSecondScreen) {
    // Fallback for other dialogs or test windows
    return <AudienceDisplayPage />;
  }

  // Show onboarding wizard if needed
  if (showOnboarding) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  // Load enabled features only for the main app
  const enabledFeatures = loadEnabledFeatures();

  return (
    <Router>
      <StageAssistProvider>
        <AppContent theme={theme} toggleTheme={toggleTheme} enabledFeatures={enabledFeatures} />
        {isMainWindow && <OfflineModelLoadingToast />}
        {isMainWindow && <UpdateNotification />}
      </StageAssistProvider>
    </Router>
  );
}

export default App;

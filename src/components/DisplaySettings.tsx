import React, { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { Monitor } from "@tauri-apps/api/window";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import { useAutoFontSize } from "../hooks/useAutoFontSize";
import {
  closeDisplayWindow,
  getAvailableMonitors,
  loadDisplaySettings,
  openDisplayWindow,
  saveDisplaySettings,
} from "../services/displayService";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_SLIDES_LAYOUT,
  DisplayLayout,
  DisplaySettings as DisplaySettingsType,
} from "../types/display";
import DisplayLayoutEditorModal from "./DisplayLayoutEditorModal";
import SlidesLayoutEditorModal from "./SlidesLayoutEditorModal";
import {
  getLiveSlidesServerInfo,
  loadLiveSlidesSettings,
  startLiveSlidesServer,
} from "../services/liveSlideService";
import { FaCopy } from "react-icons/fa";

interface SystemFont {
  family: string;
  postscript_name: string | null;
}

const SAMPLE_TEXT =
  "For God so loved the world that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.";
const SAMPLE_REFERENCE = "John 3:16";
const SAMPLE_SLIDE_LINES = [
  "Line 1 sample text",
  "Line 2 sample text",
  "Line 3 sample text",
  "Line 4 sample text",
  "Line 5 sample text",
  "Line 6 sample text",
];

const DisplaySettings: React.FC = () => {
  const [settings, setSettings] = useState<DisplaySettingsType>(
    DEFAULT_DISPLAY_SETTINGS
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [slidesLayoutEditorOpen, setSlidesLayoutEditorOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("");
  const previewTextBoxRef = useRef<HTMLDivElement | null>(null);
  const previewTextContentRef = useRef<HTMLDivElement | null>(null);
  const previewReferenceBoxRef = useRef<HTMLDivElement | null>(null);
  const previewReferenceContentRef = useRef<HTMLDivElement | null>(null);
  const slideLineBoxRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ];
  const slideLineContentRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ];
  const [layoutPreviewTab, setLayoutPreviewTab] = useState<"scripture" | "slides">("scripture");
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);
  const [serverInfo, setServerInfo] = useState<{ local_ip: string; server_port: number; server_running: boolean } | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [testWindowStatus, setTestWindowStatus] = useState<string>("");
  const [osType, setOsType] = useState<"windows" | "mac" | "linux" | "unknown">("unknown");

  useEffect(() => {
    const userAgent = navigator.userAgent;
    if (userAgent.indexOf("Win") !== -1) {
      setOsType("windows");
    } else if (userAgent.indexOf("Mac") !== -1) {
      setOsType("mac");
    } else if (userAgent.indexOf("Linux") !== -1) {
      setOsType("linux");
    }
  }, []);

  useEffect(() => {
    const loaded = loadDisplaySettings();
    setSettings(loaded);
    setSettingsLoaded(true);
  }, []);

  const loadMonitors = async () => {
    const list = await getAvailableMonitors();
    setMonitors(list);
    if (list.length > 0) {
      setSettings((prev) => {
        const monitorIndex =
          prev.monitorIndex != null && prev.monitorIndex < list.length
            ? prev.monitorIndex
            : 0;
        if (monitorIndex === prev.monitorIndex) return prev;
        return { ...prev, monitorIndex };
      });
    }
  };

  useEffect(() => {
    void loadMonitors();
  }, []);

  // Load server info for web display URL
  const loadServerInfo = async () => {
    try {
      const info = await getLiveSlidesServerInfo();
      setServerInfo({
        local_ip: info.local_ip,
        server_port: info.server_port,
        server_running: info.server_running,
      });
    } catch (error) {
      console.error("[Display] Failed to load server info:", error);
    }
  };

  useEffect(() => {
    void loadServerInfo();
    const interval = setInterval(loadServerInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load system fonts
  useEffect(() => {
    const loadSystemFonts = async () => {
      try {
        setFontsLoading(true);
        const fonts = await invoke<SystemFont[]>("get_available_system_fonts");
        setSystemFonts(fonts);
      } catch (error) {
        console.error("[Display] Failed to load system fonts:", error);
        // Fallback to empty array - will use custom font entry
      } finally {
        setFontsLoading(false);
      }
    };
    void loadSystemFonts();
  }, []);

  useDebouncedEffect(
    () => {
      if (!settingsLoaded) return;
      saveDisplaySettings(settings);
      setSaveMessage("Changes saved");
      window.setTimeout(() => setSaveMessage(""), 2000);
    },
    [settings, settingsLoaded],
    { delayMs: 400, enabled: settingsLoaded, skipFirstRun: true }
  );

  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings.enabled) {
      // Check if a monitor is selected
      if (settings.monitorIndex === null && monitors.length > 0) {
        // Auto-select first secondary monitor or primary if only one monitor
        const defaultIndex = monitors.length > 1 ? 1 : 0;
        setSettings((prev) => ({ ...prev, monitorIndex: defaultIndex }));
        return; // Will retry on next render with monitorIndex set
      }
      
      openDisplayWindow(settings)
        .then(() => {
          setErrorMessage("");
        })
        .catch((error) => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error("[Display] Failed to open audience window:", error);
          setErrorMessage(`Failed to open audience screen: ${errorMsg}`);
          // Disable the toggle if window creation fails
          setSettings((prev) => ({ ...prev, enabled: false }));
        });
    } else {
      closeDisplayWindow().catch((error) => {
        console.warn("[Display] Failed to close audience window:", error);
      });
      setErrorMessage("");
    }
  }, [settings.enabled, settings.monitorIndex, settingsLoaded, monitors.length]);

  // Load background image asynchronously
  useEffect(() => {
    const loadBackgroundImage = async () => {
      if (!settings.backgroundImagePath) {
        setBackgroundImageUrl("");
        return;
      }

      try {
        // Use read_file_as_base64 as primary method for robustness
        // convertFileSrc can have issues with asset protocol configuration or CSP
        console.log("[Display] Loading background image via base64:", settings.backgroundImagePath);
        const base64 = await invoke<string>("read_file_as_base64", {
          filePath: settings.backgroundImagePath,
        });
        
        // Determine MIME type from file extension
        const path = settings.backgroundImagePath.toLowerCase();
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
        console.error("[Display] Failed to load background image:", error);
        
        // Fallback to convertFileSrc if base64 fails
        try {
          const convertedUrl = convertFileSrc(settings.backgroundImagePath);
          if (convertedUrl && (convertedUrl.startsWith("http://") || convertedUrl.startsWith("https://") || convertedUrl.startsWith("tauri://"))) {
             setBackgroundImageUrl(convertedUrl);
          } else {
             setBackgroundImageUrl("");
          }
        } catch (e) {
           setBackgroundImageUrl("");
        }
      }
    };

    void loadBackgroundImage();
  }, [settings.backgroundImagePath]);

  const fontOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];
    
    // Add system fonts
    systemFonts.forEach((font) => {
      options.push({
        label: font.family,
        value: font.family,
      });
    });
    
    // Add custom fonts if they're not in the system fonts list
    const systemFontFamilies = new Set(systemFonts.map((f) => f.family));
    if (settings.textFont && !systemFontFamilies.has(settings.textFont)) {
      options.push({
        label: `Custom: ${settings.textFont}`,
        value: settings.textFont,
      });
    }
    if (
      settings.referenceFont &&
      !systemFontFamilies.has(settings.referenceFont) &&
      settings.referenceFont !== settings.textFont
    ) {
      options.push({
        label: `Custom: ${settings.referenceFont}`,
        value: settings.referenceFont,
      });
    }

    settings.slidesLineStyles?.forEach((style) => {
      if (style?.fontFamily && !systemFontFamilies.has(style.fontFamily)) {
        options.push({
          label: `Custom: ${style.fontFamily}`,
          value: style.fontFamily,
        });
        systemFontFamilies.add(style.fontFamily);
      }
    });
    
    return options;
  }, [systemFonts, settings.textFont, settings.referenceFont, settings.slidesLineStyles]);

  const handleUpdateLayout = (layout: DisplayLayout) => {
    setSettings((prev) => ({ ...prev, layout }));
    setLayoutEditorOpen(false);
  };

  const handleUpdateSlidesLayout = (
    slidesLayout: DisplayLayout["text"][],
    slidesLineStyles: DisplaySettingsType["slidesLineStyles"]
  ) => {
    setSettings((prev) => ({ ...prev, slidesLayout, slidesLineStyles }));
    setSlidesLayoutEditorOpen(false);
  };

  const handleSelectBackgroundImage = async () => {
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const selected = await dialog.open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp"],
          },
        ],
      });
      if (typeof selected === "string") {
        setSettings((prev) => ({ ...prev, backgroundImagePath: selected }));
      }
    } catch (error) {
      console.error("[Display] Failed to select background image:", error);
    }
  };

  useEffect(() => {
    if (!settingsLoaded) return;

    const manageAudienceWindow = async () => {
      if (settings.windowAudienceScreen) {
        try {
          // If a monitor is not selected, try to select one automatically
          let currentMonitorIndex = settings.monitorIndex;
          if (currentMonitorIndex === null && monitors.length > 0) {
            const defaultIndex = monitors.length > 1 ? 1 : 0;
            currentMonitorIndex = defaultIndex;
            // Update settings silently so it persists
            setSettings((prev) => ({ ...prev, monitorIndex: defaultIndex }));
          }

          setTestWindowStatus("Opening audience window...");
          await invoke("open_dialog", {
            dialogWindow: "audience-test",
            monitorIndex: currentMonitorIndex,
          });
          setTestWindowStatus("Audience window opened.");
          setTimeout(() => setTestWindowStatus(""), 3000);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setTestWindowStatus(`Failed to open window: ${message}`);
          console.error("[Display] Failed to open audience window:", error);
          // Revert checkbox if it fails
          setSettings((prev) => ({ ...prev, windowAudienceScreen: false }));
        }
      } else {
        try {
          await invoke("close_dialog", { dialogWindow: "audience-test" });
          setTestWindowStatus("Audience window closed.");
          setTimeout(() => setTestWindowStatus(""), 2000);
        } catch (error) {
          console.warn("[Display] Failed to close audience window:", error);
          // Fallback to JS API if command fails (though command is preferred)
          try {
            const w = await WebviewWindow.getByLabel("dialog-audience-test");
            if (w) await w.close();
          } catch (e) { /* ignore */ }
        }
      }
    };

    void manageAudienceWindow();
  }, [settings.windowAudienceScreen, settingsLoaded, monitors.length]); // Intentionally omitting monitorIndex to avoid re-opening on change for now

  const rectStyle = (rect: { x: number; y: number; width: number; height: number }): React.CSSProperties => ({
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  });

  const getSlideRect = (index: number) =>
    settings.slidesLayout[index] ||
    DEFAULT_SLIDES_LAYOUT[index] ||
    DEFAULT_SLIDES_LAYOUT[DEFAULT_SLIDES_LAYOUT.length - 1];

  // Auto font size for preview
  const previewTextFontSize = useAutoFontSize(
    previewTextBoxRef,
    previewTextContentRef,
    [
      SAMPLE_TEXT,
      settings.textFont,
      settings.layout.text.x,
      settings.layout.text.y,
      settings.layout.text.width,
      settings.layout.text.height,
    ],
    { minFontSize: 8, maxFontSize: 48 }
  );

  const previewReferenceFontSize = useAutoFontSize(
    previewReferenceBoxRef,
    previewReferenceContentRef,
    [
      SAMPLE_REFERENCE,
      settings.referenceFont,
      settings.layout.reference.x,
      settings.layout.reference.y,
      settings.layout.reference.width,
      settings.layout.reference.height,
    ],
    { minFontSize: 8, maxFontSize: 36 }
  );

  const slideLineFontSizes = [
    useAutoFontSize(
      slideLineBoxRefs[0],
      slideLineContentRefs[0],
      [
        SAMPLE_SLIDE_LINES[0],
        settings.textFont,
        settings.slidesLineStyles?.[0]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[0]?.bold,
        settings.slidesLineStyles?.[0]?.italic,
        getSlideRect(0).x,
        getSlideRect(0).y,
        getSlideRect(0).width,
        getSlideRect(0).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
    useAutoFontSize(
      slideLineBoxRefs[1],
      slideLineContentRefs[1],
      [
        SAMPLE_SLIDE_LINES[1],
        settings.textFont,
        settings.slidesLineStyles?.[1]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[1]?.bold,
        settings.slidesLineStyles?.[1]?.italic,
        getSlideRect(1).x,
        getSlideRect(1).y,
        getSlideRect(1).width,
        getSlideRect(1).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
    useAutoFontSize(
      slideLineBoxRefs[2],
      slideLineContentRefs[2],
      [
        SAMPLE_SLIDE_LINES[2],
        settings.textFont,
        settings.slidesLineStyles?.[2]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[2]?.bold,
        settings.slidesLineStyles?.[2]?.italic,
        getSlideRect(2).x,
        getSlideRect(2).y,
        getSlideRect(2).width,
        getSlideRect(2).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
    useAutoFontSize(
      slideLineBoxRefs[3],
      slideLineContentRefs[3],
      [
        SAMPLE_SLIDE_LINES[3],
        settings.textFont,
        settings.slidesLineStyles?.[3]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[3]?.bold,
        settings.slidesLineStyles?.[3]?.italic,
        getSlideRect(3).x,
        getSlideRect(3).y,
        getSlideRect(3).width,
        getSlideRect(3).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
    useAutoFontSize(
      slideLineBoxRefs[4],
      slideLineContentRefs[4],
      [
        SAMPLE_SLIDE_LINES[4],
        settings.textFont,
        settings.slidesLineStyles?.[4]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[4]?.bold,
        settings.slidesLineStyles?.[4]?.italic,
        getSlideRect(4).x,
        getSlideRect(4).y,
        getSlideRect(4).width,
        getSlideRect(4).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
    useAutoFontSize(
      slideLineBoxRefs[5],
      slideLineContentRefs[5],
      [
        SAMPLE_SLIDE_LINES[5],
        settings.textFont,
        settings.slidesLineStyles?.[5]?.fontFamily,
        settings.textStyle.bold,
        settings.textStyle.italic,
        settings.slidesLineStyles?.[5]?.bold,
        settings.slidesLineStyles?.[5]?.italic,
        getSlideRect(5).x,
        getSlideRect(5).y,
        getSlideRect(5).width,
        getSlideRect(5).height,
      ],
      { minFontSize: 8, maxFontSize: 300 }
    ),
  ];

  const getFontStyle = (style: DisplaySettingsType["textStyle"]): React.CSSProperties => {
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

  const getSlideLineStyle = (index: number): DisplaySettingsType["textStyle"] => {
    const override = settings.slidesLineStyles?.[index];
    return {
      color: override?.color ?? settings.textStyle.color,
      bold: override?.bold ?? settings.textStyle.bold,
      italic: override?.italic ?? settings.textStyle.italic,
      stroke: override?.stroke ?? settings.textStyle.stroke,
      shadow: override?.shadow ?? settings.textStyle.shadow,
    };
  };

  const getSlideLineFontFamily = (index: number) =>
    settings.slidesLineStyles?.[index]?.fontFamily || settings.textFont;

  return (
    <div style={{ maxWidth: "900px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Audience Display</h2>
      <p style={{ color: "var(--app-text-color-secondary)" }}>
        Configure the second screen used to show scriptures and slides to the audience.
      </p>

      <div style={{ marginTop: "var(--spacing-4)", display: "grid", gap: "18px" }}>
        {osType === "windows" && (
        <div
          style={{
            padding: "var(--spacing-4)",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "12px",
            border: "1px solid var(--app-border-color)",
            display: "grid",
            gap: "12px",
          }}
        >
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.windowAudienceScreen}
              onChange={(event) => {
                const newEnabled = event.target.checked;
                setSettings((prev) => ({
                  ...prev,
                  windowAudienceScreen: newEnabled,
                }));
              }}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>Enable audience screen (Windows)</div>
              <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
                Opens a second audience window on the selected monitor.
              </div>
            </div>
          </label>

          {testWindowStatus && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "0.85rem",
                color: testWindowStatus.startsWith("Failed")
                  ? "#ef4444"
                  : testWindowStatus.startsWith("Audience window opened")
                  ? "#22c55e"
                  : "var(--app-text-color-secondary)",
                fontWeight: testWindowStatus.startsWith("Failed") ? 600 : 400,
                padding: "8px",
                backgroundColor: testWindowStatus.startsWith("Failed")
                  ? "rgba(239, 68, 68, 0.1)"
                  : testWindowStatus.startsWith("Audience window opened")
                  ? "rgba(34, 197, 94, 0.1)"
                  : "transparent",
                borderRadius: "6px",
                border: testWindowStatus.startsWith("Failed")
                  ? "1px solid rgba(239, 68, 68, 0.3)"
                  : "none",
              }}
            >
              {testWindowStatus}
            </div>
          )}
        </div>
        )}

        {osType === "mac" && (
        <div
          style={{
            padding: "var(--spacing-4)",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "12px",
            border: "1px solid var(--app-border-color)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => {
                const newEnabled = event.target.checked;
                if (newEnabled && monitors.length === 0) {
                  setErrorMessage("No monitors detected. Please ensure you have at least one display connected.");
                  return;
                }
                if (newEnabled && settings.monitorIndex === null && monitors.length > 0) {
                  // Auto-select first secondary monitor or primary if only one
                  const defaultIndex = monitors.length > 1 ? 1 : 0;
                  setSettings((prev) => ({
                    ...prev,
                    enabled: newEnabled,
                    monitorIndex: defaultIndex,
                  }));
                } else {
                  setSettings((prev) => ({
                    ...prev,
                    enabled: newEnabled,
                  }));
                }
              }}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>Enable audience screen (Mac)</div>
              <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
                Opens a second audience window on the selected monitor.
                {monitors.length === 0 && (
                  <span style={{ color: "#ef4444", marginLeft: "8px" }}>
                    (No monitors detected)
                  </span>
                )}
              </div>
            </div>
          </label>
        </div>
        )}

        {/* Fallback for Linux or detection failure: Show both or Mac logic as default? Let's show Mac style if unknown/Linux for now as it's the more standard implementation, but maybe hide both if unsure? User requested logic based on OS. I will assume if unknown we might want to default to showing one or both. For now I will strictly follow OS detection. If unknown, maybe show Mac version as it uses standard Tauri multiwindow. Or better, just show both if unknown so they can pick. I'll stick to strict separation for now as requested. */}
        {osType !== "windows" && osType !== "mac" && (
           <div
           style={{
             padding: "var(--spacing-4)",
             backgroundColor: "var(--app-header-bg)",
             borderRadius: "12px",
             border: "1px solid var(--app-border-color)",
             display: "flex",
             alignItems: "center",
             gap: "12px",
           }}
         >
           <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
             <input
               type="checkbox"
               checked={settings.enabled}
               onChange={(event) => {
                  /* Standard implementation logic */
                  const newEnabled = event.target.checked;
                  if (newEnabled && monitors.length === 0) {
                    setErrorMessage("No monitors detected.");
                    return;
                  }
                  if (newEnabled && settings.monitorIndex === null && monitors.length > 0) {
                     const defaultIndex = monitors.length > 1 ? 1 : 0;
                     setSettings((prev) => ({ ...prev, enabled: newEnabled, monitorIndex: defaultIndex }));
                  } else {
                     setSettings((prev) => ({ ...prev, enabled: newEnabled }));
                  }
               }}
               style={{ width: "18px", height: "18px", cursor: "pointer" }}
             />
             <div>
               <div style={{ fontWeight: 600 }}>Enable audience screen</div>
               <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
                 Opens a second audience window on the selected monitor.
               </div>
             </div>
           </label>
         </div>
        )}

        <div
          style={{
            padding: "var(--spacing-4)",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "12px",
            border: "1px solid var(--app-border-color)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={settings.webEnabled}
              onChange={(event) => {
                setSettings((prev) => ({
                  ...prev,
                  webEnabled: event.target.checked,
                }));
              }}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <div>
            <div style={{ fontWeight: 600 }}>Enable web audience screen</div>
            <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
              Access the audience display via web browser on any device on your network.
            </div>
            {settings.webEnabled && !serverInfo?.server_running && (
              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={async () => {
                    setIsStartingServer(true);
                    try {
                      const liveSlidesSettings = loadLiveSlidesSettings();
                      await startLiveSlidesServer(liveSlidesSettings.serverPort);
                      await loadServerInfo();
                    } catch (error) {
                      console.error("[Display] Failed to start server:", error);
                      setErrorMessage("Failed to start server. Please check Network settings.");
                    } finally {
                      setIsStartingServer(false);
                    }
                  }}
                  disabled={isStartingServer}
                  className="primary"
                  style={{ minWidth: "120px" }}
                >
                  {isStartingServer ? "Starting..." : "Start Server"}
                </button>
              </div>
            )}
            </div>
          </label>
          
          {settings.webEnabled && serverInfo?.server_running && (
            <div
              style={{
                marginTop: "8px",
                padding: "12px",
                backgroundColor: "var(--app-bg-color)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--app-text-color-secondary)" }}>
                  Web Display URL:
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                    color: "var(--app-text-color)",
                    wordBreak: "break-all",
                  }}
                >
                  http://{serverInfo.local_ip}:{serverInfo.server_port}/display
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--app-text-color-secondary)", marginTop: "4px" }}>
                  Local: http://localhost:{serverInfo.server_port}/display
                </div>
              </div>
              <button
                onClick={async () => {
                  const url = `http://${serverInfo.local_ip}:${serverInfo.server_port}/display`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setUrlCopied(true);
                    setTimeout(() => setUrlCopied(false), 2000);
                  } catch (error) {
                    console.error("Failed to copy URL:", error);
                  }
                }}
                style={{
                  padding: "8px 12px",
                  backgroundColor: urlCopied ? "#22c55e" : "var(--app-primary-color)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  transition: "background-color 0.2s",
                }}
                title="Copy URL"
              >
                <FaCopy size={14} />
                {urlCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="display-monitor">Display Monitor</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              id="display-monitor"
              value={settings.monitorIndex ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  monitorIndex: event.target.value
                    ? parseInt(event.target.value, 10)
                    : null,
                }))
              }
              className="select-css"
              style={{ flex: 1 }}
            >
              <option value="" disabled>
                Select a monitor
              </option>
              {monitors.map((monitor, index) => {
                const width = monitor.size?.width ?? 0;
                const height = monitor.size?.height ?? 0;
                const isPrimary = monitor.position?.x === 0 && monitor.position?.y === 0;
                const primaryLabel = isPrimary ? " - Primary" : "";
                return (
                  <option key={`${monitor.name || "monitor"}-${index}`} value={index}>
                    Monitor {index + 1} ({width}x{height})
                    {primaryLabel}
                  </option>
                );
              })}
            </select>
            <button className="secondary" onClick={() => void loadMonitors()}>
              Refresh
            </button>
          </div>
          {monitors.length === 0 && (
            <p className="instruction-text">No additional monitors detected.</p>
          )}
        </div>

        <div className="form-group">
          <label>Background</label>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "0.85rem" }}>Color</span>
              <input
                type="color"
                value={settings.backgroundColor}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    backgroundColor: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="secondary"
              onClick={handleSelectBackgroundImage}
            >
              Choose Background Image
            </button>
            {settings.backgroundImagePath && (
              <button
                className="secondary"
                onClick={() =>
                  setSettings((prev) => ({ ...prev, backgroundImagePath: "" }))
                }
              >
                Clear Image
              </button>
            )}
          </div>
          {settings.backgroundImagePath && (
            <p className="instruction-text">
              Using image: {settings.backgroundImagePath}
            </p>
          )}
        </div>

        {/* Scripture Text Styling */}
        <div className="form-group">
          <label style={{ fontWeight: 600, marginBottom: "12px" }}>Scripture Text Styling</label>
          <div style={{ display: "grid", gap: "12px", padding: "12px", backgroundColor: "var(--app-header-bg)", borderRadius: "8px" }}>
            {/* Font Selection */}
            <div>
              <label htmlFor="display-font-text" style={{ fontSize: "0.9rem", marginBottom: "8px", display: "block" }}>Font</label>
              {fontsLoading ? (
                <div style={{ padding: "8px", color: "var(--app-text-color-secondary)" }}>
                  Loading fonts...
                </div>
              ) : (
                <select
                  id="display-font-text"
                  value={settings.textFont}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textFont: event.target.value,
                    }))
                  }
                  className="select-css"
                >
                  {fontOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.9rem" }}>Color</span>
                <input
                  type="color"
                  value={settings.textStyle.color}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textStyle: { ...prev.textStyle, color: event.target.value },
                    }))
                  }
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.textStyle.bold}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textStyle: { ...prev.textStyle, bold: event.target.checked },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Bold</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.textStyle.italic}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textStyle: { ...prev.textStyle, italic: event.target.checked },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Italic</span>
              </label>
            </div>
            
            {/* Text Stroke */}
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={!!settings.textStyle.stroke}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textStyle: {
                        ...prev.textStyle,
                        stroke: event.target.checked
                          ? { width: 2, color: "#000000" }
                          : undefined,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Enable Stroke/Outline</span>
              </label>
              {settings.textStyle.stroke && (
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginLeft: "24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.85rem", minWidth: "50px" }}>Width</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      value={settings.textStyle.stroke.width}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          textStyle: {
                            ...prev.textStyle,
                            stroke: prev.textStyle.stroke
                              ? {
                                  ...prev.textStyle.stroke,
                                  width: parseFloat(event.target.value) || 0,
                                }
                              : undefined,
                          },
                        }))
                      }
                      style={{ width: "80px" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.85rem" }}>Color</span>
                    <input
                      type="color"
                      value={settings.textStyle.stroke.color}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          textStyle: {
                            ...prev.textStyle,
                            stroke: prev.textStyle.stroke
                              ? {
                                  ...prev.textStyle.stroke,
                                  color: event.target.value,
                                }
                              : undefined,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Text Shadow */}
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={!!settings.textStyle.shadow}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      textStyle: {
                        ...prev.textStyle,
                        shadow: event.target.checked
                          ? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000" }
                          : undefined,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Enable Text Shadow</span>
              </label>
              {settings.textStyle.shadow && (
                <div style={{ display: "grid", gap: "8px", marginLeft: "24px" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "60px" }}>Offset X</span>
                      <input
                        type="number"
                        min="-50"
                        max="50"
                        step="1"
                        value={settings.textStyle.shadow.offsetX}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            textStyle: {
                              ...prev.textStyle,
                              shadow: prev.textStyle.shadow
                                ? {
                                    ...prev.textStyle.shadow,
                                    offsetX: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "60px" }}>Offset Y</span>
                      <input
                        type="number"
                        min="-50"
                        max="50"
                        step="1"
                        value={settings.textStyle.shadow.offsetY}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            textStyle: {
                              ...prev.textStyle,
                              shadow: prev.textStyle.shadow
                                ? {
                                    ...prev.textStyle.shadow,
                                    offsetY: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "50px" }}>Blur</span>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="1"
                        value={settings.textStyle.shadow.blur}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            textStyle: {
                              ...prev.textStyle,
                              shadow: prev.textStyle.shadow
                                ? {
                                    ...prev.textStyle.shadow,
                                    blur: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem" }}>Color</span>
                      <input
                        type="color"
                        value={settings.textStyle.shadow.color}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            textStyle: {
                              ...prev.textStyle,
                              shadow: prev.textStyle.shadow
                                ? {
                                    ...prev.textStyle.shadow,
                                    color: event.target.value,
                                  }
                                : undefined,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scripture Reference Styling */}
        <div className="form-group">
          <label style={{ fontWeight: 600, marginBottom: "12px" }}>Scripture Reference Styling</label>
          <div style={{ display: "grid", gap: "12px", padding: "12px", backgroundColor: "var(--app-header-bg)", borderRadius: "8px" }}>
            {/* Font Selection */}
            <div>
              <label htmlFor="display-font-reference" style={{ fontSize: "0.9rem", marginBottom: "8px", display: "block" }}>Font</label>
              {fontsLoading ? (
                <div style={{ padding: "8px", color: "var(--app-text-color-secondary)" }}>
                  Loading fonts...
                </div>
              ) : (
                <select
                  id="display-font-reference"
                  value={settings.referenceFont}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceFont: event.target.value,
                    }))
                  }
                  className="select-css"
                >
                  {fontOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.9rem" }}>Color</span>
                <input
                  type="color"
                  value={settings.referenceStyle.color}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceStyle: { ...prev.referenceStyle, color: event.target.value },
                    }))
                  }
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.referenceStyle.bold}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceStyle: { ...prev.referenceStyle, bold: event.target.checked },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Bold</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.referenceStyle.italic}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceStyle: { ...prev.referenceStyle, italic: event.target.checked },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Italic</span>
              </label>
            </div>
            
            {/* Reference Stroke */}
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={!!settings.referenceStyle.stroke}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceStyle: {
                        ...prev.referenceStyle,
                        stroke: event.target.checked
                          ? { width: 2, color: "#000000" }
                          : undefined,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Enable Stroke/Outline</span>
              </label>
              {settings.referenceStyle.stroke && (
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginLeft: "24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.85rem", minWidth: "50px" }}>Width</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      value={settings.referenceStyle.stroke.width}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          referenceStyle: {
                            ...prev.referenceStyle,
                            stroke: prev.referenceStyle.stroke
                              ? {
                                  ...prev.referenceStyle.stroke,
                                  width: parseFloat(event.target.value) || 0,
                                }
                              : undefined,
                          },
                        }))
                      }
                      style={{ width: "80px" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "0.85rem" }}>Color</span>
                    <input
                      type="color"
                      value={settings.referenceStyle.stroke.color}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          referenceStyle: {
                            ...prev.referenceStyle,
                            stroke: prev.referenceStyle.stroke
                              ? {
                                  ...prev.referenceStyle.stroke,
                                  color: event.target.value,
                                }
                              : undefined,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Reference Shadow */}
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={!!settings.referenceStyle.shadow}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      referenceStyle: {
                        ...prev.referenceStyle,
                        shadow: event.target.checked
                          ? { offsetX: 2, offsetY: 2, blur: 4, color: "#000000" }
                          : undefined,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: "0.9rem" }}>Enable Text Shadow</span>
              </label>
              {settings.referenceStyle.shadow && (
                <div style={{ display: "grid", gap: "8px", marginLeft: "24px" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "60px" }}>Offset X</span>
                      <input
                        type="number"
                        min="-50"
                        max="50"
                        step="1"
                        value={settings.referenceStyle.shadow.offsetX}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            referenceStyle: {
                              ...prev.referenceStyle,
                              shadow: prev.referenceStyle.shadow
                                ? {
                                    ...prev.referenceStyle.shadow,
                                    offsetX: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "60px" }}>Offset Y</span>
                      <input
                        type="number"
                        min="-50"
                        max="50"
                        step="1"
                        value={settings.referenceStyle.shadow.offsetY}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            referenceStyle: {
                              ...prev.referenceStyle,
                              shadow: prev.referenceStyle.shadow
                                ? {
                                    ...prev.referenceStyle.shadow,
                                    offsetY: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", minWidth: "50px" }}>Blur</span>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="1"
                        value={settings.referenceStyle.shadow.blur}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            referenceStyle: {
                              ...prev.referenceStyle,
                              shadow: prev.referenceStyle.shadow
                                ? {
                                    ...prev.referenceStyle.shadow,
                                    blur: parseInt(event.target.value) || 0,
                                  }
                                : undefined,
                            },
                          }))
                        }
                        style={{ width: "80px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem" }}>Color</span>
                      <input
                        type="color"
                        value={settings.referenceStyle.shadow.color}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            referenceStyle: {
                              ...prev.referenceStyle,
                              shadow: prev.referenceStyle.shadow
                                ? {
                                    ...prev.referenceStyle.shadow,
                                    color: event.target.value,
                                  }
                                : undefined,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Layout Preview</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            <button
              onClick={() => setLayoutPreviewTab("scripture")}
              className="secondary"
              style={{
                borderColor:
                  layoutPreviewTab === "scripture"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)",
                backgroundColor:
                  layoutPreviewTab === "scripture"
                    ? "var(--app-primary-color)"
                    : "transparent",
                color:
                  layoutPreviewTab === "scripture"
                    ? "#ffffff"
                    : "var(--app-text-color)",
              }}
            >
              Scripture layout preview
            </button>
            <button
              onClick={() => setLayoutPreviewTab("slides")}
              className="secondary"
              style={{
                borderColor:
                  layoutPreviewTab === "slides"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)",
                backgroundColor:
                  layoutPreviewTab === "slides"
                    ? "var(--app-primary-color)"
                    : "transparent",
                color:
                  layoutPreviewTab === "slides"
                    ? "#ffffff"
                    : "var(--app-text-color)",
              }}
            >
              Slides layout preview
            </button>
          </div>
          <label style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
            <input
              type="checkbox"
              checked={settings.showTimer}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  showTimer: event.target.checked,
                }))
              }
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <span>Show timer</span>
          </label>
          <label style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ minWidth: "140px" }}>Timer font size</span>
            <input
              type="range"
              min={16}
              max={300}
              step={2}
              value={settings.timerFontSize}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  timerFontSize: Number(event.target.value),
                }))
              }
              style={{ flex: 1, minWidth: "180px" }}
            />
            <input
              type="number"
              min={12}
              max={300}
              step={1}
              value={settings.timerFontSize}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  timerFontSize: Number(event.target.value) || 0,
                }))
              }
              style={{ width: "80px" }}
            />
            <span style={{ color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>px</span>
          </label>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "520px",
              aspectRatio: "16 / 9",
              backgroundColor: settings.backgroundColor,
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
            {layoutPreviewTab === "scripture" ? (
              <>
                <div
                  ref={previewTextBoxRef}
                  style={{
                    ...rectStyle(settings.layout.text),
                    border: "1px dashed rgba(99, 102, 241, 0.7)",
                    padding: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    overflow: "hidden",
                  }}
                >
                  <div
                    ref={previewTextContentRef}
                    style={{
                      ...getFontStyle(settings.textStyle),
                      fontFamily: settings.textFont,
                      fontSize: `${previewTextFontSize}px`,
                      lineHeight: 1.2,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      width: "100%",
                    }}
                  >
                    {SAMPLE_TEXT}
                  </div>
                </div>
                <div
                  ref={previewReferenceBoxRef}
                  style={{
                    ...rectStyle(settings.layout.reference),
                    border: "1px dashed rgba(34, 197, 94, 0.7)",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    overflow: "hidden",
                  }}
                >
                  <div
                    ref={previewReferenceContentRef}
                    style={{
                      ...getFontStyle(settings.referenceStyle),
                      fontFamily: settings.referenceFont,
                      fontSize: `${previewReferenceFontSize}px`,
                      lineHeight: 1.1,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      width: "100%",
                    }}
                  >
                    {SAMPLE_REFERENCE}
                  </div>
                </div>
              </>
            ) : (
              settings.slidesLayout.slice(0, 6).map((rect, index) => (
                <div
                  key={`slide-preview-${index}`}
                  ref={slideLineBoxRefs[index]}
                  style={{
                    ...rectStyle(rect),
                    border: "1px dashed rgba(99, 102, 241, 0.7)",
                    padding: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    overflow: "hidden",
                  }}
                >
                  <div
                    ref={slideLineContentRefs[index]}
                    style={{
                      ...getFontStyle(getSlideLineStyle(index)),
                      fontFamily: getSlideLineFontFamily(index),
                      fontSize: `${slideLineFontSizes[index]}px`,
                      lineHeight: 1.2,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      width: "100%",
                    }}
                  >
                    {SAMPLE_SLIDE_LINES[index] || `Line ${index + 1}`}
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: "10px" }}>
            <button
              className="secondary"
              onClick={() =>
                layoutPreviewTab === "scripture"
                  ? setLayoutEditorOpen(true)
                  : setSlidesLayoutEditorOpen(true)
              }
            >
              Edit Layout
            </button>
          </div>
        </div>
      </div>

      {saveMessage && (
        <div
          style={{
            marginTop: "var(--spacing-4)",
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "8px",
            color: "#22c55e",
            fontSize: "0.9rem",
          }}
        >
          {saveMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            marginTop: "var(--spacing-4)",
            padding: "var(--spacing-3)",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderRadius: "8px",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
            fontSize: "0.9rem",
          }}
        >
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      <DisplayLayoutEditorModal
        isOpen={layoutEditorOpen}
        onClose={() => setLayoutEditorOpen(false)}
        onSave={handleUpdateLayout}
        initialLayout={settings.layout}
        backgroundColor={settings.backgroundColor}
        backgroundImagePath={settings.backgroundImagePath}
        textFont={settings.textFont}
        referenceFont={settings.referenceFont}
        textStyle={settings.textStyle}
        referenceStyle={settings.referenceStyle}
      />
      <SlidesLayoutEditorModal
        isOpen={slidesLayoutEditorOpen}
        onClose={() => setSlidesLayoutEditorOpen(false)}
        onSave={handleUpdateSlidesLayout}
        initialLayout={settings.slidesLayout}
        initialLineStyles={settings.slidesLineStyles}
        backgroundColor={settings.backgroundColor}
        backgroundImagePath={settings.backgroundImagePath}
        textFont={settings.textFont}
        textStyle={settings.textStyle}
        fontOptions={fontOptions}
      />
    </div>
  );
};

export default DisplaySettings;

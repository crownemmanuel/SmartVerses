import React, { useState, useMemo, useRef } from "react";
import { FaSearch, FaBook, FaRocket, FaCog, FaDesktop, FaExclamationTriangle, FaGlobe, FaClock, FaBible, FaStickyNote, FaNetworkWired, FaRobot, FaMagic, FaFileImport, FaEdit, FaBug, FaCheckCircle, FaInfoCircle, FaVideo, FaMicrophone, FaShieldAlt } from "react-icons/fa";
import { resetOnboardingState } from "../types/onboarding";
import "../App.css";

interface SectionData {
  id: string;
  title: string;
  icon: React.ReactNode;
  keywords: string[];
}

interface SectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  searchQuery: string;
}

const Section = React.forwardRef<HTMLDivElement, SectionProps>(({ id, title, icon, children, searchQuery }, ref) => {
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ backgroundColor: "rgba(139, 92, 246, 0.3)", padding: "2px 4px", borderRadius: "3px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      ref={ref}
      id={id}
      style={{
        marginBottom: "40px",
        padding: "24px",
        backgroundColor: "var(--app-header-bg)",
        borderRadius: "12px",
        border: "1px solid var(--app-border-color)",
        scrollMarginTop: "100px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", paddingBottom: "16px", borderBottom: "2px solid var(--app-border-color)" }}>
        <div style={{ fontSize: "1.5rem", color: "var(--app-primary-color)" }}>{icon}</div>
        <h2 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "var(--app-text-color)" }}>
          {highlightText(title, searchQuery)}
        </h2>
      </div>
      <div style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--app-text-color)" }}>
        {children}
      </div>
    </div>
  );
});

Section.displayName = "Section";

const HelpPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sections: SectionData[] = [
    { id: "overview", title: "What this app does", icon: <FaBook />, keywords: ["overview", "introduction", "what", "app", "does", "proassist"] },
    { id: "quickstart", title: "Quick start", icon: <FaRocket />, keywords: ["quick", "start", "getting", "started", "beginner", "setup"] },
    { id: "templates", title: "Templates 101", icon: <FaCog />, keywords: ["templates", "layout", "output", "path", "prefix", "regex", "javascript", "ai"] },
    { id: "propresenter", title: "Connect to ProPresenter", icon: <FaDesktop />, keywords: ["propresenter", "linked", "text", "connect", "integration"] },
    { id: "troubleshooting", title: "Troubleshooting", icon: <FaExclamationTriangle />, keywords: ["troubleshoot", "problem", "error", "fix", "issue", "help"] },
    { id: "liveslides", title: "Live Slides", icon: <FaGlobe />, keywords: ["live", "slides", "websocket", "collaboration", "notepad", "real-time", "browser"] },
    { id: "timer", title: "Stage Assist - Timer", icon: <FaClock />, keywords: ["timer", "schedule", "countdown", "stage", "assist", "automation"] },
    { id: "recording", title: "Video & Audio Recording", icon: <FaVideo />, keywords: ["recording", "video", "audio", "record", "crash", "recovery", "corrupt", "power", "loss", "mp3", "wav", "webm"] },
    { id: "smartverses", title: "SmartVerses", icon: <FaBible />, keywords: ["smartverses", "bible", "search", "transcription", "verse", "assemblyai"] },
    { id: "testimonies", title: "Live Testimonies", icon: <FaStickyNote />, keywords: ["testimonies", "firebase", "live", "testimony"] },
    { id: "network", title: "Network Sync", icon: <FaNetworkWired />, keywords: ["network", "sync", "master", "slave", "peer", "synchronize"] },
    { id: "aiassistant", title: "Global AI Assistant", icon: <FaRobot />, keywords: ["ai", "assistant", "chat", "global", "help"] },
    { id: "automation", title: "AI Automation", icon: <FaMagic />, keywords: ["automation", "proofread", "ai", "spell", "check"] },
    { id: "advanced", title: "Advanced ProPresenter", icon: <FaDesktop />, keywords: ["advanced", "propresenter", "activation", "stage", "layout", "timer", "sync"] },
    { id: "import", title: "Import Options", icon: <FaFileImport />, keywords: ["import", "text", "network", "live", "slides", "ai"] },
    { id: "slides", title: "Slide Management", icon: <FaEdit />, keywords: ["slide", "edit", "layout", "add", "delete", "manage"] },
    { id: "developer", title: "Developer Tools", icon: <FaBug />, keywords: ["developer", "debug", "logs", "console", "error"] },
  ];

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections.filter(section => 
      section.title.toLowerCase().includes(query) ||
      section.keywords.some(keyword => keyword.includes(query))
    );
  }, [searchQuery]);

  const scrollToSection = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
      setTimeout(() => setActiveSection(null), 2000);
    }
  };

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} style={{ backgroundColor: "rgba(139, 92, 246, 0.3)", padding: "2px 4px", borderRadius: "3px" }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <code style={{
      backgroundColor: "var(--app-bg-color)",
      padding: "2px 6px",
      borderRadius: "4px",
      fontFamily: "monospace",
      fontSize: "0.9em",
      border: "1px solid var(--app-border-color)",
    }}>
      {children}
    </code>
  );

  const InfoBox: React.FC<{ children: React.ReactNode; type?: "tip" | "warning" | "info" }> = ({ children, type = "info" }) => {
    const colors = {
      tip: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", icon: <FaCheckCircle style={{ color: "rgb(34, 197, 94)" }} /> },
      warning: { bg: "rgba(251, 191, 36, 0.1)", border: "rgba(251, 191, 36, 0.3)", icon: <FaExclamationTriangle style={{ color: "rgb(251, 191, 36)" }} /> },
      info: { bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", icon: <FaInfoCircle style={{ color: "rgb(59, 130, 246)" }} /> },
    };
    const color = colors[type];
    return (
      <div style={{
        marginTop: "16px",
        padding: "16px",
        backgroundColor: color.bg,
        borderRadius: "8px",
        border: `1px solid ${color.border}`,
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}>
        <div style={{ fontSize: "1.2rem", flexShrink: 0, marginTop: "2px" }}>{color.icon}</div>
        <div>{children}</div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 51px)", backgroundColor: "var(--app-bg-color)", overflow: "hidden" }}>
      {/* Sidebar Navigation */}
      <div style={{ width: "280px", borderRight: "1px solid var(--app-border-color)", backgroundColor: "var(--app-header-bg)", overflowY: "auto", padding: "20px", flexShrink: 0 }}>
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px" }}>
            <FaBook style={{ color: "var(--app-primary-color)" }} />
            Help Guide
          </h2>
          <div style={{ position: "relative" }}>
            <FaSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--app-text-color-secondary)", fontSize: "0.9rem" }} />
            <input
              type="text"
              placeholder="Search help topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                fontSize: "0.9rem",
              }}
            />
          </div>
        </div>
        <nav>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600, color: "var(--app-text-color-secondary)", marginBottom: "12px", letterSpacing: "0.05em" }}>
            {searchQuery ? `Search Results (${filteredSections.length})` : "Table of Contents"}
          </div>
          {filteredSections.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--app-text-color-secondary)" }}>
              No results found for "{searchQuery}"
            </div>
          ) : (
            filteredSections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  marginBottom: "6px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: activeSection === section.id 
                    ? "var(--app-primary-color)" 
                    : activeSection === null && !searchQuery
                    ? "transparent"
                    : "rgba(139, 92, 246, 0.1)",
                  color: activeSection === section.id 
                    ? "white" 
                    : "var(--app-text-color)",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  if (activeSection !== section.id) {
                    e.currentTarget.style.backgroundColor = "var(--app-hover-bg-color)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== section.id) {
                    e.currentTarget.style.backgroundColor = activeSection === null && !searchQuery ? "transparent" : "rgba(139, 92, 246, 0.1)";
                  }
                }}
              >
                {section.icon}
                <span>{section.title}</span>
              </button>
            ))
          )}
        </nav>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "30px 40px" }}>
        <div style={{ backgroundColor: "var(--app-header-bg)", padding: "20px", borderBottom: "1px solid var(--app-border-color)", marginBottom: "20px" }}>
          <h1 style={{ margin: "0 0 20px 0", fontSize: "2rem", fontWeight: 700 }}>
            {highlightText("Help & Setup Guide", searchQuery)}
          </h1>
          <div style={{ position: "relative", maxWidth: "500px" }}>
            <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "var(--app-text-color-secondary)", fontSize: "1rem" }} />
            <input
              type="text"
              placeholder="Search for topics, features, or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px 12px 44px",
                borderRadius: "8px",
                border: "2px solid var(--app-border-color)",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                fontSize: "1rem",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--app-primary-color)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--app-border-color)";
              }}
            />
          </div>
        </div>

        <Section id="overview" title="What this app does" icon={<FaBook />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["overview"] = el)}>
          <p>
            ProAssist is an intelligent bridge between your notes and ProPresenter. It simplifies importing slides by turning raw text into slide‑ready content, optionally using regex/JavaScript or AI‑powered processing.
          </p>
          <p>
            When you click <strong>Go Live</strong>, ProAssist writes one line per file that ProPresenter reads via Linked Text—so going live is as simple as a single click.
          </p>
        </Section>

        <Section id="quickstart" title="Quick start" icon={<FaRocket />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["quickstart"] = el)}>
          <ol style={{ paddingLeft: "24px" }}>
            <li>Open <strong>Settings</strong> → <strong>Manage Templates</strong>.</li>
            <li>Create or edit a template (pick a color and layouts).</li>
            <li>
              Set an <strong>Output Path</strong> and a <strong>File Name Prefix</strong>. Example:
              <CodeBlock> /Users/you/ProPresenter/live/</CodeBlock> and <CodeBlock>sermon_</CodeBlock>.
            </li>
            <li>Go back to <strong>Main</strong> → <strong>Import</strong> → paste or upload your text.</li>
            <li>Pick a template and click <strong>Process</strong>, then select an item.</li>
            <li>When ready, click <strong>Go Live</strong> on a slide.</li>
          </ol>
          <div style={{ marginTop: "20px" }}>
            <button
              onClick={() => {
                resetOnboardingState();
                window.location.reload();
              }}
              style={{
                padding: "10px 20px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "var(--app-primary-color)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              <FaRocket />
              Open Onboarding Screen
            </button>
            <p style={{ marginTop: "12px", color: "var(--text-secondary-color)", fontSize: "0.9rem" }}>
              Need to set up features like SmartVerses, transcription, or other ProAssist capabilities? Click above to restart the setup wizard.
            </p>
          </div>
        </Section>

        <Section id="templates" title="Templates 101" icon={<FaCog />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["templates"] = el)}>
          <ul style={{ paddingLeft: "24px" }}>
            <li>
              <strong>Layouts</strong>: choose how many lines a slide shows (One, Two, Three, etc.). Go Live writes one file per line:
              <CodeBlock>prefix1.txt</CodeBlock>, <CodeBlock>prefix2.txt</CodeBlock>, …
            </li>
            <li>
              <strong>Logic / Notes</strong> field supports different ways to pre‑process text:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>
                  <strong>Regex</strong>: describe how to split or capture sections (e.g. by blank lines, headings). Keep it simple if you're new to regex.
                </li>
                <li>
                  <strong>JavaScript</strong>: you can provide a small snippet to transform text (e.g. split on "---").
                </li>
                <li>
                  <strong>Process with AI</strong>: enable, pick provider/model, and add your prompt. The app will generate slides from your instructions.
                </li>
              </ul>
            </li>
            <li>
              <strong>Output Path</strong>: folder where the .txt files are written. The app creates the folder if missing.
            </li>
            <li>
              <strong>File Name Prefix</strong>: base name for each line file. Example: with prefix <CodeBlock>sermon_</CodeBlock>, files become <CodeBlock>sermon_1.txt</CodeBlock>, <CodeBlock>sermon_2.txt</CodeBlock>, …
            </li>
          </ul>
        </Section>

        <Section id="propresenter" title="Connect to ProPresenter (Linked Text)" icon={<FaDesktop />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["propresenter"] = el)}>
          <ol style={{ paddingLeft: "24px" }}>
            <li>Open ProPresenter and create a new presentation/slide.</li>
            <li>
              Add <strong>N</strong> text boxes for the slide layout you want (e.g. 3 boxes for a Three‑Line slide).
            </li>
            <li>
              For each text box: <strong>Format</strong> → <strong>Linked Text</strong> → choose <strong>File</strong>, then select the matching file from your template's Output Path:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Top line → <CodeBlock>prefix1.txt</CodeBlock></li>
                <li>Second line → <CodeBlock>prefix2.txt</CodeBlock></li>
                <li>Third line → <CodeBlock>prefix3.txt</CodeBlock></li>
              </ul>
            </li>
            <li>
              In ProAssist, click <strong>Go Live</strong> on a slide. The app writes the latest text to the files; ProPresenter will display the linked content instantly.
            </li>
          </ol>
        </Section>

        <Section id="troubleshooting" title="Troubleshooting" icon={<FaExclamationTriangle />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["troubleshooting"] = el)}>
          <ul style={{ paddingLeft: "24px" }}>
            <li>
              No text in ProPresenter? Check the Output Path folder for <CodeBlock>prefix1.txt</CodeBlock> etc., and verify Linked Text points to the same files.
            </li>
            <li>
              Wrong line showing? Confirm the slide's layout and which text box links to <CodeBlock>prefix1.txt</CodeBlock>, <CodeBlock>prefix2.txt</CodeBlock>, …
            </li>
            <li>
              Nothing updates? Click Go Live again; verify you have write permission to the Output Path.
            </li>
          </ul>
        </Section>

        <Section id="liveslides" title="Live Slides - Real-Time Collaboration" icon={<FaGlobe />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["liveslides"] = el)}>
          <p>
            Live Slides is a WebSocket-based system that allows real-time editing of slides from any browser on your network. Perfect for collaborative editing or remote presenters.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Go to <strong>Settings</strong> → <strong>Live Slides</strong> to configure:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Output Path</strong>: Where slide files are written</li>
                <li><strong>File Name Prefix</strong>: Base name for output files</li>
                <li><strong>Server Port</strong>: Port for the WebSocket server (default: 9876)</li>
                <li><strong>Auto-start Server</strong>: Automatically start server when app launches</li>
                <li><strong>ProPresenter Activation</strong>: Trigger slides when Live Slides go live or take off</li>
              </ul>
            </li>
            <li>
              In <strong>Main</strong> → click <strong>Live Slides</strong> button → select or create a session
            </li>
            <li>
              Click <strong>Restart/Resume Session</strong> to get a typing URL
            </li>
            <li>
              Share the URL with team members - they can open it in any browser to edit slides in real-time
            </li>
            <li>
              Changes made in the browser notepad instantly sync to ProAssist and update ProPresenter via Linked Text
            </li>
          </ol>
          <InfoBox type="tip">
            <strong>Notepad Features:</strong> Empty lines create new slides. Consecutive lines (no empty line between) = one slide with multiple items. Tab/indent creates sub-items: first line becomes title, each indented line creates a new slide with title + sub-item. Real-time sync across all connected devices. Dark/light theme toggle.
          </InfoBox>
        </Section>

        <Section id="timer" title="Stage Assist - Timer & Schedule Management" icon={<FaClock />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["timer"] = el)}>
          <p>
            Stage Assist provides powerful timer functionality with schedule management and ProPresenter integration.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Navigate to <strong>Timer</strong> in the main navigation
            </li>
            <li>
              <strong>Load Schedule:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>From File</strong>: Import a JSON schedule file</li>
                <li><strong>From Image (AI)</strong>: Upload an image of your schedule - AI will extract the schedule automatically</li>
                <li><strong>Get Latest from Master</strong>: Sync schedule from network master (requires Network Sync configuration)</li>
              </ul>
            </li>
            <li>
              <strong>Edit Schedule:</strong> Click any cell to edit session name, times, duration, or minister
            </li>
            <li>
              <strong>Start Timer:</strong> Click <strong>Start</strong> on any session row to begin countdown
            </li>
            <li>
              <strong>Countdown Timer:</strong> Set hours, minutes, seconds and click Start for a custom countdown
            </li>
            <li>
              <strong>Countdown to Time:</strong> Set a target time (e.g., 10:30 AM) and countdown to that time
            </li>
            <li>
              <strong>Schedule Automation:</strong> Click the magic wand icon on any session to configure:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>ProPresenter slide activation when session starts</li>
                <li>Stage layout changes</li>
                <li>Multiple automations per session</li>
              </ul>
            </li>
            <li>
              <strong>Settings:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Auto Play</strong>: Automatically start next session when current ends</li>
                <li><strong>Allow Overrun</strong>: Allow timer to go negative when session exceeds time</li>
                <li><strong>Dynamic Time Adjustment</strong>: Automatically adjust subsequent sessions based on early end or overrun</li>
                <li><strong>Use Durations</strong>: Use duration field instead of end time for countdown</li>
              </ul>
            </li>
            <li>
              <strong>Remote Access Link:</strong> Click the link icon to get a URL for remote access to timer controls
            </li>
          </ol>
          <InfoBox type="info">
            <strong>Keyboard Shortcuts:</strong> Use <kbd style={{ padding: "2px 6px", backgroundColor: "var(--app-header-bg)", borderRadius: "4px", border: "1px solid var(--app-border-color)", fontFamily: "monospace" }}>↑</kbd> and <kbd style={{ padding: "2px 6px", backgroundColor: "var(--app-header-bg)", borderRadius: "4px", border: "1px solid var(--app-border-color)", fontFamily: "monospace" }}>↓</kbd> arrow keys in the navigation bar to navigate to next/previous sessions when timer is running.
          </InfoBox>
        </Section>

        <Section id="recording" title="Video & Audio Recording" icon={<FaVideo />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["recording"] = el)}>
          <p>
            ProAssist features professional-grade video and audio recording with <strong>crash-safe streaming technology</strong>. Record for hours without memory issues, and recover recordings even if the app crashes or power is lost.
          </p>
          
          <h3 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            <FaVideo style={{ color: "var(--app-primary-color)" }} />
            Video Recording
          </h3>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Navigate to <strong>Recorder</strong> in the main navigation
            </li>
            <li>
              <strong>Configure Settings:</strong> Go to <strong>Settings</strong> → <strong>Recorder</strong> to set:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Camera</strong>: Select video input device</li>
                <li><strong>Video Audio Input</strong>: Microphone to embed in video</li>
                <li><strong>Video Format</strong>: MP4 (widely compatible) or WebM (better quality)</li>
                <li><strong>Resolution</strong>: 720p, 1080p, 1440p, or 4K</li>
                <li><strong>Video Audio Codec</strong>: AAC (MP4) or Opus (WebM)</li>
                <li><strong>Video Audio Delay</strong>: Adjust sync if audio is ahead of video</li>
                <li><strong>Output Folder</strong>: Where recordings are saved</li>
              </ul>
            </li>
            <li>
              <strong>Start Recording:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Select your camera and audio device</li>
                <li>Click the red <strong>Record</strong> button to start</li>
                <li>Use <strong>Pause</strong> to temporarily pause recording</li>
                <li>Click <strong>Stop</strong> to finalize and save the recording</li>
              </ul>
            </li>
            <li>
              <strong>Production Features:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Streaming Technology</strong>: Video chunks are written to disk in real-time (no memory accumulation)</li>
                <li><strong>Long Recordings</strong>: Record for 10+ hours without running out of memory</li>
                <li><strong>Crash-Safe</strong>: If app crashes, your video is preserved on disk</li>
                <li><strong>Live Preview</strong>: See camera feed while recording</li>
                <li><strong>Timer Display</strong>: Track recording duration in real-time</li>
              </ul>
            </li>
          </ol>

          <h3 style={{ marginTop: "32px", marginBottom: "12px", fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            <FaMicrophone style={{ color: "var(--app-primary-color)" }} />
            Audio Recording
          </h3>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              <strong>Format Options:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>WAV</strong>: High-quality uncompressed audio (48kHz, 16-bit mono)</li>
                <li><strong>MP3</strong>: Compressed audio with bitrate options (128k, 192k, 320k)</li>
              </ul>
            </li>
            <li>
              <strong>Configure Settings:</strong> In <strong>Settings</strong> → <strong>Recorder</strong>:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Microphone</strong>: Select audio input device</li>
                <li><strong>Audio Format</strong>: Choose WAV or MP3</li>
                <li><strong>MP3 Bitrate</strong>: Quality setting (higher = better quality, larger files)</li>
                <li><strong>Output Folder</strong>: Where recordings are saved</li>
              </ul>
            </li>
            <li>
              <strong>Start Recording:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Select your microphone</li>
                <li>Click the red <strong>Record</strong> button</li>
                <li>View real-time audio levels in the visualizer</li>
                <li>Click <strong>Stop</strong> to finalize and save</li>
              </ul>
            </li>
            <li>
              <strong>Production Features:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>WAV Streaming</strong>: Native Rust recording with periodic disk flushing (max 1 second loss if crash)</li>
                <li><strong>MP3 Streaming</strong>: WebM chunks streamed to disk, converted to MP3 after recording</li>
                <li><strong>Crash-Safe</strong>: All audio data preserved even if app crashes</li>
                <li><strong>Audio Visualizer</strong>: Real-time level monitoring</li>
              </ul>
            </li>
          </ol>

          <h3 style={{ marginTop: "32px", marginBottom: "12px", fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
            <FaShieldAlt style={{ color: "var(--app-primary-color)" }} />
            Crash Recovery & File Recovery
          </h3>
          <p>
            ProAssist uses <strong>streaming recording technology</strong> that writes data directly to disk as it's captured. This means your recordings are safe even if:
          </p>
          <ul style={{ paddingLeft: "24px", marginTop: "8px" }}>
            <li>The app crashes unexpectedly</li>
            <li>Power is lost during recording</li>
            <li>The computer shuts down</li>
            <li>The recording wasn't properly stopped</li>
          </ul>
          
          <InfoBox type="tip">
            <strong>How It Works:</strong> Unlike traditional recording apps that accumulate data in memory, ProAssist streams each chunk directly to disk. This means:
            <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
              <li>Video: Each 1-second chunk is written immediately</li>
              <li>MP3 Audio: WebM chunks streamed to temp file, converted after stop</li>
              <li>WAV Audio: Flushed to disk every second</li>
            </ul>
            If a crash occurs, you'll find your recording files on disk with all data up to the crash point.
          </InfoBox>

          <h4 style={{ marginTop: "24px", marginBottom: "12px", fontSize: "1.1rem", fontWeight: 600 }}>
            Recovering Corrupted or Incomplete Recordings
          </h4>
          <p>
            If you find a recording file that won't play (due to crash, power loss, or incomplete stop), you can recover it using FFmpeg:
          </p>
          
          <div style={{
            marginTop: "16px",
            padding: "16px",
            backgroundColor: "var(--app-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
            fontFamily: "monospace",
            fontSize: "0.9rem",
            overflowX: "auto"
          }}>
            <div style={{ marginBottom: "12px", color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>
              # Fix video headers (makes corrupted video playable)
            </div>
            <div style={{ color: "var(--app-text-color)" }}>
              ffmpeg -i partial_video.webm -c copy fixed_video.webm
            </div>
            <div style={{ marginTop: "16px", marginBottom: "12px", color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>
              # For MP4 videos:
            </div>
            <div style={{ color: "var(--app-text-color)" }}>
              ffmpeg -i partial_video.mp4 -c copy fixed_video.mp4
            </div>
            <div style={{ marginTop: "16px", marginBottom: "12px", color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>
              # Convert WebM audio to MP3 (if MP3 conversion failed)
            </div>
            <div style={{ color: "var(--app-text-color)" }}>
              ffmpeg -i partial_audio.webm -codec:a libmp3lame -qscale:a 2 recovered.mp3
            </div>
            <div style={{ marginTop: "16px", marginBottom: "12px", color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>
              # Fix WAV file headers (if WAV appears corrupted)
            </div>
            <div style={{ color: "var(--app-text-color)" }}>
              ffmpeg -i corrupted.wav -c copy fixed.wav
            </div>
          </div>

          <InfoBox type="info">
            <strong>Where to Find Recoverable Files:</strong>
            <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
              <li><strong>Video:</strong> Check your configured output folder → <CodeBlock>video/</CodeBlock> subfolder</li>
              <li><strong>MP3 (temp):</strong> If MP3 conversion failed, check <CodeBlock>audio/.temp/</CodeBlock> for WebM files</li>
              <li><strong>WAV:</strong> Check your configured output folder → <CodeBlock>audio/</CodeBlock> subfolder</li>
            </ul>
            All files are saved with timestamps in the filename, making it easy to identify recordings.
          </InfoBox>

          <InfoBox type="tip">
            <strong>Production-Grade Reliability:</strong> This crash-safe streaming technology is the same approach used by professional broadcast software like OBS. Your recordings are protected against:
            <ul style={{ marginTop: "8px", paddingLeft: "20px" }}>
              <li>Memory exhaustion (no accumulation in RAM)</li>
              <li>Unexpected crashes</li>
              <li>Power failures</li>
              <li>System shutdowns</li>
            </ul>
            Record with confidence for live production environments!
          </InfoBox>
        </Section>

        <Section id="smartverses" title="SmartVerses - Bible Search & Transcription" icon={<FaBible />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["smartverses"] = el)}>
          <p>
            SmartVerses provides AI-powered Bible search and live transcription with automatic verse detection.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Navigate to <strong>SmartVerses</strong> in the main navigation
            </li>
            <li>
              <strong>Bible Search (Left Panel):</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Type Bible references like "John 3:16" or "Romans 8:1-4" for direct parsing</li>
                <li>Type phrases like "For God so loved" for AI-powered search</li>
                <li>Toggle <strong>AI Search</strong> to use AI models (OpenAI, Gemini, or Groq) or text-based search</li>
                <li>Navigate between verses using Previous/Next buttons</li>
                <li>Click <strong>Go Live</strong> to send verse to ProPresenter</li>
              </ul>
            </li>
            <li>
              <strong>Live Transcription (Right Panel):</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Click <strong>Start</strong> to begin live transcription (requires AssemblyAI API key)</li>
                <li>Bible references are automatically detected in speech</li>
                <li>Paraphrased verses can be detected if enabled in settings</li>
                <li>Detected references appear below the transcript</li>
                <li>Auto-trigger to ProPresenter can be enabled for automatic "Go Live"</li>
              </ul>
            </li>
            <li>
              <strong>Configuration (Settings → SmartVerses):</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>AssemblyAI API Key</strong>: Required for live transcription</li>
                <li><strong>Bible Search Provider</strong>: Choose OpenAI, Gemini, or Groq for AI search</li>
                <li><strong>Output Path & File Names</strong>: Configure where verse text and references are written</li>
                <li><strong>ProPresenter Activation</strong>: Set up automatic presentation triggering</li>
                <li><strong>Paraphrase Detection</strong>: Enable AI to detect paraphrased Bible verses</li>
                <li><strong>Key Point Extraction</strong>: Extract key points from transcript</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section id="testimonies" title="Live Testimonies" icon={<FaStickyNote />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["testimonies"] = el)}>
          <p>
            Manage testimonies from Firebase with real-time updates and ProPresenter integration.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Configure Firebase in <strong>Settings</strong> → <strong>Live Testimonies</strong>:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Enter Firebase configuration JSON</li>
                <li>Set output path and file name for testimony display</li>
                <li>Configure ProPresenter activation settings</li>
                <li>Set name formatting preferences</li>
              </ul>
            </li>
            <li>
              Navigate to <strong>Live Testimonies</strong> in the main navigation
            </li>
            <li>
              Select date and service to view testimonies
            </li>
            <li>
              Click <strong>Live</strong> on any testimony to set it live:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Writes formatted name to text file</li>
                <li>Updates Firebase live testimony</li>
                <li>Triggers ProPresenter if configured</li>
              </ul>
            </li>
            <li>
              <strong>Keyboard Navigation:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><kbd style={{ padding: "2px 6px", backgroundColor: "var(--app-header-bg)", borderRadius: "4px", border: "1px solid var(--app-border-color)", fontFamily: "monospace" }}>↑</kbd> / <kbd style={{ padding: "2px 6px", backgroundColor: "var(--app-header-bg)", borderRadius: "4px", border: "1px solid var(--app-border-color)", fontFamily: "monospace" }}>↓</kbd>: Navigate and automatically set live</li>
                <li><kbd style={{ padding: "2px 6px", backgroundColor: "var(--app-header-bg)", borderRadius: "4px", border: "1px solid var(--app-border-color)", fontFamily: "monospace" }}>Enter</kbd>: Set selected testimony live</li>
              </ul>
            </li>
            <li>
              Click <strong>Copy Name</strong> to copy formatted name to clipboard
            </li>
            <li>
              Real-time updates: Testimonies sync automatically when Firebase data changes
            </li>
          </ol>
        </Section>

        <Section id="network" title="Network Sync" icon={<FaNetworkWired />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["network"] = el)}>
          <p>
            Synchronize playlists and schedules across multiple ProAssist instances on your network.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Go to <strong>Settings</strong> → <strong>Network</strong>
            </li>
            <li>
              Choose sync mode:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Off</strong>: No synchronization</li>
                <li><strong>Master</strong>: This instance broadcasts to others</li>
                <li><strong>Slave</strong>: This instance receives from master</li>
                <li><strong>Peer</strong>: Bidirectional sync with other peers</li>
              </ul>
            </li>
            <li>
              Configure:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Remote Host</strong>: IP address of master/peer (required for Slave/Peer mode)</li>
                <li><strong>Sync Playlists</strong>: Enable playlist synchronization</li>
                <li><strong>Sync Schedule</strong>: Enable schedule synchronization</li>
                <li><strong>Sync Port</strong>: Port for sync server (default: 9877)</li>
              </ul>
            </li>
            <li>
              <strong>Import from Network:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>In <strong>Main</strong> → <strong>Import</strong> dropdown → <strong>From Network</strong></li>
                <li>Loads playlists from master server</li>
              </ul>
            </li>
            <li>
              <strong>Get Schedule from Master:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>In <strong>Timer</strong> → <strong>Load Schedule</strong> dropdown → <strong>Get Latest from Master</strong></li>
                <li>Fetches latest schedule from master server</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section id="aiassistant" title="Global AI Assistant" icon={<FaRobot />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["aiassistant"] = el)}>
          <p>
            Access AI assistance throughout the app via the chat button in the bottom-right corner.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Click the AI chat button (bottom-right) to open the assistant drawer
            </li>
            <li>
              <strong>Available Actions:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Create Slides</strong>: Generate slides from text using AI</li>
                <li><strong>Create Playlists</strong>: Generate playlists with multiple items</li>
                <li><strong>Set Timer</strong>: Start countdown or countdown to time</li>
                <li><strong>Update Schedule</strong>: Modify schedule items</li>
                <li><strong>Edit Current Slides</strong>: Modify slides in the selected playlist item</li>
                <li><strong>Proofread Slides</strong>: Check spelling and grammar</li>
              </ul>
            </li>
            <li>
              <strong>Context Awareness:</strong> The assistant understands:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Current page you're on</li>
                <li>Selected templates</li>
                <li>Current slides</li>
                <li>Active schedule</li>
              </ul>
            </li>
            <li>
              Configure AI providers in <strong>Settings</strong> → <strong>AI Configuration</strong>
            </li>
          </ol>
        </Section>

        <Section id="automation" title="AI Automation" icon={<FaMagic />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["automation"] = el)}>
          <p>
            Use AI to automate slide processing and proofreading.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              In <strong>Main</strong>, select a playlist item with slides
            </li>
            <li>
              Click the <strong>AI Automation</strong> dropdown (magic wand icon)
            </li>
            <li>
              Available options:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li><strong>Proofread Slides</strong>: AI checks spelling and grammar, highlights corrections</li>
                <li><strong>Assign Timer Sessions</strong>: Automatically assign slides to timer sessions based on schedule</li>
                <li><strong>Generate AI Prompts</strong>: Create custom prompts for slide generation</li>
              </ul>
            </li>
            <li>
              Proofread corrections are highlighted in green for 30 seconds after processing
            </li>
          </ol>
        </Section>

        <Section id="advanced" title="Advanced ProPresenter Integration" icon={<FaDesktop />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["advanced"] = el)}>
          <p>
            ProAssist offers extensive ProPresenter control beyond basic Linked Text.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              <strong>ProPresenter Connections:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Configure in <strong>Settings</strong> → <strong>ProPresenter</strong></li>
                <li>Add multiple ProPresenter instances</li>
                <li>Enable/disable specific connections</li>
                <li>Test connections</li>
              </ul>
            </li>
            <li>
              <strong>Presentation Activation:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Per-slide: Right-click slide → <strong>ProPresenter Activation</strong></li>
                <li>Per-item: Click presentation icon in header → configure default activation</li>
                <li>Per-template: Set in template settings</li>
                <li>Configure number of clicks (activation and take-off)</li>
                <li>Select specific ProPresenter connections</li>
              </ul>
            </li>
            <li>
              <strong>Stage Layout Changes:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Configure in schedule automation</li>
                <li>Automatically change stage layout when session starts</li>
              </ul>
            </li>
            <li>
              <strong>Timer Sync:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>ProAssist timers sync with ProPresenter countdown timers</li>
                <li>Timer displays in navigation bar when running</li>
                <li>Automatic timer updates when sessions change</li>
              </ul>
            </li>
            <li>
              <strong>Auto-Scripture Slides:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Bible verses can be automatically formatted</li>
                <li>Configure custom file mapping for verse text and reference</li>
                <li>Available in templates and SmartVerses</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section id="import" title="Import Options" icon={<FaFileImport />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["import"] = el)}>
          <p>
            Multiple ways to import content into ProAssist.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              <strong>From Text:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Paste text or upload .txt file</li>
                <li>Select template</li>
                <li>Process with regex, JavaScript, or AI</li>
              </ul>
            </li>
            <li>
              <strong>From Live Slides:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Import from existing Live Slides sessions</li>
                <li>Select session from list</li>
                <li>Creates new playlist item linked to session</li>
              </ul>
            </li>
            <li>
              <strong>From Network:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Load playlists from network master</li>
                <li>Requires Network Sync configuration</li>
                <li>Select from available playlists</li>
              </ul>
            </li>
            <li>
              <strong>AI-Generated:</strong>
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Use Global AI Assistant to create slides</li>
                <li>Automatically added to selected playlist</li>
              </ul>
            </li>
          </ol>
        </Section>

        <Section id="slides" title="Slide Management" icon={<FaEdit />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["slides"] = el)}>
          <p>
            Advanced slide editing and organization features.
          </p>
          <ul style={{ paddingLeft: "24px" }}>
            <li>
              <strong>Edit Slides:</strong> Right-click any slide to edit text inline
            </li>
            <li>
              <strong>Change Layout:</strong> Use layout dropdown to change slide layout (one-line through six-line)
            </li>
            <li>
              <strong>Add Slides:</strong> Click <strong>+</strong> button to add new slides with specific layouts
            </li>
            <li>
              <strong>Delete Slides:</strong> Right-click → delete or use delete button
            </li>
            <li>
              <strong>Timer Assignment:</strong> Assign slides to timer sessions from dropdown
            </li>
            <li>
              <strong>Copy to Clipboard:</strong> Copy all slides in an item to clipboard
            </li>
            <li>
              <strong>Rename:</strong> Rename playlists and items using edit button
            </li>
            <li>
              <strong>Take Off:</strong> Right-click live slide → <strong>Take Off</strong> to trigger ProPresenter take-off clicks
            </li>
          </ul>
        </Section>

        <Section id="developer" title="Developer Tools" icon={<FaBug />} searchQuery={searchQuery} ref={(el) => (sectionRefs.current["developer"] = el)}>
          <p>
            If you're experiencing issues or need to debug the application, you can enable Developer Mode to view console logs and error messages.
          </p>
          <ol style={{ paddingLeft: "24px" }}>
            <li>
              Go to <strong>Settings</strong> → <strong>Version</strong>
            </li>
            <li>
              Click <strong>Enable Developer Mode</strong> in the Developer Tools section
            </li>
            <li>
              The log viewer will display all console output, including:
              <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                <li>Update check logs (prefixed with <CodeBlock>[Updater]</CodeBlock>)</li>
                <li>Error messages and stack traces</li>
                <li>General application logs</li>
                <li>Debug information</li>
              </ul>
            </li>
            <li>
              You can filter logs by level (Error, Warn, Info, etc.), search for specific terms, export logs to a file, or clear the log history
            </li>
          </ol>
          <InfoBox type="tip">
            <strong>Tip:</strong> When reporting issues, you can export the logs and include them in your bug report to help developers diagnose the problem.
          </InfoBox>
        </Section>
      </div>
    </div>
  );
};

export default HelpPage;

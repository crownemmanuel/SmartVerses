import React, { useState, useEffect } from "react";
import {
  FaDesktop,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaMagic,
  FaSave,
  FaLayerGroup,
  FaVideo,
  FaMicrophone,
  FaPlay,
  FaStop,
  FaMusic,
  FaLink,
} from "react-icons/fa";
import {
  getEnabledConnections,
  getCurrentSlideIndex,
  getStageScreens,
  getStageLayouts,
} from "../services/propresenterService";
import { listMidiOutputDevices, type MidiDevice } from "../services/midiService";
import {
  ScheduleItemAutomation,
  SmartAutomationRule,
  ProPresenterStageScreen,
  ProPresenterStageLayout,
  ProPresenterConnection,
  HttpAutomationMethod,
} from "../types/propresenter";
import {
  loadSmartAutomations,
  addSmartAutomation,
  removeSmartAutomation,
} from "../utils/testimoniesStorage";
import "../App.css";

// Recording automation types
type RecordingAutomationType = 
  | "startVideoRecording"
  | "stopVideoRecording"
  | "startAudioRecording"
  | "stopAudioRecording"
  | "startBothRecording"
  | "stopBothRecording";

const RECORDING_AUTOMATION_TYPES: RecordingAutomationType[] = [
  "startVideoRecording",
  "stopVideoRecording",
  "startAudioRecording",
  "stopAudioRecording",
  "startBothRecording",
  "stopBothRecording",
];

const HTTP_METHODS: HttpAutomationMethod[] = ["GET", "POST", "PUT", "DELETE"];

interface ScheduleAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (automations: ScheduleItemAutomation[] | undefined) => void;
  currentAutomations?: ScheduleItemAutomation[];
  sessionName: string;
}

type AutomationType = "slide" | "stageLayout" | "recording" | "midi" | "http";

const ScheduleAutomationModal: React.FC<ScheduleAutomationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentAutomations,
  sessionName,
}) => {
  const [automationType, setAutomationType] = useState<AutomationType>("slide");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedAutomations, setSavedAutomations] = useState<
    ScheduleItemAutomation[]
  >(currentAutomations || []);
  const [activationClicks, setActivationClicks] = useState<number>(1);

  // Stage layout state
  const [stageScreens, setStageScreens] = useState<ProPresenterStageScreen[]>(
    []
  );
  const [stageLayouts, setStageLayouts] = useState<ProPresenterStageLayout[]>(
    []
  );
  const [selectedScreenIndex, setSelectedScreenIndex] = useState<number | null>(
    null
  );
  const [selectedLayoutIndex, setSelectedLayoutIndex] = useState<number | null>(
    null
  );
  const [isLoadingStageData, setIsLoadingStageData] = useState(false);

  // Smart automation options
  const [saveAsSmartRule, setSaveAsSmartRule] = useState(false);
  const [isExactMatch, setIsExactMatch] = useState(true);
  const [smartRules, setSmartRules] = useState<SmartAutomationRule[]>([]);
  const [matchingRule, setMatchingRule] = useState<SmartAutomationRule | null>(
    null
  );

  // ProPresenter connection selection
  const [enabledConnections, setEnabledConnections] = useState<ProPresenterConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");

  // Recording automation state
  const [selectedRecordingAction, setSelectedRecordingAction] = useState<RecordingAutomationType | null>(null);

  // MIDI automation state
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [selectedMidiDeviceId, setSelectedMidiDeviceId] = useState<string>("");
  const [midiChannel, setMidiChannel] = useState<number>(1);
  const [midiNote, setMidiNote] = useState<number>(60);
  const [midiVelocity, setMidiVelocity] = useState<number>(127);
  const [isLoadingMidiDevices, setIsLoadingMidiDevices] = useState(false);

  // HTTP automation state
  const [httpMethod, setHttpMethod] = useState<HttpAutomationMethod>("POST");
  const [httpUrl, setHttpUrl] = useState<string>("");
  const [httpPayload, setHttpPayload] = useState<string>("");

  // Track if modal was just opened to prevent re-initialization
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load smart rules and check for matches
  useEffect(() => {
    const rules = loadSmartAutomations();
    setSmartRules(rules);

    // Check if there's a matching rule for this session
    const normalizedName = sessionName.toLowerCase().trim();
    const exactMatch = rules.find(
      (r) =>
        r.isExactMatch &&
        r.sessionNamePattern.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) {
      setMatchingRule(exactMatch);
    } else {
      const containsMatch = rules.find(
        (r) =>
          !r.isExactMatch &&
          normalizedName.includes(r.sessionNamePattern.toLowerCase().trim())
      );
      setMatchingRule(containsMatch || null);
    }
  }, [sessionName]);

  // Load stage screens and layouts when type is stageLayout
  useEffect(() => {
    if (automationType === "stageLayout" && isOpen) {
      loadStageData();
    }
  }, [automationType, isOpen]);

  // Load MIDI devices when type is midi
  useEffect(() => {
    if (automationType === "midi" && isOpen) {
      loadMidiDevices();
    }
  }, [automationType, isOpen]);

  const loadMidiDevices = async () => {
    setIsLoadingMidiDevices(true);
    try {
      const devices = await listMidiOutputDevices();
      setMidiDevices(devices);
      // Load default MIDI settings
      const midiSettingsKey = "proassist-midi-settings";
      try {
        const saved = localStorage.getItem(midiSettingsKey);
        if (saved) {
          const settings = JSON.parse(saved);
          if (settings.selectedDeviceId && devices.find(d => d.id === settings.selectedDeviceId)) {
            setSelectedMidiDeviceId(settings.selectedDeviceId);
            setMidiChannel(settings.defaultChannel || 1);
            setMidiNote(settings.defaultNote || 60);
            setMidiVelocity(settings.defaultVelocity || 127);
          } else if (devices.length > 0) {
            setSelectedMidiDeviceId(devices[0].id);
          }
        } else if (devices.length > 0) {
          setSelectedMidiDeviceId(devices[0].id);
        }
      } catch (e) {
        // Use defaults
        if (devices.length > 0) {
          setSelectedMidiDeviceId(devices[0].id);
        }
      }
    } catch (error) {
      console.error("[AutomationModal] Failed to load MIDI devices:", error);
      setError("Failed to load MIDI devices");
    } finally {
      setIsLoadingMidiDevices(false);
    }
  };

  // Load enabled connections when modal opens
  useEffect(() => {
    if (isOpen) {
      const connections = getEnabledConnections();
      setEnabledConnections(connections);
      // Auto-select first connection if available
      if (connections.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(connections[0].id);
      }
    }
  }, [isOpen]);

  // Reset state when modal opens - only on initial open, not on every currentAutomations change
  useEffect(() => {
    if (isOpen && !hasInitialized) {
      const initialAutomations = currentAutomations || [];
      setSavedAutomations(initialAutomations);

      // default to slide tab unless only stageLayout, recording, midi, or http exists
      const hasSlide = initialAutomations.some((a) => a.type === "slide");
      const hasStage = initialAutomations.some((a) => a.type === "stageLayout");
      const hasRecording = initialAutomations.some((a) =>
        RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType)
      );
      const hasMidi = initialAutomations.some((a) => a.type === "midi");
      const hasHttp = initialAutomations.some((a) => a.type === "http");
      const initialType: AutomationType = hasSlide
        ? "slide"
        : hasStage
        ? "stageLayout"
        : hasRecording
        ? "recording"
        : hasMidi
        ? "midi"
        : hasHttp
        ? "http"
        : "slide";
      setAutomationType(initialType);

      const existingSlide = initialAutomations.find((a) => a.type === "slide");
      setActivationClicks(
        existingSlide?.type === "slide"
          ? existingSlide.activationClicks ?? 1
          : 1
      );

      const existingStage = initialAutomations.find(
        (a) => a.type === "stageLayout"
      );
      if (existingStage?.type === "stageLayout") {
        setSelectedScreenIndex(existingStage.screenIndex);
        setSelectedLayoutIndex(existingStage.layoutIndex);
      } else {
        setSelectedScreenIndex(null);
        setSelectedLayoutIndex(null);
      }

      // Initialize recording automation state
      const existingRecording = initialAutomations.find((a) =>
        RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType)
      );
      setSelectedRecordingAction(existingRecording?.type as RecordingAutomationType || null);

      // Initialize MIDI automation state
      const existingMidi = initialAutomations.find((a) => a.type === "midi");
      if (existingMidi?.type === "midi") {
        setSelectedMidiDeviceId(existingMidi.deviceId);
        setMidiChannel(existingMidi.channel);
        setMidiNote(existingMidi.note);
        setMidiVelocity(existingMidi.velocity || 127);
      }

      const existingHttp = initialAutomations.find((a) => a.type === "http");
      if (existingHttp?.type === "http") {
        setHttpMethod(existingHttp.method);
        setHttpUrl(existingHttp.url);
        if (typeof existingHttp.payload === "string") {
          setHttpPayload(existingHttp.payload);
        } else {
          setHttpPayload("");
        }
      } else {
        setHttpMethod("POST");
        setHttpUrl("");
        setHttpPayload("");
      }

      setSuccess(false);
      setError(null);
      setSaveAsSmartRule(false);
      setHasInitialized(true);
    } else if (!isOpen) {
      // Reset initialization flag when modal closes
      setHasInitialized(false);
    }
  }, [isOpen, hasInitialized, currentAutomations]);

  const loadStageData = async () => {
    setIsLoadingStageData(true);
    setError(null);

    const connections = enabledConnections.length > 0 ? enabledConnections : getEnabledConnections();
    if (connections.length === 0) {
      setError(
        "No enabled ProPresenter connections found. Please enable at least one connection in Settings."
      );
      setIsLoadingStageData(false);
      return;
    }

    // Use the selected connection
    const connection = connections.find(c => c.id === selectedConnectionId) || connections[0];

    try {
      const [screens, layouts] = await Promise.all([
        getStageScreens(connection),
        getStageLayouts(connection),
      ]);

      if (screens.length > 0 && layouts.length > 0) {
        setStageScreens(screens);
        setStageLayouts(layouts);
        setIsLoadingStageData(false);
        return;
      } else {
        setError("No stage screens or layouts found in ProPresenter.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stage data");
    }

    setIsLoadingStageData(false);
  };

  const handleGetSlide = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    if (enabledConnections.length === 0) {
      setError(
        "No enabled ProPresenter connections found. Please enable at least one connection in Settings."
      );
      setIsLoading(false);
      return;
    }

    // Find the selected connection
    const connection = enabledConnections.find(c => c.id === selectedConnectionId) || enabledConnections[0];

    try {
      const slideIndexData = await getCurrentSlideIndex(connection);
      if (slideIndexData?.presentation_index) {
        const automation: ScheduleItemAutomation = {
          type: "slide",
          presentationUuid:
            slideIndexData.presentation_index.presentation_id.uuid,
          slideIndex: slideIndexData.presentation_index.index,
          presentationName:
            slideIndexData.presentation_index.presentation_id.name,
          activationClicks:
            activationClicks !== 1 ? activationClicks : undefined,
        };
        setSavedAutomations((prev) => {
          const others = prev.filter((a) => a.type !== "slide");
          return [...others, automation];
        });
        setSuccess(true);
        setIsLoading(false);
        return;
      } else {
        setError("No active presentation found. Make sure a slide is live in ProPresenter.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get slide index");
    }

    setIsLoading(false);
  };

  const handleStageLayoutChange = () => {
    if (selectedScreenIndex === null || selectedLayoutIndex === null) {
      setError("Please select both a screen and a layout");
      return;
    }

    const screen = stageScreens.find((s) => s.index === selectedScreenIndex);
    const layout = stageLayouts.find((l) => l.id.index === selectedLayoutIndex);

    if (!screen || !layout) {
      setError("Invalid screen or layout selection");
      return;
    }

    const automation: ScheduleItemAutomation = {
      type: "stageLayout",
      screenUuid: screen.uuid,
      screenName: screen.name,
      screenIndex: screen.index,
      layoutUuid: layout.id.uuid,
      layoutName: layout.id.name,
      layoutIndex: layout.id.index,
    };

    setSavedAutomations((prev) => {
      const others = prev.filter((a) => a.type !== "stageLayout");
      return [...others, automation];
    });
    setSuccess(true);
    setError(null);
  };

  const handleSave = () => {
    if (savedAutomations.length > 0) {
      const automationToSave: ScheduleItemAutomation[] = savedAutomations.map(
        (a) => {
          if (a.type !== "slide") return a;
          return {
            ...a,
            activationClicks:
              activationClicks !== 1 ? activationClicks : undefined,
          };
        }
      );

      // Save as smart rule if checked
      if (saveAsSmartRule) {
        const rule: SmartAutomationRule = {
          id: `rule-${Date.now()}`,
          sessionNamePattern: sessionName,
          isExactMatch: isExactMatch,
          automations: automationToSave,
          createdAt: Date.now(),
        };
        addSmartAutomation(rule);
      }

      onSave(automationToSave);
    } else {
      onSave(undefined);
    }
    onClose();
  };

  const handleRemove = () => {
    onSave(undefined);
    onClose();
  };

  const handleRemoveCurrentType = () => {
    if (automationType === "recording") {
      handleRemoveRecordingAutomation();
    } else if (automationType === "midi") {
      handleRemoveMidiAutomation();
    } else if (automationType === "http") {
      handleRemoveHttpAutomation();
    } else {
      setSavedAutomations((prev) =>
        prev.filter((a) => a.type !== automationType)
      );
      setSuccess(false);
    }
  };

  const handleApplyMatchingRule = () => {
    if (matchingRule) {
      const ruleAutomations = matchingRule.automations || [];
      setSavedAutomations(ruleAutomations);

      const ruleSlide = ruleAutomations.find((a) => a.type === "slide");
      setActivationClicks(
        ruleSlide?.type === "slide" ? ruleSlide.activationClicks ?? 1 : 1
      );

      const ruleStage = ruleAutomations.find((a) => a.type === "stageLayout");
      if (ruleStage?.type === "stageLayout") {
        setSelectedScreenIndex(ruleStage.screenIndex);
        setSelectedLayoutIndex(ruleStage.layoutIndex);
      }

      const ruleRecording = ruleAutomations.find((a) => 
        RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType)
      );
      if (ruleRecording) {
        setSelectedRecordingAction(ruleRecording.type as RecordingAutomationType);
      }

      const ruleMidi = ruleAutomations.find((a) => a.type === "midi");
      if (ruleMidi?.type === "midi") {
        setSelectedMidiDeviceId(ruleMidi.deviceId);
        setMidiChannel(ruleMidi.channel);
        setMidiNote(ruleMidi.note);
        setMidiVelocity(ruleMidi.velocity || 127);
      }

      const ruleHttp = ruleAutomations.find((a) => a.type === "http");
      if (ruleHttp?.type === "http") {
        setHttpMethod(ruleHttp.method);
        setHttpUrl(ruleHttp.url);
        setHttpPayload(typeof ruleHttp.payload === "string" ? ruleHttp.payload : "");
      }

      // keep current selected tab, but if it has nothing, switch to something that exists
      const hasSelectedType = automationType === "recording" 
        ? ruleAutomations.some((a) => RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType))
        : ruleAutomations.some((a) => a.type === automationType);
      
      if (!hasSelectedType) {
        const nextType: AutomationType = ruleAutomations.some((a) => a.type === "slide")
          ? "slide"
          : ruleAutomations.some((a) => a.type === "stageLayout")
          ? "stageLayout"
          : ruleAutomations.some((a) => RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType))
          ? "recording"
          : ruleAutomations.some((a) => a.type === "midi")
          ? "midi"
          : ruleAutomations.some((a) => a.type === "http")
          ? "http"
          : "slide";
        setAutomationType(nextType);
      }
      setSuccess(true);
    }
  };

  const handleRemoveSmartRule = (ruleId: string) => {
    removeSmartAutomation(ruleId);
    setSmartRules(loadSmartAutomations());
    if (matchingRule?.id === ruleId) {
      setMatchingRule(null);
    }
  };

  const handleCancel = () => {
    setError(null);
    setSuccess(false);
    setIsLoading(false);
    setSavedAutomations(currentAutomations || []);
    onClose();
  };

  const handleTypeChange = (type: AutomationType) => {
    setAutomationType(type);
    setSuccess(false);
    setError(null);
    if (type === "stageLayout") {
      loadStageData();
    }
  };

  const handleRecordingActionChange = (action: RecordingAutomationType) => {
    setSelectedRecordingAction(action);
    
    // Add the new recording automation
    const automation: ScheduleItemAutomation = { type: action };
    setSavedAutomations((prev) => {
      // Remove any existing recording automations
      const others = prev.filter((a) =>
        !RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType)
      );
      return [...others, automation];
    });
    setSuccess(true);
    setError(null);
  };

  const handleRemoveRecordingAutomation = () => {
    setSavedAutomations((prev) =>
      prev.filter(
        (a) => !RECORDING_AUTOMATION_TYPES.includes(a.type as RecordingAutomationType)
      )
    );
    setSelectedRecordingAction(null);
    setSuccess(false);
  };

  const handleMidiNoteChange = () => {
    if (!selectedMidiDeviceId) {
      setError("Please select a MIDI device");
      return;
    }

    const device = midiDevices.find((d) => d.id === selectedMidiDeviceId);
    if (!device) {
      setError("Selected MIDI device not found");
      return;
    }

    const automation: ScheduleItemAutomation = {
      type: "midi",
      deviceId: selectedMidiDeviceId,
      deviceName: device.name,
      channel: midiChannel,
      note: midiNote,
      velocity: midiVelocity !== 127 ? midiVelocity : undefined,
    };

    setSavedAutomations((prev) => {
      const others = prev.filter((a) => a.type !== "midi");
      return [...others, automation];
    });
    setSuccess(true);
    setError(null);
  };

  const handleRemoveMidiAutomation = () => {
    setSavedAutomations((prev) => prev.filter((a) => a.type !== "midi"));
    setSelectedMidiDeviceId("");
    setMidiChannel(1);
    setMidiNote(60);
    setMidiVelocity(127);
    setSuccess(false);
  };

  const handleSetHttpAutomation = () => {
    const trimmedUrl = httpUrl.trim();
    if (!trimmedUrl) {
      setError("Please enter a URL for the HTTP call");
      return;
    }

    const trimmedPayload = httpPayload.trim();
    let payload: string | undefined;
    if (trimmedPayload) {
      try {
        JSON.parse(trimmedPayload);
        payload = trimmedPayload;
      } catch {
        setError("Invalid JSON payload. Please provide valid JSON.");
        return;
      }
    }

    const automation: ScheduleItemAutomation = {
      type: "http",
      method: httpMethod,
      url: trimmedUrl,
      payload,
    };

    setSavedAutomations((prev) => {
      const others = prev.filter((a) => a.type !== "http");
      return [...others, automation];
    });
    setSuccess(true);
    setError(null);
  };

  const handleRemoveHttpAutomation = () => {
    setSavedAutomations((prev) => prev.filter((a) => a.type !== "http"));
    setHttpMethod("POST");
    setHttpUrl("");
    setHttpPayload("");
    setSuccess(false);
  };

  if (!isOpen) return null;

  const getAutomationTypeLabel = (automation: ScheduleItemAutomation) => {
    if (automation.type === "slide") {
      return `Slide: ${
        automation.presentationName || automation.presentationUuid
      } (Index: ${automation.slideIndex})`;
    } else if (automation.type === "stageLayout") {
      return `Stage Layout: ${
        automation.screenName || `Screen ${automation.screenIndex}`
      } → ${automation.layoutName || `Layout ${automation.layoutIndex}`}`;
    } else if (automation.type === "midi") {
      return `MIDI: ${automation.deviceName || automation.deviceId} - Channel ${automation.channel}, Note ${automation.note}${automation.velocity !== undefined ? `, Velocity ${automation.velocity}` : ""}`;
    } else if (automation.type === "http") {
      return `HTTP: ${automation.method} ${automation.url}${automation.payload ? " (payload)" : ""}`;
    } else {
      // Recording automations
      const recordingLabels: Record<string, string> = {
        startVideoRecording: "▶ Start Video Recording",
        stopVideoRecording: "⏹ Stop Video Recording",
        startAudioRecording: "▶ Start Audio Recording",
        stopAudioRecording: "⏹ Stop Audio Recording",
        startBothRecording: "▶ Start Video & Audio Recording",
        stopBothRecording: "⏹ Stop Video & Audio Recording",
      };
      return recordingLabels[automation.type] || automation.type;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: "600px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <FaMagic />
          Schedule Automation
        </h2>

        <div
          style={{
            marginBottom: "16px",
            color: "var(--app-text-color-secondary)",
            fontSize: "0.9em",
          }}
        >
          Session:{" "}
          <strong style={{ color: "var(--app-text-color)" }}>
            {sessionName}
          </strong>
        </div>

        {/* Automation Type Selector */}
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <label
            style={{
              fontSize: "0.85em",
              display: "block",
              marginBottom: "8px",
              color: "var(--app-text-color-secondary)",
              fontWeight: 600,
            }}
          >
            Automation Type:
          </label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <label
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "10px",
                border: `2px solid ${
                  automationType === "slide"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor:
                  automationType === "slide"
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9em",
              }}
            >
              <input
                type="radio"
                name="automationType"
                value="slide"
                checked={automationType === "slide"}
                onChange={() => handleTypeChange("slide")}
                style={{ width: "16px", height: "16px" }}
              />
              <FaDesktop />
              <span>Trigger Slide</span>
            </label>
            <label
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "10px",
                border: `2px solid ${
                  automationType === "stageLayout"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor:
                  automationType === "stageLayout"
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9em",
              }}
            >
              <input
                type="radio"
                name="automationType"
                value="stageLayout"
                checked={automationType === "stageLayout"}
                onChange={() => handleTypeChange("stageLayout")}
                style={{ width: "16px", height: "16px" }}
              />
              <FaLayerGroup />
              <span>Stage Layout</span>
            </label>
            <label
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "10px",
                border: `2px solid ${
                  automationType === "recording"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor:
                  automationType === "recording"
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9em",
              }}
            >
              <input
                type="radio"
                name="automationType"
                value="recording"
                checked={automationType === "recording"}
                onChange={() => handleTypeChange("recording")}
                style={{ width: "16px", height: "16px" }}
              />
              <FaVideo />
              <span>Recording</span>
            </label>
            <label
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "10px",
                border: `2px solid ${
                  automationType === "midi"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor:
                  automationType === "midi"
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9em",
              }}
            >
              <input
                type="radio"
                name="automationType"
                value="midi"
                checked={automationType === "midi"}
                onChange={() => handleTypeChange("midi")}
                style={{ width: "16px", height: "16px" }}
              />
              <FaMusic />
              <span>MIDI Note</span>
            </label>
            <label
              style={{
                flex: 1,
                minWidth: "140px",
                padding: "10px",
                border: `2px solid ${
                  automationType === "http"
                    ? "var(--app-primary-color)"
                    : "var(--app-border-color)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                backgroundColor:
                  automationType === "http"
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9em",
              }}
            >
              <input
                type="radio"
                name="automationType"
                value="http"
                checked={automationType === "http"}
                onChange={() => handleTypeChange("http")}
                style={{ width: "16px", height: "16px" }}
              />
              <FaLink />
              <span>HTTP Call</span>
            </label>
          </div>
        </div>

        {/* Matching Smart Rule Notification */}
        {matchingRule &&
          !(currentAutomations && currentAutomations.length > 0) && (
            <div
              style={{
                marginBottom: "12px",
                padding: "12px",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "6px",
                color: "#3b82f6",
                fontSize: "0.9em",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                    <FaMagic style={{ marginRight: "6px" }} />
                    Matching Smart Rule Found
                  </div>
                  <div style={{ fontSize: "0.85em", opacity: 0.9 }}>
                    Pattern: "{matchingRule.sessionNamePattern}" (
                    {matchingRule.isExactMatch ? "exact" : "contains"})
                    <br />
                    {(matchingRule.automations || []).length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        {(matchingRule.automations || []).map((a) => (
                          <div key={a.type}>{getAutomationTypeLabel(a)}</div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ opacity: 0.8 }}>No automations</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleApplyMatchingRule}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}

        {/* Instructions */}
        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "var(--app-header-bg)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p style={{ margin: "0 0 12px 0", color: "var(--app-text-color)" }}>
            <strong>Instructions:</strong>
          </p>
          {automationType === "slide" ? (
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>
                Go to ProPresenter and put the slide you want to trigger live
              </li>
              <li>Click "Get Slide" below to capture the current slide</li>
              <li>
                Optionally save as a smart rule to auto-apply to future sessions
              </li>
            </ol>
          ) : automationType === "stageLayout" ? (
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>Select a stage screen from the dropdown</li>
              <li>Select a layout for that screen</li>
              <li>Click "Set Layout" to save the configuration</li>
              <li>
                Optionally save as a smart rule to auto-apply to future sessions
              </li>
            </ol>
          ) : automationType === "midi" ? (
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>Select a MIDI output device</li>
              <li>Configure the MIDI channel, note, and velocity</li>
              <li>Click "Set MIDI Note" to save the automation</li>
              <li>
                <strong>Tip:</strong> The MIDI note will be sent when this session starts
              </li>
            </ol>
          ) : automationType === "http" ? (
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>Select an HTTP method</li>
              <li>Enter the URL to call</li>
              <li>Paste an optional JSON payload</li>
              <li>Click "Set HTTP Call" to save the automation</li>
            </ol>
          ) : (
            <ol
              style={{
                margin: "0",
                paddingLeft: "20px",
                color: "var(--app-text-color-secondary)",
              }}
            >
              <li>Select a recording action to trigger when this session starts</li>
              <li>Use "Start" actions to begin recording, "Stop" to end recording</li>
              <li>
                <strong>Tip:</strong> Use with "Follow Master Timer" in Network Settings to remotely control recording
              </li>
            </ol>
          )}
        </div>

        {error && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              borderRadius: "6px",
              color: "#ef4444",
              fontSize: "0.9em",
            }}
          >
            {error}
          </div>
        )}

        {success && savedAutomations.length > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              borderRadius: "6px",
              color: "#22c55e",
              fontSize: "0.9em",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FaCheck />
              <div>
                <div style={{ fontWeight: 600 }}>
                  {automationType === "slide"
                    ? "Slide captured!"
                    : automationType === "stageLayout"
                    ? "Stage layout configured!"
                    : automationType === "midi"
                    ? "MIDI note saved!"
                    : automationType === "http"
                    ? "HTTP call configured!"
                    : "Recording automation saved!"}
                </div>
                <div
                  style={{ fontSize: "0.85em", marginTop: "4px", opacity: 0.9 }}
                >
                  {(() => {
                    const current =
                      automationType === "slide"
                        ? savedAutomations.find((a) => a.type === "slide")
                        : automationType === "stageLayout"
                        ? savedAutomations.find((a) => a.type === "stageLayout")
                        : automationType === "midi"
                        ? savedAutomations.find((a) => a.type === "midi")
                        : automationType === "http"
                        ? savedAutomations.find((a) => a.type === "http")
                        : savedAutomations.find((a) =>
                            RECORDING_AUTOMATION_TYPES.includes(
                              a.type as RecordingAutomationType
                            )
                          );
                    if (!current) return null;
                    if (current.type === "slide") {
                      return (
                        <>
                          Presentation:{" "}
                          {current.presentationName || current.presentationUuid}
                          <br />
                          Slide Index: {current.slideIndex}
                        </>
                      );
                    }
                    if (current.type === "stageLayout") {
                      return (
                        <>
                          Screen:{" "}
                          {current.screenName || `Screen ${current.screenIndex}`}
                          <br />
                          Layout:{" "}
                          {current.layoutName || `Layout ${current.layoutIndex}`}
                        </>
                      );
                    }
                    if (current.type === "midi") {
                      return (
                        <>
                          Device: {current.deviceName || current.deviceId}
                          <br />
                          Channel: {current.channel}, Note: {current.note}
                          {current.velocity !== undefined
                            ? `, Velocity: ${current.velocity}`
                            : ""}
                        </>
                      );
                    }
                    if (current.type === "http") {
                      return (
                        <>
                          Method: {current.method}
                          <br />
                          URL: {current.url}
                          {current.payload ? (
                            <>
                              <br />
                              Payload: attached
                            </>
                          ) : null}
                        </>
                      );
                    }
                    return <>{getAutomationTypeLabel(current)}</>;
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentAutomations && currentAutomations.length > 0 && !success && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
              fontSize: "0.9em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              Current Automation:
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              {currentAutomations.map((a) => (
                <div key={a.type}>{getAutomationTypeLabel(a)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Slide Configuration */}
        {automationType === "slide" && (
          <>
            {/* Clicks Setting */}
            {savedAutomations.some((a) => a.type === "slide") && (
              <div
                style={{
                  marginBottom: "12px",
                  padding: "10px",
                  backgroundColor: "var(--app-header-bg)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "6px",
                }}
              >
                <div style={{ marginBottom: "8px" }}>
                  <label
                    style={{
                      fontSize: "0.85em",
                      display: "block",
                      marginBottom: "4px",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Trigger Clicks (for animations):
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={activationClicks}
                    onChange={(e) =>
                      setActivationClicks(
                        Math.max(1, parseInt(e.target.value) || 1)
                      )
                    }
                    style={{
                      width: "80px",
                      padding: "4px 8px",
                      fontSize: "0.9em",
                      backgroundColor: "var(--app-input-bg-color)",
                      color: "var(--app-input-text-color)",
                      border: "1px solid var(--app-border-color)",
                      borderRadius: "4px",
                    }}
                  />
                </div>

                <button
                  onClick={handleRemoveCurrentType}
                  className="secondary"
                  style={{ width: "100%", marginTop: "8px", color: "#ef4444" }}
                >
                  <FaTimes />
                  Remove Slide Automation
                </button>
              </div>
            )}
          </>
        )}

        {/* Stage Layout Configuration */}
        {automationType === "stageLayout" && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "4px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Stage Screen:
              </label>
              <select
                value={selectedScreenIndex ?? ""}
                onChange={(e) => {
                  setSelectedScreenIndex(
                    e.target.value ? parseInt(e.target.value) : null
                  );
                  setSuccess(false);
                }}
                disabled={isLoadingStageData}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                <option value="">Select a screen...</option>
                {stageScreens.map((screen) => (
                  <option key={screen.uuid} value={screen.index}>
                    {screen.name} (Index: {screen.index})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "4px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Layout:
              </label>
              <select
                value={selectedLayoutIndex ?? ""}
                onChange={(e) => {
                  setSelectedLayoutIndex(
                    e.target.value ? parseInt(e.target.value) : null
                  );
                  setSuccess(false);
                }}
                disabled={isLoadingStageData || selectedScreenIndex === null}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                <option value="">Select a layout...</option>
                {stageLayouts.map((layout) => (
                  <option key={layout.id.uuid} value={layout.id.index}>
                    {layout.id.name} (Index: {layout.id.index})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStageLayoutChange}
              disabled={
                isLoadingStageData ||
                selectedScreenIndex === null ||
                selectedLayoutIndex === null
              }
              className="secondary"
              style={{ width: "100%", marginTop: "8px" }}
            >
              {isLoadingStageData ? (
                <>
                  <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
                  Loading...
                </>
              ) : (
                <>
                  <FaCheck />
                  Set Layout
                </>
              )}
            </button>

            {savedAutomations.some((a) => a.type === "stageLayout") && (
              <button
                onClick={handleRemoveCurrentType}
                className="secondary"
                style={{ width: "100%", marginTop: "8px", color: "#ef4444" }}
              >
                <FaTimes />
                Remove Stage Layout Automation
              </button>
            )}
          </div>
        )}

        {/* Recording Configuration */}
        {automationType === "recording" && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "8px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Recording Action:
              </label>
              
              {/* Start Actions */}
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "0.8em", color: "var(--app-text-color-secondary)", marginBottom: "6px", fontWeight: 600 }}>
                  <FaPlay size={10} style={{ marginRight: "4px" }} />
                  Start Recording
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "startVideoRecording" ? "#22c55e" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "startVideoRecording" ? "rgba(34, 197, 94, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "startVideoRecording"}
                      onChange={() => handleRecordingActionChange("startVideoRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <FaVideo style={{ color: "#8b5cf6" }} />
                    <span>Start Video Recording</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "startAudioRecording" ? "#22c55e" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "startAudioRecording" ? "rgba(34, 197, 94, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "startAudioRecording"}
                      onChange={() => handleRecordingActionChange("startAudioRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <FaMicrophone style={{ color: "#3b82f6" }} />
                    <span>Start Audio Recording</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "startBothRecording" ? "#22c55e" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "startBothRecording" ? "rgba(34, 197, 94, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "startBothRecording"}
                      onChange={() => handleRecordingActionChange("startBothRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <span style={{ display: "flex", gap: "4px" }}>
                      <FaVideo style={{ color: "#8b5cf6" }} />
                      <FaMicrophone style={{ color: "#3b82f6" }} />
                    </span>
                    <span>Start Video & Audio Recording</span>
                  </label>
                </div>
              </div>

              {/* Stop Actions */}
              <div>
                <div style={{ fontSize: "0.8em", color: "var(--app-text-color-secondary)", marginBottom: "6px", fontWeight: 600 }}>
                  <FaStop size={10} style={{ marginRight: "4px" }} />
                  Stop Recording
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "stopVideoRecording" ? "#ef4444" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "stopVideoRecording" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "stopVideoRecording"}
                      onChange={() => handleRecordingActionChange("stopVideoRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <FaVideo style={{ color: "#8b5cf6" }} />
                    <span>Stop Video Recording</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "stopAudioRecording" ? "#ef4444" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "stopAudioRecording" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "stopAudioRecording"}
                      onChange={() => handleRecordingActionChange("stopAudioRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <FaMicrophone style={{ color: "#3b82f6" }} />
                    <span>Stop Audio Recording</span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      border: `2px solid ${selectedRecordingAction === "stopBothRecording" ? "#ef4444" : "var(--app-border-color)"}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                      backgroundColor: selectedRecordingAction === "stopBothRecording" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="recordingAction"
                      checked={selectedRecordingAction === "stopBothRecording"}
                      onChange={() => handleRecordingActionChange("stopBothRecording")}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <span style={{ display: "flex", gap: "4px" }}>
                      <FaVideo style={{ color: "#8b5cf6" }} />
                      <FaMicrophone style={{ color: "#3b82f6" }} />
                    </span>
                    <span>Stop Video & Audio Recording</span>
                  </label>
                </div>
              </div>
            </div>

            {selectedRecordingAction && (
              <button
                onClick={handleRemoveRecordingAutomation}
                className="secondary"
                style={{ width: "100%", marginTop: "8px", color: "#ef4444" }}
              >
                <FaTimes />
                Remove Recording Automation
              </button>
            )}
          </div>
        )}

        {/* MIDI Configuration */}
        {automationType === "midi" && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "8px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                MIDI Device:
              </label>
              <select
                value={selectedMidiDeviceId}
                onChange={(e) => {
                  setSelectedMidiDeviceId(e.target.value);
                  setSuccess(false);
                }}
                disabled={isLoadingMidiDevices}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                <option value="">Select a MIDI device...</option>
                {midiDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
              {isLoadingMidiDevices && (
                <div style={{ marginTop: "8px", fontSize: "0.85em", color: "var(--app-text-color-secondary)" }}>
                  <FaSpinner style={{ animation: "spin 1s linear infinite", marginRight: "6px" }} />
                  Loading MIDI devices...
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label
                  style={{
                    fontSize: "0.85em",
                    display: "block",
                    marginBottom: "4px",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  Channel (1-16):
                </label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={midiChannel}
                  onChange={(e) => {
                    setMidiChannel(Math.max(1, Math.min(16, parseInt(e.target.value) || 1)));
                    setSuccess(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
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
                    fontSize: "0.85em",
                    display: "block",
                    marginBottom: "4px",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  Note (0-127):
                </label>
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={midiNote}
                  onChange={(e) => {
                    setMidiNote(Math.max(0, Math.min(127, parseInt(e.target.value) || 60)));
                    setSuccess(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
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
                    fontSize: "0.85em",
                    display: "block",
                    marginBottom: "4px",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  Velocity (0-127):
                </label>
                <input
                  type="number"
                  min="0"
                  max="127"
                  value={midiVelocity}
                  onChange={(e) => {
                    setMidiVelocity(Math.max(0, Math.min(127, parseInt(e.target.value) || 127)));
                    setSuccess(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    fontSize: "0.9em",
                    backgroundColor: "var(--app-input-bg-color)",
                    color: "var(--app-input-text-color)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "4px",
                  }}
                />
              </div>
            </div>

            <button
              onClick={handleMidiNoteChange}
              disabled={!selectedMidiDeviceId || isLoadingMidiDevices}
              className="secondary"
              style={{ width: "100%", marginTop: "8px" }}
            >
              <FaCheck />
              Set MIDI Note
            </button>

            {savedAutomations.some((a) => a.type === "midi") && (
              <button
                onClick={handleRemoveMidiAutomation}
                className="secondary"
                style={{ width: "100%", marginTop: "8px", color: "#ef4444" }}
              >
                <FaTimes />
                Remove MIDI Automation
              </button>
            )}
          </div>
        )}

        {/* HTTP Configuration */}
        {automationType === "http" && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                HTTP Method:
              </label>
              <select
                value={httpMethod}
                onChange={(e) => {
                  setHttpMethod(e.target.value as HttpAutomationMethod);
                  setSuccess(false);
                }}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                URL:
              </label>
              <input
                type="text"
                value={httpUrl}
                onChange={(e) => {
                  setHttpUrl(e.target.value);
                  setSuccess(false);
                  setError(null);
                }}
                placeholder="https://api.example.com/endpoint"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "0.85em",
                  display: "block",
                  marginBottom: "6px",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                JSON Payload (optional):
              </label>
              <textarea
                value={httpPayload}
                onChange={(e) => {
                  setHttpPayload(e.target.value);
                  setSuccess(false);
                  setError(null);
                }}
                rows={5}
                placeholder='{"key": "value"}'
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  marginTop: "6px",
                  fontSize: "0.8em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Payload is sent for POST/PUT/DELETE and must be valid JSON.
              </div>
            </div>

            <button
              onClick={handleSetHttpAutomation}
              disabled={!httpUrl.trim()}
              className="secondary"
              style={{ width: "100%", marginTop: "8px" }}
            >
              <FaCheck />
              Set HTTP Call
            </button>

            {savedAutomations.some((a) => a.type === "http") && (
              <button
                onClick={handleRemoveHttpAutomation}
                className="secondary"
                style={{ width: "100%", marginTop: "8px", color: "#ef4444" }}
              >
                <FaTimes />
                Remove HTTP Automation
              </button>
            )}
          </div>
        )}

        {/* Smart Rule Option */}
        {savedAutomations.length > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                fontSize: "0.9em",
              }}
            >
              <input
                type="checkbox"
                checked={saveAsSmartRule}
                onChange={(e) => setSaveAsSmartRule(e.target.checked)}
                style={{ width: "16px", height: "16px" }}
              />
              <FaSave style={{ color: "var(--app-primary-color)" }} />
              <span>
                Save as smart rule (auto-apply to future "{sessionName}"
                sessions)
              </span>
            </label>

            {saveAsSmartRule && (
              <div style={{ marginTop: "8px", marginLeft: "28px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="matchType"
                    checked={isExactMatch}
                    onChange={() => setIsExactMatch(true)}
                  />
                  <span>Exact name match</span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    color: "var(--app-text-color-secondary)",
                    marginTop: "4px",
                  }}
                >
                  <input
                    type="radio"
                    name="matchType"
                    checked={!isExactMatch}
                    onChange={() => setIsExactMatch(false)}
                  />
                  <span>
                    Contains (matches sessions containing "{sessionName}")
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Saved Smart Rules */}
        {smartRules.length > 0 && (
          <div
            style={{
              marginBottom: "16px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <div
              style={{
                fontSize: "0.85em",
                fontWeight: 600,
                marginBottom: "8px",
                color: "var(--app-text-color)",
              }}
            >
              Saved Smart Rules:
            </div>
            <div style={{ maxHeight: "120px", overflowY: "auto" }}>
              {smartRules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    marginBottom: "4px",
                    backgroundColor: "var(--app-input-bg-color)",
                    borderRadius: "4px",
                    fontSize: "0.85em",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--app-text-color)" }}>
                      "{rule.sessionNamePattern}"
                    </span>
                    <span
                      style={{
                        color: "var(--app-text-color-secondary)",
                        marginLeft: "6px",
                      }}
                    >
                      ({rule.isExactMatch ? "exact" : "contains"})
                    </span>
                    <div
                      style={{
                        fontSize: "0.8em",
                        color: "var(--app-text-color-secondary)",
                        marginTop: "2px",
                      }}
                    >
                      {(rule.automations || []).length > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          {(rule.automations || []).map((a) => (
                            <div key={a.type}>{getAutomationTypeLabel(a)}</div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ opacity: 0.8 }}>No automations</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveSmartRule(rule.id)}
                    style={{
                      padding: "2px 6px",
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "0.85em",
                    }}
                    title="Remove this rule"
                  >
                    <FaTimes />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ProPresenter Connection Selector */}
        {enabledConnections.length > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              backgroundColor: "var(--app-header-bg)",
              border: "1px solid var(--app-border-color)",
              borderRadius: "6px",
            }}
          >
            <label
              style={{
                fontSize: "0.85em",
                display: "block",
                marginBottom: "6px",
                color: "var(--app-text-color-secondary)",
                fontWeight: 600,
              }}
            >
              {automationType === "slide" ? "Get slide from:" : "Get stage data from:"}
            </label>
            {enabledConnections.length === 1 ? (
              <div
                style={{
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                {enabledConnections[0].name} ({enabledConnections[0].apiUrl})
              </div>
            ) : (
              <select
                value={selectedConnectionId}
                onChange={(e) => {
                  setSelectedConnectionId(e.target.value);
                  // Reset stage data when connection changes so user needs to reload
                  if (automationType === "stageLayout") {
                    setStageScreens([]);
                    setStageLayouts([]);
                    setSelectedScreenIndex(null);
                    setSelectedLayoutIndex(null);
                    setSuccess(false);
                    // Auto-reload stage data for the new connection
                    setTimeout(() => loadStageData(), 100);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "0.9em",
                  backgroundColor: "var(--app-input-bg-color)",
                  color: "var(--app-input-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "4px",
                }}
              >
                {enabledConnections.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name} ({conn.apiUrl})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          {savedAutomations.length > 0 && (
            <button
              onClick={handleRemove}
              className="secondary"
              style={{ marginRight: "auto" }}
            >
              <FaTimes />
              Remove All
            </button>
          )}
          <button onClick={handleCancel} className="secondary">
            <FaTimes />
            Cancel
          </button>
          {automationType === "slide" && (
            <button
              onClick={handleGetSlide}
              disabled={isLoading || enabledConnections.length === 0}
              className="secondary"
              style={{ minWidth: "140px" }}
            >
              {isLoading ? (
                <>
                  <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
                  Reading...
                </>
              ) : (
                <>
                  <FaDesktop />
                  Get Slide
                </>
              )}
            </button>
          )}
          {savedAutomations.length > 0 && (
            <button onClick={handleSave} className="primary">
              <FaCheck />
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScheduleAutomationModal;

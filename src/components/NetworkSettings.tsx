import React, { useCallback, useEffect, useState } from "react";
import {
  NetworkSyncMode,
  NetworkSyncSettings,
  DEFAULT_NETWORK_SYNC_SETTINGS,
} from "../types/networkSync";
import {
  getSyncStatus,
  loadNetworkSyncSettings,
  networkSyncManager,
  saveNetworkSyncSettings,
} from "../services/networkSyncService";
import {
  getLocalIp,
  getLiveSlidesServerInfo,
  loadLiveSlidesSettings,
  saveLiveSlidesSettings,
  startLiveSlidesServer,
  stopLiveSlidesServer,
} from "../services/liveSlideService";
import {
  DEFAULT_LIVE_SLIDES_SETTINGS,
  LiveSlidesSettings as LiveSlidesSettingsType,
} from "../types/liveSlides";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect";
import { setApiEnabled } from "../services/apiService";
import "../App.css";

const NetworkSettings: React.FC = () => {
  // Network Sync state
  const [syncSettings, setSyncSettings] = useState<NetworkSyncSettings>(
    DEFAULT_NETWORK_SYNC_SETTINGS
  );
  const [syncServerRunning, setSyncServerRunning] = useState(false);
  const [syncConnectedClients, setSyncConnectedClients] = useState(0);
  const [clientConnected, setClientConnected] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isTogglingSyncServer, setIsTogglingSyncServer] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  const [localIp, setLocalIp] = useState<string>("Loading...");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [apiServerRunning, setApiServerRunning] = useState(false);
  const [apiMessage, setApiMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  
  // Connection test state
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  // Web Server (Live Slides Server) state
  const [webServerSettings, setWebServerSettings] = useState<LiveSlidesSettingsType>(
    DEFAULT_LIVE_SLIDES_SETTINGS
  );
  const [webServerRunning, setWebServerRunning] = useState<boolean>(false);
  const [webServerStatusText, setWebServerStatusText] = useState<string>("");
  const [isTogglingWebServer, setIsTogglingWebServer] = useState(false);
  const [webServerMessage, setWebServerMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  const [webServerSettingsLoaded, setWebServerSettingsLoaded] = useState(false);

  useEffect(() => {
    setSyncSettings(loadNetworkSyncSettings());
    refreshSyncServerStatus();

    // Load Web Server settings
    const loadedWebServerSettings = loadLiveSlidesSettings();
    setWebServerSettings(loadedWebServerSettings);
    setWebServerSettingsLoaded(true);
    refreshWebServerStatus();

    getLocalIp()
      .then((ip) => setLocalIp(ip))
      .catch(() => setLocalIp("Unable to determine"));
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshSyncServerStatus();
      refreshWebServerStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-save settings on change (debounced). We avoid saving while sync server is
  // running because some fields are intentionally locked in the UI.
  useDebouncedEffect(
    () => {
      try {
        if (syncSettings.serverPort < 1024 || syncSettings.serverPort > 65535) {
          throw new Error("Port must be between 1024 and 65535");
        }
        if (
          (syncSettings.mode === "slave" || syncSettings.mode === "peer") &&
          !syncSettings.remoteHost.trim()
        ) {
          throw new Error("Remote host is required for slave/peer mode");
        }
        saveNetworkSyncSettings(syncSettings);
        setSyncMessage({ text: "All changes saved", type: "success" });
        setTimeout(() => setSyncMessage({ text: "", type: "" }), 2000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setSyncMessage({ text: msg, type: "error" });
      }
    },
    [syncSettings, syncServerRunning, settingsLoaded],
    { delayMs: 600, enabled: settingsLoaded && !syncServerRunning, skipFirstRun: true }
  );

  // Auto-save Web Server settings on change (debounced)
  useDebouncedEffect(
    () => {
      try {
        if (webServerSettings.serverPort < 1024 || webServerSettings.serverPort > 65535) {
          throw new Error("Port must be between 1024 and 65535");
        }
        saveLiveSlidesSettings(webServerSettings);
        setWebServerMessage({ text: "All changes saved", type: "success" });
        setTimeout(() => setWebServerMessage({ text: "", type: "" }), 2000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setWebServerMessage({ text: msg, type: "error" });
      }
    },
    [webServerSettings, webServerSettingsLoaded],
    { delayMs: 600, enabled: webServerSettingsLoaded, skipFirstRun: true }
  );

  const refreshSyncServerStatus = async () => {
    try {
      const status = await getSyncStatus();
      setSyncServerRunning(status.serverRunning);
      setSyncConnectedClients(status.serverConnectedClients);
      setClientConnected(status.clientConnected);
      setClientError(status.clientError);
    } catch {
      setSyncServerRunning(false);
      setSyncConnectedClients(0);
      setClientConnected(false);
      setClientError(null);
    }
  };

  const refreshWebServerStatus = async () => {
    try {
      const info = await getLiveSlidesServerInfo();
      setWebServerRunning(info.server_running);
      setWebServerStatusText(
        info.server_running ? `${info.local_ip}:${info.server_port}` : "Stopped"
      );
    } catch {
      setWebServerRunning(false);
      setWebServerStatusText("Stopped");
    }
  };
  const refreshApiServerInfo = useCallback(async () => {
    const fallbackHost =
      localIp && !localIp.startsWith("Unable") && !localIp.startsWith("Loading")
        ? localIp
        : "localhost";
    const fallbackPort = loadLiveSlidesSettings().serverPort;

    try {
      const info = await getLiveSlidesServerInfo();
      const host = info.local_ip || fallbackHost;
      const port = info.server_port || fallbackPort;
      setApiBaseUrl(`http://${host}:${port}`);
      setApiServerRunning(info.server_running);
    } catch {
      setApiBaseUrl(`http://${fallbackHost}:${fallbackPort}`);
      setApiServerRunning(false);
    }
  }, [localIp]);

  const ensureApiServerRunning = useCallback(async () => {
    const settings = loadLiveSlidesSettings();
    try {
      const info = await getLiveSlidesServerInfo();
      if (!info.server_running) {
        try {
          await startLiveSlidesServer(info.server_port || settings.serverPort);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!message.toLowerCase().includes("already running")) {
            throw error;
          }
        }
      }
    } catch (error) {
      try {
        await startLiveSlidesServer(settings.serverPort);
      } catch (startError) {
        throw startError;
      }
    } finally {
      await refreshApiServerInfo();
    }
  }, [refreshApiServerInfo]);

  useEffect(() => {
    refreshApiServerInfo();
  }, [refreshApiServerInfo]);

  useEffect(() => {
    if (!settingsLoaded) return;
    setApiEnabled(syncSettings.apiEnabled).catch((error) => {
      console.warn("[API] Failed to update API toggle:", error);
    });
  }, [settingsLoaded, syncSettings.apiEnabled]);

  useEffect(() => {
    if (!settingsLoaded || !syncSettings.apiEnabled) return;
    ensureApiServerRunning().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setApiMessage({ text: message, type: "error" });
      setTimeout(() => setApiMessage({ text: "", type: "" }), 4000);
    });
  }, [ensureApiServerRunning, settingsLoaded, syncSettings.apiEnabled]);

  const handleSyncSettingChange = (
    field: keyof NetworkSyncSettings,
    value: string | number | boolean
  ) => {
    setSyncSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleWebServerSettingChange = (
    field: keyof LiveSlidesSettingsType,
    value: string | number | boolean
  ) => {
    setWebServerSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleToggleWebServer = async () => {
    setIsTogglingWebServer(true);
    setWebServerMessage({ text: "", type: "" });
    try {
      if (webServerRunning) {
        await stopLiveSlidesServer();
      } else {
        await startLiveSlidesServer(webServerSettings.serverPort);
      }
      await refreshWebServerStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setWebServerMessage({ text: `Server action failed: ${msg}`, type: "error" });
      setTimeout(() => setWebServerMessage({ text: "", type: "" }), 5000);
    } finally {
      setIsTogglingWebServer(false);
    }
  };

  const handleApiToggle = (enabled: boolean) => {
    setSyncSettings((prev) => {
      const next = { ...prev, apiEnabled: enabled };
      saveNetworkSyncSettings(next);
      return next;
    });
    setApiMessage({
      text: enabled ? "API enabled" : "API disabled",
      type: "success",
    });
    setTimeout(() => setApiMessage({ text: "", type: "" }), 2000);
  };

  const handleSyncModeChange = (mode: NetworkSyncMode) => {
    setSyncSettings((prev) => ({
      ...prev,
      mode,
    }));
  };

  const handleToggleSyncServer = async () => {
    setIsTogglingSyncServer(true);
    setSyncMessage({ text: "", type: "" });

    try {
      const isActive =
        syncSettings.mode === "master"
          ? syncServerRunning
          : syncSettings.mode === "slave"
            ? clientConnected
            : syncSettings.mode === "peer"
              ? syncServerRunning || clientConnected
              : false;

      if (isActive) {
        await networkSyncManager.stop();
        setSyncMessage({
          text:
            syncSettings.mode === "slave"
              ? "Disconnected from master"
              : "Sync stopped",
          type: "success",
        });
      } else {
        if (syncSettings.mode === "off") {
          throw new Error("Please select a sync mode first");
        }
        if (
          (syncSettings.mode === "slave" || syncSettings.mode === "peer") &&
          !syncSettings.remoteHost
        ) {
          throw new Error("Remote host IP is required for slave/peer mode");
        }

        // Ensure the latest settings are persisted before starting
        saveNetworkSyncSettings(syncSettings);
        await networkSyncManager.start();
        setSyncMessage({
          text:
            syncSettings.mode === "master"
              ? "Sync server started"
              : syncSettings.mode === "slave"
                ? "Connected to master"
                : "Sync started",
          type: "success",
        });
      }
      await refreshSyncServerStatus();
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 3000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setSyncMessage({ text: msg, type: "error" });
      setTimeout(() => setSyncMessage({ text: "", type: "" }), 5000);
    } finally {
      setIsTogglingSyncServer(false);
    }
  };

  // Test connection to remote master/peer
  const handleTestConnection = async () => {
    if (!syncSettings.remoteHost.trim()) {
      setConnectionTestResult({
        status: "error",
        message: "Please enter a remote host IP address",
      });
      return;
    }

    setIsTestingConnection(true);
    setConnectionTestResult({ status: "idle", message: "" });

    const wsUrl = `ws://${syncSettings.remoteHost}:${syncSettings.remotePort}/sync`;
    let testWs: WebSocket | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (testWs) {
        try {
          testWs.close();
        } catch {
          // Ignore close errors
        }
        testWs = null;
      }
    };

    try {
      await new Promise<void>((resolve, reject) => {
        // Set a timeout for the connection attempt
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error("Connection timed out after 5 seconds"));
        }, 5000);

        testWs = new WebSocket(wsUrl);

        testWs.onopen = () => {
          // Send a test message
          testWs?.send(JSON.stringify({
            type: "sync_join",
            clientMode: "test",
            clientId: `test-${Date.now()}`,
          }));
        };

        testWs.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "sync_welcome") {
              // Successfully received welcome from server
              setConnectionTestResult({
                status: "success",
                message: `Connected! Server has ${message.connectedClients} client(s) connected.`,
              });
              cleanup();
              resolve();
            }
          } catch {
            // Ignore parse errors
          }
        };

        testWs.onerror = () => {
          cleanup();
          reject(new Error("Failed to connect - check IP address and ensure master is running"));
        };

        testWs.onclose = (event) => {
          if (event.code !== 1000 && event.code !== 1005) {
            // Not a normal close
            cleanup();
            reject(new Error(`Connection closed: ${event.reason || "Connection refused"}`));
          }
        };
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setConnectionTestResult({
        status: "error",
        message: msg,
      });
    } finally {
      cleanup();
      setIsTestingConnection(false);
      
      // Clear result after 5 seconds
      setTimeout(() => {
        setConnectionTestResult({ status: "idle", message: "" });
      }, 5000);
    }
  };

  const handleOpenApiDocs = async () => {
    setApiMessage({ text: "", type: "" });

    try {
      if (syncSettings.apiEnabled) {
        await ensureApiServerRunning();
      } else {
        await refreshApiServerInfo();
      }

      const fallbackHost =
        localIp && !localIp.startsWith("Unable") && !localIp.startsWith("Loading")
          ? localIp
          : "localhost";
      const fallbackPort = loadLiveSlidesSettings().serverPort;
      const baseUrl =
        apiBaseUrl || `http://${fallbackHost}:${fallbackPort}`;
      const url = `${baseUrl}/api/docs`;

      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApiMessage({ text: message, type: "error" });
      setTimeout(() => setApiMessage({ text: "", type: "" }), 4000);
      try {
        const fallbackHost =
          localIp && !localIp.startsWith("Unable") && !localIp.startsWith("Loading")
            ? localIp
            : "localhost";
        const fallbackPort = loadLiveSlidesSettings().serverPort;
        const url = `${apiBaseUrl || `http://${fallbackHost}:${fallbackPort}`}/api/docs`;
        window.open(url, "_blank", "noopener");
      } catch {
        // Ignore fallback errors
      }
    }
  };

  return (
    <div style={{ maxWidth: "800px" }}>
      <h2 style={{ marginBottom: "var(--spacing-4)" }}>Network Settings</h2>

      {/* Web Server Settings Section */}
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
            marginBottom: "var(--spacing-4)",
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Web Server Settings
        </h3>

        {/* Network Information */}
        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Network Information
          </h4>
          <div
            style={{
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-input-bg-color)",
              borderRadius: "8px",
              border: "1px solid var(--app-border-color)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 500 }}>Local IP Address:</span>
              <span
                style={{
                  fontFamily: "monospace",
                  padding: "4px 12px",
                  backgroundColor: "var(--app-bg-color)",
                  borderRadius: "4px",
                }}
              >
                {localIp}
              </span>
            </div>
            <p
              style={{
                margin: "var(--spacing-2) 0 0 0",
                fontSize: "0.85em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              Other devices on your local network can connect using this IP
              address.
            </p>
          </div>
        </div>

        {/* Server Control */}
        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Server Status
          </h4>
          <div
            style={{
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-input-bg-color)",
              borderRadius: "8px",
              border: "1px solid var(--app-border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--spacing-3)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                Status:{" "}
                <span style={{ color: webServerRunning ? "#22c55e" : "#9ca3af" }}>
                  {webServerRunning ? "Running" : "Stopped"}
                </span>
              </div>
              <div
                style={{
                  fontSize: "0.9em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                {webServerStatusText}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
              <button
                onClick={handleToggleWebServer}
                disabled={isTogglingWebServer}
                className={webServerRunning ? "secondary" : "primary"}
                style={{ minWidth: "140px" }}
              >
                {webServerRunning
                  ? isTogglingWebServer
                    ? "Stopping..."
                    : "Stop Server"
                  : isTogglingWebServer
                  ? "Starting..."
                  : "Start Server"}
              </button>
              <button
                onClick={refreshWebServerStatus}
                disabled={isTogglingWebServer}
                className="secondary"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Server Configuration */}
        <div>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Server Configuration
          </h4>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-3)",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "var(--spacing-1)",
                  fontWeight: 500,
                }}
              >
                Server Port
              </label>
              <input
                type="number"
                value={webServerSettings.serverPort}
                onChange={(e) =>
                  handleWebServerSettingChange("serverPort", parseInt(e.target.value, 10) || 9876)
                }
                min={1024}
                max={65535}
                style={{ width: "150px", padding: "var(--spacing-2)" }}
              />
              <p
                style={{
                  marginTop: "var(--spacing-1)",
                  fontSize: "0.85em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Port for the web server (default: 9876). Must be between 1024
                and 65535. This server handles both HTTP and WebSocket
                connections.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
                padding: "var(--spacing-3)",
                backgroundColor: "var(--app-bg-color)",
                borderRadius: "8px",
              }}
            >
              <input
                type="checkbox"
                id="autoStartWebServer"
                checked={webServerSettings.autoStartServer}
                onChange={(e) =>
                  handleWebServerSettingChange("autoStartServer", e.target.checked)
                }
                style={{ width: "auto", margin: 0 }}
              />
              <label
                htmlFor="autoStartWebServer"
                style={{ margin: 0, cursor: "pointer", fontWeight: 500 }}
              >
                Auto-start server when app opens
              </label>
            </div>
          </div>
        </div>

        {/* Save Status */}
        {webServerMessage.text && (
          <div
            style={{
              marginTop: "var(--spacing-3)",
              padding: "var(--spacing-2)",
              color: webServerMessage.type === "success" ? "#22c55e" : "#dc2626",
              fontSize: "0.9em",
            }}
          >
            {webServerMessage.text}
          </div>
        )}
      </div>

      {/* Network Sync Section */}
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
          Network Sync
        </h3>

        {/* Info Box */}
        <div
          style={{
            marginBottom: "var(--spacing-4)",
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p style={{ margin: "0 0 var(--spacing-2) 0", fontWeight: 500 }}>
            About Network Sync
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "0.9em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            Network Sync allows multiple SmartVerses instances to share data. In
            Master mode, this device broadcasts changes to others. In Slave
            mode, it receives updates from a master. In Peer mode, all devices
            sync bidirectionally.
          </p>
        </div>

        {/* Sync Mode Selection */}
        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
            Sync Mode
          </h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "var(--spacing-2)",
            }}
          >
            {[
              { value: "off", label: "Off", desc: "Sync disabled" },
              { value: "master", label: "Master", desc: "Broadcast only" },
              { value: "slave", label: "Slave", desc: "Receive only" },
              { value: "peer", label: "Peer", desc: "Both directions" },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() =>
                  handleSyncModeChange(mode.value as NetworkSyncMode)
                }
                disabled={syncServerRunning}
                style={{
                  padding: "var(--spacing-3)",
                  backgroundColor:
                    syncSettings.mode === mode.value
                      ? "var(--app-primary-color)"
                      : "var(--app-input-bg-color)",
                  color:
                    syncSettings.mode === mode.value
                      ? "white"
                      : "var(--app-text-color)",
                  border: "1px solid var(--app-border-color)",
                  borderRadius: "8px",
                  cursor: syncServerRunning ? "not-allowed" : "pointer",
                  opacity: syncServerRunning ? 0.7 : 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontWeight: 600 }}>{mode.label}</span>
                <span style={{ fontSize: "0.75em", opacity: 0.8 }}>
                  {mode.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sync Server Status - Only for Master mode */}
        {syncSettings.mode === "master" && (
          <div style={{ marginBottom: "var(--spacing-4)" }}>
            <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
              Sync Server Status
            </h4>
            <div
              style={{
                padding: "var(--spacing-3)",
                backgroundColor: "var(--app-input-bg-color)",
                borderRadius: "8px",
                border: "1px solid var(--app-border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--spacing-3)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                  Status:{" "}
                  <span
                    style={{ color: syncServerRunning ? "#22c55e" : "#9ca3af" }}
                  >
                    {syncServerRunning ? "Running" : "Stopped"}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.9em",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  {syncServerRunning
                    ? `${localIp}:${syncSettings.serverPort} • ${syncConnectedClients} client${syncConnectedClients !== 1 ? "s" : ""} connected`
                    : "Not running"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
                <button
                  onClick={handleToggleSyncServer}
                  disabled={isTogglingSyncServer}
                  className={syncServerRunning ? "secondary" : "primary"}
                  style={{ minWidth: "140px" }}
                >
                  {syncServerRunning
                    ? isTogglingSyncServer
                      ? "Stopping..."
                      : "Stop Server"
                    : isTogglingSyncServer
                    ? "Starting..."
                    : "Start Server"}
                </button>
                <button
                  onClick={refreshSyncServerStatus}
                  disabled={isTogglingSyncServer}
                  className="secondary"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connection Settings (for slave mode) - Shows first, before connect button */}
        {syncSettings.mode === "slave" && (
          <div style={{ marginBottom: "var(--spacing-4)" }}>
            <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
              Master Connection
            </h4>
            <p
              style={{
                marginBottom: "var(--spacing-3)",
                fontSize: "0.9em",
                color: "var(--app-text-color-secondary)",
              }}
            >
              Enter the IP address and port of the master device to connect to.
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-3)",
                alignItems: "flex-end",
              }}
            >
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "var(--spacing-1)",
                    fontWeight: 500,
                  }}
                >
                  Master IP Address
                </label>
                <input
                  type="text"
                  value={syncSettings.remoteHost}
                  onChange={(e) =>
                    handleSyncSettingChange("remoteHost", e.target.value)
                  }
                  placeholder="192.168.1.100"
                  disabled={clientConnected || isTogglingSyncServer}
                  style={{ width: "100%", padding: "var(--spacing-2)" }}
                />
              </div>
              <div style={{ width: "120px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "var(--spacing-1)",
                    fontWeight: 500,
                  }}
                >
                  Port
                </label>
                <input
                  type="number"
                  value={syncSettings.remotePort}
                  onChange={(e) =>
                    handleSyncSettingChange(
                      "remotePort",
                      parseInt(e.target.value, 10) || 9877
                    )
                  }
                  min={1024}
                  max={65535}
                  disabled={clientConnected || isTogglingSyncServer}
                  style={{ width: "100%", padding: "var(--spacing-2)" }}
                />
              </div>
              <button
                onClick={handleTestConnection}
                disabled={
                  isTestingConnection ||
                  isTogglingSyncServer ||
                  clientConnected ||
                  !syncSettings.remoteHost.trim()
                }
                className="secondary"
                style={{ 
                  minWidth: "120px",
                  whiteSpace: "nowrap",
                }}
              >
                {isTestingConnection ? "Testing..." : "Test Connection"}
              </button>
            </div>
            
            {/* Connection Test Result */}
            {connectionTestResult.status !== "idle" && (
              <div
                style={{
                  marginTop: "var(--spacing-2)",
                  padding: "var(--spacing-2) var(--spacing-3)",
                  backgroundColor:
                    connectionTestResult.status === "success"
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${
                    connectionTestResult.status === "success"
                      ? "rgba(34, 197, 94, 0.3)"
                      : "rgba(239, 68, 68, 0.3)"
                  }`,
                  borderRadius: "6px",
                  fontSize: "0.9em",
                  color:
                    connectionTestResult.status === "success"
                      ? "#22c55e"
                      : "#ef4444",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>
                  {connectionTestResult.status === "success" ? "✓" : "✗"}
                </span>
                <span>{connectionTestResult.message}</span>
              </div>
            )}

            {/* Connection Status - Only show after IP is entered */}
            {syncSettings.remoteHost.trim() && (
              <div
                style={{
                  marginTop: "var(--spacing-3)",
                  padding: "var(--spacing-3)",
                  backgroundColor: "var(--app-input-bg-color)",
                  borderRadius: "8px",
                  border: "1px solid var(--app-border-color)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--spacing-3)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                    Status:{" "}
                    <span
                      style={{ 
                        color: clientConnected 
                          ? "#22c55e" 
                          : isTogglingSyncServer
                            ? "#f59e0b" 
                            : "#9ca3af" 
                      }}
                    >
                      {clientConnected 
                        ? "Connected" 
                        : isTogglingSyncServer 
                          ? "Connecting..." 
                          : "Disconnected"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.9em",
                      color: clientError ? "#ef4444" : "var(--app-text-color-secondary)",
                    }}
                  >
                    {clientConnected
                      ? `Connected to ${syncSettings.remoteHost}:${syncSettings.remotePort}`
                      : clientError
                        ? clientError
                        : isTogglingSyncServer
                          ? `Attempting to connect to ${syncSettings.remoteHost}:${syncSettings.remotePort}...`
                          : "Not connected to master"}
                  </div>
                </div>
                <button
                  onClick={handleToggleSyncServer}
                  disabled={isTogglingSyncServer}
                  className={clientConnected ? "secondary" : "primary"}
                  style={{ minWidth: "160px" }}
                >
                  {isTogglingSyncServer
                    ? clientConnected
                      ? "Disconnecting..."
                      : "Connecting..."
                    : clientConnected
                      ? "Disconnect"
                      : "Connect to Master"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Peer mode - Shows both server status and remote connection */}
        {syncSettings.mode === "peer" && (
          <>
            {/* Server Status for Peer */}
            <div style={{ marginBottom: "var(--spacing-4)" }}>
              <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
                Local Server Status
              </h4>
              <div
                style={{
                  padding: "var(--spacing-3)",
                  backgroundColor: "var(--app-input-bg-color)",
                  borderRadius: "8px",
                  border: "1px solid var(--app-border-color)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--spacing-3)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                    Status:{" "}
                    <span
                      style={{ color: syncServerRunning ? "#22c55e" : "#9ca3af" }}
                    >
                      {syncServerRunning ? "Running" : "Stopped"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.9em",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    {syncServerRunning
                      ? `${localIp}:${syncSettings.serverPort} • ${syncConnectedClients} client${syncConnectedClients !== 1 ? "s" : ""} connected`
                      : "Not running"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
                  <button
                    onClick={handleToggleSyncServer}
                    disabled={isTogglingSyncServer}
                    className={syncServerRunning ? "secondary" : "primary"}
                    style={{ minWidth: "140px" }}
                  >
                    {syncServerRunning
                      ? isTogglingSyncServer
                        ? "Stopping..."
                        : "Stop Sync"
                      : isTogglingSyncServer
                      ? "Starting..."
                      : "Start Sync"}
                  </button>
                  <button
                    onClick={refreshSyncServerStatus}
                    disabled={isTogglingSyncServer}
                    className="secondary"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Remote Connection for Peer */}
            <div style={{ marginBottom: "var(--spacing-4)" }}>
              <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
                Remote Peer Connection
              </h4>
              <p
                style={{
                  marginBottom: "var(--spacing-3)",
                  fontSize: "0.9em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Enter the IP address and port of another peer to sync with.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "var(--spacing-3)",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "var(--spacing-1)",
                      fontWeight: 500,
                    }}
                  >
                    Peer IP Address
                  </label>
                  <input
                    type="text"
                    value={syncSettings.remoteHost}
                    onChange={(e) =>
                      handleSyncSettingChange("remoteHost", e.target.value)
                    }
                    placeholder="192.168.1.100"
                    disabled={syncServerRunning}
                    style={{ width: "100%", padding: "var(--spacing-2)" }}
                  />
                </div>
                <div style={{ width: "120px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "var(--spacing-1)",
                      fontWeight: 500,
                    }}
                  >
                    Port
                  </label>
                  <input
                    type="number"
                    value={syncSettings.remotePort}
                    onChange={(e) =>
                      handleSyncSettingChange(
                        "remotePort",
                        parseInt(e.target.value, 10) || 9877
                      )
                    }
                    min={1024}
                    max={65535}
                    disabled={syncServerRunning}
                    style={{ width: "100%", padding: "var(--spacing-2)" }}
                  />
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={isTestingConnection || syncServerRunning || !syncSettings.remoteHost.trim()}
                  className="secondary"
                  style={{ 
                    minWidth: "120px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isTestingConnection ? "Testing..." : "Test Connection"}
                </button>
              </div>
              
              {/* Connection Test Result */}
              {connectionTestResult.status !== "idle" && (
                <div
                  style={{
                    marginTop: "var(--spacing-2)",
                    padding: "var(--spacing-2) var(--spacing-3)",
                    backgroundColor:
                      connectionTestResult.status === "success"
                        ? "rgba(34, 197, 94, 0.1)"
                        : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${
                      connectionTestResult.status === "success"
                        ? "rgba(34, 197, 94, 0.3)"
                        : "rgba(239, 68, 68, 0.3)"
                    }`,
                    borderRadius: "6px",
                    fontSize: "0.9em",
                    color:
                      connectionTestResult.status === "success"
                        ? "#22c55e"
                        : "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>
                    {connectionTestResult.status === "success" ? "✓" : "✗"}
                  </span>
                  <span>{connectionTestResult.message}</span>
                </div>
              )}

              {/* Remote Peer Connection Status */}
              {syncServerRunning && syncSettings.remoteHost.trim() && (
                <div
                  style={{
                    marginTop: "var(--spacing-3)",
                    padding: "var(--spacing-2) var(--spacing-3)",
                    backgroundColor: "var(--app-input-bg-color)",
                    borderRadius: "6px",
                    border: "1px solid var(--app-border-color)",
                    fontSize: "0.9em",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: clientConnected ? "#22c55e" : "#f59e0b",
                    }}
                  />
                  <span style={{ color: "var(--app-text-color-secondary)" }}>
                    Remote peer:{" "}
                    <span style={{ color: clientConnected ? "#22c55e" : "#f59e0b" }}>
                      {clientConnected ? "Connected" : "Connecting..."}
                    </span>
                    {clientError && (
                      <span style={{ color: "#ef4444", marginLeft: "8px" }}>
                        ({clientError})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Sync Port Configuration - Only for Master and Peer (they run servers) */}
        {(syncSettings.mode === "master" || syncSettings.mode === "peer") && (
          <div style={{ marginBottom: "var(--spacing-4)" }}>
            <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
              Server Configuration
            </h4>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "var(--spacing-1)",
                  fontWeight: 500,
                }}
              >
                Local Sync Port
              </label>
              <input
                type="number"
                value={syncSettings.serverPort}
                onChange={(e) =>
                  handleSyncSettingChange(
                    "serverPort",
                    parseInt(e.target.value, 10) || 9877
                  )
                }
                min={1024}
                max={65535}
                disabled={syncServerRunning}
                style={{ width: "150px", padding: "var(--spacing-2)" }}
              />
              <p
                style={{
                  marginTop: "var(--spacing-1)",
                  fontSize: "0.85em",
                  color: "var(--app-text-color-secondary)",
                }}
              >
                Port for the sync server (default: 9877). Must be different from
                the web server port.
              </p>
            </div>
          </div>
        )}

        {/* What to Sync */}
        {syncSettings.mode !== "off" && (
          <div style={{ marginBottom: "var(--spacing-4)" }}>
            <h4 style={{ marginBottom: "var(--spacing-2)", fontSize: "1rem" }}>
              What to Sync
            </h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--spacing-2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  padding: "var(--spacing-2)",
                  backgroundColor: "var(--app-bg-color)",
                  borderRadius: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="syncPlaylists"
                  checked={syncSettings.syncPlaylists}
                  onChange={(e) =>
                    handleSyncSettingChange("syncPlaylists", e.target.checked)
                  }
                  disabled={syncServerRunning}
                  style={{ width: "auto", margin: 0 }}
                />
                <label
                  htmlFor="syncPlaylists"
                  style={{ margin: 0, cursor: "pointer", flex: 1 }}
                >
                  <span style={{ fontWeight: 500 }}>Playlist Items</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.85em",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Sync slides when they are created or updated (excludes Live
                    Slides)
                  </span>
                </label>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-2)",
                  padding: "var(--spacing-2)",
                  backgroundColor: "var(--app-bg-color)",
                  borderRadius: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="syncSchedule"
                  checked={syncSettings.syncSchedule}
                  onChange={(e) =>
                    handleSyncSettingChange("syncSchedule", e.target.checked)
                  }
                  disabled={syncServerRunning}
                  style={{ width: "auto", margin: 0 }}
                />
                <label
                  htmlFor="syncSchedule"
                  style={{ margin: 0, cursor: "pointer", flex: 1 }}
                >
                  <span style={{ fontWeight: 500 }}>Timer Schedule</span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.85em",
                      color: "var(--app-text-color-secondary)",
                    }}
                  >
                    Sync the session schedule when it changes
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Follow Master Timer toggle lives on the Timer page (to avoid duplicate/confusing controls). */}

        {/* Auto-connect */}
        {syncSettings.mode !== "off" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
              padding: "var(--spacing-3)",
              backgroundColor: "var(--app-bg-color)",
              borderRadius: "8px",
              marginBottom: "var(--spacing-4)",
            }}
          >
            <input
              type="checkbox"
              id="autoConnectSync"
              checked={syncSettings.autoConnect}
              onChange={(e) =>
                handleSyncSettingChange("autoConnect", e.target.checked)
              }
              style={{ width: "auto", margin: 0 }}
            />
            <label
              htmlFor="autoConnectSync"
              style={{ margin: 0, cursor: "pointer", fontWeight: 500 }}
            >
              Auto-start sync when app opens
            </label>
          </div>
        )}

        {/* Sync Actions */}
        {syncSettings.mode !== "off" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
            }}
          >
            {syncMessage.text && (
              <span
                style={{
                  color:
                    syncMessage.type === "success" ? "#22c55e" : "#dc2626",
                  fontSize: "0.9em",
                }}
              >
                {syncMessage.text}
              </span>
            )}
          </div>
        )}
      </div>

      {/* HTTP API Section */}
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
          HTTP API (v1)
        </h3>
        <div
          style={{
            marginBottom: "var(--spacing-4)",
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
          }}
        >
          <p style={{ margin: "0 0 var(--spacing-2) 0", fontWeight: 500 }}>
            About the API
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "0.9em",
              color: "var(--app-text-color-secondary)",
            }}
          >
            The API lets external systems trigger Scripture Go Live and start
            countdown timers. It runs on the Live Slides web server.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-2)",
            marginBottom: "var(--spacing-3)",
          }}
        >
          <input
            type="checkbox"
            id="enableApi"
            checked={syncSettings.apiEnabled}
            onChange={(e) => handleApiToggle(e.target.checked)}
            style={{ width: "auto", margin: 0 }}
          />
          <label
            htmlFor="enableApi"
            style={{ margin: 0, cursor: "pointer", fontWeight: 500 }}
          >
            Enable API
          </label>
        </div>

        <div
          style={{
            padding: "var(--spacing-3)",
            backgroundColor: "var(--app-input-bg-color)",
            borderRadius: "8px",
            border: "1px solid var(--app-border-color)",
            marginBottom: "var(--spacing-3)",
            fontSize: "0.9em",
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            Base URL:{" "}
            <span style={{ fontWeight: 600 }}>
              {apiBaseUrl || "http://localhost:9876"}
            </span>
          </div>
          <div style={{ color: "var(--app-text-color-secondary)" }}>
            Server status:{" "}
            <span style={{ color: apiServerRunning ? "#22c55e" : "#9ca3af" }}>
              {apiServerRunning ? "Running" : "Stopped"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
          <button
            onClick={handleOpenApiDocs}
            className="secondary"
            disabled={!syncSettings.apiEnabled}
          >
            Open Documentation
          </button>
          {apiMessage.text && (
            <span
              style={{
                color: apiMessage.type === "success" ? "#22c55e" : "#dc2626",
                fontSize: "0.9em",
              }}
            >
              {apiMessage.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkSettings;

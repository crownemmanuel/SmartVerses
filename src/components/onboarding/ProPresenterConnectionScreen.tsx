/**
 * Screen: ProPresenter Setup - Connection details
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  generateUUID,
  loadProPresenterConnections,
  saveProPresenterConnections,
  testConnection,
} from "../../services/propresenterService";
import {
  loadSmartVersesSettings,
  saveSmartVersesSettings,
} from "../../services/transcriptionService";
import "./onboarding.css";
import type { ProPresenterConnection } from "../../types/propresenter";

interface ProPresenterConnectionScreenProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = "59343";

const parseConnectionHostPort = (apiUrl: string) => {
  try {
    const parsed = new URL(apiUrl);
    return {
      host: parsed.hostname || DEFAULT_HOST,
      port: parsed.port || DEFAULT_PORT,
    };
  } catch {
    return { host: DEFAULT_HOST, port: DEFAULT_PORT };
  }
};

const ProPresenterConnectionScreen: React.FC<
  ProPresenterConnectionScreenProps
> = ({ onNext, onBack, onSkip }) => {
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [timerIndex, setTimerIndex] = useState(0);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  const apiUrl = useMemo(
    () => `http://${host || DEFAULT_HOST}:${port || DEFAULT_PORT}`,
    [host, port]
  );

  useEffect(() => {
    const settings = loadSmartVersesSettings();
    const connections = loadProPresenterConnections();
    const hasSelectedConnection = Boolean(
      settings.selectedProPresenterConnectionId
    );
    let activeConnection =
      connections.find((c) => c.id === settings.selectedProPresenterConnectionId) ||
      connections[0];

    if (!activeConnection) {
      activeConnection = {
        id: generateUUID(),
        name: "ProPresenter 1",
        apiUrl: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
        timerIndex: 0,
        isEnabled: true,
      };
      connections.push(activeConnection);
      saveProPresenterConnections(connections);
    }

    if (
      !hasSelectedConnection &&
      activeConnection.apiUrl === "http://localhost:1025"
    ) {
      activeConnection = {
        ...activeConnection,
        apiUrl: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
        isEnabled: true,
      };
      const nextConnections = connections.map((c) =>
        c.id === activeConnection.id ? activeConnection : c
      );
      saveProPresenterConnections(nextConnections);
    }

    const parsed = parseConnectionHostPort(activeConnection.apiUrl);
    setHost(parsed.host);
    setPort(parsed.port);
    setTimerIndex(activeConnection.timerIndex ?? 0);
    setConnectionId(activeConnection.id);

    const nextSettings = loadSmartVersesSettings();
    nextSettings.selectedProPresenterConnectionId = activeConnection.id;
    nextSettings.proPresenterConnectionIds = [activeConnection.id];
    saveSmartVersesSettings(nextSettings);
    window.dispatchEvent(
      new CustomEvent("smartverses-settings-changed", { detail: nextSettings })
    );
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    const connections = loadProPresenterConnections();
    const existing =
      connections.find((c) => c.id === connectionId) ||
      connections[0] || {
        id: connectionId,
        name: "ProPresenter 1",
        apiUrl,
        timerIndex,
        isEnabled: true,
      };

    const updated: ProPresenterConnection = {
      ...existing,
      apiUrl,
      timerIndex,
      isEnabled: true,
    };
    const nextConnections = connections.some((c) => c.id === updated.id)
      ? connections.map((c) => (c.id === updated.id ? updated : c))
      : [...connections, updated];

    saveProPresenterConnections(nextConnections);

    const settings = loadSmartVersesSettings();
    settings.selectedProPresenterConnectionId = updated.id;
    settings.proPresenterConnectionIds = [updated.id];
    saveSmartVersesSettings(settings);
    window.dispatchEvent(
      new CustomEvent("smartverses-settings-changed", { detail: settings })
    );
  }, [apiUrl, connectionId, timerIndex]);

  const handleTestConnection = async () => {
    if (!connectionId) return;
    setTestStatus("testing");
    setTestMessage("Testing connection...");
    try {
      const result = await testConnection({
        id: connectionId,
        name: "ProPresenter 1",
        apiUrl,
        timerIndex,
        isEnabled: true,
      });
      if (result.success) {
        setTestStatus("success");
        setTestMessage(result.message);
      } else {
        setTestStatus("error");
        setTestMessage(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTestStatus("error");
      setTestMessage(message);
    }
  };

  return (
    <div className="onboarding-screen">
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "500px",
        }}
      >
        <div
          className="onboarding-content"
          style={{
            maxWidth: "600px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <h1 className="onboarding-title">Connect to ProPresenter</h1>
          <p className="onboarding-body">
            Enter the IP address and port from ProPresenter&apos;s Network settings.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              maxWidth: "520px",
              margin: "0 auto",
            }}
          >
            <div className="onboarding-form-field">
              <label className="onboarding-label" htmlFor="propresenter-host">
                IP Address
              </label>
              <input
                id="propresenter-host"
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
                className="onboarding-input"
              />
            </div>
            <div className="onboarding-form-field">
              <label className="onboarding-label" htmlFor="propresenter-port">
                Port
              </label>
              <input
                id="propresenter-port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder={DEFAULT_PORT}
                className="onboarding-input"
              />
            </div>
          </div>

          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--spacing-3)",
              marginBottom: "var(--spacing-3)",
              maxWidth: "520px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--onboarding-text-secondary)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                API URL
              </label>
              <span style={{ fontSize: "0.875rem" }}>{apiUrl}</span>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--onboarding-text-secondary)",
                  marginBottom: "var(--spacing-1)",
                }}
              >
                Timer Index
              </label>
              <span style={{ fontSize: "0.875rem" }}>{timerIndex}</span>
            </div>
          </div>

          <div className="onboarding-buttons" style={{ justifyContent: "center" }}>
            <button
              onClick={handleTestConnection}
              className="onboarding-button onboarding-button-secondary"
            >
              {testStatus === "testing" ? "Testing..." : "Test connection"}
            </button>
          </div>

          {testStatus !== "idle" && (
            <div
              className={`onboarding-message ${
                testStatus === "success"
                  ? "onboarding-message-success"
                  : testStatus === "error"
                  ? "onboarding-message-error"
                  : "onboarding-message-info"
              }`}
            >
              {testMessage}
            </div>
          )}

          <div className="onboarding-buttons" style={{ justifyContent: "center" }}>
            <button
              onClick={onNext}
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
    </div>
  );
};

export default ProPresenterConnectionScreen;

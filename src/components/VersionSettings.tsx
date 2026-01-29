import React, { useState, useEffect } from 'react';
import { checkForUpdates, clearSkippedVersion, downloadAndInstallUpdate, UpdateResult } from '../utils/updater';
import { resetOnboardingState } from '../types/onboarding';
import LogViewer from './LogViewer';
import '../App.css';

// Current app version - matches package.json and tauri.conf.json
const APP_VERSION = '0.7.0';

const VersionSettings: React.FC = () => {
  const [currentVersion, setCurrentVersion] = useState<string>(APP_VERSION);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devtoolsError, setDevtoolsError] = useState<string | null>(null);
  const [developerMode, setDeveloperMode] = useState<boolean>(() => {
    return localStorage.getItem('developer-mode') === 'true';
  });

  useEffect(() => {
    // Try to get version from Tauri API if available
    const loadVersion = async () => {
      try {
        // Try Tauri v2 API - dynamically import to avoid build errors if not available
        const appApi = await import('@tauri-apps/api/app');
        if (appApi && typeof appApi.getVersion === 'function') {
          const version = await appApi.getVersion();
          setCurrentVersion(version);
        }
      } catch {
        // Use constant version if API is not available
        setCurrentVersion(APP_VERSION);
      }
    };
    
    loadVersion();
  }, []);

  useEffect(() => {
    localStorage.setItem('developer-mode', developerMode.toString());
  }, [developerMode]);

  const handleOpenInspector = async () => {
    setDevtoolsError(null);
    try {
      const coreApi = await import('@tauri-apps/api/core');
      await coreApi.invoke('toggle_devtools');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to open inspector';
      setDevtoolsError(msg);
      console.error('Open Inspector failed:', err);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    setUpdateResult(null);
    
    try {
      // If the user manually checks for updates, they may be reconsidering a previously skipped version.
      clearSkippedVersion();
      const result = await checkForUpdates();
      setUpdateResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to check for updates';
      setError(msg);
      console.error('Update check error:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateResult?.available) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);
    
    try {
      const success = await downloadAndInstallUpdate((downloaded, total) => {
        const percent = Math.round((downloaded / total) * 100);
        setDownloadProgress(percent);
      });
      
      if (!success) {
        setError('Update download failed. Please try again.');
        setIsDownloading(false);
      }
      // If successful, the app will relaunch automatically
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download update';
      setError(msg);
      setIsDownloading(false);
      console.error('Update download error:', err);
    }
  };

  if (developerMode) {
    return (
      <div style={{ height: 'calc(100vh - 51px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--spacing-4)', borderBottom: '1px solid var(--app-border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Developer Mode</h2>
            <button
              onClick={() => setDeveloperMode(false)}
              style={{
                padding: 'var(--spacing-2) var(--spacing-4)',
                borderRadius: '6px',
                border: '1px solid var(--app-border-color)',
                backgroundColor: 'var(--button-bg-color)',
                color: 'var(--button-text-color)',
                cursor: 'pointer',
              }}
            >
              Exit Developer Mode
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <LogViewer />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h2 style={styles.title}>Version Information</h2>
        <div style={styles.infoRow}>
          <span style={styles.label}>Current Version:</span>
          <span style={styles.value}>{currentVersion}</span>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.title}>Updates</h2>
        <p style={styles.description}>
          Check for updates to ensure you're running the latest version of ProAssist.
        </p>

        <div style={styles.buttonContainer}>
          <button
            onClick={handleCheckForUpdates}
            disabled={isChecking || isDownloading}
            style={{
              ...styles.button,
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              ...(isChecking || isDownloading ? styles.buttonDisabled : {}),
            }}
          >
            {isChecking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>

        {error && (
          <div style={styles.errorMessage}>
            {error}
          </div>
        )}

        {updateResult && (
          <div style={styles.updateStatus}>
            {updateResult.available ? (
              <div style={styles.updateAvailable}>
                <div style={styles.updateHeader}>
                  <span style={styles.updateIcon}>✨</span>
                  <span style={styles.updateTitle}>Update Available!</span>
                </div>
                <div style={styles.updateInfo}>
                  <div style={styles.infoRow}>
                    <span style={styles.label}>New Version:</span>
                    <span style={styles.newVersion}>{updateResult.update?.version}</span>
                  </div>
                  {updateResult.update?.date && (
                    <div style={styles.infoRow}>
                      <span style={styles.label}>Release Date:</span>
                      <span style={styles.value}>
                        {new Date(updateResult.update.date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {updateResult.update?.body && (
                    <div style={styles.releaseNotes}>
                      <strong style={styles.releaseNotesTitle}>Release Notes:</strong>
                      <pre style={styles.releaseNotesContent}>
                        {updateResult.update.body}
                      </pre>
                    </div>
                  )}
                </div>
                {isDownloading ? (
                  <div style={styles.progressContainer}>
                    <div style={styles.progressBar}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${downloadProgress}%`,
                        }}
                      />
                    </div>
                    <span style={styles.progressText}>
                      Downloading... {downloadProgress}%
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={handleUpdate}
                    style={{
                      ...styles.button,
                      ...styles.updateButton,
                    }}
                  >
                    Download and Install Update
                  </button>
                )}
              </div>
            ) : (
              <div style={styles.noUpdate}>
                <span style={styles.noUpdateIcon}>✓</span>
                <span>You're running the latest version!</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.title}>Developer Tools</h2>
        <p style={styles.description}>
          Enable developer mode to view console logs and debug information.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setDeveloperMode(true)}
            style={{
              ...styles.button,
              backgroundColor: '#4b5563',
              color: '#ffffff',
            }}
          >
            Enable Developer Mode
          </button>
          <button
            onClick={handleOpenInspector}
            style={{
              ...styles.button,
              backgroundColor: '#2563eb',
              color: '#ffffff',
            }}
            title="Shortcut: F12 (Windows/Linux) or Cmd+Opt+I (macOS)"
          >
            Open Inspector
          </button>
          <button
            onClick={() => {
              resetOnboardingState();
              window.location.reload();
            }}
            style={{
              ...styles.button,
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
            }}
          >
            Open Onboarding Screen
          </button>
        </div>
        {devtoolsError && (
          <div style={styles.errorMessage}>
            {devtoolsError}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: 'var(--spacing-4)',
    color: 'var(--text-color)',
  },
  section: {
    marginBottom: 'var(--spacing-6)',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: 'var(--spacing-4)',
    color: 'var(--text-color)',
  },
  description: {
    color: 'var(--text-secondary-color)',
    marginBottom: 'var(--spacing-4)',
    lineHeight: 1.6,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--spacing-3) 0',
    borderBottom: '1px solid var(--app-border-color)',
  },
  label: {
    color: 'var(--text-secondary-color)',
    fontWeight: 500,
  },
  value: {
    color: 'var(--text-color)',
    fontFamily: 'monospace',
  },
  newVersion: {
    color: '#6366f1',
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  buttonContainer: {
    marginBottom: 'var(--spacing-4)',
  },
  button: {
    padding: 'var(--spacing-2) var(--spacing-4)',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  updateButton: {
    backgroundColor: '#6366f1',
    color: '#ffffff',
    width: '100%',
    marginTop: 'var(--spacing-4)',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  errorMessage: {
    padding: 'var(--spacing-3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#ef4444',
    marginTop: 'var(--spacing-3)',
  },
  updateStatus: {
    marginTop: 'var(--spacing-4)',
  },
  updateAvailable: {
    padding: 'var(--spacing-4)',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: '8px',
  },
  updateHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-2)',
    marginBottom: 'var(--spacing-3)',
  },
  updateIcon: {
    fontSize: '20px',
  },
  updateTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#6366f1',
  },
  updateInfo: {
    marginBottom: 'var(--spacing-4)',
  },
  releaseNotes: {
    marginTop: 'var(--spacing-3)',
    padding: 'var(--spacing-3)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
  },
  releaseNotesTitle: {
    display: 'block',
    marginBottom: 'var(--spacing-2)',
    color: 'var(--text-color)',
  },
  releaseNotesContent: {
    margin: 0,
    color: 'var(--text-secondary-color)',
    fontSize: '13px',
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
  },
  noUpdate: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-2)',
    padding: 'var(--spacing-3)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    color: '#22c55e',
  },
  noUpdateIcon: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  progressContainer: {
    marginTop: 'var(--spacing-4)',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: 'var(--spacing-2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.3s ease',
  },
  progressText: {
    display: 'block',
    textAlign: 'center',
    color: 'var(--text-secondary-color)',
    fontSize: '13px',
  },
};

export default VersionSettings;

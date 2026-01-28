import React, { useEffect, useState } from 'react';
import { checkForUpdatesOnStartup, downloadAndInstallUpdate, UpdateInfo, saveSkippedVersion } from '../utils/updater';

interface UpdateNotificationProps {
  checkOnMount?: boolean;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ 
  checkOnMount = true 
}) => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showNotification, setShowNotification] = useState(true);

  useEffect(() => {
    if (checkOnMount) {
      checkForUpdatesOnStartup().then(result => {
        if (result.available && result.update) {
          setUpdateAvailable(true);
          setUpdateInfo(result.update);
        }
      });
    }
  }, [checkOnMount]);

  const handleUpdate = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    
    await downloadAndInstallUpdate((downloaded, total) => {
      const percent = Math.round((downloaded / total) * 100);
      setDownloadProgress(percent);
    });
    
    // If we get here, the update failed (successful update causes relaunch)
    setIsDownloading(false);
  };

  const handleDismiss = () => {
    setShowNotification(false);
  };

  const handleSkipVersion = () => {
    if (updateInfo?.version) {
      saveSkippedVersion(updateInfo.version);
      console.log(`[UpdateNotification] Skipped version ${updateInfo.version}`);
    }
    setShowNotification(false);
  };

  if (!updateAvailable || !showNotification) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.notification}>
        <div style={styles.header}>
          <span style={styles.icon}>🎉</span>
          <h3 style={styles.title}>Update Available!</h3>
        </div>
        
        <p style={styles.version}>
          Version {updateInfo?.version} is ready to install
        </p>
        
        {updateInfo?.body && (
          <p style={styles.body}>{updateInfo.body}</p>
        )}
        
        {isDownloading ? (
          <div style={styles.progressContainer}>
            <div style={styles.progressBar}>
              <div 
                style={{
                  ...styles.progressFill,
                  width: `${downloadProgress}%`
                }}
              />
            </div>
            <span style={styles.progressText}>{downloadProgress}%</span>
          </div>
        ) : (
          <div style={styles.buttons}>
            <button 
              onClick={handleUpdate} 
              style={styles.updateButton}
            >
              Update Now
            </button>
            <button 
              onClick={handleDismiss} 
              style={styles.dismissButton}
            >
              Later
            </button>
            <button 
              onClick={handleSkipVersion} 
              style={styles.skipButton}
            >
              Skip This Version
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  notification: {
    backgroundColor: '#1a1a2e',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    border: '1px solid #2d2d44',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  icon: {
    fontSize: '28px',
  },
  title: {
    margin: 0,
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 600,
  },
  version: {
    color: '#a0a0b0',
    fontSize: '14px',
    margin: '0 0 16px 0',
  },
  body: {
    color: '#c0c0d0',
    fontSize: '14px',
    margin: '0 0 20px 0',
    lineHeight: 1.5,
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  updateButton: {
    flex: 1,
    padding: '12px 24px',
    backgroundColor: '#6366f1',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  dismissButton: {
    flex: 1,
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: '#a0a0b0',
    border: '1px solid #3d3d54',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  skipButton: {
    flex: 1,
    padding: '12px 24px',
    backgroundColor: 'transparent',
    color: '#8b5cf6',
    border: '1px solid #6d28d9',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: '#2d2d44',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366f1',
    transition: 'width 0.3s ease',
  },
  progressText: {
    color: '#a0a0b0',
    fontSize: '14px',
    fontWeight: 500,
    minWidth: '40px',
    textAlign: 'right',
  },
};

export default UpdateNotification;

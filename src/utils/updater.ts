import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export interface UpdateResult {
  available: boolean;
  update?: UpdateInfo;
}

const STORAGE_KEY_SKIPPED_VERSION = 'proassist-skipped-version';

/**
 * Save a version number to skip future update notifications
 */
export function saveSkippedVersion(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SKIPPED_VERSION, version);
    console.log(`[Updater] Saved skipped version: ${version}`);
  } catch (error) {
    console.error('[Updater] Failed to save skipped version:', error);
  }
}

/**
 * Get the currently skipped version number
 */
export function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_SKIPPED_VERSION);
  } catch (error) {
    console.error('[Updater] Failed to load skipped version:', error);
    return null;
  }
}

/**
 * Clear the skipped version (useful if user manually checks for updates)
 */
export function clearSkippedVersion(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SKIPPED_VERSION);
    console.log('[Updater] Cleared skipped version');
  } catch (error) {
    console.error('[Updater] Failed to clear skipped version:', error);
  }
}

/**
 * Check if an update is available
 */
export async function checkForUpdates(): Promise<UpdateResult> {
  try {
    console.log('[Updater] Checking for updates...');
    const update = await check();
    
    if (update) {
      console.log('[Updater] Update available:', {
        version: update.version,
        date: update.date,
        body: update.body,
        currentVersion: update.currentVersion,
      });
      return {
        available: true,
        update: {
          version: update.version,
          date: update.date,
          body: update.body,
        },
      };
    }
    
    console.log('[Updater] No update available - already on latest version');
    return { available: false };
  } catch (error) {
    console.error('[Updater] Failed to check for updates:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('[Updater] Error message:', error.message);
      console.error('[Updater] Error stack:', error.stack);
    }
    return { available: false };
  }
}

/**
 * Download and install an update, then relaunch the app
 */
export async function downloadAndInstallUpdate(
  onProgress?: (progress: number, total: number) => void
): Promise<boolean> {
  try {
    console.log('[Updater] Checking for update before download...');
    const update = await check();
    
    if (!update) {
      console.log('[Updater] No update available for download');
      return false;
    }

    console.log(`[Updater] Downloading update ${update.version}...`);
    
    let downloaded = 0;
    let contentLength = 0;
    
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          console.log(`[Updater] Download started, size: ${contentLength} bytes`);
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          if (onProgress && contentLength > 0) {
            onProgress(downloaded, contentLength);
          }
          const percent = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
          console.log(`[Updater] Download progress: ${downloaded}/${contentLength} bytes (${percent}%)`);
          break;
        case 'Finished':
          console.log('[Updater] Download finished');
          break;
      }
    });

    console.log('[Updater] Update installed successfully, relaunching app...');
    await relaunch();
    return true;
  } catch (error) {
    console.error('[Updater] Failed to download and install update:', error);
    if (error instanceof Error) {
      console.error('[Updater] Error message:', error.message);
      console.error('[Updater] Error stack:', error.stack);
    }
    return false;
  }
}

/**
 * Check for updates on app startup (silent check)
 * This will skip showing the notification if the version was previously skipped
 */
export async function checkForUpdatesOnStartup(): Promise<UpdateResult> {
  // Add a small delay to avoid blocking app startup
  console.log('[Updater] Scheduling startup update check in 2 seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('[Updater] Performing startup update check...');
  
  const result = await checkForUpdates();
  
  // If an update is available, check if it was skipped
  if (result.available && result.update) {
    const skippedVersion = getSkippedVersion();
    if (skippedVersion === result.update.version) {
      console.log(`[Updater] Update ${result.update.version} was skipped, not showing notification`);
      return { available: false };
    }
  }
  
  return result;
}

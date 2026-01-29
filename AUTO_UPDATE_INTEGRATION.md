# Auto-Update Integration Guide for SmartVerses

This document explains how to set up and use the auto-update feature for SmartVerses. The app uses Tauri's built-in updater plugin with GitHub Releases as the update server.

## Overview

The auto-update system works as follows:

1. **GitHub Actions** builds the app for all platforms (Windows, macOS, Linux) in the cloud
2. **Signed updates** are published to GitHub Releases with a `latest.json` file
3. **Users' apps** check for updates on startup and can download/install them automatically

## Prerequisites

Before you can release updates, you need to:

### 1. Generate Signing Keys

Tauri requires signed updates for security. Generate your signing keys by running:

```bash
# From the project root
npm run tauri signer generate -- -w ~/.tauri/smartverses.key
```

This creates two files in `~/.tauri/`:

- `smartverses.key` - **Private key** (KEEP THIS SECRET! Never commit to git!)
- `smartverses.key.pub` - **Public key** (This goes in tauri.conf.json)

When prompted, enter a password for the private key (or press Enter for no password).

### 2. Update Configuration

After generating keys, update `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "PASTE_YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/YOUR_USERNAME/SmartVerses/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Replace:

- `PASTE_YOUR_PUBLIC_KEY_HERE` with the content of `~/.tauri/smartverses.key.pub`
- `YOUR_USERNAME` with your GitHub username or organization name

### 3. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add:

| Secret Name                          | Value                                  |
| ------------------------------------ | -------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Content of `~/.tauri/smartverses.key`  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set (leave empty if none) |

## How to Release an Update

### Option 1: Using Git Tags (Recommended)

1. **Update the version** in `src-tauri/tauri.conf.json`:

   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **Commit the change**:

   ```bash
   git add -A
   git commit -m "Bump version to 0.2.0"
   ```

3. **Create and push a tag**:

   ```bash
   git tag v0.2.0
   git push origin main
   git push origin v0.2.0
   ```

4. **GitHub Actions will automatically**:
   - Build the app for Windows, macOS (Intel + Apple Silicon), and Linux
   - Sign all update bundles
   - Create a draft GitHub Release
   - Upload all installers and the `latest.json` file
   - Publish the release

### Option 2: Manual Workflow Dispatch

1. Go to your GitHub repository → Actions → Release workflow
2. Click "Run workflow"
3. Select the branch and click "Run workflow"

## What Gets Built

The GitHub Actions workflow builds:

| Platform | Architecture             | Output                       |
| -------- | ------------------------ | ---------------------------- |
| Windows  | x64                      | `.msi` and `.exe` installers |
| macOS    | Apple Silicon (M1/M2/M3) | `.dmg` and `.app.tar.gz`     |
| macOS    | Intel (x86_64)           | `.dmg` and `.app.tar.gz`     |
| Linux    | x64                      | `.AppImage` and `.deb`       |

## Using the Update Component

The app includes an `UpdateNotification` component that checks for updates on startup. To use it in your app:

### Basic Usage

Add the component to your main App component:

```tsx
import UpdateNotification from "./components/UpdateNotification";

function App() {
  return (
    <div>
      <UpdateNotification />
      {/* Your other components */}
    </div>
  );
}
```

### Manual Update Check

You can also trigger update checks manually:

```tsx
import { checkForUpdates, downloadAndInstallUpdate } from "./utils/updater";

// Check for updates
const result = await checkForUpdates();
if (result.available) {
  console.log(`Update available: ${result.update?.version}`);

  // Download and install
  await downloadAndInstallUpdate((downloaded, total) => {
    console.log(`Progress: ${Math.round((downloaded / total) * 100)}%`);
  });
}
```

## Important Notes

### Version Numbering

- Use semantic versioning (e.g., `0.1.0`, `1.0.0`, `1.2.3`)
- Tags must start with `v` (e.g., `v0.1.0`, `v1.0.0`)
- The version in `tauri.conf.json` should match the tag (without the `v`)

### Security

- **Never commit your private key** to the repository
- The private key should only exist in GitHub Secrets and on your secure local machine
- If your private key is compromised, users who installed with that key cannot receive updates signed with a new key

### Debugging Updates

To test the update flow locally:

1. Build a version with a lower version number
2. Install it
3. Push a higher version to GitHub Releases
4. Launch the installed app and check if it detects the update

### Update Flow

1. App starts → checks GitHub Releases for `latest.json`
2. If a newer version exists → shows update notification
3. User clicks "Update Now" → downloads the update bundle
4. Verifies signature using the public key
5. Installs the update and relaunches the app

## Troubleshooting

### Update Not Detected

- Ensure the version in `tauri.conf.json` is lower than the released version
- Check that the `latest.json` URL is accessible
- Verify the public key in config matches the private key used to sign

### Build Failures in GitHub Actions

- Check that all secrets are properly configured
- Ensure the repository has Actions enabled
- Review the workflow logs for specific errors

### Signature Verification Failed

- The public key in `tauri.conf.json` must match the private key in secrets
- Make sure the private key wasn't regenerated without updating the public key

### "Missing comment in secret key" Error

This error indicates the private key format is incorrect:

1. **Verify Key Format**: The private key must include the full content with the comment header:

   ```
   untrusted comment: <description>
   <base64 encoded key>
   ```

2. **Check Password Secret**:

   - If key has **no password**: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` should be empty or not set
   - If key **has a password**: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` must match exactly

3. **Solution**: Regenerate keys and ensure you copy the **entire** key file content to GitHub Secrets (including the comment line)

## File Structure

```
SmartVerses/
├── .github/
│   └── workflows/
│       └── release.yml          # GitHub Actions workflow
├── src/
│   ├── components/
│   │   └── UpdateNotification.tsx  # Update UI component
│   └── utils/
│       └── updater.ts           # Update utility functions
├── src-tauri/
│   ├── tauri.conf.json          # Tauri config with updater settings
│   ├── capabilities/
│   │   └── default.json         # Permissions including updater
│   ├── Cargo.toml               # Rust dependencies
│   └── src/
│       ├── lib.rs               # Updater plugin initialization
│       └── main.rs              # Updater plugin initialization
└── AUTO_UPDATE_INTEGRATION.md   # This file
```

## Quick Start Checklist

- [ ] Generate signing keys: `npm run tauri signer generate -- -w ~/.tauri/smartverses.key`
- [ ] Copy public key to `tauri.conf.json` plugins.updater.pubkey
- [ ] Update GitHub username in `tauri.conf.json` endpoints URL
- [ ] Add `TAURI_SIGNING_PRIVATE_KEY` to GitHub Secrets
- [ ] Add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to GitHub Secrets
- [ ] Install dependencies: `npm install`
- [ ] Add `<UpdateNotification />` to your App component
- [ ] Create first release: `git tag v0.1.0 && git push origin v0.1.0`

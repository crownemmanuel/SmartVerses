# Release Instructions

**⚠️ MUST READ BEFORE CREATING A RELEASE**

This document provides step-by-step instructions for creating a new release of SmartVerses. Follow these steps carefully to ensure proper builds, signing, and auto-update functionality.

## Pre-Release Checklist

Before creating a release, ensure:

- [ ] All changes are committed and pushed to `main` branch
- [ ] Version number updated in `src-tauri/tauri.conf.json`, `package.json`, and `src/components/VersionSettings.tsx`
- [ ] **Local build passes**: Run `npm run build` and verify no errors
- [ ] **CHANGELOG.md updated**: Always include changelog entry describing what changed in this release
- [ ] All tests pass (if applicable)
- [ ] GitHub Secrets are configured:
  - [ ] `TAURI_SIGNING_PRIVATE_KEY` is set
  - [ ] `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is set (or empty if no password)

## Step-by-Step Release Process

### 1. Update Version Number

Update the version in `src-tauri/tauri.conf.json`:

```json
{
  "version": "0.2.0" // Increment from previous version
}
```

**Version Format**: Use [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.2.0): New features, backward compatible
- **PATCH** (0.1.1): Bug fixes

### 2. Commit Version Change

```bash
git add src-tauri/tauri.conf.json package.json src/components/VersionSettings.tsx
git commit -m "Bump version to 0.2.0"
git push origin main
```

### 2.5. ⚠️ CRITICAL: Update CHANGELOG.md

**ALWAYS update the CHANGELOG.md file before creating a release.** This documents what changed for users and helps track version history.

1. Open `CHANGELOG.md` (create it if it doesn't exist)
2. Add a new section at the top for the new version:

```markdown
## [0.2.0] - YYYY-MM-DD

### Added

- New feature description

### Changed

- Improvement description

### Fixed

- Bug fix description
```

3. Commit the changelog update:

```bash
git add CHANGELOG.md
git commit -m "Update CHANGELOG for v0.2.0"
git push origin main
```

### 2.6. ⚠️ CRITICAL: Run Local Build Before Tagging

**ALWAYS run a local build before creating and pushing a tag.** This catches TypeScript errors and build issues before they break the CI/CD pipeline.

```bash
# Run the build locally
npm run build
```

**If the build fails:**

1. Fix all TypeScript/build errors
2. Commit the fixes: `git add -A && git commit -m "Fix build errors"`
3. Push the fixes: `git push origin main`
4. Run `npm run build` again to verify it passes
5. Only then proceed to create the tag

**If you already pushed a tag with build errors:**

1. Delete the tag locally: `git tag -d v0.2.0`
2. Delete the tag remotely: `git push origin --delete v0.2.0`
3. Fix the build errors and commit
4. Recreate the tag: `git tag -a v0.2.0 -m "Release message"`
5. Push the tag again: `git push origin v0.2.0`

**Why this matters:**

- GitHub Actions will fail if the build has errors
- Fixing errors locally is faster than waiting for CI to fail
- Prevents broken releases and wasted CI resources

### 3. Create and Push Git Tag

Create a tag matching your version (must start with `v`):

```bash
# Create the tag
git tag v0.2.0

# Push the tag to trigger GitHub Actions
git push origin v0.2.0
```

**Important**: The tag name must match the version in `tauri.conf.json` with a `v` prefix.

### 4. Monitor GitHub Actions

1. Go to your repository → **Actions** tab
2. Watch the **Release** workflow run
3. The workflow will:
   - Create a draft GitHub Release
   - Build for all platforms (Windows, macOS Intel, macOS Apple Silicon, Linux)
   - Sign all update bundles
   - Upload installers and `latest.json` to the release
   - Publish the release automatically

### 5. Verify Release

After the workflow completes:

1. Go to **Releases** page
2. Verify the release is published (not draft)
3. Check that all platform installers are present:
   - Windows: `.msi` and `.exe`
   - macOS: `.dmg` (both architectures)
   - Linux: `.AppImage` and `.deb`
4. Verify `latest.json` is present in the release assets

### 6. Test Auto-Update (Recommended)

1. Install an older version of the app
2. Launch the app
3. Verify it detects the new update
4. Test the update installation process

## Alternative: Manual Workflow Dispatch

If you need to trigger a build without creating a tag:

1. Go to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Select branch (usually `main`)
4. Click **Run workflow**

**Note**: This still requires a version tag to be created for the release to be properly versioned.

## Troubleshooting

### Build Fails

- **Check GitHub Secrets**: Ensure `TAURI_SIGNING_PRIVATE_KEY` is correctly set
- **Check Logs**: Review the failed job's logs in Actions
- **Verify Dependencies**: Ensure all dependencies are up to date

### Update Not Detected

- **Version Check**: Ensure new version is higher than installed version
- **Public Key**: Verify `tauri.conf.json` has the correct public key
- **Release Assets**: Check that `latest.json` exists in release assets
- **URL**: Verify the endpoint URL in `tauri.conf.json` matches your repository

### Signature Verification Failed

- **Key Mismatch**: Public key in config must match private key in secrets
- **Key Format**: Ensure keys are copied completely (no truncation)
- **Password**: If you set a password, ensure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is set

### "Missing comment in secret key" Error

This error occurs when the private key format is incorrect or the password is mismatched:

1. **Check Private Key Format**:

   - The private key should start with a comment line like `untrusted comment: <description>`
   - Ensure you copied the **entire** key file content, including all headers
   - Verify the key wasn't truncated when copying to GitHub Secrets

2. **Verify Password Secret**:

   - If your key was generated **without a password** (pressed Enter), ensure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is either:
     - Not set at all, OR
     - Set to an empty string
   - If your key **has a password**, ensure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` matches exactly

3. **Regenerate Keys if Needed**:

   ```bash
   # Generate new keys
   npm run tauri signer generate -- -w ~/.tauri/smartverses.key
   # When prompted, either set a password or press Enter for no password

   # Copy the FULL content of ~/.tauri/smartverses.key to TAURI_SIGNING_PRIVATE_KEY
   # Copy the FULL content of ~/.tauri/smartverses.key.pub to tauri.conf.json
   ```

4. **Verify Key Content**:
   - The private key should look like:
     ```
     untrusted comment: <your comment>
     <base64 encoded key content>
     ```
   - Make sure no lines are missing when copying to GitHub Secrets

### Missing Platform Builds

- **Check Matrix**: Verify all platforms in workflow matrix are building
- **Review Logs**: Check individual platform build logs
- **Dependencies**: Some platforms may need additional system dependencies

## Release Notes Template

When creating a release, consider including:

```markdown
## What's New in v0.2.0

### ✨ New Features

- Feature 1 description
- Feature 2 description

### 🐛 Bug Fixes

- Fixed issue with...
- Resolved problem with...

### 🔧 Improvements

- Enhanced performance of...
- Improved UI for...

### 📝 Documentation

- Updated setup instructions
- Added new examples

---

**Download**: [Get the latest version](https://github.com/crownemmanuel/SmartVerses/releases/latest)
```

## Version History

Keep track of releases:

- `v0.1.0` - Initial release with auto-update support
- `v0.2.0` - [Your release notes here]

## Important Notes

- **Never delete releases**: Deleting a release breaks auto-update for users who installed that version
- **Keep private key secure**: If compromised, you'll need to generate new keys and users will need to reinstall
- **Test before release**: Always test the build process on a test tag first if possible
- **Semantic versioning**: Follow semver to help users understand the impact of updates

## Quick Reference

```bash
# Full release workflow
# 1. Update version numbers
git add src-tauri/tauri.conf.json package.json src/components/VersionSettings.tsx
git commit -m "Bump version to X.Y.Z"
git push origin main

# 2. Update CHANGELOG.md (REQUIRED)
# Edit CHANGELOG.md with release notes, then:
git add CHANGELOG.md
git commit -m "Update CHANGELOG for vX.Y.Z"
git push origin main

# 3. ⚠️ CRITICAL: Always run build before tagging
npm run build

# 4. If build passes, create and push tag
git tag -a vX.Y.Z -m "Release version X.Y.Z - Description"
git push origin vX.Y.Z

# 5. Monitor Actions → Release workflow
```

---

**For LLMs/Developers**: Always check this file before creating releases. The process is automated via GitHub Actions, but version numbers and tags must be set correctly.

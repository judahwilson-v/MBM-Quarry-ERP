# MBM ERP Release Workflow

This document outlines the strict end-to-end process for publishing a new version of the MBM Quarry ERP application and verifying that the auto-update pipeline successfully deploys the update to all installed clients.

---

## The Release Workflow

Whenever you are ready to ship new features or bug fixes to the quarry staff, you must follow these exact steps:

### 1. Update Changelog & Progress (CRITICAL)
Before cutting a release, you MUST:
1. Update `docs/CHANGELOG.md` with the new version number and a summary of all changes.
2. Update `AI_PROGRESS.md` with the status of the release.
3. Update any other relevant `.md` documentation files related to the features you just built.

> **Failure to do this means users won't know what changed, and future AI agents will lack context.**

### Critical Rule for Auto-Updates (Blockmaps)
Do **NOT** add the `portable` target to the Windows build configuration in `package.json`. 
Building both an NSIS installer and a Portable app simultaneously causes `electron-builder` to silently fail to upload the `.exe.blockmap` file to GitHub Releases. 
Without the `.blockmap` file on GitHub, clients cannot calculate "Delta Patches" and are forced to download the entire 150MB `.exe` for every minor update. Ensure `target` is set **only** to `nsis`.
### 2. Run the Release Script
Ensure your terminal is authenticated with GitHub (if required, though the script uses your local Git credentials).
Run one of the following commands depending on the size of the update:
```bash
npm run release:patch  # For bug fixes (e.g. 1.9.0 -> 1.9.1)
npm run release:minor  # For new features (e.g. 1.9.0 -> 1.10.0)
npm run release:major  # For massive overhauls (e.g. 1.9.0 -> 2.0.0)
```
This script will automatically:
- Bump the version in `package.json`
- Stamp the `VERSION` file with the build date
- Create a Git commit and tag
- Push everything to GitHub

### 3. GitHub Actions Takes Over
Once the tag is pushed to GitHub, the **Release Windows App** GitHub Action automatically starts. It will:
- Build the Next.js app
- Package the Electron binaries (`.exe`)
- Publish the release to the GitHub Releases page automatically.

You do NOT need to run `npm run electron:publish` manually anymore.

### 4. Verify the GitHub Release
1. Open your web browser and navigate to [mbm-quarry/MBM-Quarry-ERP Releases](https://github.com/mbm-quarry/MBM-Quarry-ERP/releases) (or the relevant repo URL).
2. Ensure the new release is published and the `.exe` installer is attached in the Assets section.

### 5. Test Auto-Update from an Older Installed Version
To confirm the entire pipeline works end-to-end:
1. Ensure you have the **older** version (e.g., `1.8.0`) currently installed on a Windows test machine.
2. Launch the older application from the desktop shortcut.
3. Wait quietly for 1-2 minutes. The application should display an OS notification stating: *"MBM Quarry ERP Update Available: Downloading in the background..."*
4. Once the silent background download completes, a prompt will appear asking you to **Restart & Update**.
5. Click **Restart & Update**. The application should close, apply the update, and reopen showing the new features (version `1.9.0`), with all local SQLite data perfectly intact.

---

## Verification Requirement
Do not consider the Auto-Update feature complete until you have successfully executed all 5 steps above and observed a legacy client automatically updating itself.

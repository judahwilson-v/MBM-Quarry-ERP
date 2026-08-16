# MBM ERP Auto-Update Guide

This guide explains how to release new updates to the Windows clients automatically. The MBM Quarry ERP is configured with a fully automated, background-updating pipeline using `electron-updater` and GitHub Releases.

## How It Works for Quarry Staff (The End User)
1. Staff opens the MBM Quarry app from their Windows desktop shortcut.
2. In the background, the app silently checks your GitHub Releases page for a newer version.
3. If an update is available, a native Windows Notification ("MBM Quarry ERP Update Available") pops up, and the new `.exe` is downloaded entirely in the background so it doesn't interrupt their work.
4. Once fully downloaded, another notification appears ("Update Ready to Install"), along with a dialog box asking if they want to "Restart & Update" or wait until "Later".
5. Clicking "Restart & Update" closes the app, securely installs the new version, and restarts exactly where they left off. Their local database (`quarry.db`) and all settings are perfectly preserved.

---

## How to Release a New Version (For the Developer)

When you have finished testing new code on your Mac and are ready to deploy it to the quarry:

### Step 1: Increment the Version Number
Before building, you **must** increment the version number in your `package.json`. If you do not change the version number, the Windows clients will not detect an update.

Open `package.json` and change the version:
```json
// Example:
"version": "1.0.0", // Change this to "1.0.1" or "1.1.0"
```

### Step 2: Ensure You Are Authenticated
Because this publishes directly to GitHub, your terminal needs a valid GitHub Token exposed in your environment.
In your terminal, set the token:
```bash
export GH_TOKEN="your_personal_access_token_here"
```
*(Note: You only need `repo` scopes for the token).*

### Step 3: Run the Publish Command
Run the single command that handles building, packaging, and publishing:
```bash
npm run electron:publish
```
This command will:
1. Build the Next.js frontend.
2. Package the Electron app into a `.dmg` and `.exe`.
3. Create a Draft Release on your GitHub repository.
4. Upload the installers directly to that release.

### Step 4: Verify the 5 Compulsory Assets on GitHub
Every release **must** contain exactly 5 assets on GitHub:
1. **`latest.yml`** (Update manifest)
2. **`MBM-Quarry-V2-Setup-X.Y.Z.exe`** (Installer)
3. **`MBM-Quarry-V2-Setup-X.Y.Z.exe.blockmap`** (Differential chunk map for delta updates)
4. **`Source code (zip)`**
5. **`Source code (tar.gz)`**

> [!IMPORTANT]
> The `.blockmap` file is mandatory for delta updates. It allows clients with slow/limited quarry internet to download only changed binary chunks instead of the entire 180MB package.

**The moment the release is published with all 5 assets, all Windows clients at the quarry will detect it on their next launch and begin the auto-update process.**

---

## Troubleshooting

### Q: I receive a "Cannot find latest.yml... HttpError: 404" error.
- **Missing Assets / Empty Release**: This error means the client found the new version tag, but the update manifest (`latest.yml`) is missing from the GitHub release. This usually happens if `gh release create` and `electron-builder` clash, resulting in an empty release. **Always verify all 5 compulsory assets are present in the release on GitHub**.

### Q: I published a release, but the client isn't updating.
- **Check the Version**: Did you actually increment the `"version"` in `package.json` before running the publish command?
- **Check the GitHub Release**: Is the release marked as a "Draft" or "Pre-release"? `electron-updater` only pulls from stable published releases.
- **Check the Network**: Ensure the Windows machine has an active internet connection to reach GitHub.

### Q: `npm run electron:publish` fails with a GitHub error.
- **Check your Token**: Ensure your `GH_TOKEN` environment variable is set in the terminal where you are running the command. If using VS Code, you may need to restart the terminal after exporting the token in your `.zshrc`.

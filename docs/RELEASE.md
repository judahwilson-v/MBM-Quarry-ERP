# MBM ERP Release Workflow

This document outlines the strict end-to-end process for publishing a new version of the MBM Quarry ERP application and verifying that the auto-update pipeline successfully deploys the update to all installed clients.

---

## The Release Workflow

Whenever you are ready to ship new features or bug fixes to the quarry staff, you must follow these exact steps:

### 1. Update Version
Open `package.json` and increment the `"version"` field. 
*Example: Change `"0.1.0"` to `"0.1.1"`.*
> **Critical**: If you do not change the version, the auto-updater will ignore the release because it thinks the client is already up to date.

### 2. Commit and Push
Ensure all your local changes are committed and pushed to the `main` branch of your GitHub repository.
```bash
git add .
git commit -m "Bump version for release"
git push origin main
```

### 3. Run `npm run electron:publish`
Ensure your terminal is authenticated with GitHub by setting your Personal Access Token.
```bash
export GH_TOKEN="your_personal_access_token_here"
npm run electron:publish
```
This command will compile the Next.js app, package the Electron binaries (Mac `.dmg` and Windows `.exe`), and automatically upload them to your GitHub Releases page.

### 4. Verify the GitHub Release
1. Open your web browser and navigate to [mbm-quarry/MBM-Quarry-ERP Releases](https://github.com/mbm-quarry/MBM-Quarry-ERP/releases).
2. Locate the newly created release. It may be marked as a **Draft**.
3. Edit the release, ensure the `.exe` and `.dmg` installer files are attached in the Assets section, and click **Publish Release**.
> **Note**: `electron-updater` will only pull updates from releases that are fully "Published" (not Drafts or Pre-releases).

### 5. Test Auto-Update from an Older Installed Version
To confirm the entire pipeline works end-to-end:
1. Ensure you have the **older** version (e.g., `0.1.0`) currently installed on a Windows test machine.
2. Launch the older application from the desktop shortcut.
3. Wait quietly for 1-2 minutes. The application should display an OS notification stating: *"MBM Quarry ERP Update Available: Downloading in the background..."*
4. Once the silent background download completes, a prompt will appear asking you to **Restart & Update**.
5. Click **Restart & Update**. The application should close, apply the update, and reopen showing the new features (version `0.1.1`), with all local SQLite data perfectly intact.

---

## Verification Requirement
Do not consider the Auto-Update feature complete until you have successfully executed all 5 steps above and observed a legacy client automatically updating itself.

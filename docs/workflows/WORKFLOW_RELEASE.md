---
type: workflow
id: SET-3
name: Release & App Update
last_updated: "2026-08-16"
triggers:
  - release
  - app update
  - version bump
  - deploy
  - package
  - electron build
---

# WORKFLOW: Release & App Update (SET 3)

> **When to use**: Preparing and shipping a new version of the desktop app.

---

## Step 1 — Pre-Release Verification

Run these commands in order. ALL must pass:

```bash
npx tsc --noEmit          # Zero type errors
npm run lint              # Zero lint errors
npm test                  # All tests pass
npm run build             # Production build succeeds
```

If any fail → switch to **WORKFLOW_DEBUG.md** first.

---

## Step 2 — Version Bump

1. Update `package.json` → `"version": "X.Y.Z"`
2. The `prebuild` script auto-stamps the `VERSION` file
3. Verify `VERSION` file content after build

---

## Step 3 — Update Documentation

These files **MUST** be updated for every release:

| File | What to update |
|:---|:---|
| `docs/CHANGELOG.md` | Add new version entry at top with all changes |
| `docs/handoff/AI_HANDOFF.md` | Update version, status, last completed phase |
| `docs/reference/RELEASE_NOTES.md` | User-facing release notes |

These files **MAY** need updating:
- `docs/reference/KNOWN_BUGS.md` — mark resolved bugs
- `docs/reference/DEPLOYMENT.md` — if deployment process changed
- `docs/reference/AUTO_UPDATE.md` — if auto-update behaviour changed

---

## Step 4 — Package & Build

```bash
npm run electron:package         # Build Windows installer
# or
npm run electron:build-win       # Build + package for Windows
npm run electron:build-mac       # Build + package for macOS
```

Output goes to `release-v2/` directory.

---

## Step 5 — Post-Release & Asset Verification

- [ ] Verify the installer runs and boots correctly
- [ ] Verify the `VERSION` displayed in Settings > About matches
- [ ] Tag the git commit: `git tag vX.Y.Z`
- [ ] Push: `git push origin main --tags`
- [ ] If publishing: `npm run electron:publish`

### ⚠️ Compulsory Release Assets (Must Be Exactly 5)
Every published GitHub release MUST contain all 5 assets:
1. **`latest.yml`** — Update manifest checked by `electron-updater` (contains version, sha512, file path).
2. **`MBM-Quarry-V2-Setup-X.Y.Z.exe`** — Full NSIS installer for clean installs.
3. **`MBM-Quarry-V2-Setup-X.Y.Z.exe.blockmap`** — **COMPULSORY**: Differential binary chunk map for fast delta downloads. Enables existing clients to download only changed chunks (~2MB to 15MB) instead of the entire 180MB installer.
4. **`Source code (zip)`** — GitHub repository snapshot.
5. **`Source code (tar.gz)`** — GitHub repository snapshot.

Verify with:
```bash
gh release view vX.Y.Z --json assets --jq ".assets[].name"
```

---

## Reference

- **Deployment guide**: `docs/reference/DEPLOYMENT.md`
- **Auto-update setup**: `docs/reference/AUTO_UPDATE.md`
- **Release notes format**: `docs/reference/RELEASE_NOTES.md`
- **Release process details**: `docs/reference/RELEASE.md`


# Forensic Investigation Report: MBM Quarry V2 Startup Crash

**To**: Mac Engineering Team  
**From**: Windows Antigravity Agent  
**Subject**: Forensic Trace of V2 Startup Crash & Zombie Process 

I have systematically executed the requested forensic steps using `ELECTRON_ENABLE_LOGGING=1` and `ELECTRON_RUN_AS_NODE=1`. The root cause of the "briefly in taskbar but never opens" behavior is a chain reaction of three distinct bugs introduced in the latest refactor, culminating in an Unhandled Promise Rejection.

Here are the step-by-step findings and raw logs.

---

### 1. Verify `main.js` Execution & Catch Early Exits
**Result**: `main.js` executes perfectly through its top-level imports and successfully reaches `app.whenReady()`. 
**Evidence**: The first line of standard output captured is:
```text
21:39:13.131 > Health check passed: Write permissions OK.
```
This proves the newly added `ipcMain.handle('check-updates')` at the top of the file did **not** throw an exception and is valid.

---

### 2. Isolate `spawnSync` Migration Crash
**Result**: The `spawnSync` command executes synchronously without hanging the thread or crashing Electron. However, **the migration script fails instantly due to a pathing bug**.
**Evidence**: The exact logged output from the migrator is:
```text
21:39:13.157 > Running auto-migrator...
21:39:13.249 > Migrator Output: 
Migrator Error: [Migrate] Prisma Client not found at E:\mbm1\New folder\MBM Quarry V2\resources\node_modules\@prisma\client
```
**The Bug**: In `migrate.js` (Lines 5-6), you are traversing up a directory:
```javascript
  const standaloneDir = path.join(__dirname, '..'); // Resolves to /resources/
  const prismaPath = path.join(standaloneDir, 'node_modules', '@prisma', 'client');
```
This incorrectly resolves to `resources/node_modules/` instead of `resources/standalone/node_modules/`. The migration gracefully catches this and exits without doing any work.

---

### 3. Validate `after-pack.js` Integrity Changes
**Result**: The regex substitution successfully stripped the Mac absolute path. It did **not** corrupt the JavaScript syntax.
**Evidence**: Executing `server.js` directly via `ELECTRON_RUN_AS_NODE=1` boots the Next.js server normally without any `SyntaxError`:
```text
  ▲ Next.js 14.2.35
  - Local:        http://localhost:3000
 ✓ Starting...
 ✓ Ready in 64ms
```

---

### 4 & 5. Capture Uncaught Exceptions (The True Root Cause)
**Result**: Because `migrate.js` failed to run, the V1 database is never updated to include the `time` column. When Next.js starts, the root page triggers a database query, resulting in a Prisma crash (`The column 'main.party_ledger.time' does not exist`) and Next.js returns a `500` error.

The Electron main thread's `waitForServer()` function hits Next.js, sees the `500` error, and goes into a 30-second retry loop. After 30 seconds, it throws a Timeout Error, which triggers a catastrophic bug in your `catch` block.

**The Fatal Bug**: 
In `main.js` around line 251, inside the `catch` block that handles the Next.js boot failure, you attempt to reference a variable called `nextjsLog` which no longer exists in scope:
```javascript
      console.error("Fatal error booting Next.js:", err);
      // FATAL: nextjsLog is undefined!
      const logSnippet = nextjsLog ? nextjsLog.slice(-1500) : "No Next.js logs captured.";
```

Because this throws a `ReferenceError` inside an async function without an outer try-catch, it causes an **Unhandled Promise Rejection**, immediately terminating the function execution. 
- The error dialog `dialog.showMessageBoxSync` is skipped.
- `app.quit()` is skipped.
- `mainWindow.show()` is skipped.

**Evidence** (Raw Error Trace):
```text
21:39:43.637 > Fatal error booting Next.js: Error: Timeout waiting for Next.js server to boot.
    at Timeout.checkServer [as _onTimeout] (...\desktop\main.js:75:16)
21:39:43.638 > (node:5752) UnhandledPromiseRejectionWarning: ReferenceError: nextjsLog is not defined
    at createWindow (...\desktop\main.js:251:26)
21:39:43.638 > (node:5752) UnhandledPromiseRejectionWarning: Unhandled promise rejection. 
```

### Actionable Fixes for Mac Team:
1. Fix `migrate.js` to point to the correct standalone directory: `const standaloneDir = __dirname;`
2. Define `let nextjsLog = ""` globally in `main.js` (or remove the reference in the catch block) so the error dialog can actually appear when a crash happens.

const { app, BrowserWindow, dialog, Notification, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const { autoUpdater } = require("electron-updater");

// Load production env file when packaged
function loadProductionEnv() {
  if (!app.isPackaged) return {};
  const envPath = path.join(process.resourcesPath, "env", "production.env");
  const envVars = {};
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load production env:", e);
  }
  return envVars;
}

let mainWindow;
let nextProcess = null;
let serverPort = null;
let isManualUpdateCheck = false;

// Function to find a free port
function getFreePort(startingPort) {
  return new Promise((resolve, reject) => {
    let port = startingPort;
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => {
        resolve(port);
      });
      server.close();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, try the next one
        resolve(getFreePort(port + 1));
      } else {
        reject(err);
      }
    });
  });
}

// Setup IPC Handlers
ipcMain.handle('check-updates', async () => {
  isManualUpdateCheck = true;
  try {
    return await autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    console.error("Update check failed:", error);
    dialog.showMessageBox({
      type: 'warning',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Please ensure you have an active internet connection.'
    });
    isManualUpdateCheck = false;
    return null;
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

// AutoUpdater Event Forwarding
autoUpdater.on('checking-for-update', () => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'checking' });
});
autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'available', info });
});
autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'not-available', info });
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'error', error: err.message });
});
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'progress', progress: progressObj });
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater-event', { type: 'downloaded', info });
});

// Function to poll the port until Next.js is ready
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkServer = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error("Timeout waiting for Next.js server to boot."));
        return;
      }
      
      const req = http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve();
        } else {
          setTimeout(checkServer, 500);
        }
      });
      
      req.on('error', () => {
        setTimeout(checkServer, 500);
      });
      
      req.end();
    };
    
    checkServer();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until server is ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    },
  });

  ipcMain.handle('print-silent', async (event, printerName, htmlContent) => {
    try {
      return new Promise((resolve) => {
        let printTarget = mainWindow;
        let hiddenWindow = null;
        
        const doPrint = (targetWindow) => {
          targetWindow.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: printerName || ''
          }, (success, failureReason) => {
            if (!success) console.error("Silent print failed:", failureReason);
            resolve({ success, error: failureReason });
            if (hiddenWindow) hiddenWindow.close();
          });
        };

        if (htmlContent) {
          hiddenWindow = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
          hiddenWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
          hiddenWindow.webContents.on('did-finish-load', () => {
            setTimeout(() => doPrint(hiddenWindow), 500); // Give it a moment to render fonts
          });
        } else {
          doPrint(printTarget);
        }
      });
    } catch (err) {
      console.error('Silent print exception:', err);
      return { success: false, error: err.message };
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (app.isPackaged) {
    console.log("Running in packaged mode (v2)");
    
    // 1. Setup Database Path
    const userDataPath = app.getPath("userData");
    const dbName = "quarry.db";
    const dbPath = path.join(userDataPath, dbName);
    const packagedDbPath = path.join(process.resourcesPath, "standalone", "prisma", "local.db");

    // Copy initial DB if it doesn't exist
    if (!fs.existsSync(dbPath)) {
      console.log("Initializing database at", dbPath);
      try {
        fs.copyFileSync(packagedDbPath, dbPath);
      } catch (e) {
        console.error("Failed to copy pristine DB", e);
        dialog.showErrorBox("Database Error", "Failed to initialize local database.");
      }
    }

    const dbUrlFormatted = dbPath.replace(/\\/g, '/');
    const databaseUrl = `file:${dbUrlFormatted}`;
    console.log("Using Database URL:", databaseUrl);
    
    let nextjsLog = "";

    // 2. Start Next.js Server dynamically
    try {
      serverPort = await getFreePort(4000);
      console.log(`Found free port for Next.js: ${serverPort}`);
      
      const serverPath = path.join(process.resourcesPath, "standalone", "server.js");

      // Read VERSION file
      let appVersion = app.getVersion();
      let buildDate = "Unknown";
      try {
        const versionFile = path.join(process.resourcesPath, "app.asar", "VERSION");
        if (fs.existsSync(versionFile)) {
          const content = fs.readFileSync(versionFile, "utf-8");
          const versionMatch = content.match(/VERSION=(.*)/);
          const dateMatch = content.match(/BUILD_DATE=(.*)/);
          if (versionMatch) appVersion = versionMatch[1].trim();
          if (dateMatch) buildDate = dateMatch[1].trim();
        }
      } catch (e) {
        console.error("Failed to read VERSION", e);
      }

      const productionEnvVars = loadProductionEnv();

      const env = {
        ...process.env,
        ...productionEnvVars,
        PORT: serverPort.toString(),
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        ELECTRON_RUN_AS_NODE: "1",
        NEXT_PUBLIC_APP_VERSION: appVersion,
        NEXT_PUBLIC_BUILD_DATE: buildDate
      };

      // 2.5 Run Auto-Migrator
      const migratePath = path.join(process.resourcesPath, "standalone", "migrate.js");
      if (fs.existsSync(migratePath)) {
        console.log("Running auto-migrator...");
        const migrateResult = require('child_process').spawnSync(process.execPath, [migratePath], { env });
        console.log("Migrator Output:", migrateResult.stdout?.toString());
        if (migrateResult.status !== 0) {
          const errText = migrateResult.stderr?.toString() || migrateResult.stdout?.toString();
          console.error("Migrator Error:", errText);
          throw new Error(`Database auto-migration failed.\nReason: ${errText}`);
        }
      }

      nextProcess = spawn(process.execPath, [serverPath], {
        env,
        cwd: path.join(process.resourcesPath, "standalone"),
      });

      nextProcess.stdout.on("data", (data) => {
        const str = data.toString();
        nextjsLog += str;
        console.log(`Next.js: ${str}`);
      });

      nextProcess.stderr.on("data", (data) => {
        const str = data.toString();
        nextjsLog += str;
        console.error(`Next.js Error: ${str}`);
      });
      
      nextProcess.on("exit", (code) => {
        console.log(`Next.js process exited with code ${code}`);
      });

      // 3. Wait for the server to be ready before loading
      const url = `http://localhost:${serverPort}`;
      console.log(`Waiting for Next.js to be reachable at ${url}...`);
      await waitForServer(url);
      console.log(`Next.js is ready. Loading window.`);
      mainWindow.loadURL(url);
      
      // Startup update check has been moved to app.on("ready") to prevent duplicates
      
    } catch (err) {
      console.error("Fatal error booting Next.js:", err);
      
      const logSnippet = nextjsLog ? nextjsLog.slice(-1500) : "No Next.js logs captured.";
      const response = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Startup Error (Database or Server)',
        message: `MBM Quarry ERP failed to start. This might be due to a corrupted database or a failed update.\n\nError details:\n${err.message}\n\nNext.js Logs:\n${logSnippet}\n\nWould you like to automatically restore your database from the most recent backup, or Factory Reset the local database to the pristine state (you can sync from cloud after)?`,
        buttons: ['Attempt Automatic Recovery', 'Factory Reset (Wipe & Re-seed)', 'Quit'],
        defaultId: 0,
        cancelId: 2
      });

      if (response === 0) {
        // Attempt recovery
        try {
          const documentsPath = app.getPath('documents');
          const backupDir = path.join(documentsPath, 'MBM-Backups');
          const userDataPath = app.getPath("userData");
          const dbPath = path.join(userDataPath, "quarry.db");

          if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir)
              .filter(f => f.startsWith('MBM_Backup_') && f.endsWith('.sqlite'))
              .map(f => ({ name: f, path: path.join(backupDir, f), stat: fs.statSync(path.join(backupDir, f)) }))
              .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

            if (files.length > 0) {
              const latestBackup = files[0];
              console.log(`Restoring database from: ${latestBackup.path}`);
              fs.copyFileSync(latestBackup.path, dbPath);
              dialog.showMessageBoxSync({
                type: 'info',
                title: 'Recovery Successful',
                message: `Successfully restored database from ${latestBackup.name}. The application will now restart.`
              });
              app.relaunch();
              app.exit(0);
              return;
            } else {
              dialog.showErrorBox("Recovery Failed", "No backups found in the MBM-Backups folder.");
            }
          } else {
            dialog.showErrorBox("Recovery Failed", "Backup folder does not exist.");
          }
        } catch (recoveryErr) {
          console.error("Recovery failed:", recoveryErr);
          dialog.showErrorBox("Recovery Failed", `Could not restore database:\n${recoveryErr.message}`);
        }
      } else if (response === 1) {
        // Factory Reset
        try {
          console.log("Factory resetting database...");
          const userDataPath = app.getPath("userData");
          const dbPath = path.join(userDataPath, "quarry.db");
          
          if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
          }
          
          const packagedDbPath = path.join(process.resourcesPath, "standalone", "prisma", "local.db");
          fs.copyFileSync(packagedDbPath, dbPath);
          
          dialog.showMessageBoxSync({
            type: 'info',
            title: 'Factory Reset Successful',
            message: `Successfully reset the local database. The application will now restart. Please use the 'Sync from Cloud' feature to restore your data.`
          });
          app.relaunch();
          app.exit(0);
          return;
        } catch (resetErr) {
          console.error("Factory Reset failed:", resetErr);
          dialog.showErrorBox("Factory Reset Failed", `Could not reset database:\n${resetErr.message}`);
        }
      }
      
      app.quit();
    }
  } else {
    // Development mode
    console.log("Running in development mode (v2)");
    try {
      // In dev mode, we expect `npm run dev` to be running concurrently on port 3005
      const devPort = process.env.ELECTRON_DEV_PORT || "3005";
      const url = `http://localhost:${devPort}`;
      console.log(`Waiting for Dev Server to be reachable at ${url}...`);
      await waitForServer(url);
      console.log(`Dev Server is ready. Loading window.`);
      mainWindow.loadURL(url);
      mainWindow.webContents.openDevTools();
    } catch (err) {
      console.error("Fatal error booting Next.js Dev Server:", err);
      dialog.showErrorBox("Startup Error", `Failed to connect to dev server:\n${err.message}`);
      app.quit();
    }
  }
}

// Guarantee single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("ready", () => {
    // Setup electron-log
    const log = require('electron-log');
    log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');
    Object.assign(console, log.functions);
    
    // Backup Functions
    const performDatabaseBackup = async (prefix = 'manual') => {
      try {
        const documentsPath = app.getPath('documents');
        const backupDir = path.join(documentsPath, 'MBM-Backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        const userDataPath = app.getPath("userData");
        const dbPath = path.join(userDataPath, "quarry.db");
        
        if (!fs.existsSync(dbPath)) return false;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `MBM_Backup_${prefix}_${timestamp}.sqlite`;
        const backupPath = path.join(backupDir, backupFilename);

        fs.copyFileSync(dbPath, backupPath);
        console.log(`Successfully created backup: ${backupPath}`);
        
        // Cleanup old backups (> 30 days logic can be simple: keep last 30 files)
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('MBM_Backup_') && f.endsWith('.sqlite'))
          .map(f => ({ name: f, path: path.join(backupDir, f), stat: fs.statSync(path.join(backupDir, f)) }))
          .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
          
        if (files.length > 30) {
          const toDelete = files.slice(30);
          toDelete.forEach(f => fs.unlinkSync(f.path));
        }
        
        return backupPath;
      } catch (err) {
        console.error(`Failed to create ${prefix} backup:`, err);
        return false;
      }
    };

    const ensureDailyBackup = async () => {
      try {
        const documentsPath = app.getPath('documents');
        const backupDir = path.join(documentsPath, 'MBM-Backups');
        if (!fs.existsSync(backupDir)) return;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const files = fs.readdirSync(backupDir);
        const hasTodayBackup = files.some(f => f.startsWith(`MBM_Backup_daily_${todayStr}`));
        
        if (!hasTodayBackup) {
          console.log('No daily backup found. Creating one...');
          await performDatabaseBackup('daily');
        }
      } catch (err) {}
    };

    const performStartupHealthCheck = () => {
      try {
        const userDataPath = app.getPath("userData");
        const documentsPath = app.getPath('documents');
        const backupDir = path.join(documentsPath, 'MBM-Backups');

        // Check if we can write to userData
        const testFile = path.join(userDataPath, '.healthcheck');
        fs.writeFileSync(testFile, 'ok');
        fs.unlinkSync(testFile);

        // Check backup dir if it exists
        if (fs.existsSync(backupDir)) {
          const testBackupFile = path.join(backupDir, '.healthcheck');
          fs.writeFileSync(testBackupFile, 'ok');
          fs.unlinkSync(testBackupFile);
        }
        console.log("Health check passed: Write permissions OK.");
      } catch (err) {
        console.error("Health check failed:", err);
        dialog.showErrorBox("Permission Error", "MBM Quarry ERP does not have permission to write to its data folders. Please check your antivirus or run as administrator.");
      }
    };

    if (app.isPackaged) {
      performStartupHealthCheck();
      ensureDailyBackup();
    }

    createWindow();
    
    // Check for updates if packaged
    if (app.isPackaged) {
      console.log("Checking for auto-updates...");
      
      autoUpdater.logger = log;
      autoUpdater.autoDownload = false; // We prompt before download now for safety
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.error("Auto-update failed:", err);
      });
      
      autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info.version);
        isManualUpdateCheck = false;
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} is available.\n\n• New Dashboard\n• Bug Fixes\n\nWould you like to download it now?`,
          buttons: ['Download', 'Later'],
          defaultId: 0,
          cancelId: 1
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.downloadUpdate();
          }
        });
      });

      autoUpdater.on('update-not-available', (info) => {
        if (isManualUpdateCheck) {
          dialog.showMessageBox({
            type: 'info',
            title: 'Up to Date',
            message: 'You are already running the latest version of MBM Quarry ERP.'
          });
          isManualUpdateCheck = false;
        }
      });

      autoUpdater.on('download-progress', (progressObj) => {
        let log_message = `Download speed: ${Math.round(progressObj.bytesPerSecond / 1024)} KB/s - Downloaded ${Math.round(progressObj.percent)}%`;
        console.log(log_message);
      });
      
      autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info.version);
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Ready',
          message: `The update is ready.\n\nPlease finish your current work.\n\n(A safety backup of your database will be created before installing).`,
          buttons: ['Restart & Install', 'Later'],
          defaultId: 0,
          cancelId: 1
        }).then(async (result) => {
          if (result.response === 0) {
            console.log("Creating pre-update backup before installation...");
            await performDatabaseBackup(`pre-update-${info.version}`);
            autoUpdater.quitAndInstall(false, true);
          }
        });
      });
      
      autoUpdater.on('error', (err) => {
        console.error('Error in auto-updater.', err);
        if (isManualUpdateCheck) {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Update Error',
            message: 'There was a problem checking for updates. Please verify your internet connection.'
          });
          isManualUpdateCheck = false;
        }
      });
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // Cleanup child process on exit
  app.on("will-quit", () => {
    if (nextProcess) {
      console.log("Killing Next.js child process...");
      nextProcess.kill();
    }
  });
}

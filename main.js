const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let nextProcess = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (app.isPackaged) {
    // 1. Setup Database Path
    const userDataPath = app.getPath("userData");
    const dbName = "quarry.db";
    const dbPath = path.join(userDataPath, dbName);
    const packagedDbPath = path.join(process.resourcesPath, "prisma", "dev.db");

    // Copy initial DB if it doesn't exist
    if (!fs.existsSync(dbPath)) {
      console.log("Initializing database at", dbPath);
      try {
        fs.copyFileSync(packagedDbPath, dbPath);
      } catch (e) {
        console.error("Failed to copy pristine DB", e);
      }
    }

    const databaseUrl = `file:${dbPath}`;
    console.log("Using Database URL:", databaseUrl);

    // 2. Start Next.js Server
    const serverPath = path.join(process.resourcesPath, "standalone", "server.js");
    const port = 3000; // You can make this dynamic later to avoid conflicts

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

    const env = {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      ELECTRON_RUN_AS_NODE: "1",
      NEXT_PUBLIC_APP_VERSION: appVersion,
      NEXT_PUBLIC_BUILD_DATE: buildDate
    };

    nextProcess = spawn(process.execPath, [serverPath], {
      env,
      cwd: path.join(process.resourcesPath, "standalone"),
    });

    nextProcess.stdout.on("data", (data) => {
      console.log(`Next.js: ${data}`);
    });

    nextProcess.stderr.on("data", (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    // 3. Wait a moment for the server to start, then load
    setTimeout(() => {
      mainWindow.loadURL(`http://localhost:${port}`);
    }, 2000);

  } else {
    // Development mode
    const devPort = process.env.ELECTRON_DEV_PORT || "3005";
    mainWindow.loadURL(`http://localhost:${devPort}`);
    mainWindow.webContents.openDevTools();
  }
}


const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    // Setup auto-updater (Stage 3 & 4 implementation - currently disabled/stubbed)
    // autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on('update-available', () => {
      console.log('Update available.');
    });
    autoUpdater.on('update-downloaded', () => {
      console.log('Update downloaded. Ready to install.');
      // autoUpdater.quitAndInstall();
    });

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});

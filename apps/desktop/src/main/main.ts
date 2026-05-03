import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createLocalOrchestrator } from "@mergepilot/orchestrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerOrchestratorIpcHandlers } from "./orchestrator-ipc.js";

const rendererDevServerUrl = process.env.VITE_DEV_SERVER_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDirOverride = process.env.MERGEPILOT_USER_DATA_DIR;

function isExternalHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function installNavigationGuards(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isExternalHttpUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
}

if (userDataDirOverride) {
  app.setPath("userData", userDataDirOverride);
}

const orchestrator = createLocalOrchestrator({
  dataDir: path.join(app.getPath("userData"), "orchestrator")
});

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/preload.cjs");
}

function getRendererIndexPath(): string {
  return path.join(__dirname, "../../../web/dist/index.html");
}

async function createMainWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "MergePilot",
    backgroundColor: "#f7f8fa",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  installNavigationGuards(mainWindow);

  if (rendererDevServerUrl) {
    await mainWindow.loadURL(rendererDevServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(getRendererIndexPath());
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:get-runtime-info", () => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform
  }));
  registerOrchestratorIpcHandlers(ipcMain, orchestrator);
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  if (rendererDevServerUrl) {
    await orchestrator.start();
  }
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

let quittingAfterOrchestratorStop = false;

app.on("before-quit", (event) => {
  if (quittingAfterOrchestratorStop) {
    return;
  }
  event.preventDefault();
  void (async () => {
    try {
      await orchestrator.stop();
      quittingAfterOrchestratorStop = true;
      app.quit();
    } catch (error) {
      console.error("MergePilot quit blocked while orchestrator lifecycle operations are active.", error);
    }
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

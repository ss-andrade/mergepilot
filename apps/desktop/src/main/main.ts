import { app, BrowserWindow, ipcMain } from "electron";
import { createLocalOrchestrator } from "@mergepilot/orchestrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerOrchestratorIpcHandlers } from "./orchestrator-ipc.js";

const rendererDevServerUrl = process.env.VITE_DEV_SERVER_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const orchestrator = createLocalOrchestrator({
  dataDir: path.join(app.getPath("userData"), "orchestrator")
});

function getPreloadPath(): string {
  return path.join(__dirname, "../preload/preload.js");
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

app.on("before-quit", () => {
  void orchestrator.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

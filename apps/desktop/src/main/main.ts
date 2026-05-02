import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

const rendererDevServerUrl = process.env.VITE_DEV_SERVER_URL;

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
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

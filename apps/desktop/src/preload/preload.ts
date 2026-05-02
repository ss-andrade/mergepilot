import { contextBridge, ipcRenderer } from "electron";

export interface MergePilotRuntimeInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}

export interface MergePilotDesktopApi {
  readonly appInfo: {
    readonly name: "MergePilot";
    readonly shell: "electron";
  };
  getRuntimeInfo(): Promise<MergePilotRuntimeInfo>;
}

const desktopApi: MergePilotDesktopApi = {
  appInfo: {
    name: "MergePilot",
    shell: "electron"
  },
  getRuntimeInfo: () => ipcRenderer.invoke("app:get-runtime-info")
};

contextBridge.exposeInMainWorld("mergePilot", desktopApi);

import { contextBridge, ipcRenderer } from "electron";

export interface MergePilotRuntimeInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}

export interface OrchestratorStatus {
  state: "stopped" | "running";
  dataDir: string;
  databasePath: string;
}

export interface Workstream {
  id: string;
  title: string;
  description: string | null;
  repositoryPath: string | null;
  status: "active" | "paused" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkstreamInput {
  title: string;
  description?: string | null;
  repositoryPath?: string | null;
}

export interface WorkstreamEvent {
  id: string;
  workstreamId: string;
  sequence: number;
  type: string;
  message: string;
  payload: unknown | null;
  createdAt: string;
}

export interface AppendWorkstreamEventInput {
  workstreamId: string;
  type: string;
  message: string;
  payload?: unknown;
}

export interface MergePilotDesktopApi {
  readonly appInfo: {
    readonly name: "MergePilot";
    readonly shell: "electron";
  };
  getRuntimeInfo(): Promise<MergePilotRuntimeInfo>;
  orchestrator: {
    start(): Promise<OrchestratorStatus>;
    stop(): Promise<OrchestratorStatus>;
    status(): Promise<OrchestratorStatus>;
  };
  workstreams: {
    create(input: CreateWorkstreamInput): Promise<Workstream>;
    list(): Promise<Workstream[]>;
    get(id: string): Promise<Workstream | null>;
  };
  events: {
    append(input: AppendWorkstreamEventInput): Promise<WorkstreamEvent>;
    list(workstreamId: string): Promise<WorkstreamEvent[]>;
  };
}

const desktopApi: MergePilotDesktopApi = {
  appInfo: {
    name: "MergePilot",
    shell: "electron"
  },
  getRuntimeInfo: () => ipcRenderer.invoke("app:get-runtime-info"),
  orchestrator: {
    start: () => ipcRenderer.invoke("orchestrator:start"),
    stop: () => ipcRenderer.invoke("orchestrator:stop"),
    status: () => ipcRenderer.invoke("orchestrator:status")
  },
  workstreams: {
    create: (input) => ipcRenderer.invoke("workstreams:create", input),
    list: () => ipcRenderer.invoke("workstreams:list"),
    get: (id) => ipcRenderer.invoke("workstreams:get", { workstreamId: id })
  },
  events: {
    append: (input) => ipcRenderer.invoke("events:append", input),
    list: (workstreamId) => ipcRenderer.invoke("events:list", { workstreamId })
  }
};

contextBridge.exposeInMainWorld("mergePilot", desktopApi);

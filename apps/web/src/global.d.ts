interface MergePilotRuntimeInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  platform: string;
}

interface OrchestratorStatus {
  state: "stopped" | "running";
  dataDir: string;
  databasePath: string;
}

interface Workstream {
  id: string;
  title: string;
  description: string | null;
  repositoryPath: string | null;
  status: "active" | "paused" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

interface CreateWorkstreamInput {
  title: string;
  description?: string | null;
  repositoryPath?: string | null;
}

interface WorkstreamEvent {
  id: string;
  workstreamId: string;
  sequence: number;
  type: string;
  message: string;
  payload: unknown | null;
  createdAt: string;
}

interface AppendWorkstreamEventInput {
  workstreamId: string;
  type: string;
  message: string;
  payload?: unknown;
}

interface MergePilotDesktopApi {
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

interface Window {
  mergePilot: MergePilotDesktopApi;
}

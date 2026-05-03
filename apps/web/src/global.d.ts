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

type WorkstreamStatus =
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "awaiting_user_input"
  | "awaiting_review"
  | "merge_ready"
  | "completed"
  | "failed"
  | "cancelled";

interface Workstream {
  id: string;
  title: string;
  goal: string;
  status: WorkstreamStatus;
  repo: string;
  createdBy: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateWorkstreamInput {
  title: string;
  goal: string;
  repo: string;
  createdBy: string;
  summary?: string | null;
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
    updateStatus(id: string, status: WorkstreamStatus): Promise<Workstream>;
  };
  events: {
    append(input: AppendWorkstreamEventInput): Promise<WorkstreamEvent>;
    list(workstreamId: string): Promise<WorkstreamEvent[]>;
  };
}

interface Window {
  mergePilot: MergePilotDesktopApi;
}

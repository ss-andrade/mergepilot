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

export type WorkstreamStatus =
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
export type WorkstreamEventType =
  | "user_message"
  | "coordinator_message"
  | "plan_created"
  | "plan_approved"
  | "agent_started"
  | "agent_completed"
  | "command_ran"
  | "commit_created"
  | "branch_pushed"
  | "pr_opened"
  | "ci_started"
  | "ci_passed"
  | "ci_failed"
  | "review_summary_created"
  | "human_action_required"
  | "workstream_completed";

export interface Workstream {
  id: string;
  title: string;
  goal: string;
  status: WorkstreamStatus;
  repo: string;
  githubRepository: WorkstreamGitHubRepositoryScope | null;
  createdBy: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkstreamInput {
  title: string;
  goal: string;
  repo: string;
  githubRepository?: WorkstreamGitHubRepositoryScope | null;
  createdBy: string;
  summary?: string | null;
}

export interface GitHubRepositoryConnection {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl: string | null;
  apiUrl: string | null;
  connectedAt: string;
  updatedAt: string;
  selectedAt: string | null;
}

export interface WorkstreamGitHubRepositoryScope {
  id?: string;
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl?: string | null;
  apiUrl?: string | null;
}

export interface ConnectGitHubRepositoryInput {
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl?: string | null;
  apiUrl?: string | null;
}

export interface ReportGitHubRepositoryConnectionErrorInput {
  workstreamId: string;
  repository: string;
  message: string;
  reason: string;
}

export interface WorkstreamEvent {
  id: string;
  workstreamId: string;
  sequence: number;
  type: WorkstreamEventType;
  message: string;
  payload: unknown | null;
  createdAt: string;
}

export interface AppendWorkstreamEventInput {
  workstreamId: string;
  type: WorkstreamEventType;
  message: string;
  payload?: unknown;
}

interface Plan {
  id: string;
  workstreamId: string;
  title: string;
  body: string;
  goalRestatement: string;
  steps: string[];
  risks: string[];
  expectedOutputs: string[];
  status: "draft" | "approved" | "rejected" | "superseded";
  createdAt: string;
  updatedAt: string;
}

interface ProposePlanInput {
  workstreamId: string;
}

interface PlanDecisionInput {
  workstreamId: string;
  planId: string;
  reason?: string;
}

interface AgentRun {
  id: string;
  workstreamId: string;
  planId: string | null;
  providerId: string;
  adapterId: string | null;
  role: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  goal: string;
  workspacePath: string | null;
  branchName: string | null;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StartBuildAgentRunInput {
  workstreamId: string;
  planId?: string;
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
    updateStatus(id: string, status: WorkstreamStatus): Promise<Workstream>;
  };
  github: {
    repositories: {
      connect(input: ConnectGitHubRepositoryInput): Promise<GitHubRepositoryConnection>;
      list(): Promise<GitHubRepositoryConnection[]>;
      select(id: string): Promise<GitHubRepositoryConnection>;
      reportError(input: ReportGitHubRepositoryConnectionErrorInput): Promise<WorkstreamEvent>;
    };
  };
  events: {
    append(input: AppendWorkstreamEventInput): Promise<WorkstreamEvent>;
    list(workstreamId: string): Promise<WorkstreamEvent[]>;
  };
  plans: {
    propose(input: ProposePlanInput): Promise<Plan>;
    list(workstreamId: string): Promise<Plan[]>;
    approve(input: PlanDecisionInput): Promise<Plan>;
    reject(input: PlanDecisionInput): Promise<Plan>;
  };
  agents: {
    startBuildRun(input: StartBuildAgentRunInput): Promise<AgentRun>;
    listRuns(workstreamId: string): Promise<AgentRun[]>;
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
    get: (id) => ipcRenderer.invoke("workstreams:get", { workstreamId: id }),
    updateStatus: (id, status) => ipcRenderer.invoke("workstreams:update-status", { workstreamId: id, status })
  },
  github: {
    repositories: {
      connect: (input) => ipcRenderer.invoke("github:repositories:connect", input),
      list: () => ipcRenderer.invoke("github:repositories:list"),
      select: (id) => ipcRenderer.invoke("github:repositories:select", { repositoryId: id }),
      reportError: (input) => ipcRenderer.invoke("github:repositories:report-error", input)
    }
  },
  events: {
    append: (input) => ipcRenderer.invoke("events:append", input),
    list: (workstreamId) => ipcRenderer.invoke("events:list", { workstreamId })
  },
  plans: {
    propose: (input) => ipcRenderer.invoke("plans:propose", input),
    list: (workstreamId) => ipcRenderer.invoke("plans:list", { workstreamId }),
    approve: (input) => ipcRenderer.invoke("plans:approve", input),
    reject: (input) => ipcRenderer.invoke("plans:reject", input)
  },
  agents: {
    startBuildRun: (input) => ipcRenderer.invoke("agents:start-build-run", input),
    listRuns: (workstreamId) => ipcRenderer.invoke("agents:list-runs", { workstreamId })
  }
};

contextBridge.exposeInMainWorld("mergePilot", desktopApi);

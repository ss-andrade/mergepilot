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
type WorkstreamEventType =
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

interface Workstream {
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

interface CreateWorkstreamInput {
  title: string;
  goal: string;
  repo: string;
  githubRepository?: WorkstreamGitHubRepositoryScope | null;
  createdBy: string;
  summary?: string | null;
}

interface GitHubRepositoryConnection {
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

interface WorkstreamGitHubRepositoryScope {
  id?: string;
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl?: string | null;
  apiUrl?: string | null;
}

interface ConnectGitHubRepositoryInput {
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl?: string | null;
  apiUrl?: string | null;
}

interface ReportGitHubRepositoryConnectionErrorInput {
  workstreamId: string;
  repository: string;
  message: string;
  reason: string;
}

interface WorkstreamEvent {
  id: string;
  workstreamId: string;
  sequence: number;
  type: WorkstreamEventType;
  message: string;
  payload: unknown | null;
  createdAt: string;
}

interface AppendWorkstreamEventInput {
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

interface PullRequest {
  id: string;
  workstreamId: string;
  agentRunId: string;
  branchName: string;
  commitSha: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
  body: string;
  status: "open" | "failed";
  errorMessage: string | null;
  checksStatus: "unknown" | "pending" | "passed" | "failed";
  reviewStatus: "not_started" | "ready" | "changes_requested" | "blocked";
  changedFiles: string[];
  testCommands: string[];
  ciSummary: string | null;
  riskSummary: string | null;
  reviewSummary: string | null;
  humanAction: "review" | "merge" | "answer_question" | "fix_access" | null;
  createdAt: string;
  updatedAt: string;
}

interface OpenPullRequestInput {
  workstreamId: string;
  agentRunId: string;
  title?: string;
  body?: string;
}

interface SyncPullRequestReviewInput {
  workstreamId: string;
  pullRequestId: string;
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
  pullRequests: {
    open(input: OpenPullRequestInput): Promise<PullRequest>;
    list(workstreamId: string): Promise<PullRequest[]>;
    syncReview(input: SyncPullRequestReviewInput): Promise<PullRequest>;
  };
}

interface Window {
  mergePilot: MergePilotDesktopApi;
}

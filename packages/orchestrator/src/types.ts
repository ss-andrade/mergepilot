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
export type PlanStatus = "draft" | "approved" | "rejected" | "superseded";
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type OrchestratorState = "stopped" | "running";
export const WORKSTREAM_EVENT_TYPES = [
  "user_message",
  "coordinator_message",
  "plan_created",
  "plan_approved",
  "agent_started",
  "agent_completed",
  "command_ran",
  "commit_created",
  "branch_pushed",
  "pr_opened",
  "ci_started",
  "ci_passed",
  "ci_failed",
  "review_summary_created",
  "human_action_required",
  "workstream_completed"
] as const;
export type WorkstreamEventType = (typeof WORKSTREAM_EVENT_TYPES)[number];

export interface Workstream {
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

export interface CreateWorkstreamInput {
  title: string;
  goal: string;
  repo: string;
  createdBy: string;
  summary?: string | null;
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

export interface Plan {
  id: string;
  workstreamId: string;
  title: string;
  body: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanInput {
  workstreamId: string;
  title: string;
  body: string;
  status?: PlanStatus;
}

export interface AgentRun {
  id: string;
  workstreamId: string;
  providerId: string;
  adapterId: string | null;
  role: string;
  status: AgentRunStatus;
  goal: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentRunInput {
  workstreamId: string;
  providerId: string;
  adapterId?: string | null;
  role: string;
  status?: AgentRunStatus;
  goal: string;
}

export interface OrchestratorStore {
  createWorkstream(input: CreateWorkstreamInput): Workstream;
  listWorkstreams(): Workstream[];
  getWorkstream(id: string): Workstream | null;
  updateWorkstreamStatus(id: string, nextStatus: WorkstreamStatus): Workstream;
  appendEvent(input: AppendWorkstreamEventInput): WorkstreamEvent;
  listEvents(workstreamId: string): WorkstreamEvent[];
  createPlan(input: CreatePlanInput): Plan;
  listPlans(workstreamId: string): Plan[];
  createAgentRun(input: CreateAgentRunInput): AgentRun;
  listAgentRuns(workstreamId: string): AgentRun[];
  close(): void;
}

export interface OrchestratorStatus {
  state: OrchestratorState;
  dataDir: string;
  databasePath: string;
}

export interface LocalOrchestratorService extends Omit<OrchestratorStore, "close"> {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): OrchestratorStatus;
}

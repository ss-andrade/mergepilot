export type AgentProviderId = string;

export type AgentRunRole = "coordinator" | "build" | "review";

export interface AgentAdapterCapabilities {
  streamingEvents: boolean;
  cancellation: boolean;
  structuredResults: boolean;
}

export interface AgentAdapterMetadata {
  providerId: AgentProviderId;
  displayName: string;
  version?: string;
  capabilities: AgentAdapterCapabilities;
}

export interface AgentProviderDetectionInput {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export type AgentProviderDetectionStatus =
  | "available"
  | "unavailable"
  | "unknown";

export interface AgentProviderDetectionResult {
  providerId: AgentProviderId;
  status: AgentProviderDetectionStatus;
  checkedAt: string;
  message?: string;
  version?: string;
  executablePath?: string;
}

export interface AgentProviderHealthInput {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export type AgentProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unknown";

export interface AgentProviderHealthResult {
  providerId: AgentProviderId;
  status: AgentProviderHealthStatus;
  checkedAt: string;
  message?: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface AgentRunInput {
  runId: string;
  workstreamId: string;
  role: AgentRunRole;
  goal: string;
  workspacePath: string;
  repoPath?: string;
  branchName?: string;
  baseBranch?: string;
  instructions?: string;
  env?: Readonly<Record<string, string | undefined>>;
  metadata?: Readonly<Record<string, unknown>>;
}

export type AgentRunLifecycleStatus =
  | "queued"
  | "started"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export interface BaseAgentRunEvent {
  runId: string;
  providerId: AgentProviderId;
  timestamp: string;
}

export interface AgentRunLifecycleEvent extends BaseAgentRunEvent {
  type: "lifecycle";
  status: AgentRunLifecycleStatus;
  message?: string;
}

export interface AgentRunMessageEvent extends BaseAgentRunEvent {
  type: "message";
  role: "agent" | "system";
  content: string;
}

export interface AgentRunCommandEvent extends BaseAgentRunEvent {
  type: "command";
  command: string;
  cwd?: string;
  exitCode?: number;
}

export interface AgentRunArtifactEvent extends BaseAgentRunEvent {
  type: "artifact";
  artifactType: "diff" | "file" | "summary" | "log";
  path?: string;
  content?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentRunErrorEvent extends BaseAgentRunEvent {
  type: "error";
  message: string;
  code?: string;
  recoverable?: boolean;
}

export type AgentRunEvent =
  | AgentRunLifecycleEvent
  | AgentRunMessageEvent
  | AgentRunCommandEvent
  | AgentRunArtifactEvent
  | AgentRunErrorEvent;

export type AgentRunResultStatus = "completed" | "failed" | "cancelled";

export interface AgentRunResult {
  runId: string;
  providerId: AgentProviderId;
  status: AgentRunResultStatus;
  summary?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt: string;
  artifacts?: readonly AgentRunArtifactEvent[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentRunHandle {
  runId: string;
  providerId: AgentProviderId;
  events: AsyncIterable<AgentRunEvent>;
  result: Promise<AgentRunResult>;
  cancel(): Promise<void>;
}

export interface AgentAdapter {
  metadata: AgentAdapterMetadata;
  detect(
    input?: AgentProviderDetectionInput,
  ): Promise<AgentProviderDetectionResult>;
  health(input?: AgentProviderHealthInput): Promise<AgentProviderHealthResult>;
  run(input: AgentRunInput): Promise<AgentRunHandle>;
}

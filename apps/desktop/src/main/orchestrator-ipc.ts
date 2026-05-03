import type {
  AppendWorkstreamEventInput,
  ConnectGitHubRepositoryInput,
  CreateWorkstreamInput,
  LocalOrchestratorService,
  PlanDecisionInput,
  ProposePlanInput,
  ReportGitHubRepositoryConnectionErrorInput,
  StartBuildAgentRunInput,
  WorkstreamGitHubRepositoryScope,
  WorkstreamEventType,
  WorkstreamStatus
} from "@mergepilot/orchestrator";
import { WORKSTREAM_EVENT_TYPES } from "@mergepilot/orchestrator";

const workstreamEventTypes = new Set<string>(WORKSTREAM_EVENT_TYPES);

export interface OrchestratorIpc {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface TestableOrchestratorIpc extends OrchestratorIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

export function registerOrchestratorIpcHandlers(
  ipc: OrchestratorIpc,
  orchestrator: Pick<
    LocalOrchestratorService,
    | "start"
    | "stop"
    | "status"
    | "createWorkstream"
    | "listWorkstreams"
    | "getWorkstream"
    | "updateWorkstreamStatus"
    | "connectGitHubRepository"
    | "listGitHubRepositories"
    | "selectGitHubRepository"
    | "recordGitHubRepositoryConnectionError"
    | "proposePlan"
    | "listPlans"
    | "approvePlan"
    | "rejectPlan"
    | "startBuildAgentRun"
    | "listAgentRuns"
    | "appendEvent"
    | "listEvents"
  >
): void {
  ipc.handle("orchestrator:start", async () => {
    await orchestrator.start();
    return orchestrator.status();
  });

  ipc.handle("orchestrator:stop", async () => {
    await orchestrator.stop();
    return orchestrator.status();
  });

  ipc.handle("orchestrator:status", () => orchestrator.status());

  ipc.handle("workstreams:create", (_event, rawInput) => {
    return orchestrator.createWorkstream(parseCreateWorkstreamInput(rawInput));
  });

  ipc.handle("workstreams:list", () => orchestrator.listWorkstreams());

  ipc.handle("workstreams:get", (_event, rawInput) => {
    const id = parseIdInput(rawInput, "workstreamId");
    return orchestrator.getWorkstream(id);
  });

  ipc.handle("workstreams:update-status", (_event, rawInput) => {
    const input = requireRecord(rawInput);
    const id = parseIdInput(input.workstreamId, "workstreamId");
    return orchestrator.updateWorkstreamStatus(id, parseWorkstreamStatus(input.status));
  });

  ipc.handle("github:repositories:connect", (_event, rawInput) => {
    return orchestrator.connectGitHubRepository(parseConnectGitHubRepositoryInput(rawInput));
  });

  ipc.handle("github:repositories:list", () => orchestrator.listGitHubRepositories());

  ipc.handle("github:repositories:select", (_event, rawInput) => {
    return orchestrator.selectGitHubRepository(parseIdInput(rawInput, "repositoryId"));
  });

  ipc.handle("github:repositories:report-error", (_event, rawInput) => {
    return orchestrator.recordGitHubRepositoryConnectionError(parseReportGitHubRepositoryConnectionErrorInput(rawInput));
  });

  ipc.handle("plans:propose", (_event, rawInput) => {
    return orchestrator.proposePlan(parseProposePlanInput(rawInput));
  });

  ipc.handle("plans:list", (_event, rawInput) => {
    return orchestrator.listPlans(parseIdInput(rawInput, "workstreamId"));
  });

  ipc.handle("plans:approve", (_event, rawInput) => {
    return orchestrator.approvePlan(parsePlanDecisionInput(rawInput));
  });

  ipc.handle("plans:reject", (_event, rawInput) => {
    return orchestrator.rejectPlan(parsePlanDecisionInput(rawInput));
  });

  ipc.handle("agents:start-build-run", (_event, rawInput) => {
    return orchestrator.startBuildAgentRun(parseStartBuildAgentRunInput(rawInput));
  });

  ipc.handle("agents:list-runs", (_event, rawInput) => {
    return orchestrator.listAgentRuns(parseIdInput(rawInput, "workstreamId"));
  });

  ipc.handle("events:append", (_event, rawInput) => {
    return orchestrator.appendEvent(parseAppendEventInput(rawInput));
  });

  ipc.handle("events:list", (_event, rawInput) => {
    const workstreamId = parseIdInput(rawInput, "workstreamId");
    return orchestrator.listEvents(workstreamId);
  });
}

function parseCreateWorkstreamInput(rawInput: unknown): CreateWorkstreamInput {
  const input = requireRecord(rawInput);
  const parsed: CreateWorkstreamInput = {
    title: requireBoundedString(input.title, "title", 160),
    goal: requireBoundedString(input.goal, "goal", 5000),
    repo: requireBoundedString(input.repo, "repo", 2048),
    createdBy: requireBoundedString(input.createdBy, "createdBy", 160)
  };

  if ("summary" in input) {
    parsed.summary = optionalBoundedString(input.summary, "summary", 5000);
  }
  if ("githubRepository" in input && input.githubRepository !== null && input.githubRepository !== undefined) {
    parsed.githubRepository = parseGitHubRepositoryScope(input.githubRepository);
  }

  return parsed;
}

function parseConnectGitHubRepositoryInput(rawInput: unknown): ConnectGitHubRepositoryInput {
  const input = requireRecord(rawInput);
  const parsed: ConnectGitHubRepositoryInput = {
    owner: requireGitHubOwner(input.owner),
    name: requireGitHubRepositoryName(input.name),
    defaultBranch: requireGitHubDefaultBranch(input.defaultBranch)
  };
  if ("htmlUrl" in input) {
    parsed.htmlUrl = optionalBoundedString(input.htmlUrl, "htmlUrl", 2048);
  }
  if ("apiUrl" in input) {
    parsed.apiUrl = optionalBoundedString(input.apiUrl, "apiUrl", 2048);
  }
  return parsed;
}

function parseGitHubRepositoryScope(rawInput: unknown): WorkstreamGitHubRepositoryScope {
  const input = requireRecord(rawInput);
  const parsed: WorkstreamGitHubRepositoryScope = {
    owner: requireGitHubOwner(input.owner),
    name: requireGitHubRepositoryName(input.name),
    defaultBranch: requireGitHubDefaultBranch(input.defaultBranch)
  };
  if ("id" in input && input.id !== undefined && input.id !== null) {
    parsed.id = parseIdInput(input.id, "repositoryId");
  }
  if ("htmlUrl" in input) {
    parsed.htmlUrl = optionalBoundedString(input.htmlUrl, "htmlUrl", 2048);
  }
  if ("apiUrl" in input) {
    parsed.apiUrl = optionalBoundedString(input.apiUrl, "apiUrl", 2048);
  }
  return parsed;
}

function parseReportGitHubRepositoryConnectionErrorInput(
  rawInput: unknown
): ReportGitHubRepositoryConnectionErrorInput {
  const input = requireRecord(rawInput);
  return {
    workstreamId: parseIdInput(input.workstreamId, "workstreamId"),
    repository: requireBoundedString(input.repository, "repository", 2048),
    message: requireBoundedString(input.message, "message", 2000),
    reason: requireBoundedString(input.reason, "reason", 160)
  };
}

function parseProposePlanInput(rawInput: unknown): ProposePlanInput {
  const input = requireRecord(rawInput);
  return {
    workstreamId: parseIdInput(input.workstreamId, "workstreamId")
  };
}

function parsePlanDecisionInput(rawInput: unknown): PlanDecisionInput {
  const input = requireRecord(rawInput);
  const parsed: PlanDecisionInput = {
    workstreamId: parseIdInput(input.workstreamId, "workstreamId"),
    planId: parseIdInput(input.planId, "planId")
  };
  if ("reason" in input && input.reason !== undefined && input.reason !== null) {
    parsed.reason = requireBoundedString(input.reason, "reason", 2000);
  }
  return parsed;
}

function parseStartBuildAgentRunInput(rawInput: unknown): StartBuildAgentRunInput {
  const input = requireRecord(rawInput);
  const parsed: StartBuildAgentRunInput = {
    workstreamId: parseIdInput(input.workstreamId, "workstreamId")
  };
  if ("planId" in input && input.planId !== undefined && input.planId !== null) {
    parsed.planId = parseIdInput(input.planId, "planId");
  }
  return parsed;
}

function parseAppendEventInput(rawInput: unknown): AppendWorkstreamEventInput {
  const input = requireRecord(rawInput);
  const parsed: AppendWorkstreamEventInput = {
    workstreamId: parseIdInput(input.workstreamId, "workstreamId"),
    type: requireEventType(input.type),
    message: requireBoundedString(input.message, "message", 2000)
  };

  if ("payload" in input) {
    assertJsonCompatible(input.payload);
    parsed.payload = input.payload;
  }

  return parsed;
}

function parseIdInput(rawInput: unknown, field: string): string {
  const value = typeof rawInput === "object" && rawInput !== null && field in rawInput
    ? (rawInput as Record<string, unknown>)[field]
    : rawInput;
  const id = requireBoundedString(value, field, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new Error(`${field} must be a valid local id.`);
  }
  return id;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("IPC input must be an object.");
  }
  return value as Record<string, unknown>;
}

function requireBoundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function requireGitHubOwner(value: unknown): string {
  const owner = requireBoundedString(value, "owner", 39);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error("owner must be a valid GitHub owner.");
  }
  return owner;
}

function requireGitHubRepositoryName(value: unknown): string {
  const name = requireBoundedString(value, "name", 100);
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === "." || name === ".." || name.toLowerCase() === ".git") {
    throw new Error("name must be a valid GitHub repository name.");
  }
  return name;
}

function requireGitHubDefaultBranch(value: unknown): string {
  const branch = requireBoundedString(value, "defaultBranch", 250);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,249}$/.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.endsWith(".")) {
    throw new Error("defaultBranch must be a valid Git branch name.");
  }
  return branch;
}

function optionalBoundedString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireBoundedString(value, field, maxLength);
}

function requireEventType(value: unknown): WorkstreamEventType {
  const type = requireBoundedString(value, "type", 128);
  if (!workstreamEventTypes.has(type)) {
    throw new Error("type must be a valid event type.");
  }
  return type as WorkstreamEventType;
}

function parseWorkstreamStatus(value: unknown): WorkstreamStatus {
  const status = requireBoundedString(value, "status", 40);
  if (
    ![
      "draft",
      "planning",
      "awaiting_plan_approval",
      "running",
      "awaiting_user_input",
      "awaiting_review",
      "merge_ready",
      "completed",
      "failed",
      "cancelled"
    ].includes(status)
  ) {
    throw new Error("status must be a valid workstream status.");
  }
  return status as WorkstreamStatus;
}

function assertJsonCompatible(value: unknown): void {
  if (!isJsonCompatible(value, new Set())) {
    throw new Error("payload must be JSON serializable.");
  }
}

function isJsonCompatible(value: unknown, seen: Set<object>): boolean {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((item) => isJsonCompatible(item, seen));
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every((item) => isJsonCompatible(item, seen));
}

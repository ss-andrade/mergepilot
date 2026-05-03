import { WORKSTREAM_EVENT_TYPES, WorkstreamEventType } from "./types.js";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const eventTypes = new Set<string>(WORKSTREAM_EVENT_TYPES);
const workstreamStatuses = new Set([
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
]);
const allowedWorkstreamTransitions: Record<string, Set<string>> = {
  draft: new Set(["planning", "cancelled"]),
  planning: new Set(["awaiting_plan_approval", "cancelled"]),
  awaiting_plan_approval: new Set(["planning", "running", "cancelled"]),
  running: new Set(["awaiting_user_input", "awaiting_review", "failed", "cancelled"]),
  awaiting_user_input: new Set(["running", "cancelled"]),
  awaiting_review: new Set(["merge_ready", "running", "failed", "cancelled"]),
  merge_ready: new Set(["completed", "running", "failed", "cancelled"]),
  completed: new Set([]),
  failed: new Set(["cancelled"]),
  cancelled: new Set([])
};
const planStatuses = new Set(["draft", "approved", "rejected", "superseded"]);
const agentRunStatuses = new Set(["queued", "running", "completed", "failed", "cancelled"]);
const githubOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const githubRepositoryNamePattern = /^[A-Za-z0-9._-]{1,100}$/;
const gitRefNamePattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,249}$/;

export function normalizeOptionalString(value: string | null | undefined, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`Value must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

export function requireString(value: string, field: string, maxLength: number): string {
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

export function requireId(value: string, field = "id"): string {
  const trimmed = requireString(value, field, 128);
  if (!idPattern.test(trimmed)) {
    throw new Error(`${field} must be a valid local id.`);
  }
  return trimmed;
}

export function requireGitHubOwner(value: unknown): string {
  const owner = requireString(value as string, "owner", 39);
  if (!githubOwnerPattern.test(owner)) {
    throw new Error("owner must be a valid GitHub owner.");
  }
  return owner;
}

export function requireGitHubRepositoryName(value: unknown): string {
  const name = requireString(value as string, "name", 100);
  if (!githubRepositoryNamePattern.test(name) || name === "." || name === ".." || name.toLowerCase() === ".git") {
    throw new Error("name must be a valid GitHub repository name.");
  }
  return name;
}

export function requireGitHubDefaultBranch(value: unknown): string {
  const branch = requireString(value as string, "defaultBranch", 250);
  if (!gitRefNamePattern.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.endsWith(".")) {
    throw new Error("defaultBranch must be a valid Git branch name.");
  }
  return branch;
}

export function requireEventType(value: string): WorkstreamEventType {
  const trimmed = requireString(value, "type", 128);
  if (!eventTypes.has(trimmed)) {
    throw new Error("type must be a valid event type.");
  }
  return trimmed as WorkstreamEventType;
}

export function requireWorkstreamStatus(
  value: unknown
):
  | "draft"
  | "planning"
  | "awaiting_plan_approval"
  | "running"
  | "awaiting_user_input"
  | "awaiting_review"
  | "merge_ready"
  | "completed"
  | "failed"
  | "cancelled" {
  const status = requireString(value as string, "status", 40);
  if (!workstreamStatuses.has(status)) {
    throw new Error("status must be a valid workstream status.");
  }
  return status as
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
}

export function assertWorkstreamStatusTransition(currentStatus: string, nextStatus: string): void {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!allowedWorkstreamTransitions[currentStatus]?.has(nextStatus)) {
    throw new Error(`Invalid workstream status transition from ${currentStatus} to ${nextStatus}.`);
  }
}

export function requirePlanStatus(value: unknown): "draft" | "approved" | "rejected" | "superseded" {
  const status = requireString(value as string, "status", 40);
  if (!planStatuses.has(status)) {
    throw new Error("status must be a valid plan status.");
  }
  return status as "draft" | "approved" | "rejected" | "superseded";
}

export function requireStringList(value: unknown, field: string, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be a non-empty string list.`);
  }

  if (value.length === 0) {
    throw new Error(`${field} must include at least one item.`);
  }

  if (value.length > maxItems) {
    throw new Error(`${field} must include ${maxItems} items or fewer.`);
  }

  return value.map((item, index) => requireString(item as string, `${field}[${index}]`, maxItemLength));
}

export function requireAgentRunStatus(value: unknown): "queued" | "running" | "completed" | "failed" | "cancelled" {
  const status = requireString(value as string, "status", 40);
  if (!agentRunStatuses.has(status)) {
    throw new Error("status must be a valid agent run status.");
  }
  return status as "queued" | "running" | "completed" | "failed" | "cancelled";
}

export function assertJsonCompatible(value: unknown): void {
  if (value === undefined) {
    return;
  }

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

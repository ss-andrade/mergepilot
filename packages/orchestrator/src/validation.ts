const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const eventTypePattern = /^[a-z][a-z0-9.:_-]{0,127}$/;
const planStatuses = new Set(["draft", "approved", "rejected", "superseded"]);
const agentRunStatuses = new Set(["queued", "running", "completed", "failed", "cancelled"]);

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

export function requireEventType(value: string): string {
  const trimmed = requireString(value, "type", 128);
  if (!eventTypePattern.test(trimmed)) {
    throw new Error("type must be a valid event type.");
  }
  return trimmed;
}

export function requirePlanStatus(value: unknown): "draft" | "approved" | "rejected" | "superseded" {
  const status = requireString(value as string, "status", 40);
  if (!planStatuses.has(status)) {
    throw new Error("status must be a valid plan status.");
  }
  return status as "draft" | "approved" | "rejected" | "superseded";
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

  try {
    JSON.stringify(value);
  } catch {
    throw new Error("payload must be JSON serializable.");
  }
}

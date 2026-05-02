import type {
  AppendWorkstreamEventInput,
  CreateWorkstreamInput,
  LocalOrchestratorService
} from "@mergepilot/orchestrator";

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
    title: requireBoundedString(input.title, "title", 160)
  };

  if ("description" in input) {
    parsed.description = optionalBoundedString(input.description, "description", 5000);
  }
  if ("repositoryPath" in input) {
    parsed.repositoryPath = optionalBoundedString(input.repositoryPath, "repositoryPath", 2048);
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

function optionalBoundedString(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireBoundedString(value, field, maxLength);
}

function requireEventType(value: unknown): string {
  const type = requireBoundedString(value, "type", 128);
  if (!/^[a-z][a-z0-9.:_-]{0,127}$/.test(type)) {
    throw new Error("type must be a valid event type.");
  }
  return type;
}

function assertJsonCompatible(value: unknown): void {
  try {
    JSON.stringify(value);
  } catch {
    throw new Error("payload must be JSON serializable.");
  }
}

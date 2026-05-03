import type {
  AgentAdapter,
  AgentAdapterMetadata,
  AgentProviderDetectionInput,
  AgentProviderDetectionResult,
  AgentProviderHealthInput,
  AgentProviderHealthResult,
  AgentRunArtifactEvent,
  AgentRunEvent,
  AgentRunHandle,
  AgentRunInput,
  AgentRunResult,
} from "@mergepilot/agents";
import {
  ClaudeCliRunner,
  ClaudeCliRunRequest,
  ClaudeCliRunResult,
  SpawnClaudeCliRunner,
} from "./process-runner.js";

export type {
  ClaudeCliRunner,
  ClaudeCliRunRequest,
  ClaudeCliRunResult,
} from "./process-runner.js";

export interface ClaudeCodeAdapterOptions {
  adapterId?: string;
  executable?: string;
  defaultMaxTurns?: number;
  detectTimeoutMs?: number;
  healthTimeoutMs?: number;
  maxBufferBytes?: number;
  runner?: ClaudeCliRunner;
}

const PROVIDER_ID = "claude-code";
const DEFAULT_MAX_TURNS = 3;
const MAX_MAX_TURNS = 50;
const DEFAULT_DETECT_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;
const REDACTED = "[redacted]";

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly #executable: string;
  readonly #defaultMaxTurns: number;
  readonly #detectTimeoutMs: number;
  readonly #healthTimeoutMs: number;
  readonly #maxBufferBytes: number;
  readonly #runner: ClaudeCliRunner;

  readonly metadata: AgentAdapterMetadata;

  constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.#executable = options.executable ?? "claude";
    this.#defaultMaxTurns = normalizeMaxTurns(
      options.defaultMaxTurns,
      DEFAULT_MAX_TURNS,
    );
    this.#detectTimeoutMs = normalizePositiveInteger(
      options.detectTimeoutMs,
      DEFAULT_DETECT_TIMEOUT_MS,
    );
    this.#healthTimeoutMs = normalizePositiveInteger(
      options.healthTimeoutMs,
      DEFAULT_HEALTH_TIMEOUT_MS,
    );
    this.#maxBufferBytes = normalizePositiveInteger(
      options.maxBufferBytes,
      DEFAULT_MAX_BUFFER_BYTES,
    );
    this.#runner = options.runner ?? new SpawnClaudeCliRunner();
    this.metadata = {
      adapterId: options.adapterId,
      providerId: PROVIDER_ID,
      displayName: "Claude Code",
      capabilities: {
        streamingEvents: false,
        cancellation: true,
        structuredResults: true,
        sessionResume: true,
      },
      labels: ["local-cli", "first-party"],
    };
  }

  async detect(
    input: AgentProviderDetectionInput = {},
  ): Promise<AgentProviderDetectionResult> {
    const checkedAt = new Date().toISOString();
    const result = await this.#runCli({
      command: this.#executable,
      args: ["--version"],
      cwd: input.cwd,
      env: input.env,
      timeoutMs: this.#detectTimeoutMs,
    });

    if (result.timedOut) {
      return {
        providerId: PROVIDER_ID,
        status: "unknown",
        checkedAt,
        message: `Claude Code CLI detection timed out after ${this.#detectTimeoutMs}ms.`,
      };
    }

    if (isMissingBinary(result)) {
      return {
        providerId: PROVIDER_ID,
        status: "unavailable",
        checkedAt,
        message: `Claude Code CLI '${this.#executable}' was not found.`,
      };
    }

    if (result.exitCode === 0) {
      const version = firstLine(result.stdout) ?? firstLine(result.stderr);
      return {
        providerId: PROVIDER_ID,
        status: "available",
        checkedAt,
        message: version
          ? `Claude Code CLI is installed: ${version}.`
          : "Claude Code CLI is installed.",
        version,
        executablePath: this.#executable,
      };
    }

    return {
      providerId: PROVIDER_ID,
      status: "unavailable",
      checkedAt,
      message:
        firstLine(result.stderr) ??
        firstLine(result.stdout) ??
        `Claude Code CLI exited with code ${result.exitCode}.`,
    };
  }

  async health(
    input: AgentProviderHealthInput = {},
  ): Promise<AgentProviderHealthResult> {
    const detected = await this.detect(input);
    const checkedAt = new Date().toISOString();

    if (detected.status !== "available") {
      return {
        providerId: PROVIDER_ID,
        status: detected.status === "unknown" ? "unknown" : "unavailable",
        checkedAt,
        message: detected.message,
        details: { detectionStatus: detected.status },
      };
    }

    const result = await this.#runCli({
      command: this.#executable,
      args: [
        "-p",
        "Reply with OK only.",
        "--output-format",
        "json",
        "--max-turns",
        "1",
      ],
      cwd: input.cwd,
      env: input.env,
      timeoutMs: this.#healthTimeoutMs,
    });

    if (result.timedOut) {
      return {
        providerId: PROVIDER_ID,
        status: "unknown",
        checkedAt,
        message: `Claude Code health check timed out after ${this.#healthTimeoutMs}ms.`,
        details: {
          reason: "timeout",
          version: detected.version,
        },
      };
    }

    if (result.exitCode === 0) {
      return {
        providerId: PROVIDER_ID,
        status: "healthy",
        checkedAt,
        message: "Claude Code CLI is installed and accepted a bounded print-mode run.",
        details: { version: detected.version },
      };
    }

    const message =
      firstLine(result.stderr) ??
      firstLine(result.stdout) ??
      `Claude Code health check exited with code ${result.exitCode}.`;

    return {
      providerId: PROVIDER_ID,
      status: "degraded",
      checkedAt,
      message,
      details: {
        reason: looksUnauthenticated(message) ? "unauthenticated" : "unavailable",
        exitCode: result.exitCode,
        version: detected.version,
      },
    };
  }

  async run(input: AgentRunInput): Promise<AgentRunHandle> {
    const abortController = new AbortController();
    const execution = this.#executeRun(input, abortController.signal);

    return {
      runId: input.runId,
      providerId: PROVIDER_ID,
      adapterId: this.metadata.adapterId,
      events: (async function* () {
        const { events } = await execution;
        yield* events;
      })(),
      result: execution.then(({ result }) => result),
      cancel: async () => {
        abortController.abort();
      },
    };
  }

  async #executeRun(
    input: AgentRunInput,
    signal: AbortSignal,
  ): Promise<{ events: AgentRunEvent[]; result: AgentRunResult }> {
    const startedAt = new Date().toISOString();
    const artifacts: AgentRunArtifactEvent[] = [];
    const events: AgentRunEvent[] = [
      lifecycleEvent(input.runId, startedAt, "started", "Claude Code run started."),
    ];
    const prompt = buildPrompt(input);
    const maxTurns = resolveMaxTurns(input.metadata, this.#defaultMaxTurns);
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--max-turns",
      String(maxTurns),
      ...resumeArgs(input.session?.resumeSessionId),
    ];

    events.push({
      type: "command",
      runId: input.runId,
      providerId: PROVIDER_ID,
      timestamp: startedAt,
      command: formatCommand(this.#executable, args),
      cwd: input.workspacePath,
    });

    const cliResult = await this.#runCli({
      command: this.#executable,
      args,
      cwd: input.workspacePath,
      env: input.env,
      signal,
    });
    const completedAt = new Date().toISOString();
    const parsed = parseClaudeOutput(cliResult.stdout);
    const cancelled = signal.aborted || isAbortedResult(cliResult);

    if (cliResult.stdout.trim()) {
      const event = artifactEvent(input.runId, completedAt, "log", {
        content: cliResult.stdout,
        metadata: { stream: "stdout" },
      });
      artifacts.push(event);
      events.push(event);
    }

    if (cliResult.stderr.trim()) {
      const event = artifactEvent(input.runId, completedAt, "log", {
        content: cliResult.stderr,
        metadata: { stream: "stderr" },
      });
      artifacts.push(event);
      events.push(event);
    }

    const summary = parsed.summary ?? fallbackSummary(cliResult);

    if (summary) {
      events.push({
        type: "message",
        runId: input.runId,
        providerId: PROVIDER_ID,
        timestamp: completedAt,
        role: "agent",
        content: summary,
      });
      const event = artifactEvent(input.runId, completedAt, "summary", {
        content: summary,
      });
      artifacts.push(event);
      events.push(event);
    }

    const status = cancelled
      ? "cancelled"
      : cliResult.exitCode === 0
        ? "completed"
        : "failed";
    const errorMessage =
      status === "failed"
        ? firstLine(cliResult.stderr) ??
          firstLine(cliResult.stdout) ??
          `Claude Code exited with code ${cliResult.exitCode}.`
        : undefined;

    if (errorMessage) {
      events.push({
        type: "error",
        runId: input.runId,
        providerId: PROVIDER_ID,
        timestamp: completedAt,
        message: errorMessage,
        code:
          typeof cliResult.exitCode === "number"
            ? `CLAUDE_EXIT_${cliResult.exitCode}`
            : "CLAUDE_PROCESS_ERROR",
        recoverable: false,
      });
    }

    events.push(
      lifecycleEvent(
        input.runId,
        completedAt,
        status,
        status === "completed"
          ? "Claude Code run completed."
          : status === "cancelled"
            ? "Claude Code run cancelled."
            : "Claude Code run failed.",
      ),
    );

    return {
      events,
      result: {
        runId: input.runId,
        providerId: PROVIDER_ID,
        adapterId: this.metadata.adapterId,
        status,
        summary,
        errorMessage,
        startedAt,
        completedAt,
        session: parsed.sessionId
          ? {
              sessionId: parsed.sessionId,
              sessionKey: input.session?.sessionKey,
            }
          : undefined,
        artifacts,
        metadata: {
          exitCode: cliResult.exitCode,
          outputFormat: parsed.rawJson ? "json" : "text",
          maxTurns,
          cancelled,
          stdoutTruncated: cliResult.stdoutTruncated || undefined,
          stderrTruncated: cliResult.stderrTruncated || undefined,
        },
      },
    };
  }

  async #runCli(request: ClaudeCliRunRequest): Promise<ClaudeCliRunResult> {
    try {
      return await this.#runner.run({
        maxBufferBytes: this.#maxBufferBytes,
        ...request,
      });
    } catch (error) {
      return {
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        error,
      };
    }
  }
}

function lifecycleEvent(
  runId: string,
  timestamp: string,
  status: "started" | "completed" | "failed" | "cancelled",
  message: string,
): AgentRunEvent {
  return {
    type: "lifecycle",
    runId,
    providerId: PROVIDER_ID,
    timestamp,
    status,
    message,
  };
}

function artifactEvent(
  runId: string,
  timestamp: string,
  artifactType: AgentRunArtifactEvent["artifactType"],
  event: Partial<Pick<AgentRunArtifactEvent, "content" | "metadata">>,
): AgentRunArtifactEvent {
  return {
    type: "artifact",
    runId,
    providerId: PROVIDER_ID,
    timestamp,
    artifactType,
    ...event,
  };
}

function buildPrompt(input: AgentRunInput): string {
  return [input.session?.handoff, input.goal, input.instructions]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
}

function resumeArgs(resumeSessionId?: string): string[] {
  return resumeSessionId ? ["--resume", resumeSessionId] : [];
}

function resolveMaxTurns(
  metadata: Readonly<Record<string, unknown>> | undefined,
  defaultMaxTurns: number,
): number {
  const value = metadata?.claudeMaxTurns ?? metadata?.maxTurns;
  return normalizeMaxTurns(value, defaultMaxTurns);
}

function normalizeMaxTurns(value: unknown, fallback: number): number {
  const normalized = normalizePositiveInteger(value, fallback);
  return Math.min(normalized, MAX_MAX_TURNS);
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function parseClaudeOutput(stdout: string): {
  rawJson?: unknown;
  summary?: string;
  sessionId?: string;
} {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const rawJson: unknown = JSON.parse(trimmed);
    return {
      rawJson,
      summary: extractSummary(rawJson),
      sessionId: extractString(rawJson, ["session_id", "sessionId"]),
    };
  } catch {
    return { summary: trimmed };
  }
}

function extractSummary(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["result", "summary", "message", "content", "text"]) {
    const nested = value[key];
    if (typeof nested === "string" && nested.trim()) {
      return nested;
    }
  }

  return undefined;
}

function extractString(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const nested = value[key];
    if (typeof nested === "string" && nested.trim()) {
      return nested;
    }
  }

  return undefined;
}

function fallbackSummary(result: ClaudeCliRunResult): string | undefined {
  return firstLine(result.stdout) ?? firstLine(result.stderr);
}

function firstLine(value: string): string | undefined {
  const line = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  return line || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingBinary(result: ClaudeCliRunResult): boolean {
  if (isNodeError(result.error) && result.error.code === "ENOENT") {
    return true;
  }

  return result.exitCode === null && /ENOENT|not found/i.test(String(result.error));
}

function isAbortedResult(result: ClaudeCliRunResult): boolean {
  if (result.aborted) {
    return true;
  }

  return isAbortError(result.error);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /abort/i.test(error.message))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function looksUnauthenticated(message: string): boolean {
  return /auth|login|credential|api key|unauthor/i.test(message);
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...redactCommandArgs(args).map(quoteArg)].join(" ");
}

function redactCommandArgs(args: readonly string[]): string[] {
  const redacted = [...args];

  for (const option of ["-p", "--prompt", "--resume"]) {
    const index = redacted.indexOf(option);

    if (index >= 0 && index + 1 < redacted.length) {
      redacted[index + 1] = REDACTED;
    }
  }

  return redacted;
}

function quoteArg(value: string): string {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value)
    ? value
    : JSON.stringify(value);
}

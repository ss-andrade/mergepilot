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
  AgentRunLifecycleStatus,
  AgentRunResult,
} from "@mergepilot/agents";
import {
  CodexCliEvent,
  CodexCliRunner,
  CodexCliRunRequest,
  CodexCliRunResult,
  SpawnCodexCliRunner,
} from "./process-runner.js";

export type {
  CodexCliEvent,
  CodexCliRunner,
  CodexCliRunRequest,
  CodexCliRunResult,
} from "./process-runner.js";

export interface CodexAdapterOptions {
  adapterId?: string;
  executable?: string;
  sandbox?: string;
  defaultArgs?: readonly string[];
  detectTimeoutMs?: number;
  healthTimeoutMs?: number;
  diffTimeoutMs?: number;
  maxBufferBytes?: number;
  runner?: CodexCliRunner;
}

const PROVIDER_ID = "codex";
const DEFAULT_SANDBOX = "workspace-write";
const DEFAULT_DETECT_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_DIFF_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;
const REDACTED = "[redacted]";
const SENSITIVE_ARG_NAMES = new Set([
  "--api-key",
  "--auth-token",
  "--password",
  "--token",
]);

export class CodexAdapter implements AgentAdapter {
  readonly #executable: string;
  readonly #sandbox: string;
  readonly #defaultArgs: readonly string[];
  readonly #detectTimeoutMs: number;
  readonly #healthTimeoutMs: number;
  readonly #diffTimeoutMs: number;
  readonly #maxBufferBytes: number;
  readonly #runner: CodexCliRunner;

  readonly metadata: AgentAdapterMetadata;

  constructor(options: CodexAdapterOptions = {}) {
    this.#executable = options.executable ?? "codex";
    this.#sandbox = normalizeString(options.sandbox, DEFAULT_SANDBOX);
    this.#defaultArgs = options.defaultArgs ?? [];
    this.#detectTimeoutMs = normalizePositiveInteger(
      options.detectTimeoutMs,
      DEFAULT_DETECT_TIMEOUT_MS,
    );
    this.#healthTimeoutMs = normalizePositiveInteger(
      options.healthTimeoutMs,
      DEFAULT_HEALTH_TIMEOUT_MS,
    );
    this.#diffTimeoutMs = normalizePositiveInteger(
      options.diffTimeoutMs,
      DEFAULT_DIFF_TIMEOUT_MS,
    );
    this.#maxBufferBytes = normalizePositiveInteger(
      options.maxBufferBytes,
      DEFAULT_MAX_BUFFER_BYTES,
    );
    this.#runner = options.runner ?? new SpawnCodexCliRunner();
    this.metadata = {
      adapterId: options.adapterId,
      providerId: PROVIDER_ID,
      displayName: "OpenAI Codex",
      capabilities: {
        streamingEvents: true,
        cancellation: true,
        structuredResults: false,
        sessionResume: false,
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
        message: `Codex CLI detection timed out after ${this.#detectTimeoutMs}ms.`,
      };
    }

    if (isMissingBinary(result)) {
      return {
        providerId: PROVIDER_ID,
        status: "unavailable",
        checkedAt,
        message: `Codex CLI '${this.#executable}' was not found.`,
      };
    }

    if (result.exitCode === 0) {
      const version = firstLine(result.stdout) ?? firstLine(result.stderr);
      return {
        providerId: PROVIDER_ID,
        status: "available",
        checkedAt,
        message: version
          ? `Codex CLI is installed: ${version}.`
          : "Codex CLI is installed.",
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
        `Codex CLI exited with code ${result.exitCode}.`,
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
      args: ["exec", "--sandbox", "read-only", "Reply with OK only."],
      cwd: input.cwd,
      env: input.env,
      timeoutMs: this.#healthTimeoutMs,
    });

    if (result.timedOut) {
      return {
        providerId: PROVIDER_ID,
        status: "unknown",
        checkedAt,
        message: `Codex CLI health check timed out after ${this.#healthTimeoutMs}ms.`,
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
        message: "Codex CLI is installed and accepted a bounded exec run.",
        details: {
          installed: true,
          authStatus: "authenticated",
          version: detected.version,
        },
      };
    }

    const message =
      firstLine(result.stderr) ??
      firstLine(result.stdout) ??
      `Codex CLI health check exited with code ${result.exitCode}.`;

    return {
      providerId: PROVIDER_ID,
      status: "degraded",
      checkedAt,
      message,
      details: {
        reason: looksUnauthenticated(message) ? "unauthenticated" : "unavailable",
        installed: true,
        authStatus: looksUnauthenticated(message) ? "unauthenticated" : "unknown",
        exitCode: result.exitCode,
        version: detected.version,
      },
    };
  }

  async run(input: AgentRunInput): Promise<AgentRunHandle> {
    const abortController = new AbortController();
    const eventStream = createEventStream<AgentRunEvent>();
    const execution = this.#executeRun(input, abortController.signal, eventStream.push);

    execution
      .then(({ result }) => eventStream.close(result))
      .catch((error: unknown) => eventStream.fail(error));

    return {
      runId: input.runId,
      providerId: PROVIDER_ID,
      adapterId: this.metadata.adapterId,
      events: eventStream.iterable,
      result: execution.then(({ result }) => result),
      cancel: async () => {
        abortController.abort();
      },
    };
  }

  async #executeRun(
    input: AgentRunInput,
    signal: AbortSignal,
    emit: (event: AgentRunEvent) => void,
  ): Promise<{ result: AgentRunResult }> {
    const startedAt = new Date().toISOString();
    const artifacts: AgentRunArtifactEvent[] = [];
    const prompt = buildPrompt(input);
    const args = [
      "exec",
      "--sandbox",
      this.#sandbox,
      ...this.#defaultArgs,
      prompt,
    ];

    emit(lifecycleEvent(input.runId, startedAt, "started", "Codex run started."));
    emit({
      type: "command",
      runId: input.runId,
      providerId: PROVIDER_ID,
      timestamp: startedAt,
      command: formatCommand(this.#executable, args),
      cwd: input.workspacePath,
    });

    const emittedProcessStreams = new Set<string>();
    const cliResult = await this.#runCli({
      command: this.#executable,
      args,
      cwd: input.workspacePath,
      env: input.env,
      signal,
      collectDiff: true,
      diffTimeoutMs: this.#diffTimeoutMs,
      onEvent: (event) => {
        const normalized = normalizeProcessEvent(input.runId, event);

        if (normalized.type === "artifact") {
          artifacts.push(normalized);
          const stream = normalized.metadata?.stream;
          if (typeof stream === "string") {
            emittedProcessStreams.add(stream);
          }
        }

        emit(normalized);
      },
    });
    const completedAt = new Date().toISOString();
    const cancelled = signal.aborted || isAbortedResult(cliResult);

    if (cliResult.stdout.trim()) {
      const event = artifactEvent(input.runId, completedAt, "log", {
        content: cliResult.stdout,
        metadata: { stream: "stdout", source: "final" },
      });
      if (!emittedProcessStreams.has("stdout")) {
        artifacts.push(event);
        emit(event);
      }
    }

    if (cliResult.stderr.trim()) {
      const event = artifactEvent(input.runId, completedAt, "log", {
        content: cliResult.stderr,
        metadata: { stream: "stderr", source: "final" },
      });
      if (!emittedProcessStreams.has("stderr")) {
        artifacts.push(event);
        emit(event);
      }
    }

    const summary = fallbackSummary(cliResult);

    if (summary) {
      emit({
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
      emit(event);
    }

    if (cliResult.diff?.trim()) {
      const event = artifactEvent(input.runId, completedAt, "diff", {
        content: cliResult.diff,
        metadata: { source: "git-diff" },
      });
      artifacts.push(event);
      emit(event);
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
          `Codex CLI exited with code ${cliResult.exitCode}.`
        : undefined;

    if (errorMessage) {
      emit({
        type: "error",
        runId: input.runId,
        providerId: PROVIDER_ID,
        timestamp: completedAt,
        message: errorMessage,
        code:
          typeof cliResult.exitCode === "number"
            ? `CODEX_EXIT_${cliResult.exitCode}`
            : "CODEX_PROCESS_ERROR",
        recoverable: false,
      });
    }

    emit(
      lifecycleEvent(
        input.runId,
        completedAt,
        status,
        status === "completed"
          ? "Codex run completed."
          : status === "cancelled"
            ? "Codex run cancelled."
            : "Codex run failed.",
      ),
    );

    return {
      result: {
        runId: input.runId,
        providerId: PROVIDER_ID,
        adapterId: this.metadata.adapterId,
        status,
        summary,
        errorMessage,
        startedAt,
        completedAt,
        artifacts,
        metadata: {
          exitCode: cliResult.exitCode,
          sandbox: this.#sandbox,
          cancelled,
          stdoutTruncated: cliResult.stdoutTruncated || undefined,
          stderrTruncated: cliResult.stderrTruncated || undefined,
          diffTruncated: cliResult.diffTruncated || undefined,
          diffTimedOut: cliResult.diffTimedOut || undefined,
        },
      },
    };
  }

  async #runCli(request: CodexCliRunRequest): Promise<CodexCliRunResult> {
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
  status: AgentRunLifecycleStatus,
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
  event: Pick<AgentRunArtifactEvent, "content" | "metadata">,
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

function normalizeProcessEvent(runId: string, event: CodexCliEvent): AgentRunEvent {
  const timestamp = new Date().toISOString();

  if (event.type === "waiting-for-input") {
    return lifecycleEvent(runId, timestamp, "running", "Codex is waiting for input.");
  }

  return artifactEvent(runId, timestamp, "log", {
    content: event.data,
    metadata: {
      stream: event.type,
      source: "process",
    },
  });
}

function buildPrompt(input: AgentRunInput): string {
  return [input.session?.handoff, input.goal, input.instructions]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function fallbackSummary(result: CodexCliRunResult): string | undefined {
  return firstLine(result.stdout) ?? firstLine(result.stderr);
}

function firstLine(value: string): string | undefined {
  const line = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  return line || undefined;
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...redactArgs(args)].map(formatShellToken).join(" ");
}

function redactArgs(args: readonly string[]): string[] {
  if (args.length === 0) {
    return [];
  }

  const redacted: string[] = [];
  let redactNext = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (index === args.length - 1 || redactNext) {
      redacted.push(REDACTED);
      redactNext = false;
      continue;
    }

    const [name, value] = arg.split("=", 2);
    if (SENSITIVE_ARG_NAMES.has(name)) {
      redacted.push(value === undefined ? arg : `${name}=${REDACTED}`);
      redactNext = value === undefined;
      continue;
    }

    redacted.push(arg);
  }

  return redacted;
}

function formatShellToken(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value)
    ? value
    : JSON.stringify(value);
}


function isMissingBinary(result: CodexCliRunResult): boolean {
  const error = result.error;

  return (
    hasErrorCode(error, "ENOENT") ||
    /\bENOENT\b/i.test(result.stderr) ||
    /\bnot found\b/i.test(result.stderr)
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isAbortedResult(result: CodexCliRunResult): boolean {
  return (
    result.aborted === true ||
    result.signal === "SIGTERM" ||
    result.signal === "SIGINT" ||
    (isRecord(result.error) && result.error.name === "AbortError")
  );
}

function looksUnauthenticated(value: string): boolean {
  return /\b(auth|authenticate|authenticated|login|log in|token|api key)\b/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createEventStream<T>(): {
  iterable: AsyncIterable<T>;
  push: (value: T) => void;
  close: (value?: unknown) => void;
  fail: (error: unknown) => void;
} {
  const values: T[] = [];
  const waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let closed = false;
  let failed: unknown;

  const next = (): Promise<IteratorResult<T>> => {
    if (values.length > 0) {
      return Promise.resolve({ done: false, value: values.shift() as T });
    }

    if (failed) {
      return Promise.reject(failed);
    }

    if (closed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  };

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return { next };
      },
    },
    push: (value) => {
      const waiter = waiters.shift();

      if (waiter) {
        waiter.resolve({ done: false, value });
        return;
      }

      values.push(value);
    },
    close: () => {
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter.resolve({ done: true, value: undefined });
      }
    },
    fail: (error) => {
      failed = error;
      for (const waiter of waiters.splice(0)) {
        waiter.reject(error);
      }
    },
  };
}

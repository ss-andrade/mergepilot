import { describe, expect, it } from "vitest";
import {
  CodexAdapter,
  CodexCliEvent,
  CodexCliRunner,
  CodexCliRunRequest,
  CodexCliRunResult,
} from "../src/index.js";

class FakeRunner implements CodexCliRunner {
  readonly requests: CodexCliRunRequest[] = [];
  #results: CodexCliRunResult[];

  constructor(results: CodexCliRunResult[]) {
    this.#results = [...results];
  }

  async run(request: CodexCliRunRequest): Promise<CodexCliRunResult> {
    this.requests.push(request);
    const result = this.#results.shift();

    if (!result) {
      throw new Error("Unexpected fake Codex CLI request.");
    }

    for (const event of result.events ?? []) {
      request.onEvent?.(event);
    }

    return result;
  }
}

class AbortAwareRunner implements CodexCliRunner {
  readonly requests: CodexCliRunRequest[] = [];

  run(request: CodexCliRunRequest): Promise<CodexCliRunResult> {
    this.requests.push(request);

    return new Promise((resolve) => {
      request.signal?.addEventListener(
        "abort",
        () => {
          resolve({
            exitCode: null,
            stdout: "",
            stderr: "",
            error: Object.assign(new Error("The operation was aborted."), {
              name: "AbortError",
            }),
            aborted: true,
          });
        },
        { once: true },
      );
    });
  }
}

const success = (stdout = "", extra: Partial<CodexCliRunResult> = {}): CodexCliRunResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
  ...extra,
});

const failure = (stderr: string, exitCode = 1): CodexCliRunResult => ({
  exitCode,
  stdout: "",
  stderr,
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];

  for await (const value of iterable) {
    values.push(value);
  }

  return values;
}

describe("CodexAdapter", () => {
  it("reports detection and healthy auth status", async () => {
    const runner = new FakeRunner([
      success("codex-cli 1.2.3\n"),
      success("codex-cli 1.2.3\n"),
      success("OK\n"),
    ]);
    const adapter = new CodexAdapter({ runner });

    await expect(adapter.detect()).resolves.toMatchObject({
      providerId: "codex",
      status: "available",
      version: "codex-cli 1.2.3",
      executablePath: "codex",
    });

    await expect(adapter.health({ cwd: "/tmp/repo" })).resolves.toMatchObject({
      providerId: "codex",
      status: "healthy",
      details: { version: "codex-cli 1.2.3" },
    });

    expect(runner.requests[0]).toMatchObject({
      command: "codex",
      args: ["--version"],
      timeoutMs: 5000,
    });
    expect(runner.requests[0]?.collectDiff).toBeUndefined();
    expect(runner.requests[2]).toMatchObject({
      cwd: "/tmp/repo",
      args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "Reply with OK only."],
      timeoutMs: 30000,
    });
    expect(runner.requests[2]?.collectDiff).toBeUndefined();
  });

  it("bounds detection and health checks with configurable timeouts", async () => {
    const runner = new FakeRunner([
      { exitCode: null, stdout: "", stderr: "", timedOut: true },
      success("codex-cli 1.2.3\n"),
      { exitCode: null, stdout: "", stderr: "", timedOut: true },
    ]);
    const adapter = new CodexAdapter({
      runner,
      detectTimeoutMs: 123,
      healthTimeoutMs: 456,
    });

    await expect(adapter.detect()).resolves.toMatchObject({
      status: "unknown",
      message: expect.stringContaining("123ms"),
    });
    await expect(adapter.health()).resolves.toMatchObject({
      status: "unknown",
      message: expect.stringContaining("456ms"),
      details: { reason: "timeout" },
    });

    expect(runner.requests[0]).toMatchObject({ args: ["--version"], timeoutMs: 123 });
    expect(runner.requests[1]).toMatchObject({ args: ["--version"], timeoutMs: 123 });
    expect(runner.requests[2]).toMatchObject({ timeoutMs: 456 });
  });

  it("distinguishes missing binary and unauthenticated health", async () => {
    const missing = new FakeRunner([
      {
        exitCode: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      },
    ]);
    const unauthenticated = new FakeRunner([
      success("codex-cli 1.2.3\n"),
      failure("Not authenticated. Run codex login.\n"),
    ]);

    await expect(new CodexAdapter({ runner: missing }).detect()).resolves.toMatchObject({
      status: "unavailable",
      message: expect.stringMatching(/not found/i),
    });

    await expect(new CodexAdapter({ runner: unauthenticated }).health()).resolves.toMatchObject({
      status: "degraded",
      details: { reason: "unauthenticated" },
    });
  });

  it("runs codex exec in the workspace and normalizes process events and diff evidence", async () => {
    const emitted: CodexCliEvent[] = [
      { type: "stdout", data: "Analyzing repo\n" },
      { type: "waiting-for-input", message: "Codex is waiting for approval." },
      { type: "stderr", data: "warning: tool approval required\n" },
    ];
    const runner = new FakeRunner([
      success("Implemented the task.\n", {
        stderr: "warning: tool approval required\n",
        events: emitted,
        diff: "diff --git a/a.ts b/a.ts\n+const a = 1;\n",
        diffTruncated: true,
      }),
    ]);
    const adapter = new CodexAdapter({
      adapterId: "codex-local",
      runner,
      defaultArgs: ["--model", "gpt-5.2"],
    });

    const handle = await adapter.run({
      runId: "run-1",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Implement issue 13.",
      workspacePath: "/tmp/workspace",
      instructions: "Keep changes focused.",
    });

    const [events, result] = await Promise.all([
      collect(handle.events),
      handle.result,
    ]);

    expect(runner.requests[0]).toMatchObject({
      command: "codex",
      cwd: "/tmp/workspace",
      args: [
        "exec",
        "--sandbox",
        "danger-full-access",
        "--model",
        "gpt-5.2",
        "Implement issue 13.\n\nKeep changes focused.",
      ],
      collectDiff: true,
      diffTimeoutMs: 5000,
    });
    expect(result).toMatchObject({
      runId: "run-1",
      providerId: "codex",
      adapterId: "codex-local",
      status: "completed",
      summary: "Implemented the task.",
      metadata: {
        exitCode: 0,
        sandbox: "danger-full-access",
        cancelled: false,
        diffTruncated: true,
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "lifecycle", status: "started" }),
        expect.objectContaining({
          type: "command",
          cwd: "/tmp/workspace",
          command:
            'codex exec --sandbox danger-full-access --model gpt-5.2 "[redacted]"',
        }),
        expect.objectContaining({
          type: "artifact",
          artifactType: "log",
          content: "Analyzing repo\n",
          metadata: { stream: "stdout", source: "process" },
        }),
        expect.objectContaining({
          type: "lifecycle",
          status: "running",
          message: "Codex is waiting for input.",
        }),
        expect.objectContaining({
          type: "artifact",
          artifactType: "diff",
          content: "diff --git a/a.ts b/a.ts\n+const a = 1;\n",
        }),
        expect.objectContaining({ type: "lifecycle", status: "completed" }),
      ]),
    );

    const commandEvent = events.find((event) => event.type === "command");
    expect(commandEvent).not.toMatchObject({
      command: expect.stringContaining("Implement issue 13."),
    });
  });

  it("maps aborted runs to cancelled lifecycle and result status", async () => {
    const runner = new AbortAwareRunner();
    const adapter = new CodexAdapter({ runner });
    const handle = await adapter.run({
      runId: "run-cancel",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Cancel this run.",
      workspacePath: "/tmp/workspace",
    });

    await handle.cancel();

    const [events, result] = await Promise.all([
      collect(handle.events),
      handle.result,
    ]);

    expect(runner.requests[0]?.signal?.aborted).toBe(true);
    expect(result).toMatchObject({
      status: "cancelled",
      metadata: {
        cancelled: true,
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "lifecycle", status: "started" }),
        expect.objectContaining({ type: "lifecycle", status: "cancelled" }),
      ]),
    );
    expect(events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "error" }),
      ]),
    );
  });

  it("redacts sensitive configured command args", async () => {
    const runner = new FakeRunner([success("Done.\n")]);
    const adapter = new CodexAdapter({
      runner,
      defaultArgs: ["--token", "secret-token", "--api-key=secret-key"],
    });
    const handle = await adapter.run({
      runId: "run-redact",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Do the task.",
      workspacePath: "/tmp/workspace",
    });

    const events = await collect(handle.events);
    const commandEvent = events.find((event) => event.type === "command");

    expect(commandEvent).toMatchObject({
      type: "command",
      command:
        'codex exec --sandbox danger-full-access --token "[redacted]" "--api-key=[redacted]" "[redacted]"',
    });
    expect(commandEvent).not.toMatchObject({
      command: expect.stringContaining("secret"),
    });
  });

  it("captures text output and maps a non-zero exit to a failed result", async () => {
    const runner = new FakeRunner([
      {
        exitCode: 2,
        stdout: "partial text result\n",
        stderr: "Codex failed\n",
      },
    ]);
    const adapter = new CodexAdapter({ runner });
    const handle = await adapter.run({
      runId: "run-2",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Fail this run.",
      workspacePath: "/tmp/workspace",
    });

    const [events, result] = await Promise.all([
      collect(handle.events),
      handle.result,
    ]);

    expect(result).toMatchObject({
      status: "failed",
      summary: "partial text result",
      errorMessage: "Codex failed",
      metadata: {
        exitCode: 2,
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact",
          artifactType: "log",
          content: "partial text result\n",
          metadata: { stream: "stdout", source: "final" },
        }),
        expect.objectContaining({
          type: "artifact",
          artifactType: "log",
          content: "Codex failed\n",
          metadata: { stream: "stderr", source: "final" },
        }),
        expect.objectContaining({
          type: "error",
          message: "Codex failed",
          code: "CODEX_EXIT_2",
        }),
        expect.objectContaining({ type: "lifecycle", status: "failed" }),
      ]),
    );
  });
});

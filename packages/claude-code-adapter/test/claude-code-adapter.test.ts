import { describe, expect, it } from "vitest";
import {
  ClaudeCliRunner,
  ClaudeCliRunRequest,
  ClaudeCliRunResult,
  ClaudeCodeAdapter,
} from "../src/index.js";

class FakeRunner implements ClaudeCliRunner {
  readonly requests: ClaudeCliRunRequest[] = [];
  #results: ClaudeCliRunResult[];

  constructor(results: ClaudeCliRunResult[]) {
    this.#results = [...results];
  }

  async run(request: ClaudeCliRunRequest): Promise<ClaudeCliRunResult> {
    this.requests.push(request);
    const result = this.#results.shift();

    if (!result) {
      throw new Error("Unexpected fake Claude CLI request.");
    }

    return result;
  }
}

class AbortAwareRunner implements ClaudeCliRunner {
  readonly requests: ClaudeCliRunRequest[] = [];

  run(request: ClaudeCliRunRequest): Promise<ClaudeCliRunResult> {
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

const success = (stdout = ""): ClaudeCliRunResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
});

const failure = (stderr: string, exitCode = 1): ClaudeCliRunResult => ({
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

describe("ClaudeCodeAdapter", () => {
  it("reports detection and healthy auth status", async () => {
    const runner = new FakeRunner([
      success("claude 1.2.3\n"),
      success("claude 1.2.3\n"),
      success(JSON.stringify({ result: "OK" })),
    ]);
    const adapter = new ClaudeCodeAdapter({ runner });

    await expect(adapter.detect()).resolves.toMatchObject({
      providerId: "claude-code",
      status: "available",
      version: "claude 1.2.3",
      executablePath: "claude",
    });

    await expect(adapter.health({ cwd: "/tmp/repo" })).resolves.toMatchObject({
      providerId: "claude-code",
      status: "healthy",
    });

    expect(runner.requests[0]).toMatchObject({
      command: "claude",
      args: ["--version"],
      timeoutMs: 5000,
    });
    expect(runner.requests[2]).toMatchObject({
      cwd: "/tmp/repo",
      args: [
        "-p",
        "Reply with OK only.",
        "--output-format",
        "json",
        "--max-turns",
        "1",
      ],
      timeoutMs: 30000,
    });
  });

  it("bounds detection and health checks with configurable timeouts", async () => {
    const runner = new FakeRunner([
      { exitCode: null, stdout: "", stderr: "", timedOut: true },
      success("claude 1.2.3\n"),
      { exitCode: null, stdout: "", stderr: "", timedOut: true },
    ]);
    const adapter = new ClaudeCodeAdapter({
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
      { exitCode: null, stdout: "", stderr: "", error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }) },
    ]);
    const unauthenticated = new FakeRunner([
      success("claude 1.2.3\n"),
      failure("Please login to Claude first.\n"),
    ]);

    await expect(new ClaudeCodeAdapter({ runner: missing }).detect()).resolves.toMatchObject({
      status: "unavailable",
      message: expect.stringMatching(/not found/i),
    });

    await expect(new ClaudeCodeAdapter({ runner: unauthenticated }).health()).resolves.toMatchObject({
      status: "degraded",
      details: { reason: "unauthenticated" },
    });
  });

  it("runs Claude print mode in the workspace and normalizes JSON output", async () => {
    const runner = new FakeRunner([
      success(JSON.stringify({ result: "Implemented the task.", session_id: "session-123" })),
    ]);
    const adapter = new ClaudeCodeAdapter({
      adapterId: "claude-main",
      runner,
      defaultMaxTurns: 2,
    });

    const handle = await adapter.run({
      runId: "run-1",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Implement issue 12.",
      workspacePath: "/tmp/workspace",
      instructions: "Keep changes focused.",
      session: {
        sessionKey: "issue-12",
        resumeSessionId: "session-previous",
        handoff: "Continue prior context.",
      },
      metadata: {
        claudeMaxTurns: 7,
      },
    });

    const [events, result] = await Promise.all([
      collect(handle.events),
      handle.result,
    ]);

    expect(runner.requests[0]).toMatchObject({
      command: "claude",
      cwd: "/tmp/workspace",
      args: [
        "-p",
        "Continue prior context.\n\nImplement issue 12.\n\nKeep changes focused.",
        "--output-format",
        "json",
        "--max-turns",
        "7",
        "--resume",
        "session-previous",
      ],
    });
    expect(result).toMatchObject({
      runId: "run-1",
      providerId: "claude-code",
      adapterId: "claude-main",
      status: "completed",
      summary: "Implemented the task.",
      session: {
        sessionId: "session-123",
        sessionKey: "issue-12",
      },
      metadata: {
        exitCode: 0,
        outputFormat: "json",
        maxTurns: 7,
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "lifecycle", status: "started" }),
        expect.objectContaining({ type: "command", cwd: "/tmp/workspace" }),
        expect.objectContaining({ type: "artifact", artifactType: "log" }),
        expect.objectContaining({
          type: "message",
          role: "agent",
          content: "Implemented the task.",
        }),
        expect.objectContaining({
          type: "lifecycle",
          status: "completed",
        }),
      ]),
    );

    const commandEvent = events.find((event) => event.type === "command");
    expect(commandEvent).toMatchObject({
      type: "command",
      command: 'claude -p "[redacted]" --output-format json --max-turns 7 --resume "[redacted]"',
    });
    expect(commandEvent).not.toMatchObject({
      command: expect.stringContaining("session-previous"),
    });
    expect(commandEvent).not.toMatchObject({
      command: expect.stringContaining("Implement issue 12."),
    });
  });

  it("caps max turns to a bounded upper limit", async () => {
    const runner = new FakeRunner([
      success(JSON.stringify({ result: "Done." })),
    ]);
    const adapter = new ClaudeCodeAdapter({
      runner,
      defaultMaxTurns: 99,
    });

    const handle = await adapter.run({
      runId: "run-max-turns",
      workstreamId: "workstream-1",
      role: "build",
      goal: "Use a bounded turn count.",
      workspacePath: "/tmp/workspace",
      metadata: {
        claudeMaxTurns: 999,
      },
    });
    const result = await handle.result;

    expect(runner.requests[0]?.args).toContain("50");
    expect(result.metadata).toMatchObject({ maxTurns: 50 });
  });

  it("maps aborted runs to cancelled lifecycle and result status", async () => {
    const runner = new AbortAwareRunner();
    const adapter = new ClaudeCodeAdapter({ runner });
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

  it("captures text output and maps a non-zero exit to a failed result", async () => {
    const runner = new FakeRunner([
      {
        exitCode: 2,
        stdout: "partial text result\n",
        stderr: "Claude failed\n",
      },
    ]);
    const adapter = new ClaudeCodeAdapter({ runner });
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
      errorMessage: "Claude failed",
      metadata: {
        exitCode: 2,
        outputFormat: "text",
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "artifact",
          artifactType: "log",
          content: "partial text result\n",
          metadata: { stream: "stdout" },
        }),
        expect.objectContaining({
          type: "artifact",
          artifactType: "log",
          content: "Claude failed\n",
          metadata: { stream: "stderr" },
        }),
        expect.objectContaining({
          type: "error",
          message: "Claude failed",
          code: "CLAUDE_EXIT_2",
        }),
        expect.objectContaining({ type: "lifecycle", status: "failed" }),
      ]),
    );
  });
});

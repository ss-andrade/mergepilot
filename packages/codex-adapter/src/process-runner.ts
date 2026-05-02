import { spawn } from "node:child_process";

export type CodexCliEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "waiting-for-input"; message?: string; metadata?: Readonly<Record<string, unknown>> };

export interface CodexCliRunRequest {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBufferBytes?: number;
  collectDiff?: boolean;
  diffTimeoutMs?: number;
  onEvent?: (event: CodexCliEvent) => void;
}

export interface CodexCliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  diff?: string;
  error?: unknown;
  signal?: NodeJS.Signals | null;
  aborted?: boolean;
  timedOut?: boolean;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  diffTruncated?: boolean;
  diffTimedOut?: boolean;
  events?: readonly CodexCliEvent[];
}

export interface CodexCliRunner {
  run(request: CodexCliRunRequest): Promise<CodexCliRunResult>;
}

const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

export class SpawnCodexCliRunner implements CodexCliRunner {
  run(request: CodexCliRunRequest): Promise<CodexCliRunResult> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const timeoutMs = normalizeTimeoutMs(request.timeoutMs);
      let timedOut = false;
      const timeout = timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

      if (request.signal?.aborted) {
        controller.abort();
      } else {
        request.signal?.addEventListener("abort", abort, { once: true });
      }

      const child = spawn(request.command, request.args, {
        cwd: request.cwd,
        env: mergeEnv(request.env),
        signal: controller.signal,
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const maxBufferBytes = normalizeMaxBufferBytes(request.maxBufferBytes);
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let spawnError: unknown;

      child.stdout.on("data", (chunk: Buffer) => {
        const accepted = boundedChunk(chunk, stdoutBytes, maxBufferBytes);
        const result = appendBoundedBuffer(stdout, stdoutBytes, chunk, maxBufferBytes);
        stdoutBytes = result.bytes;
        stdoutTruncated ||= result.truncated;
        if (accepted.byteLength > 0) {
          request.onEvent?.({ type: "stdout", data: accepted.toString("utf8") });
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const accepted = boundedChunk(chunk, stderrBytes, maxBufferBytes);
        const text = accepted.toString("utf8");
        const result = appendBoundedBuffer(stderr, stderrBytes, chunk, maxBufferBytes);
        stderrBytes = result.bytes;
        stderrTruncated ||= result.truncated;
        if (accepted.byteLength > 0) {
          request.onEvent?.({ type: "stderr", data: text });
        }

        if (text && looksLikeWaitingForInput(text)) {
          request.onEvent?.({
            type: "waiting-for-input",
            message: "Codex is waiting for input.",
            metadata: { source: "stderr" },
          });
        }
      });
      child.on("error", (error) => {
        spawnError = error;
      });
      child.on("close", async (exitCode, signal) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        request.signal?.removeEventListener("abort", abort);
        const diffResult =
          exitCode === 0 && request.cwd && request.collectDiff
            ? await collectGitDiff({
                cwd: request.cwd,
                maxBufferBytes,
                timeoutMs: request.diffTimeoutMs ?? request.timeoutMs,
                signal: request.signal,
              })
            : undefined;
        resolve({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          diff: diffResult?.content,
          error: spawnError,
          signal,
          aborted: controller.signal.aborted,
          timedOut,
          stdoutTruncated,
          stderrTruncated,
          diffTruncated: diffResult?.truncated,
          diffTimedOut: diffResult?.timedOut,
        });
      });
    });
  }
}

function boundedChunk(
  chunk: Buffer,
  existingBytes: number,
  maxBufferBytes: number,
): Buffer {
  const remainingBytes = maxBufferBytes - existingBytes;

  if (remainingBytes <= 0) {
    return Buffer.alloc(0);
  }

  return chunk.byteLength <= remainingBytes
    ? chunk
    : chunk.subarray(0, remainingBytes);
}

function appendBoundedBuffer(
  chunks: Buffer[],
  existingBytes: number,
  chunk: Buffer,
  maxBufferBytes: number,
): { bytes: number; truncated: boolean } {
  const remainingBytes = maxBufferBytes - existingBytes;

  if (remainingBytes <= 0) {
    return { bytes: existingBytes, truncated: true };
  }

  if (chunk.byteLength <= remainingBytes) {
    chunks.push(chunk);
    return { bytes: existingBytes + chunk.byteLength, truncated: false };
  }

  chunks.push(chunk.subarray(0, remainingBytes));
  return { bytes: maxBufferBytes, truncated: true };
}

function normalizeTimeoutMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeMaxBufferBytes(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_MAX_BUFFER_BYTES;
}

function mergeEnv(
  env?: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv | undefined {
  return env ? { ...process.env, ...env } : undefined;
}

function looksLikeWaitingForInput(value: string): boolean {
  return /\b(waiting for|approval required|press enter|confirm|continue\?)\b/i.test(value);
}

interface CollectGitDiffInput {
  cwd: string;
  maxBufferBytes: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface CollectGitDiffResult {
  content?: string;
  truncated?: boolean;
  timedOut?: boolean;
}

function collectGitDiff(input: CollectGitDiffInput): Promise<CollectGitDiffResult | undefined> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
    let timedOut = false;
    const timeout = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

    if (input.signal?.aborted) {
      controller.abort();
    } else {
      input.signal?.addEventListener("abort", abort, { once: true });
    }

    const child = spawn("git", ["diff", "--no-ext-diff", "--no-color"], {
      cwd: input.cwd,
      signal: controller.signal,
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let truncated = false;
    let spawnError: unknown;

    child.stdout.on("data", (chunk: Buffer) => {
      const result = appendBoundedBuffer(stdout, stdoutBytes, chunk, input.maxBufferBytes);
      stdoutBytes = result.bytes;
      truncated ||= result.truncated;
    });
    child.stderr.resume();
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (exitCode) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      input.signal?.removeEventListener("abort", abort);

      if (timedOut) {
        resolve({ timedOut: true });
        return;
      }

      if (spawnError || exitCode !== 0 || controller.signal.aborted) {
        resolve(undefined);
        return;
      }

      const diff = Buffer.concat(stdout).toString("utf8");
      resolve(diff.trim() ? { content: diff, truncated } : undefined);
    });
  });
}

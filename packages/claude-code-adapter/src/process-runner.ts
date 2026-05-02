import { spawn } from "node:child_process";

export interface ClaudeCliRunRequest {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface ClaudeCliRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
  signal?: NodeJS.Signals | null;
  aborted?: boolean;
  timedOut?: boolean;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}

export interface ClaudeCliRunner {
  run(request: ClaudeCliRunRequest): Promise<ClaudeCliRunResult>;
}

const DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024;

export class SpawnClaudeCliRunner implements ClaudeCliRunner {
  run(request: ClaudeCliRunRequest): Promise<ClaudeCliRunResult> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const timeoutMs = normalizeTimeoutMs(request.timeoutMs);
      const timeout = timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;
      let timedOut = false;

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
        const result = appendBoundedBuffer(stdout, stdoutBytes, chunk, maxBufferBytes);
        stdoutBytes = result.bytes;
        stdoutTruncated ||= result.truncated;
      });
      child.stderr.on("data", (chunk: Buffer) => {
        const result = appendBoundedBuffer(stderr, stderrBytes, chunk, maxBufferBytes);
        stderrBytes = result.bytes;
        stderrTruncated ||= result.truncated;
      });
      child.on("error", (error) => {
        spawnError = error;
      });
      child.on("close", (exitCode, signal) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        request.signal?.removeEventListener("abort", abort);
        resolve({
          exitCode,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          error: spawnError,
          signal,
          aborted: controller.signal.aborted,
          timedOut,
          stdoutTruncated,
          stderrTruncated,
        });
      });
    });
  }
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

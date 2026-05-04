#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const githubRemotePattern = /github\.com[:/][^/\s]+\/[^/\s]+(?:\.git)?$/i;

function defaultRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function firstLine(value) {
  return String(value ?? "").split(/\r?\n/).find(Boolean) ?? "";
}

function pass(id, label, detail) {
  return { id, label, status: "pass", detail };
}

function fail(id, label, detail, remediation) {
  return { id, label, status: "fail", detail, remediation };
}

function skip(id, label, detail) {
  return { id, label, status: "skip", detail };
}

function normalizeElectronCheck(check) {
  const detail = check.detail ?? check.message ?? "Electron dependency check completed.";
  return {
    id: "electron-linux",
    label: "Electron Linux dependencies",
    ...check,
    detail,
  };
}

function commandCheck({ id, label, command, args, cwd, runner, remediation, detailFromStdout = firstLine }) {
  const result = runner(command, args, { cwd });

  if (result.status === 0) {
    return pass(id, label, detailFromStdout(result.stdout) || "Available.");
  }

  return fail(id, label, "Unavailable or returned a non-zero exit code.", remediation);
}

async function defaultCanWriteWorktree(cwd) {
  const probePath = path.join(cwd, `.mergepilot-dogfood-preflight-${process.pid}.tmp`);
  let createdProbe = false;

  try {
    await access(cwd, constants.W_OK);
    await writeFile(probePath, "mergepilot preflight\n", { flag: "wx" });
    createdProbe = true;
    return true;
  } catch {
    return false;
  } finally {
    if (createdProbe) {
      await rm(probePath, { force: true });
    }
  }
}

const modulePath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(modulePath);

async function defaultElectronPreflight(cwd, runner) {
  if (process.platform !== "linux") {
    return skip("electron-linux", "Electron Linux dependencies", "Only required on Linux hosts.");
  }

  const scriptPath = path.join(scriptDir, "preflight-electron-linux.mjs");
  const result = runner(process.execPath, [scriptPath], { cwd });

  if (result.status === 0) {
    return pass("electron-linux", "Electron Linux dependencies", "Required shared libraries found.");
  }

  return fail(
    "electron-linux",
    "Electron Linux dependencies",
    "Missing Linux desktop libraries required by Electron runtime tests.",
    "Run `node scripts/preflight-electron-linux.mjs` for distro-specific package guidance.",
  );
}

function githubAuthCheck(cwd, runner) {
  const result = runner("gh", ["auth", "status"]);

  if (result.status === 0) {
    return pass("github-auth", "GitHub CLI auth", "Authenticated for GitHub CLI operations.");
  }

  return fail(
    "github-auth",
    "GitHub CLI auth",
    "GitHub CLI is not authenticated or cannot verify auth.",
    "Run `gh auth login`, then rerun `node scripts/preflight-dogfood.mjs`.",
  );
}

function originCheck(cwd, runner) {
  const result = runner("git", ["remote", "get-url", "origin"], { cwd });
  const remote = firstLine(result.stdout).trim();

  if (result.status === 0 && githubRemotePattern.test(remote)) {
    return pass("github-origin", "GitHub origin remote", remote.replace(/^https:\/\/[^@]+@/i, "https://"));
  }

  return fail(
    "github-origin",
    "GitHub origin remote",
    "No `origin` remote pointing at github.com was found.",
    "Run `git remote set-url origin git@github.com:<owner>/<repo>.git` or dogfood from a GitHub-backed clone.",
  );
}

async function writableWorktreeCheck(cwd, canWriteWorktree) {
  if (await canWriteWorktree(cwd)) {
    return pass("writable-worktree", "Writable worktree", "Current worktree accepts local writes.");
  }

  return fail(
    "writable-worktree",
    "Writable worktree",
    "Current worktree is not writable.",
    "Fix directory permissions or clone the dogfood repository into a writable path.",
  );
}

export async function buildDogfoodPreflightReport(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  const canWriteWorktree = options.canWriteWorktree ?? defaultCanWriteWorktree;
  const electronPreflight = options.electronPreflight ?? ((checkCwd) => defaultElectronPreflight(checkCwd, runner));

  const checks = [
    commandCheck({
      id: "codex",
      label: "Codex CLI",
      command: "codex",
      args: ["--version"],
      runner,
      remediation: "Install Codex CLI and run `codex --version` locally before dogfooding.",
    }),
    commandCheck({
      id: "git",
      label: "Git",
      command: "git",
      args: ["--version"],
      runner,
      remediation: "Install Git and ensure `git --version` succeeds.",
    }),
    commandCheck({
      id: "github-cli",
      label: "GitHub CLI",
      command: "gh",
      args: ["--version"],
      runner,
      remediation: "Install GitHub CLI and ensure `gh --version` succeeds.",
    }),
    githubAuthCheck(cwd, runner),
    originCheck(cwd, runner),
    await writableWorktreeCheck(cwd, canWriteWorktree),
    normalizeElectronCheck(await electronPreflight(cwd)),
  ];

  return {
    ok: checks.every((check) => check.status !== "fail"),
    cwd,
    checks,
  };
}

export function formatDogfoodPreflightReport(report) {
  const lines = [
    "MergePilot dogfood preflight",
    `Worktree: ${report.cwd}`,
    "",
  ];

  for (const check of report.checks) {
    const marker = check.status.toUpperCase();
    lines.push(`${marker} ${check.label}: ${check.detail}`);

    if (check.remediation) {
      lines.push(`  Fix: ${check.remediation}`);
    }
  }

  lines.push("");
  lines.push(report.ok
    ? "Ready: required dogfood checks passed."
    : "Not ready: fix failed checks before starting a real MergePilot dogfood run.");

  return lines.join("\n");
}

async function main() {
  const cwd = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const report = await buildDogfoodPreflightReport({ cwd });
  const output = formatDogfoodPreflightReport(report);
  const stream = report.ok ? process.stdout : process.stderr;
  stream.write(`${output}\n`);
  process.exit(report.ok ? 0 : 1);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error("Dogfood preflight failed unexpectedly.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

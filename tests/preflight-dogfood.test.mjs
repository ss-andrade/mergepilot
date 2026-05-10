import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildDogfoodPreflightReport,
  formatDogfoodPreflightReport,
} from "../scripts/preflight-dogfood.mjs";

const success = (stdout = "ok\n") => ({ status: 0, stdout, stderr: "" });
const failure = (stderr = "failed\n", status = 1) => ({ status, stdout: "", stderr });

function fakeRunner(results) {
  const calls = [];

  return {
    calls,
    run(command, args) {
      calls.push({ command, args });
      const key = [command, ...args].join(" ");
      const result = results[key];

      if (!result) {
        return failure(`Unexpected command: ${key}`);
      }

      return result;
    },
  };
}

describe("dogfood preflight", () => {
  it("passes when required tools, GitHub auth, repo remote, and worktree are ready", async () => {
    const runner = fakeRunner({
      "codex --version": success("codex-cli 1.2.3\n"),
      "git --version": success("git version 2.44.0\n"),
      "gh --version": success("gh version 2.71.0\n"),
      "gh auth status": success("github.com\n  Logged in to github.com account user\n"),
      "git remote get-url origin": success("git@github.com:owner/repo.git\n"),
    });

    const report = await buildDogfoodPreflightReport({
      cwd: "/repo",
      runner: runner.run,
      electronPreflight: async () => ({ status: "pass", message: "Electron dependencies ready." }),
      canWriteWorktree: async () => true,
    });

    assert.equal(report.ok, true);
    assert.deepEqual(
      report.checks.map((check) => [check.id, check.status]),
      [
        ["codex", "pass"],
        ["git", "pass"],
        ["github-cli", "pass"],
        ["github-auth", "pass"],
        ["github-origin", "pass"],
        ["writable-worktree", "pass"],
        ["electron-linux", "pass"],
      ],
    );
    assert.deepEqual(runner.calls, [
      { command: "codex", args: ["--version"] },
      { command: "git", args: ["--version"] },
      { command: "gh", args: ["--version"] },
      { command: "gh", args: ["auth", "status"] },
      { command: "git", args: ["remote", "get-url", "origin"] },
    ]);
    assert.match(formatDogfoodPreflightReport(report), /PASS Electron Linux dependencies: Electron dependencies ready\./);
  });

  it("fails with clear remediation without exposing command stderr", async () => {
    const runner = fakeRunner({
      "codex --version": failure("DO_NOT_PRINT_ME\n"),
      "git --version": success("git version 2.44.0\n"),
      "gh --version": success("gh version 2.71.0\n"),
      "gh auth status": failure("github.com\n  X not logged in\n  DO_NOT_PRINT_ME\n"),
      "git remote get-url origin": success("https://example.com/owner/repo.git\n"),
    });

    const report = await buildDogfoodPreflightReport({
      cwd: "/repo",
      runner: runner.run,
      electronPreflight: async () => ({ status: "skip", message: "Not Linux." }),
      canWriteWorktree: async () => false,
    });
    const output = formatDogfoodPreflightReport(report);

    assert.equal(report.ok, false);
    assert.match(output, /FAIL Codex CLI/);
    assert.match(output, /run `codex --version` locally/);
    assert.match(output, /FAIL GitHub CLI auth/);
    assert.match(output, /Run `gh auth login`/);
    assert.match(output, /FAIL GitHub origin remote/);
    assert.match(output, /git remote set-url origin/);
    assert.match(output, /FAIL Writable worktree/);
    assert.doesNotMatch(output, /DO_NOT_PRINT_ME/);
  });

  it("reports a missing target worktree as a normal preflight failure", async () => {
    const runner = fakeRunner({
      "codex --version": success("codex-cli 1.2.3\n"),
      "git --version": success("git version 2.44.0\n"),
      "gh --version": success("gh version 2.71.0\n"),
      "gh auth status": success("github.com\n  Logged in to github.com account user\n"),
      "git remote get-url origin": success("git@github.com:owner/repo.git\n"),
    });
    const missingPath = path.join(tmpdir(), `mergepilot-missing-${process.pid}-${Date.now()}`);

    const report = await buildDogfoodPreflightReport({
      cwd: missingPath,
      runner: runner.run,
      electronPreflight: async () => ({ status: "skip", detail: "Not Linux." }),
    });
    const output = formatDogfoodPreflightReport(report);

    assert.equal(report.ok, false);
    assert.match(output, /FAIL Writable worktree/);
    assert.match(output, /Fix directory permissions or clone the dogfood repository/);
    assert.doesNotMatch(output, /Dogfood preflight failed unexpectedly/);
    assert.doesNotMatch(output, /ENOENT/);
  });

  it("sanitizes tokens from successful details and injected check output", async () => {
    const runner = fakeRunner({
      "codex --version": success("codex-cli token=DO_NOT_PRINT_ME\n"),
      "git --version": success("git version 2.44.0\n"),
      "gh --version": success("gh version 2.71.0\n"),
      "gh auth status": success("github.com\n"),
      "git remote get-url origin": success("https://ghp_DO_NOT_PRINT_ME123456789@github.com/owner/repo.git\n"),
    });

    const report = await buildDogfoodPreflightReport({
      cwd: "/repo",
      runner: runner.run,
      electronPreflight: async () => ({
        status: "fail",
        detail: "Missing dependency with password=DO_NOT_PRINT_ME",
        remediation: "Run safe package guidance.",
      }),
      canWriteWorktree: async () => true,
    });
    const output = formatDogfoodPreflightReport(report);

    assert.doesNotMatch(output, /DO_NOT_PRINT_ME/);
    assert.match(output, /\[redacted\]/);
    assert.match(output, /https:\/\/github\.com\/owner\/repo\.git/);
  });

  it("fails when the GitHub origin does not match the expected repository", async () => {
    const runner = fakeRunner({
      "codex --version": success("codex-cli 1.0.0\n"),
      "git --version": success("git version 2.44.0\n"),
      "gh --version": success("gh version 2.71.0\n"),
      "gh auth status": success("github.com\n"),
      "git remote get-url origin": success("https://github.com/other/repo.git\n"),
    });

    const report = await buildDogfoodPreflightReport({
      cwd: "/repo",
      expectedRepo: "owner/repo",
      runner: runner.run,
      electronPreflight: async () => ({ status: "skip", detail: "Only required on Linux hosts." }),
      canWriteWorktree: async () => true,
    });

    assert.equal(report.ok, false);
    assert.match(formatDogfoodPreflightReport(report), /other\/repo, not owner\/repo/);
  });
});

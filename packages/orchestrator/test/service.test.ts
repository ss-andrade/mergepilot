import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalOrchestrator } from "../src/index.js";
import { GitHubCliPullRequestPublisher, deriveGitHubPullRequestReviewResult } from "../src/service.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mergepilot-service-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalOrchestratorService", () => {
  it("does not mark blocked GitHub merge states as ready", () => {
    const result = deriveGitHubPullRequestReviewResult({
      files: [{ path: "src/app.ts" }],
      statusCheckRollup: [{ name: "verify", status: "COMPLETED", conclusion: "SUCCESS" }],
      reviewDecision: "APPROVED",
      mergeStateStatus: "BLOCKED"
    }, "mergepilot/ws/build/run");

    expect(result).toMatchObject({
      checksStatus: "passed",
      reviewStatus: "blocked",
      humanAction: "review"
    });
    expect(result.riskSummary).toContain("BLOCKED");
  });

  it("starts, reports status, serves workstreams and stops", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({ dataDir });

    expect(orchestrator.status()).toMatchObject({ state: "stopped" });

    await orchestrator.start();
    expect(orchestrator.status()).toMatchObject({ state: "running", dataDir });

    const workstream = orchestrator.createWorkstream({
      title: "Service workstream",
      goal: "Exercise service behavior.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    expect(orchestrator.updateWorkstreamStatus(workstream.id, "planning")).toMatchObject({ status: "planning" });
    orchestrator.appendEvent({
      workstreamId: workstream.id,
      type: "coordinator_message",
      message: "Service ready"
    });

    expect(orchestrator.listWorkstreams()).toEqual([
      expect.objectContaining({
        id: workstream.id,
        goal: "Exercise service behavior.",
        repo: "ss-andrade/mergepilot",
        createdBy: "hermes",
        status: "planning"
      })
    ]);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({
      id: workstream.id,
      title: "Service workstream"
    });
    expect(orchestrator.listEvents(workstream.id)).toEqual([
      expect.objectContaining({ type: "coordinator_message" })
    ]);

    await orchestrator.stop();
    expect(orchestrator.status()).toMatchObject({ state: "stopped" });
  });

  it("serves GitHub repository connections through the local service", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({ dataDir });
    await orchestrator.start();

    const repository = orchestrator.connectGitHubRepository({
      owner: "ss-andrade",
      name: "mergepilot",
      defaultBranch: "main"
    });

    expect(orchestrator.selectGitHubRepository(repository.id)).toMatchObject({
      id: repository.id,
      selectedAt: expect.any(String)
    });
    expect(orchestrator.listGitHubRepositories()).toEqual([
      expect.objectContaining({
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main"
      })
    ]);

    await orchestrator.stop();
  });

  it("serves the coordinator planning approval loop", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({ dataDir });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Service planning",
      goal: "Create a visible plan before execution.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");

    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });

    expect(plan).toMatchObject({
      workstreamId: workstream.id,
      goalRestatement: "Create a visible plan before execution.",
      status: "draft"
    });
    expect(orchestrator.listPlans(workstream.id)).toEqual([expect.objectContaining({ id: plan.id })]);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_plan_approval" });
    expect(orchestrator.listEvents(workstream.id)).toEqual([
      expect.objectContaining({ type: "plan_created", payload: expect.objectContaining({ planId: plan.id }) })
    ]);

    expect(orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id })).toMatchObject({
      id: plan.id,
      status: "approved"
    });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "running" });
    expect(orchestrator.listEvents(workstream.id).at(-1)).toMatchObject({
      type: "plan_approved",
      payload: expect.objectContaining({ planId: plan.id, unlocksExecution: true })
    });

    await orchestrator.stop();
  });

  it("starts a scoped build-agent run from an approved plan and records runtime evidence", async () => {
    const dataDir = await createTempDir();
    const adapterRun = vi.fn(async (input) => ({
      runId: input.runId,
      providerId: "fake-agent",
      adapterId: "fake-build",
      events: (async function* () {
        yield {
          type: "lifecycle" as const,
          status: "started" as const,
          runId: input.runId,
          providerId: "fake-agent",
          timestamp: "2026-05-02T00:00:01.000Z",
          message: "Fake build agent started."
        };
        yield {
          type: "command" as const,
          runId: input.runId,
          providerId: "fake-agent",
          timestamp: "2026-05-02T00:00:02.000Z",
          command: "npm test -- --runInBand",
          cwd: input.workspacePath
        };
        yield {
          type: "artifact" as const,
          artifactType: "diff" as const,
          runId: input.runId,
          providerId: "fake-agent",
          timestamp: "2026-05-02T00:00:03.000Z",
          content: "diff --git a/app.ts b/app.ts"
        };
      })(),
      result: Promise.resolve({
        runId: input.runId,
        providerId: "fake-agent",
        adapterId: "fake-build",
        status: "completed" as const,
        summary: "Implemented the approved build task and tests passed.",
        startedAt: "2026-05-02T00:00:01.000Z",
        completedAt: "2026-05-02T00:00:04.000Z",
        artifacts: [
          {
            type: "artifact" as const,
            artifactType: "summary" as const,
            runId: input.runId,
            providerId: "fake-agent",
            timestamp: "2026-05-02T00:00:04.000Z",
            content: "Implemented the approved build task and tests passed."
          }
        ]
      }),
      cancel: async () => undefined
    }));
    const orchestrator = createLocalOrchestrator({
      dataDir,
      buildAgentAdapter: {
        metadata: {
          providerId: "fake-agent",
          adapterId: "fake-build",
          displayName: "Fake Build Agent",
          capabilities: {
            streamingEvents: true,
            cancellation: true,
            structuredResults: true,
            sessionResume: false
          }
        },
        detect: async () => ({ providerId: "fake-agent", status: "available", checkedAt: "2026-05-02T00:00:00.000Z" }),
        health: async () => ({ providerId: "fake-agent", status: "healthy", checkedAt: "2026-05-02T00:00:00.000Z" }),
        run: adapterRun
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Build loop",
      goal: "Run a deterministic build task.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });

    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });

    expect(run).toMatchObject({
      workstreamId: workstream.id,
      planId: plan.id,
      providerId: "fake-agent",
      adapterId: "fake-build",
      role: "build",
      status: "completed",
      summary: "Implemented the approved build task and tests passed.",
      workspacePath: expect.stringContaining(path.join(dataDir, "workspaces", workstream.id))
    });
    expect(adapterRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: run.id,
        workstreamId: workstream.id,
        role: "build",
        goal: "Run a deterministic build task.",
        workspacePath: run.workspacePath,
        repoPath: "ss-andrade/mergepilot",
        branchName: expect.stringContaining(`mergepilot/${workstream.id}/build/`),
        instructions: expect.stringContaining(plan.goalRestatement),
        metadata: expect.objectContaining({ planId: plan.id })
      })
    );
    expect(orchestrator.listAgentRuns(workstream.id)).toEqual([expect.objectContaining({ id: run.id, status: "completed" })]);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({
      status: "awaiting_review",
      summary: "Implemented the approved build task and tests passed."
    });
    expect(orchestrator.listEvents(workstream.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "agent_started", payload: expect.objectContaining({ runId: run.id, workspacePath: run.workspacePath }) }),
        expect.objectContaining({ type: "command_ran", payload: expect.objectContaining({ runId: run.id, command: "npm test -- --runInBand", exitCode: null }) }),
        expect.objectContaining({ type: "agent_completed", payload: expect.objectContaining({ runId: run.id, summary: run.summary, diff: expect.any(String) }) })
      ])
    );

    await orchestrator.stop();
  });

  it("surfaces build-agent adapter failures as human action instead of fake success", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      buildAgentAdapter: {
        metadata: {
          providerId: "codex",
          adapterId: "codex",
          displayName: "OpenAI Codex",
          capabilities: {
            streamingEvents: true,
            cancellation: true,
            structuredResults: false,
            sessionResume: false
          }
        },
        detect: async () => ({ providerId: "codex", status: "available", checkedAt: "2026-05-04T00:00:00.000Z" }),
        health: async () => ({ providerId: "codex", status: "degraded", checkedAt: "2026-05-04T00:00:00.000Z" }),
        run: vi.fn(async () => {
          throw new Error("Codex CLI is not authenticated.");
        })
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Codex failure",
      goal: "Surface Codex execution failures.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });

    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });

    expect(run).toMatchObject({
      providerId: "codex",
      adapterId: "codex",
      status: "failed",
      summary: "Codex CLI is not authenticated."
    });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({
      status: "awaiting_user_input",
      summary: "Codex CLI is not authenticated."
    });
    expect(orchestrator.listEvents(workstream.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "human_action_required",
          message: "Build agent run failed.",
          payload: expect.objectContaining({ runId: run.id, errorMessage: "Codex CLI is not authenticated." })
        })
      ])
    );
    expect(orchestrator.listEvents(workstream.id)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "agent_completed", payload: expect.objectContaining({ runId: run.id }) })
      ])
    );

    await orchestrator.stop();
  });

  it("opens a pull request from a completed build-agent run and links it to the timeline", async () => {
    const dataDir = await createTempDir();
    const pullRequestPublisher = {
      openPullRequest: vi.fn(async (input) => ({
        branchName: input.agentRun.branchName ?? "mergepilot/ws-1/build/run-1",
        commitSha: "abc123def456",
        prNumber: 42,
        prUrl: "https://github.com/ss-andrade/mergepilot/pull/42"
      }))
    };
    const pullRequestReviewProvider = {
      syncPullRequestReview: vi.fn(async () => ({
        checksStatus: "passed" as const,
        reviewStatus: "ready" as const,
        changedFiles: ["src/app.ts"],
        testCommands: ["npm test"],
        ciSummary: "CI passed",
        riskSummary: "Low risk",
        reviewSummary: "CI passed and the PR is ready for merge.",
        humanAction: "merge" as const
      }))
    };
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher, pullRequestReviewProvider });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Branch and PR",
      goal: "Open a pull request from completed agent work.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });

    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(pullRequestPublisher.openPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        workstream: expect.objectContaining({ id: workstream.id }),
        agentRun: expect.objectContaining({ id: run.id, branchName: run.branchName }),
        title: "Branch and PR: build-agent changes"
      })
    );
    expect(pullRequest).toMatchObject({
      workstreamId: workstream.id,
      agentRunId: run.id,
      branchName: run.branchName,
      commitSha: "abc123def456",
      prNumber: 42,
      prUrl: "https://github.com/ss-andrade/mergepilot/pull/42",
      status: "open"
    });
    expect(orchestrator.listPullRequests(workstream.id)).toEqual([expect.objectContaining({ id: pullRequest.id })]);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_review" });
    expect(orchestrator.listEvents(workstream.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "commit_created", payload: expect.objectContaining({ commitSha: "abc123def456" }) }),
        expect.objectContaining({ type: "branch_pushed", payload: expect.objectContaining({ branchName: run.branchName }) }),
        expect.objectContaining({ type: "pr_opened", message: expect.stringContaining("https://github.com/ss-andrade/mergepilot/pull/42") })
      ])
    );

    await expect(orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id })).resolves.toMatchObject({ id: pullRequest.id });
    expect(pullRequestPublisher.openPullRequest).toHaveBeenCalledTimes(1);

    const reviewed = await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });

    expect(reviewed).toMatchObject({
      id: pullRequest.id,
      checksStatus: "passed",
      reviewStatus: "ready",
      humanAction: "merge"
    });
    expect(reviewed.changedFiles).toContain("src/app.ts");
    expect(reviewed.testCommands).toContain("npm test");
    expect(reviewed.reviewSummary).toContain("CI passed");
    expect(reviewed.riskSummary).toContain("Low risk");
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "merge_ready" });
    expect(orchestrator.listEvents(workstream.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "ci_passed", payload: expect.objectContaining({ checksStatus: "passed" }) }),
        expect.objectContaining({ type: "review_summary_created", payload: expect.objectContaining({ humanAction: "merge" }) }),
        expect.objectContaining({ type: "human_action_required", message: "Review complete; ready for merge." })
      ])
    );

    expect(pullRequestReviewProvider.syncPullRequestReview).toHaveBeenCalledWith({
      workstream: expect.objectContaining({ id: workstream.id }),
      pullRequest: expect.objectContaining({ id: pullRequest.id })
    });

    await orchestrator.stop();
  });

  it("rejects inconsistent merge-ready review sync results", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestReviewProvider: {
        syncPullRequestReview: vi.fn(async () => ({
          checksStatus: "failed" as const,
          reviewStatus: "blocked" as const,
          changedFiles: ["src/app.ts"],
          testCommands: ["npm test"],
          ciSummary: "CI failed",
          riskSummary: "Blocking failures remain.",
          reviewSummary: "CI failed and cannot merge.",
          humanAction: "merge" as const
        }))
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Bad review", goal: "Reject invalid review state.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    await expect(orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id })).rejects.toThrow(/passed checks/i);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_review" });

    await orchestrator.stop();
  });

  it("rejects stale pull request syncs from terminal workstream states", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestReviewProvider: {
        syncPullRequestReview: vi.fn(async () => ({
          checksStatus: "passed" as const,
          reviewStatus: "ready" as const,
          changedFiles: ["src/app.ts"],
          testCommands: ["npm test"],
          ciSummary: "CI passed",
          riskSummary: "Low risk",
          reviewSummary: "Ready to merge",
          humanAction: "merge" as const
        }))
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Terminal PR", goal: "Do not reopen completed workstreams.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });
    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    orchestrator.updateWorkstreamStatus(workstream.id, "completed");

    await expect(orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id })).rejects.toThrow(/Invalid workstream status transition/i);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "completed" });

    await orchestrator.stop();
  });

  it("rejects review resyncs that would regress merge-ready workstreams", async () => {
    const dataDir = await createTempDir();
    let ready = true;
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestReviewProvider: {
        syncPullRequestReview: vi.fn(async () => ready
          ? ({
              checksStatus: "passed" as const,
              reviewStatus: "ready" as const,
              changedFiles: ["src/app.ts"],
              testCommands: ["npm test"],
              ciSummary: "CI passed",
              riskSummary: "Low risk",
              reviewSummary: "Ready to merge",
              humanAction: "merge" as const
            })
          : ({
              checksStatus: "failed" as const,
              reviewStatus: "blocked" as const,
              changedFiles: ["src/app.ts"],
              testCommands: ["npm test"],
              ciSummary: "CI failed",
              riskSummary: "Blocking failures remain.",
              reviewSummary: "Not ready",
              humanAction: "review" as const
            }))
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Merge-ready PR", goal: "Do not regress status from stale sync.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });
    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "merge_ready" });
    ready = false;

    await expect(orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id })).rejects.toThrow(/Invalid workstream status transition/i);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "merge_ready" });

    await orchestrator.stop();
  });

  it("moves blocked review sync results to awaiting user input", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestReviewProvider: {
        syncPullRequestReview: vi.fn(async () => ({
          checksStatus: "unknown" as const,
          reviewStatus: "blocked" as const,
          changedFiles: ["PR metadata unavailable"],
          testCommands: ["GitHub PR checks sync"],
          ciSummary: "Unable to sync PR checks through GitHub CLI.",
          riskSummary: "Merge readiness could not be verified.",
          reviewSummary: "Unable to sync PR checks through GitHub CLI.",
          humanAction: "fix_access" as const
        }))
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Blocked review", goal: "Surface access failures.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    const reviewed = await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });

    expect(reviewed).toMatchObject({ checksStatus: "unknown", reviewStatus: "blocked", humanAction: "fix_access" });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });

    await orchestrator.stop();
  });

  it("allows pull request review sync to recover after human action", async () => {
    const dataDir = await createTempDir();
    let mode: "blocked" | "pending" | "ready" = "blocked";
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestReviewProvider: {
        syncPullRequestReview: vi.fn(async () => {
          if (mode === "blocked") {
            return {
              checksStatus: "unknown" as const,
              reviewStatus: "blocked" as const,
              changedFiles: ["PR metadata unavailable"],
              testCommands: ["GitHub PR checks sync"],
              ciSummary: "Unable to sync PR checks through GitHub CLI.",
              riskSummary: "Merge readiness could not be verified.",
              reviewSummary: "Unable to sync PR checks through GitHub CLI.",
              humanAction: "fix_access" as const
            };
          }
          if (mode === "pending") {
            return {
              checksStatus: "pending" as const,
              reviewStatus: "not_started" as const,
              changedFiles: ["src/app.ts"],
              testCommands: ["npm test"],
              ciSummary: "CI pending",
              riskSummary: "Checks are still running.",
              reviewSummary: "CI is still pending.",
              humanAction: "review" as const
            };
          }
          return {
            checksStatus: "passed" as const,
            reviewStatus: "ready" as const,
            changedFiles: ["src/app.ts"],
            testCommands: ["npm test"],
            ciSummary: "CI passed",
            riskSummary: "Low risk",
            reviewSummary: "Ready to merge",
            humanAction: "merge" as const
          };
        })
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Recover review", goal: "Recover after fixing human action.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });
    mode = "pending";
    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_review" });
    mode = "blocked";
    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });
    mode = "ready";
    await orchestrator.syncPullRequestReview({ workstreamId: workstream.id, pullRequestId: pullRequest.id });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "merge_ready" });

    await orchestrator.stop();
  });

  it("rejects review records for failed pull request publications", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestPublisher: {
        openPullRequest: vi.fn(async () => {
          throw new Error("GitHub access denied");
        })
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({ title: "Failed PR", goal: "Do not review failed PR records.", repo: "ss-andrade/mergepilot", createdBy: "hermes" });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    const failedPullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(() => orchestrator.recordPullRequestReview({
      workstreamId: workstream.id,
      pullRequestId: failedPullRequest.id,
      checksStatus: "passed",
      reviewStatus: "ready",
      changedFiles: ["src/app.ts"],
      testCommands: ["npm test"],
      ciSummary: "CI passed",
      riskSummary: "Low risk",
      reviewSummary: "Ready",
      humanAction: "merge"
    })).toThrow(/open pull request/i);
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });

    await orchestrator.stop();
  });

  it("blocks concurrent pull request publication for the same agent run", async () => {
    const dataDir = await createTempDir();
    let releasePublisher!: () => void;
    let publisherStarted!: () => void;
    const publisherStartedPromise = new Promise<void>((resolve) => {
      publisherStarted = resolve;
    });
    const releasePublisherPromise = new Promise<void>((resolve) => {
      releasePublisher = resolve;
    });
    const pullRequestPublisher = {
      openPullRequest: vi.fn(async (input) => {
        publisherStarted();
        await releasePublisherPromise;
        return {
          branchName: input.agentRun.branchName ?? "mergepilot/ws-1/build/run-1",
          commitSha: "abc123def456",
          prNumber: 42,
          prUrl: "https://github.com/ss-andrade/mergepilot/pull/42"
        };
      })
    };
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Concurrent PR",
      goal: "Avoid duplicate pull request publication.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });

    const firstOpen = orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });
    await publisherStartedPromise;

    await expect(orchestrator.stop()).rejects.toThrow(/active/i);
    await expect(orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id })).rejects.toThrow(/already being opened/i);

    releasePublisher();
    await expect(firstOpen).resolves.toMatchObject({ status: "open", prNumber: 42 });
    expect(pullRequestPublisher.openPullRequest).toHaveBeenCalledTimes(1);
    expect(orchestrator.listPullRequests(workstream.id).filter((pullRequest) => pullRequest.status === "open")).toHaveLength(1);

    await orchestrator.stop();
  });

  it("creates a human attention item when pull request publication fails", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({
      dataDir,
      pullRequestPublisher: {
        openPullRequest: vi.fn(async () => {
          throw new Error("push rejected");
        })
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "PR failure",
      goal: "Surface failed branch publication.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = await orchestrator.startBuildAgentRun({ workstreamId: workstream.id });

    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(pullRequest).toMatchObject({ status: "failed", errorMessage: "push rejected", prUrl: null });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });
    expect(orchestrator.listEvents(workstream.id).at(-1)).toMatchObject({
      type: "human_action_required",
      message: "Pull request creation failed.",
      payload: expect.objectContaining({ errorMessage: "push rejected" })
    });

    await orchestrator.stop();
  });

  it("publishes completed build-agent changes through git and GitHub CLI", async () => {
    const dataDir = await createTempDir();
    const workspacePath = path.join(dataDir, "workspace");
    const commands: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const pullRequestPublisher = new GitHubCliPullRequestPublisher({
      command: async (command, args, options) => {
        commands.push({ command, args, cwd: options.cwd });
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M packages/orchestrator/src/service.ts\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url origin") {
          return { stdout: "git@github.com:ss-andrade/mergepilot.git\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url --push --all origin") {
          return { stdout: "https://github.com/ss-andrade/mergepilot.git\n" };
        }
        if (command === "git" && args.join(" ") === "rev-parse HEAD") {
          return { stdout: "abc123def456\n" };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return { stdout: "https://github.com/ss-andrade/mergepilot/pull/42\n" };
        }
        return { stdout: "" };
      }
    });
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Real PR",
      goal: "Publish real build-agent work.",
      repo: "ss-andrade/mergepilot",
      githubRepository: { owner: "ss-andrade", name: "mergepilot", defaultBranch: "main" },
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = orchestrator.createAgentRun({
      workstreamId: workstream.id,
      planId: plan.id,
      providerId: "codex",
      role: "build",
      status: "completed",
      goal: workstream.goal,
      workspacePath,
      branchName: `mergepilot/${workstream.id}/build/run-1`
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "awaiting_review");

    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(pullRequest).toMatchObject({
      branchName: run.branchName,
      commitSha: "abc123def456",
      prNumber: 42,
      prUrl: "https://github.com/ss-andrade/mergepilot/pull/42",
      status: "open"
    });
    expect(commands.map((entry) => [entry.command, entry.args])).toEqual([
      ["git", ["status", "--porcelain"]],
      ["git", ["remote", "get-url", "origin"]],
      ["git", ["remote", "get-url", "--push", "--all", "origin"]],
      ["gh", ["auth", "status"]],
      ["git", ["checkout", "-B", run.branchName]],
      ["git", ["add", "-A"]],
      ["git", ["commit", "-m", "Real PR: build-agent changes", "-m", expect.stringContaining(workstream.id)]],
      ["git", ["rev-parse", "HEAD"]],
      ["git", ["push", "--set-upstream", "origin", run.branchName]],
      ["gh", ["pr", "create", "--repo", "ss-andrade/mergepilot", "--base", "main", "--head", run.branchName, "--title", "Real PR: build-agent changes", "--body", expect.stringContaining(workstream.id)]]
    ]);
    expect(commands.every((entry) => entry.cwd === workspacePath)).toBe(true);

    await orchestrator.stop();
  });

  it("records no-change real publisher runs as failed pull requests requiring human action", async () => {
    const dataDir = await createTempDir();
    const pullRequestPublisher = new GitHubCliPullRequestPublisher({
      command: async () => ({ stdout: "" })
    });
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "No changes",
      goal: "Do not publish empty work.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = orchestrator.createAgentRun({
      workstreamId: workstream.id,
      planId: plan.id,
      providerId: "codex",
      role: "build",
      status: "completed",
      goal: workstream.goal,
      workspacePath: path.join(dataDir, "workspace"),
      branchName: `mergepilot/${workstream.id}/build/run-1`
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "awaiting_review");

    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(pullRequest).toMatchObject({
      status: "failed",
      branchName: run.branchName,
      prNumber: null,
      prUrl: null,
      errorMessage: expect.stringMatching(/no file changes/i)
    });
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "awaiting_user_input" });

    await orchestrator.stop();
  });

  it("surfaces missing GitHub CLI authentication as a real publisher failure", async () => {
    const dataDir = await createTempDir();
    const pullRequestPublisher = new GitHubCliPullRequestPublisher({
      command: async (command, args) => {
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M README.md\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url origin") {
          return { stdout: "https://github.com/ss-andrade/mergepilot.git\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url --push --all origin") {
          return { stdout: "https://github.com/ss-andrade/mergepilot.git\n" };
        }
        if (command === "gh" && args.join(" ") === "auth status") {
          throw new Error("gh auth status failed");
        }
        return { stdout: "" };
      }
    });
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Auth failure",
      goal: "Surface GitHub auth failures.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });
    const run = orchestrator.createAgentRun({
      workstreamId: workstream.id,
      planId: plan.id,
      providerId: "codex",
      role: "build",
      status: "completed",
      goal: workstream.goal,
      workspacePath: path.join(dataDir, "workspace"),
      branchName: `mergepilot/${workstream.id}/build/run-1`
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "awaiting_review");

    const pullRequest = await orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id });

    expect(pullRequest).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("gh auth status failed")
    });

    await orchestrator.stop();
  });

  it("refuses to publish when the workspace origin does not match the selected repository", async () => {
    const publisher = new GitHubCliPullRequestPublisher({
      command: async (command, args) => {
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M README.md\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url origin") {
          return { stdout: "git@github.com:someone-else/wrong-repo.git\n" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      }
    });

    await expect(publisher.openPullRequest({
      workstream: {
        id: "ws-1",
        title: "Wrong origin",
        goal: "Validate workspace remote.",
        status: "awaiting_review",
        repo: "ss-andrade/mergepilot",
        githubRepository: { owner: "ss-andrade", name: "mergepilot", defaultBranch: "main" },
        createdBy: "hermes",
        summary: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      agentRun: {
        id: "run-1",
        workstreamId: "ws-1",
        planId: null,
        providerId: "codex",
        adapterId: "codex",
        role: "build",
        status: "completed",
        goal: "Validate workspace remote.",
        workspacePath: "/tmp/workspace",
        branchName: "mergepilot/ws-1/build/run-1",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      title: "Wrong origin",
      body: "Body"
    })).rejects.toThrow(/workspace origin/i);
  });

  it("refuses to publish when the workspace push origin does not match the selected repository", async () => {
    const publisher = new GitHubCliPullRequestPublisher({
      command: async (command, args) => {
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return { stdout: " M README.md\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url origin") {
          return { stdout: "https://github.com/ss-andrade/mergepilot.git\n" };
        }
        if (command === "git" && args.join(" ") === "remote get-url --push --all origin") {
          return { stdout: "https://github.com/ss-andrade/mergepilot.git\nssh://git@evil.example.com/some/repo.git\n" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      }
    });

    await expect(publisher.openPullRequest({
      workstream: {
        id: "ws-1",
        title: "Wrong push origin",
        goal: "Validate workspace push remote.",
        status: "awaiting_review",
        repo: "ss-andrade/mergepilot",
        githubRepository: { owner: "ss-andrade", name: "mergepilot", defaultBranch: "main" },
        createdBy: "hermes",
        summary: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      agentRun: {
        id: "run-1",
        workstreamId: "ws-1",
        planId: null,
        providerId: "codex",
        adapterId: "codex",
        role: "build",
        status: "completed",
        goal: "Validate workspace push remote.",
        workspacePath: "/tmp/workspace",
        branchName: "mergepilot/ws-1/build/run-1",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      title: "Wrong push origin",
      body: "Body"
    })).rejects.toThrow(/push origin/i);
  });

  it("validates repository scope and branch metadata before real publishing", async () => {
    const publisher = new GitHubCliPullRequestPublisher({
      command: vi.fn(async () => ({ stdout: "" }))
    });

    await expect(publisher.openPullRequest({
      workstream: {
        id: "ws-1",
        title: "Bad scope",
        goal: "Validate repository metadata.",
        status: "awaiting_review",
        repo: "ss-andrade/mergepilot",
        githubRepository: { owner: "other", name: "mergepilot", defaultBranch: "main" },
        createdBy: "hermes",
        summary: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      agentRun: {
        id: "run-1",
        workstreamId: "ws-1",
        planId: null,
        providerId: "codex",
        adapterId: "codex",
        role: "build",
        status: "completed",
        goal: "Validate repository metadata.",
        workspacePath: "/tmp/workspace",
        branchName: "mergepilot/ws-1/build/run-1",
        summary: null,
        startedAt: null,
        completedAt: null,
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z"
      },
      title: "Bad scope",
      body: "Body"
    })).rejects.toThrow(/connected GitHub repository/i);
  });

  it("keeps active build-agent runs lifecycle-safe until they settle", async () => {
    const dataDir = await createTempDir();
    let releaseRun!: () => void;
    let adapterStarted!: () => void;
    const adapterStartedPromise = new Promise<void>((resolve) => {
      adapterStarted = resolve;
    });
    const releaseRunPromise = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const orchestrator = createLocalOrchestrator({
      dataDir,
      buildAgentAdapter: {
        metadata: {
          providerId: "slow-agent",
          adapterId: "slow-build",
          displayName: "Slow Build Agent",
          capabilities: {
            streamingEvents: true,
            cancellation: false,
            structuredResults: true,
            sessionResume: false
          }
        },
        detect: async () => ({ providerId: "slow-agent", status: "available", checkedAt: "2026-05-02T00:00:00.000Z" }),
        health: async () => ({ providerId: "slow-agent", status: "healthy", checkedAt: "2026-05-02T00:00:00.000Z" }),
        run: async (input) => {
          adapterStarted();
          return {
            runId: input.runId,
            providerId: "slow-agent",
            adapterId: "slow-build",
            events: (async function* () {
              yield {
                type: "command" as const,
                runId: input.runId,
                providerId: "slow-agent",
                timestamp: "2026-05-02T00:00:01.000Z",
                command: "npm test",
                cwd: input.workspacePath,
                exitCode: 0
              };
              await releaseRunPromise;
            })(),
            result: releaseRunPromise.then(() => ({
              runId: input.runId,
              providerId: "slow-agent",
              adapterId: "slow-build",
              status: "completed" as const,
              summary: "Slow build finished.",
              startedAt: "2026-05-02T00:00:01.000Z",
              completedAt: "2026-05-02T00:00:02.000Z"
            })),
            cancel: async () => undefined
          };
        }
      }
    });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Slow build loop",
      goal: "Exercise active-run lifecycle safety.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    orchestrator.updateWorkstreamStatus(workstream.id, "planning");
    const plan = orchestrator.proposePlan({ workstreamId: workstream.id });
    orchestrator.approvePlan({ workstreamId: workstream.id, planId: plan.id });

    const runPromise = orchestrator.startBuildAgentRun({ workstreamId: workstream.id });
    await adapterStartedPromise;

    await expect(orchestrator.stop()).rejects.toThrow(/active/i);
    await expect(orchestrator.startBuildAgentRun({ workstreamId: workstream.id })).rejects.toThrow(/already active/i);

    releaseRun();
    await expect(runPromise).resolves.toMatchObject({ status: "completed", summary: "Slow build finished." });
    await expect(orchestrator.stop()).resolves.toBeUndefined();
  });

  it("does not start a build-agent run before plan approval", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({ dataDir });
    await orchestrator.start();
    const workstream = orchestrator.createWorkstream({
      title: "Blocked build loop",
      goal: "Require approval before execution.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    await expect(orchestrator.startBuildAgentRun({ workstreamId: workstream.id })).rejects.toThrow(/approved plan/i);
    expect(orchestrator.listAgentRuns(workstream.id)).toEqual([]);

    await orchestrator.stop();
  });

  it("rejects data operations while stopped", async () => {
    const orchestrator = createLocalOrchestrator({ dataDir: await createTempDir() });

    expect(() => orchestrator.listWorkstreams()).toThrow(/not running/i);
  });
});

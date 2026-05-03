import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalOrchestrator } from "../src/index.js";

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
    const orchestrator = createLocalOrchestrator({ dataDir, pullRequestPublisher });
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
    expect(orchestrator.getWorkstream(workstream.id)).toMatchObject({ status: "merge_ready" });
    expect(orchestrator.listEvents(workstream.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "commit_created", payload: expect.objectContaining({ commitSha: "abc123def456" }) }),
        expect.objectContaining({ type: "branch_pushed", payload: expect.objectContaining({ branchName: run.branchName }) }),
        expect.objectContaining({ type: "pr_opened", message: expect.stringContaining("https://github.com/ss-andrade/mergepilot/pull/42") })
      ])
    );

    await expect(orchestrator.openPullRequest({ workstreamId: workstream.id, agentRunId: run.id })).resolves.toMatchObject({ id: pullRequest.id });
    expect(pullRequestPublisher.openPullRequest).toHaveBeenCalledTimes(1);

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

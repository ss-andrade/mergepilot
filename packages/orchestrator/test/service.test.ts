import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

  it("rejects data operations while stopped", async () => {
    const orchestrator = createLocalOrchestrator({ dataDir: await createTempDir() });

    expect(() => orchestrator.listWorkstreams()).toThrow(/not running/i);
  });
});

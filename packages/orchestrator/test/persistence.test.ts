import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteOrchestratorStore } from "../src/index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mergepilot-orchestrator-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SqliteOrchestratorStore", () => {
  it("persists workstreams across store instances", async () => {
    const dataDir = await createTempDir();
    const first = createSqliteOrchestratorStore({ dataDir });

    const created = first.createWorkstream({
      title: "Add orchestrator foundation",
      repositoryPath: "/tmp/mergepilot",
      description: "Track local work and event history."
    });
    first.close();

    const second = createSqliteOrchestratorStore({ dataDir });

    expect(second.listWorkstreams()).toEqual([
      expect.objectContaining({
        id: created.id,
        title: "Add orchestrator foundation",
        repositoryPath: "/tmp/mergepilot",
        status: "active"
      })
    ]);
    expect(second.getWorkstream(created.id)).toMatchObject({ id: created.id });
    second.close();
  });

  it("appends and reads ordered timeline events with structured payloads", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({ title: "Timeline coverage" });

    const first = store.appendEvent({
      workstreamId: workstream.id,
      type: "workstream.created",
      message: "Workstream created",
      payload: { source: "test" }
    });
    const second = store.appendEvent({
      workstreamId: workstream.id,
      type: "agent.run.started",
      message: "Agent run started"
    });

    expect(store.listEvents(workstream.id)).toEqual([
      expect.objectContaining({
        id: first.id,
        sequence: 1,
        payload: { source: "test" }
      }),
      expect.objectContaining({
        id: second.id,
        sequence: 2,
        payload: null
      })
    ]);
    store.close();
  });

  it("creates plans and agent runs linked to a workstream", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({ title: "Agent run coverage" });

    const plan = store.createPlan({
      workstreamId: workstream.id,
      title: "Implementation plan",
      body: "Add persistence, services, and IPC.",
      status: "draft"
    });
    const run = store.createAgentRun({
      workstreamId: workstream.id,
      providerId: "codex",
      role: "build",
      status: "queued",
      goal: "Implement the orchestrator foundation."
    });

    expect(store.listPlans(workstream.id)).toEqual([expect.objectContaining({ id: plan.id })]);
    expect(store.listAgentRuns(workstream.id)).toEqual([expect.objectContaining({ id: run.id })]);
    store.close();
  });

  it("rejects invalid plan and agent run statuses at runtime", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({ title: "Runtime validation" });

    expect(() => store.createPlan({
      workstreamId: workstream.id,
      title: "Bad plan",
      body: "Invalid status",
      status: "done" as never
    })).toThrow(/plan status/i);
    expect(() => store.createAgentRun({
      workstreamId: workstream.id,
      providerId: "codex",
      role: "build",
      goal: "Invalid status",
      status: "waiting" as never
    })).toThrow(/agent run status/i);
    store.close();
  });
});

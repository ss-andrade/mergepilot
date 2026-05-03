import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
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
      goal: "Track local work and event history.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes",
      summary: "Build the local orchestration model."
    });
    first.close();

    const second = createSqliteOrchestratorStore({ dataDir });

    expect(second.listWorkstreams()).toEqual([
      expect.objectContaining({
        id: created.id,
        title: "Add orchestrator foundation",
        goal: "Track local work and event history.",
        repo: "ss-andrade/mergepilot",
        createdBy: "hermes",
        summary: "Build the local orchestration model.",
        status: "draft"
      })
    ]);
    expect(second.getWorkstream(created.id)).toMatchObject({
      id: created.id,
      title: "Add orchestrator foundation",
      goal: "Track local work and event history.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes",
      summary: "Build the local orchestration model.",
      status: "draft",
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    second.close();
  });

  it("migrates legacy workstream data without dropping linked records", async () => {
    const dataDir = await createTempDir();
    const databasePath = path.join(dataDir, "mergepilot.sqlite3");
    const legacy = new Database(databasePath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE workstreams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        repository_path TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE workstream_events (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(workstream_id, sequence)
      );
      CREATE TABLE plans (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        adapter_id TEXT,
        role TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
        goal TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacy.prepare(`
      INSERT INTO workstreams (id, title, description, repository_path, status, created_at, updated_at)
      VALUES ('legacy-ws', 'Legacy work', 'Legacy description', '/tmp/repo', 'active', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')
    `).run();
    legacy.prepare(`
      INSERT INTO workstream_events (id, workstream_id, sequence, type, message, payload_json, created_at)
      VALUES ('legacy-event', 'legacy-ws', 1, 'workstream.created', 'Created before migration', '{"ok":true}', '2026-05-01T00:00:01.000Z')
    `).run();
    legacy.prepare(`
      INSERT INTO plans (id, workstream_id, title, body, status, created_at, updated_at)
      VALUES ('legacy-plan', 'legacy-ws', 'Legacy plan', 'Plan body', 'draft', '2026-05-01T00:00:02.000Z', '2026-05-01T00:00:02.000Z')
    `).run();
    legacy.prepare(`
      INSERT INTO agent_runs (id, workstream_id, provider_id, adapter_id, role, status, goal, started_at, completed_at, created_at, updated_at)
      VALUES ('legacy-run', 'legacy-ws', 'codex', NULL, 'build', 'queued', 'Run goal', NULL, NULL, '2026-05-01T00:00:03.000Z', '2026-05-01T00:00:03.000Z')
    `).run();
    legacy.close();

    const migrated = createSqliteOrchestratorStore({ dataDir });

    expect(migrated.getWorkstream("legacy-ws")).toMatchObject({
      id: "legacy-ws",
      title: "Legacy work",
      goal: "Legacy description",
      repo: "/tmp/repo",
      createdBy: "legacy",
      summary: "Legacy description",
      status: "running"
    });
    expect(migrated.listEvents("legacy-ws")).toEqual([expect.objectContaining({ id: "legacy-event" })]);
    expect(migrated.listPlans("legacy-ws")).toEqual([expect.objectContaining({ id: "legacy-plan" })]);
    expect(migrated.listAgentRuns("legacy-ws")).toEqual([expect.objectContaining({ id: "legacy-run" })]);
    migrated.close();
  });

  it("creates canonical workstreams and validates status transitions", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const created = store.createWorkstream({
      title: "Canonical model",
      goal: "Exercise issue two behavior.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    expect(created).toEqual({
      id: expect.any(String),
      title: "Canonical model",
      goal: "Exercise issue two behavior.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes",
      summary: null,
      status: "draft",
      createdAt: expect.any(String),
      updatedAt: created.createdAt
    });

    const planning = store.updateWorkstreamStatus(created.id, "planning");
    expect(planning).toMatchObject({
      id: created.id,
      status: "planning",
      createdAt: created.createdAt,
      updatedAt: expect.any(String)
    });
    expect(new Date(planning.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

    expect(store.updateWorkstreamStatus(created.id, "awaiting_plan_approval")).toMatchObject({
      status: "awaiting_plan_approval"
    });
    expect(store.updateWorkstreamStatus(created.id, "running")).toMatchObject({ status: "running" });
    expect(store.updateWorkstreamStatus(created.id, "awaiting_user_input")).toMatchObject({
      status: "awaiting_user_input"
    });
    expect(store.updateWorkstreamStatus(created.id, "running")).toMatchObject({ status: "running" });
    expect(store.updateWorkstreamStatus(created.id, "awaiting_review")).toMatchObject({ status: "awaiting_review" });
    expect(store.updateWorkstreamStatus(created.id, "merge_ready")).toMatchObject({ status: "merge_ready" });
    expect(store.updateWorkstreamStatus(created.id, "completed")).toMatchObject({ status: "completed" });

    expect(() => store.updateWorkstreamStatus(created.id, "running")).toThrow(/invalid workstream status transition/i);
    expect(() => store.updateWorkstreamStatus(created.id, "active" as never)).toThrow(/valid workstream status/i);
    store.close();
  });

  it("rejects invalid workstream transitions without changing persisted status", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Transition validation",
      goal: "Reject impossible jumps.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    expect(store.updateWorkstreamStatus(workstream.id, "planning")).toMatchObject({ status: "planning" });
    expect(() => store.updateWorkstreamStatus(workstream.id, "merge_ready")).toThrow(
      /invalid workstream status transition/i
    );
    expect(store.getWorkstream(workstream.id)).toMatchObject({ status: "planning" });

    expect(store.updateWorkstreamStatus(workstream.id, "cancelled")).toMatchObject({ status: "cancelled" });
    expect(() => store.updateWorkstreamStatus(workstream.id, "running")).toThrow(
      /invalid workstream status transition/i
    );
    store.close();
  });

  it("appends and reads ordered timeline events with structured payloads", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Timeline coverage",
      goal: "Capture ordered timeline events.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

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
    const workstream = store.createWorkstream({
      title: "Agent run coverage",
      goal: "Create linked plans and runs.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

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
    const workstream = store.createWorkstream({
      title: "Runtime validation",
      goal: "Validate child records.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

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

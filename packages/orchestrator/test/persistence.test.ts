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
  it("connects, selects, and persists GitHub repositories", async () => {
    const dataDir = await createTempDir();
    const first = createSqliteOrchestratorStore({ dataDir });

    const connected = first.connectGitHubRepository({
      owner: " ss-andrade ",
      name: " mergepilot ",
      defaultBranch: " main ",
      htmlUrl: "https://github.com/ss-andrade/mergepilot",
      apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot"
    });

    expect(connected).toEqual({
      id: expect.any(String),
      owner: "ss-andrade",
      name: "mergepilot",
      defaultBranch: "main",
      htmlUrl: "https://github.com/ss-andrade/mergepilot",
      apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot",
      connectedAt: expect.any(String),
      updatedAt: connected.connectedAt,
      selectedAt: null
    });

    expect(first.selectGitHubRepository(connected.id)).toMatchObject({
      id: connected.id,
      selectedAt: expect.any(String)
    });
    first.close();

    const second = createSqliteOrchestratorStore({ dataDir });
    expect(second.listGitHubRepositories()).toEqual([
      expect.objectContaining({
        id: connected.id,
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        selectedAt: expect.any(String)
      })
    ]);
    second.close();
  });

  it("stores typed GitHub repository scope on workstreams while preserving canonical repo", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const repository = store.connectGitHubRepository({
      owner: "ss-andrade",
      name: "mergepilot",
      defaultBranch: "main"
    });

    const workstream = store.createWorkstream({
      title: "GitHub scoped work",
      goal: "Track work against a connected GitHub repository.",
      repo: "ignored/manual-value",
      githubRepository: repository,
      createdBy: "hermes"
    });

    expect(workstream).toMatchObject({
      repo: "ss-andrade/mergepilot",
      githubRepository: {
        id: repository.id,
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        htmlUrl: null,
        apiUrl: null
      }
    });
    expect(store.getWorkstream(workstream.id)).toMatchObject({
      repo: "ss-andrade/mergepilot",
      githubRepository: {
        id: repository.id,
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main"
      }
    });
    store.close();
  });

  it("validates GitHub repository connection input", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });

    expect(() =>
      store.connectGitHubRepository({ owner: "bad owner", name: "mergepilot", defaultBranch: "main" })
    ).toThrow(/owner/i);
    expect(() =>
      store.connectGitHubRepository({ owner: "ss-andrade", name: ".git", defaultBranch: "main" })
    ).toThrow(/name/i);
    expect(() =>
      store.connectGitHubRepository({ owner: "ss-andrade", name: "mergepilot", defaultBranch: "feature branch" })
    ).toThrow(/defaultBranch/i);
    expect(store.listGitHubRepositories()).toEqual([]);
    store.close();
  });

  it("surfaces GitHub integration errors as human action required timeline events", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Repository access",
      goal: "Connect a repository that requires attention.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    const event = store.recordGitHubRepositoryConnectionError({
      workstreamId: workstream.id,
      repository: "ss-andrade/mergepilot",
      message: "GitHub repository access needs attention.",
      reason: "not_found"
    });

    expect(event).toMatchObject({
      workstreamId: workstream.id,
      type: "human_action_required",
      message: "GitHub repository access needs attention.",
      payload: {
        integration: "github",
        surface: "repository_connection",
        repository: "ss-andrade/mergepilot",
        reason: "not_found"
      }
    });
    expect(store.listEvents(workstream.id)).toEqual([expect.objectContaining({ id: event.id })]);
    store.close();
  });

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
      VALUES ('legacy-event', 'legacy-ws', 1, 'plan.created', 'Created before migration', '{"ok":true}', '2026-05-01T00:00:01.000Z')
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
    expect(migrated.listEvents("legacy-ws")).toEqual([
      expect.objectContaining({ id: "legacy-event", type: "plan_created", payload: { ok: true } })
    ]);
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
      githubRepository: null,
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

  it("appends every canonical timeline event type and reads them in stable sequence order with structured payloads", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Timeline coverage",
      goal: "Capture ordered timeline events.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    const eventTypes = [
      "user_message",
      "coordinator_message",
      "plan_created",
      "plan_approved",
      "agent_started",
      "agent_completed",
      "command_ran",
      "commit_created",
      "branch_pushed",
      "pr_opened",
      "ci_started",
      "ci_passed",
      "ci_failed",
      "review_summary_created",
      "human_action_required",
      "workstream_completed"
    ] as const;

    const created = eventTypes.map((type, index) =>
      store.appendEvent({
        workstreamId: workstream.id,
        type,
        message: `Timeline event ${index + 1}`,
        payload:
          index === 0
            ? {
                source: "test",
                command: ["npm", "test"],
                exitCode: 0,
                nested: { ok: true, count: 2 },
                labels: ["timeline", "audit"],
                optional: null
              }
            : undefined
      })
    );

    expect(store.listEvents(workstream.id)).toEqual([
      expect.objectContaining({
        id: created[0].id,
        sequence: 1,
        type: "user_message",
        payload: {
          source: "test",
          command: ["npm", "test"],
          exitCode: 0,
          nested: { ok: true, count: 2 },
          labels: ["timeline", "audit"],
          optional: null
        }
      }),
      ...created.slice(1).map((event, index) =>
        expect.objectContaining({
          id: event.id,
          sequence: index + 2,
          type: eventTypes[index + 1],
          payload: null
        })
      )
    ]);
    store.close();
  });

  it("rejects non-canonical event types at the service and SQLite boundaries", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Event type validation",
      goal: "Reject non-canonical timeline events.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    expect(() =>
      store.appendEvent({
        workstreamId: workstream.id,
        type: "workstream.created" as never,
        message: "Legacy dotted type"
      })
    ).toThrow(/valid event type/i);

    const db = new Database(store.databasePath);
    expect(() =>
      db
        .prepare(
          `INSERT INTO workstream_events (id, workstream_id, sequence, type, message, payload_json, created_at)
           VALUES ('bad-event', ?, 1, 'workstream.created', 'Bad event', NULL, '2026-05-01T00:00:00.000Z')`
        )
        .run(workstream.id)
    ).toThrow();
    db.close();
    expect(store.listEvents(workstream.id)).toEqual([]);
    store.close();
  });

  it("rejects payloads that cannot be faithfully represented as JSON metadata", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Metadata validation",
      goal: "Reject lossy payload metadata.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });

    expect(() =>
      store.appendEvent({
        workstreamId: workstream.id,
        type: "command_ran",
        message: "Invalid payload",
        payload: { command: "npm test", elided: undefined }
      })
    ).toThrow(/payload/i);
    expect(() =>
      store.appendEvent({
        workstreamId: workstream.id,
        type: "command_ran",
        message: "Invalid payload",
        payload: { command: "npm test", metadata: () => "not JSON" }
      })
    ).toThrow(/payload/i);
    store.close();
  });

  it("prevents direct mutation or deletion of persisted events", async () => {
    const dataDir = await createTempDir();
    const store = createSqliteOrchestratorStore({ dataDir });
    const workstream = store.createWorkstream({
      title: "Immutable timeline",
      goal: "Prevent audit event tampering.",
      repo: "ss-andrade/mergepilot",
      createdBy: "hermes"
    });
    const event = store.appendEvent({
      workstreamId: workstream.id,
      type: "command_ran",
      message: "npm test",
      payload: { command: ["npm", "test"], exitCode: 0 }
    });
    store.close();

    const db = new Database(path.join(dataDir, "mergepilot.sqlite3"));
    expect(() =>
      db.prepare("UPDATE workstream_events SET message = 'tampered' WHERE id = ?").run(event.id)
    ).toThrow(/immutable/i);
    expect(() => db.prepare("DELETE FROM workstream_events WHERE id = ?").run(event.id)).toThrow(/immutable/i);
    db.close();

    const reopened = createSqliteOrchestratorStore({ dataDir });
    expect(reopened.listEvents(workstream.id)).toEqual([
      expect.objectContaining({
        id: event.id,
        type: "command_ran",
        message: "npm test",
        payload: { command: ["npm", "test"], exitCode: 0 }
      })
    ]);
    reopened.close();
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

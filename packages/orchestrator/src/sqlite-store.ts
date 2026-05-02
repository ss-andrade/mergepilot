import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AgentRun,
  AppendWorkstreamEventInput,
  CreateAgentRunInput,
  CreatePlanInput,
  CreateWorkstreamInput,
  OrchestratorStore,
  Plan,
  Workstream,
  WorkstreamEvent
} from "./types.js";
import {
  assertJsonCompatible,
  normalizeOptionalString,
  requireAgentRunStatus,
  requireEventType,
  requireId,
  requirePlanStatus,
  requireString
} from "./validation.js";

export interface SqliteStoreOptions {
  dataDir: string;
  databaseFileName?: string;
}

type WorkstreamRow = Omit<Workstream, "repositoryPath" | "createdAt" | "updatedAt"> & {
  repository_path: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = Omit<WorkstreamEvent, "workstreamId" | "createdAt" | "payload"> & {
  workstream_id: string;
  created_at: string;
  payload_json: string | null;
};

type PlanRow = Omit<Plan, "workstreamId" | "createdAt" | "updatedAt"> & {
  workstream_id: string;
  created_at: string;
  updated_at: string;
};

type AgentRunRow = Omit<
  AgentRun,
  "workstreamId" | "providerId" | "adapterId" | "startedAt" | "completedAt" | "createdAt" | "updatedAt"
> & {
  workstream_id: string;
  provider_id: string;
  adapter_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export class SqliteOrchestratorStore implements OrchestratorStore {
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(options: SqliteStoreOptions) {
    const databaseFileName = options.databaseFileName ?? "mergepilot.sqlite3";
    mkdirSync(options.dataDir, { recursive: true });
    this.databasePath = path.join(options.dataDir, databaseFileName);
    this.db = new Database(this.databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  createWorkstream(input: CreateWorkstreamInput): Workstream {
    const now = new Date().toISOString();
    const workstream: Workstream = {
      id: randomUUID(),
      title: requireString(input.title, "title", 160),
      description: normalizeOptionalString(input.description, 5000),
      repositoryPath: normalizeOptionalString(input.repositoryPath, 2048),
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO workstreams (id, title, description, repository_path, status, created_at, updated_at)
         VALUES (@id, @title, @description, @repositoryPath, @status, @createdAt, @updatedAt)`
      )
      .run(workstream);

    return workstream;
  }

  listWorkstreams(): Workstream[] {
    const rows = this.db
      .prepare("SELECT * FROM workstreams ORDER BY updated_at DESC, created_at DESC")
      .all() as WorkstreamRow[];
    return rows.map(mapWorkstreamRow);
  }

  getWorkstream(id: string): Workstream | null {
    const row = this.db.prepare("SELECT * FROM workstreams WHERE id = ?").get(requireId(id)) as
      | WorkstreamRow
      | undefined;
    return row ? mapWorkstreamRow(row) : null;
  }

  appendEvent(input: AppendWorkstreamEventInput): WorkstreamEvent {
    const workstreamId = requireId(input.workstreamId, "workstreamId");
    this.requireWorkstream(workstreamId);
    const type = requireEventType(input.type);
    const message = requireString(input.message, "message", 2000);
    assertJsonCompatible(input.payload);

    const event = this.db.transaction(() => {
      const nextSequence =
        ((this.db
          .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM workstream_events WHERE workstream_id = ?")
          .get(workstreamId) as { sequence: number }).sequence ?? 1);
      const createdAt = new Date().toISOString();
      const record = {
        id: randomUUID(),
        workstreamId,
        sequence: nextSequence,
        type,
        message,
        payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload),
        createdAt
      };

      this.db
        .prepare(
          `INSERT INTO workstream_events (id, workstream_id, sequence, type, message, payload_json, created_at)
           VALUES (@id, @workstreamId, @sequence, @type, @message, @payloadJson, @createdAt)`
        )
        .run(record);
      this.db.prepare("UPDATE workstreams SET updated_at = ? WHERE id = ?").run(createdAt, workstreamId);

      return {
        id: record.id,
        workstreamId,
        sequence: nextSequence,
        type,
        message,
        payload: input.payload === undefined ? null : input.payload,
        createdAt
      };
    })();

    return event;
  }

  listEvents(workstreamId: string): WorkstreamEvent[] {
    const id = requireId(workstreamId, "workstreamId");
    this.requireWorkstream(id);
    const rows = this.db
      .prepare("SELECT * FROM workstream_events WHERE workstream_id = ? ORDER BY sequence ASC")
      .all(id) as EventRow[];
    return rows.map(mapEventRow);
  }

  createPlan(input: CreatePlanInput): Plan {
    const workstreamId = requireId(input.workstreamId, "workstreamId");
    this.requireWorkstream(workstreamId);
    const now = new Date().toISOString();
    const plan: Plan = {
      id: randomUUID(),
      workstreamId,
      title: requireString(input.title, "title", 160),
      body: requireString(input.body, "body", 100000),
      status: input.status ? requirePlanStatus(input.status) : "draft",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO plans (id, workstream_id, title, body, status, created_at, updated_at)
         VALUES (@id, @workstreamId, @title, @body, @status, @createdAt, @updatedAt)`
      )
      .run(plan);
    return plan;
  }

  listPlans(workstreamId: string): Plan[] {
    const id = requireId(workstreamId, "workstreamId");
    this.requireWorkstream(id);
    const rows = this.db.prepare("SELECT * FROM plans WHERE workstream_id = ? ORDER BY created_at ASC").all(id) as PlanRow[];
    return rows.map(mapPlanRow);
  }

  createAgentRun(input: CreateAgentRunInput): AgentRun {
    const workstreamId = requireId(input.workstreamId, "workstreamId");
    this.requireWorkstream(workstreamId);
    const now = new Date().toISOString();
    const run: AgentRun = {
      id: randomUUID(),
      workstreamId,
      providerId: requireString(input.providerId, "providerId", 80),
      adapterId: normalizeOptionalString(input.adapterId, 120),
      role: requireString(input.role, "role", 80),
      status: input.status ? requireAgentRunStatus(input.status) : "queued",
      goal: requireString(input.goal, "goal", 5000),
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO agent_runs (
           id, workstream_id, provider_id, adapter_id, role, status, goal,
           started_at, completed_at, created_at, updated_at
         )
         VALUES (
           @id, @workstreamId, @providerId, @adapterId, @role, @status, @goal,
           @startedAt, @completedAt, @createdAt, @updatedAt
         )`
      )
      .run(run);
    return run;
  }

  listAgentRuns(workstreamId: string): AgentRun[] {
    const id = requireId(workstreamId, "workstreamId");
    this.requireWorkstream(id);
    const rows = this.db
      .prepare("SELECT * FROM agent_runs WHERE workstream_id = ? ORDER BY created_at ASC")
      .all(id) as AgentRunRow[];
    return rows.map(mapAgentRunRow);
  }

  close(): void {
    this.db.close();
  }

  private requireWorkstream(workstreamId: string): void {
    const row = this.db.prepare("SELECT id FROM workstreams WHERE id = ?").get(workstreamId);
    if (!row) {
      throw new Error(`Workstream ${workstreamId} was not found.`);
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workstreams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        repository_path TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workstream_events (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(workstream_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
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

      CREATE INDEX IF NOT EXISTS idx_workstream_events_workstream_sequence
        ON workstream_events(workstream_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_plans_workstream
        ON plans(workstream_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_workstream
        ON agent_runs(workstream_id);
    `);
  }
}

export function createSqliteOrchestratorStore(options: SqliteStoreOptions): SqliteOrchestratorStore {
  return new SqliteOrchestratorStore(options);
}

function mapWorkstreamRow(row: WorkstreamRow): Workstream {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    repositoryPath: row.repository_path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEventRow(row: EventRow): WorkstreamEvent {
  return {
    id: row.id,
    workstreamId: row.workstream_id,
    sequence: row.sequence,
    type: row.type,
    message: row.message,
    payload: row.payload_json === null ? null : JSON.parse(row.payload_json),
    createdAt: row.created_at
  };
}

function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    workstreamId: row.workstream_id,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAgentRunRow(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    workstreamId: row.workstream_id,
    providerId: row.provider_id,
    adapterId: row.adapter_id,
    role: row.role,
    status: row.status,
    goal: row.goal,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AgentRun,
  AppendWorkstreamEventInput,
  ConnectGitHubRepositoryInput,
  CreateAgentRunInput,
  CreatePlanInput,
  CreateWorkstreamInput,
  GitHubRepositoryConnection,
  OrchestratorStore,
  Plan,
  ReportGitHubRepositoryConnectionErrorInput,
  Workstream,
  WorkstreamEvent,
  WorkstreamGitHubRepositoryScope,
  WORKSTREAM_EVENT_TYPES,
  WorkstreamEventType
} from "./types.js";
import {
  assertJsonCompatible,
  normalizeOptionalString,
  requireAgentRunStatus,
  requireEventType,
  requireGitHubDefaultBranch,
  requireGitHubOwner,
  requireGitHubRepositoryName,
  requireId,
  requirePlanStatus,
  requireString,
  requireWorkstreamStatus,
  assertWorkstreamStatusTransition
} from "./validation.js";

export interface SqliteStoreOptions {
  dataDir: string;
  databaseFileName?: string;
}

type WorkstreamRow = Omit<Workstream, "createdBy" | "createdAt" | "updatedAt" | "githubRepository"> & {
  created_by: string;
  created_at: string;
  updated_at: string;
  github_repository_json: string | null;
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

type GitHubRepositoryRow = Omit<GitHubRepositoryConnection, "defaultBranch" | "htmlUrl" | "apiUrl" | "connectedAt" | "updatedAt" | "selectedAt"> & {
  default_branch: string;
  html_url: string | null;
  api_url: string | null;
  connected_at: string;
  updated_at: string;
  selected_at: string | null;
};

const eventTypeSqlList = WORKSTREAM_EVENT_TYPES.map((type) => `'${type}'`).join(", ");

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
    const githubRepository = normalizeGitHubRepositoryScope(input.githubRepository);
    const repo = githubRepository ? `${githubRepository.owner}/${githubRepository.name}` : requireString(input.repo, "repo", 2048);
    const workstream: Workstream = {
      id: randomUUID(),
      title: requireString(input.title, "title", 160),
      goal: requireString(input.goal, "goal", 5000),
      status: "draft",
      repo,
      githubRepository,
      createdBy: requireString(input.createdBy, "createdBy", 160),
      summary: normalizeOptionalString(input.summary, 5000),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO workstreams (
           id, title, goal, status, repo, github_repository_json, created_by, summary, created_at, updated_at
         )
         VALUES (
           @id, @title, @goal, @status, @repo, @githubRepositoryJson, @createdBy, @summary, @createdAt, @updatedAt
         )`
      )
      .run({
        ...workstream,
        githubRepositoryJson: githubRepository ? JSON.stringify(githubRepository) : null
      });

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

  updateWorkstreamStatus(id: string, nextStatus: Workstream["status"]): Workstream {
    const workstreamId = requireId(id);
    const status = requireWorkstreamStatus(nextStatus);
    const current = this.getWorkstream(workstreamId);
    if (!current) {
      throw new Error(`Workstream ${workstreamId} was not found.`);
    }
    assertWorkstreamStatusTransition(current.status, status);

    if (current.status === status) {
      return current;
    }

    const updatedAt = new Date().toISOString();
    this.db.prepare("UPDATE workstreams SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, workstreamId);
    return {
      ...current,
      status,
      updatedAt
    };
  }

  connectGitHubRepository(input: ConnectGitHubRepositoryInput): GitHubRepositoryConnection {
    const now = new Date().toISOString();
    const owner = requireGitHubOwner(input.owner);
    const name = requireGitHubRepositoryName(input.name);
    const existing = this.db
      .prepare("SELECT * FROM github_repositories WHERE owner = ? AND name = ?")
      .get(owner, name) as GitHubRepositoryRow | undefined;
    const record = {
      id: existing?.id ?? randomUUID(),
      owner,
      name,
      defaultBranch: requireGitHubDefaultBranch(input.defaultBranch),
      htmlUrl: normalizeOptionalString(input.htmlUrl, 2048),
      apiUrl: normalizeOptionalString(input.apiUrl, 2048),
      connectedAt: existing?.connected_at ?? now,
      updatedAt: now,
      selectedAt: existing?.selected_at ?? null
    };

    this.db
      .prepare(
        `INSERT INTO github_repositories (
           id, owner, name, default_branch, html_url, api_url, connected_at, updated_at, selected_at
         )
         VALUES (
           @id, @owner, @name, @defaultBranch, @htmlUrl, @apiUrl, @connectedAt, @updatedAt, @selectedAt
         )
         ON CONFLICT(owner, name) DO UPDATE SET
           default_branch = excluded.default_branch,
           html_url = excluded.html_url,
           api_url = excluded.api_url,
           updated_at = excluded.updated_at`
      )
      .run(record);

    return record;
  }

  listGitHubRepositories(): GitHubRepositoryConnection[] {
    const rows = this.db
      .prepare("SELECT * FROM github_repositories ORDER BY selected_at DESC NULLS LAST, updated_at DESC, owner ASC, name ASC")
      .all() as GitHubRepositoryRow[];
    return rows.map(mapGitHubRepositoryRow);
  }

  selectGitHubRepository(id: string): GitHubRepositoryConnection {
    const repositoryId = requireId(id, "repositoryId");
    const current = this.db.prepare("SELECT * FROM github_repositories WHERE id = ?").get(repositoryId) as
      | GitHubRepositoryRow
      | undefined;
    if (!current) {
      throw new Error(`GitHub repository ${repositoryId} was not found.`);
    }

    const selectedAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare("UPDATE github_repositories SET selected_at = NULL").run();
      this.db
        .prepare("UPDATE github_repositories SET selected_at = ?, updated_at = ? WHERE id = ?")
        .run(selectedAt, selectedAt, repositoryId);
    })();

    return {
      ...mapGitHubRepositoryRow(current),
      updatedAt: selectedAt,
      selectedAt
    };
  }

  recordGitHubRepositoryConnectionError(input: ReportGitHubRepositoryConnectionErrorInput): WorkstreamEvent {
    return this.appendEvent({
      workstreamId: input.workstreamId,
      type: "human_action_required",
      message: requireString(input.message, "message", 2000),
      payload: {
        integration: "github",
        surface: "repository_connection",
        repository: requireString(input.repository, "repository", 2048),
        reason: requireString(input.reason, "reason", 160)
      }
    });
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
    this.recreateLegacyWorkstreamSchema();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workstreams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'draft',
          'planning',
          'awaiting_plan_approval',
          'running',
          'awaiting_user_input',
          'awaiting_review',
          'merge_ready',
          'completed',
          'failed',
          'cancelled'
        )),
        repo TEXT NOT NULL,
        github_repository_json TEXT,
        created_by TEXT NOT NULL,
        summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workstream_events (
        id TEXT PRIMARY KEY,
        workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN (${eventTypeSqlList})),
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

      CREATE TABLE IF NOT EXISTS github_repositories (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        default_branch TEXT NOT NULL,
        html_url TEXT,
        api_url TEXT,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        selected_at TEXT,
        UNIQUE(owner, name)
      );

      CREATE INDEX IF NOT EXISTS idx_workstream_events_workstream_sequence
        ON workstream_events(workstream_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_plans_workstream
        ON plans(workstream_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_workstream
        ON agent_runs(workstream_id);
      CREATE INDEX IF NOT EXISTS idx_github_repositories_selected
        ON github_repositories(selected_at);
    `);
    this.ensureWorkstreamsGitHubRepositorySchema();
    this.ensureWorkstreamEventsSchema();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workstream_events_workstream_sequence
        ON workstream_events(workstream_id, sequence);
    `);
    this.createEventImmutabilityTriggers();
  }

  private recreateLegacyWorkstreamSchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(workstreams)").all() as Array<{ name: string }>;
    if (columns.length === 0) {
      return;
    }

    const columnNames = new Set(columns.map((column) => column.name));
    const hasCanonicalColumns = ["goal", "repo", "created_by", "summary"].every((column) => columnNames.has(column));
    if (hasCanonicalColumns) {
      return;
    }

    const legacyWorkstreams = this.db.prepare("SELECT * FROM workstreams").all() as Array<Record<string, unknown>>;
    const legacyEvents = this.readLegacyRows("workstream_events");
    const legacyPlans = this.readLegacyRows("plans");
    const legacyAgentRuns = this.readLegacyRows("agent_runs");

    this.db.pragma("foreign_keys = OFF");
    const migrateLegacyData = this.db.transaction(() => {
      this.db.exec(`
        DROP TABLE IF EXISTS agent_runs;
        DROP TABLE IF EXISTS plans;
        DROP TABLE IF EXISTS workstream_events;
        DROP TABLE IF EXISTS workstreams;
      `);

      this.db.exec(`
        CREATE TABLE workstreams (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          goal TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN (
            'draft',
            'planning',
            'awaiting_plan_approval',
            'running',
            'awaiting_user_input',
            'awaiting_review',
            'merge_ready',
            'completed',
            'failed',
            'cancelled'
          )),
          repo TEXT NOT NULL,
          github_repository_json TEXT,
          created_by TEXT NOT NULL,
          summary TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE workstream_events (
          id TEXT PRIMARY KEY,
          workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN (${eventTypeSqlList})),
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

      const insertWorkstream = this.db.prepare(`
        INSERT INTO workstreams (id, title, goal, status, repo, github_repository_json, created_by, summary, created_at, updated_at)
        VALUES (@id, @title, @goal, @status, @repo, NULL, @createdBy, @summary, @createdAt, @updatedAt)
      `);
      for (const row of legacyWorkstreams) {
        const title = String(row.title ?? "Untitled workstream");
        const summary = nullableString(row.description);
        insertWorkstream.run({
          id: String(row.id),
          title,
          goal: summary ?? title,
          status: mapLegacyWorkstreamStatus(nullableString(row.status)),
          repo: nullableString(row.repository_path) ?? "legacy/local-repository",
          createdBy: "legacy",
          summary,
          createdAt: String(row.created_at ?? new Date().toISOString()),
          updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString())
        });
      }

      const insertEvent = this.db.prepare(`
        INSERT INTO workstream_events (id, workstream_id, sequence, type, message, payload_json, created_at)
        VALUES (@id, @workstream_id, @sequence, @type, @message, @payload_json, @created_at)
      `);
      for (const row of legacyEvents) {
        row.type = mapLegacyEventType(row.type);
        insertEvent.run(row);
      }

      const insertPlan = this.db.prepare(`
        INSERT INTO plans (id, workstream_id, title, body, status, created_at, updated_at)
        VALUES (@id, @workstream_id, @title, @body, @status, @created_at, @updated_at)
      `);
      for (const row of legacyPlans) {
        insertPlan.run(row);
      }

      const insertAgentRun = this.db.prepare(`
        INSERT INTO agent_runs (
          id, workstream_id, provider_id, adapter_id, role, status, goal, started_at, completed_at, created_at, updated_at
        )
        VALUES (
          @id, @workstream_id, @provider_id, @adapter_id, @role, @status, @goal, @started_at, @completed_at, @created_at, @updated_at
        )
      `);
      for (const row of legacyAgentRuns) {
        insertAgentRun.run(row);
      }
    });

    try {
      migrateLegacyData();
    } finally {
      this.db.pragma("foreign_keys = ON");
    }
  }

  private readLegacyRows(tableName: string): Array<Record<string, unknown>> {
    const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
    if (!row) {
      return [];
    }
    return this.db.prepare(`SELECT * FROM ${tableName}`).all() as Array<Record<string, unknown>>;
  }

  private ensureWorkstreamEventsSchema(): void {
    const table = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'workstream_events'")
      .get() as { sql: string } | undefined;
    if (!table || table.sql.includes("CHECK (type IN")) {
      return;
    }

    const rows = this.db.prepare("SELECT * FROM workstream_events ORDER BY workstream_id, sequence").all() as Array<
      Record<string, unknown>
    >;

    const recreateEvents = this.db.transaction(() => {
      this.db.exec(`
        DROP TRIGGER IF EXISTS trg_workstream_events_no_update;
        DROP TRIGGER IF EXISTS trg_workstream_events_no_delete;
        DROP TABLE workstream_events;
        CREATE TABLE workstream_events (
          id TEXT PRIMARY KEY,
          workstream_id TEXT NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN (${eventTypeSqlList})),
          message TEXT NOT NULL,
          payload_json TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(workstream_id, sequence)
        );
      `);

      const insertEvent = this.db.prepare(`
        INSERT INTO workstream_events (id, workstream_id, sequence, type, message, payload_json, created_at)
        VALUES (@id, @workstream_id, @sequence, @type, @message, @payload_json, @created_at)
      `);

      for (const row of rows) {
        insertEvent.run({
          ...row,
          type: mapLegacyEventType(row.type)
        });
      }
    });

    recreateEvents();
  }

  private ensureWorkstreamsGitHubRepositorySchema(): void {
    const columns = this.db.prepare("PRAGMA table_info(workstreams)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "github_repository_json")) {
      this.db.exec("ALTER TABLE workstreams ADD COLUMN github_repository_json TEXT;");
    }
  }

  private createEventImmutabilityTriggers(): void {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_workstream_events_no_update
      BEFORE UPDATE ON workstream_events
      BEGIN
        SELECT RAISE(ABORT, 'workstream_events are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_workstream_events_no_delete
      BEFORE DELETE ON workstream_events
      BEGIN
        SELECT RAISE(ABORT, 'workstream_events are immutable');
      END;
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
    goal: row.goal,
    status: row.status,
    repo: row.repo,
    githubRepository: row.github_repository_json === null ? null : JSON.parse(row.github_repository_json),
    createdBy: row.created_by,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGitHubRepositoryRow(row: GitHubRepositoryRow): GitHubRepositoryConnection {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.default_branch,
    htmlUrl: row.html_url,
    apiUrl: row.api_url,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    selectedAt: row.selected_at
  };
}

function normalizeGitHubRepositoryScope(
  input: WorkstreamGitHubRepositoryScope | GitHubRepositoryConnection | null | undefined
): WorkstreamGitHubRepositoryScope | null {
  if (!input) {
    return null;
  }
  const scope: WorkstreamGitHubRepositoryScope = {
    owner: requireGitHubOwner(input.owner),
    name: requireGitHubRepositoryName(input.name),
    defaultBranch: requireGitHubDefaultBranch(input.defaultBranch),
    htmlUrl: normalizeOptionalString(input.htmlUrl, 2048),
    apiUrl: normalizeOptionalString(input.apiUrl, 2048)
  };
  if (input.id) {
    scope.id = requireId(input.id, "repositoryId");
  }
  return scope;
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

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapLegacyWorkstreamStatus(status: string | null): Workstream["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "paused":
      return "awaiting_user_input";
    case "archived":
      return "cancelled";
    case "active":
      return "running";
    default:
      return "draft";
  }
}

function mapLegacyEventType(value: unknown): WorkstreamEventType {
  if (typeof value === "string" && (WORKSTREAM_EVENT_TYPES as readonly string[]).includes(value)) {
    return value as WorkstreamEventType;
  }

  switch (value) {
    case "agent.run.started":
      return "agent_started";
    case "agent.run.completed":
      return "agent_completed";
    case "plan.created":
      return "plan_created";
    case "plan.approved":
      return "plan_approved";
    case "workstream.completed":
      return "workstream_completed";
    default:
      return "user_message";
  }
}

import path from "node:path";
import {
  AppendWorkstreamEventInput,
  CreateAgentRunInput,
  CreatePlanInput,
  CreateWorkstreamInput,
  LocalOrchestratorService,
  OrchestratorStatus,
  OrchestratorStore
} from "./types.js";
import { createSqliteOrchestratorStore } from "./sqlite-store.js";

export interface LocalOrchestratorOptions {
  dataDir: string;
}

export class InProcessLocalOrchestrator implements LocalOrchestratorService {
  private store: OrchestratorStore | null = null;
  private readonly databasePath: string;

  constructor(private readonly options: LocalOrchestratorOptions) {
    this.databasePath = path.join(options.dataDir, "mergepilot.sqlite3");
  }

  async start(): Promise<void> {
    if (this.store) {
      return;
    }

    this.store = createSqliteOrchestratorStore({ dataDir: this.options.dataDir });
  }

  async stop(): Promise<void> {
    this.store?.close();
    this.store = null;
  }

  status(): OrchestratorStatus {
    return {
      state: this.store ? "running" : "stopped",
      dataDir: this.options.dataDir,
      databasePath: this.databasePath
    };
  }

  createWorkstream(input: CreateWorkstreamInput) {
    return this.requireStore().createWorkstream(input);
  }

  listWorkstreams() {
    return this.requireStore().listWorkstreams();
  }

  getWorkstream(id: string) {
    return this.requireStore().getWorkstream(id);
  }

  appendEvent(input: AppendWorkstreamEventInput) {
    return this.requireStore().appendEvent(input);
  }

  listEvents(workstreamId: string) {
    return this.requireStore().listEvents(workstreamId);
  }

  createPlan(input: CreatePlanInput) {
    return this.requireStore().createPlan(input);
  }

  listPlans(workstreamId: string) {
    return this.requireStore().listPlans(workstreamId);
  }

  createAgentRun(input: CreateAgentRunInput) {
    return this.requireStore().createAgentRun(input);
  }

  listAgentRuns(workstreamId: string) {
    return this.requireStore().listAgentRuns(workstreamId);
  }

  private requireStore(): OrchestratorStore {
    if (!this.store) {
      throw new Error("Local orchestrator is not running.");
    }
    return this.store;
  }
}

export function createLocalOrchestrator(options: LocalOrchestratorOptions): LocalOrchestratorService {
  return new InProcessLocalOrchestrator(options);
}

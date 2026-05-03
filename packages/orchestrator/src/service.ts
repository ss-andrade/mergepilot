import path from "node:path";
import { mkdir } from "node:fs/promises";
import type {
  AgentAdapter,
  AgentRunArtifactEvent as AdapterRunArtifactEvent,
  AgentRunEvent as AdapterRunEvent,
  AgentRunHandle,
  AgentRunInput as AdapterRunInput,
  AgentRunResult as AdapterRunResult
} from "@mergepilot/agents";
import {
  AgentRun,
  AppendWorkstreamEventInput,
  BuildAgentRunnerOptions,
  ConnectGitHubRepositoryInput,
  CreateAgentRunInput,
  CreatePlanInput,
  CreateWorkstreamInput,
  LocalOrchestratorService,
  OrchestratorStatus,
  OrchestratorStore,
  Plan,
  PlanDecisionInput,
  ProposePlanInput,
  ReportGitHubRepositoryConnectionErrorInput,
  StartBuildAgentRunInput,
  UpdateAgentRunInput,
  WorkstreamStatus
} from "./types.js";
import { createSqliteOrchestratorStore } from "./sqlite-store.js";

export interface LocalOrchestratorOptions extends BuildAgentRunnerOptions {
  dataDir: string;
}

export class InProcessLocalOrchestrator implements LocalOrchestratorService {
  private store: OrchestratorStore | null = null;
  private readonly databasePath: string;
  private readonly buildAgentAdapter: AgentAdapter;
  private readonly activeBuildWorkstreamIds = new Set<string>();

  constructor(private readonly options: LocalOrchestratorOptions) {
    this.databasePath = path.join(options.dataDir, "mergepilot.sqlite3");
    this.buildAgentAdapter = options.buildAgentAdapter ?? new DeterministicBuildAgentAdapter();
  }

  async start(): Promise<void> {
    if (this.store) {
      return;
    }

    this.store = createSqliteOrchestratorStore({ dataDir: this.options.dataDir });
  }

  async stop(): Promise<void> {
    if (this.activeBuildWorkstreamIds.size > 0) {
      throw new Error("Cannot stop the local orchestrator while build-agent runs are active.");
    }
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

  updateWorkstreamStatus(id: string, nextStatus: WorkstreamStatus) {
    return this.requireStore().updateWorkstreamStatus(id, nextStatus);
  }

  updateWorkstreamSummary(id: string, summary: string | null) {
    return this.requireStore().updateWorkstreamSummary(id, summary);
  }

  connectGitHubRepository(input: ConnectGitHubRepositoryInput) {
    return this.requireStore().connectGitHubRepository(input);
  }

  listGitHubRepositories() {
    return this.requireStore().listGitHubRepositories();
  }

  selectGitHubRepository(id: string) {
    return this.requireStore().selectGitHubRepository(id);
  }

  recordGitHubRepositoryConnectionError(input: ReportGitHubRepositoryConnectionErrorInput) {
    return this.requireStore().recordGitHubRepositoryConnectionError(input);
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

  proposePlan(input: ProposePlanInput) {
    return this.requireStore().proposePlan(input);
  }

  approvePlan(input: PlanDecisionInput) {
    return this.requireStore().approvePlan(input);
  }

  rejectPlan(input: PlanDecisionInput) {
    return this.requireStore().rejectPlan(input);
  }

  listPlans(workstreamId: string) {
    return this.requireStore().listPlans(workstreamId);
  }

  createAgentRun(input: CreateAgentRunInput) {
    return this.requireStore().createAgentRun(input);
  }

  updateAgentRun(input: UpdateAgentRunInput) {
    return this.requireStore().updateAgentRun(input);
  }

  listAgentRuns(workstreamId: string) {
    return this.requireStore().listAgentRuns(workstreamId);
  }

  async startBuildAgentRun(input: StartBuildAgentRunInput): Promise<AgentRun> {
    const store = this.requireStore();
    const workstream = store.getWorkstream(input.workstreamId);
    if (!workstream) {
      throw new Error(`Workstream ${input.workstreamId} was not found.`);
    }
    if (workstream.status !== "running") {
      throw new Error("An approved plan is required before agent execution can start.");
    }

    const approvedPlan = selectApprovedPlan(store.listPlans(workstream.id), input.planId);
    if (!approvedPlan) {
      throw new Error("An approved plan is required before agent execution can start.");
    }

    if (this.activeBuildWorkstreamIds.has(workstream.id)) {
      throw new Error("A build-agent run is already active for this workstream.");
    }
    this.activeBuildWorkstreamIds.add(workstream.id);

    try {
      const runId = createRunId();
      const workspacePath = path.join(this.options.dataDir, "workspaces", workstream.id, runId);
      const branchName = `mergepilot/${workstream.id}/build/${runId}`;
      await mkdir(workspacePath, { recursive: true });

      let run = store.createAgentRun({
      id: runId,
      workstreamId: workstream.id,
      planId: approvedPlan.id,
      providerId: this.buildAgentAdapter.metadata.providerId,
      adapterId: this.buildAgentAdapter.metadata.adapterId ?? this.buildAgentAdapter.metadata.providerId,
      role: "build",
      status: "queued",
      goal: workstream.goal,
      workspacePath,
      branchName
    });

    const startedAt = new Date().toISOString();
    run = store.updateAgentRun({ id: run.id, status: "running", startedAt });
    store.appendEvent({
      workstreamId: workstream.id,
      type: "agent_started",
      message: "Build agent run started.",
      payload: {
        runId: run.id,
        planId: approvedPlan.id,
        providerId: run.providerId,
        adapterId: run.adapterId,
        workspacePath,
        branchName
      }
    });

    const artifacts: AdapterRunArtifactEvent[] = [];
    let result: AdapterRunResult;
    try {
      const handle = await this.buildAgentAdapter.run({
        runId: run.id,
        workstreamId: workstream.id,
        role: "build",
        goal: workstream.goal,
        workspacePath,
        repoPath: workstream.repo,
        branchName,
        baseBranch: workstream.githubRepository?.defaultBranch,
        instructions: buildAgentInstructions(workstream.goal, approvedPlan),
        metadata: {
          planId: approvedPlan.id,
          workstreamTitle: workstream.title,
          repository: workstream.repo
        }
      });

      for await (const event of handle.events) {
        if (event.type === "artifact") {
          artifacts.push(event);
        }
        persistAdapterEvent(store, workstream.id, run.id, event);
      }
      result = await handle.result;
      artifacts.push(...(result.artifacts ?? []));
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      run = store.updateAgentRun({ id: run.id, status: "failed", completedAt, summary: message });
      store.appendEvent({
        workstreamId: workstream.id,
        type: "human_action_required",
        message: "Build agent run failed.",
        payload: { runId: run.id, errorMessage: message }
      });
      store.updateWorkstreamStatus(workstream.id, "awaiting_user_input");
      store.updateWorkstreamSummary(workstream.id, message);
      return run;
    }

    const completedAt = result.completedAt ?? new Date().toISOString();
    const summary = result.summary ?? result.errorMessage ?? fallbackResultSummary(result.status);
    const finalStatus = result.status === "completed" ? "completed" : result.status === "cancelled" ? "cancelled" : "failed";
    run = store.updateAgentRun({ id: run.id, status: finalStatus, completedAt, summary });

    if (finalStatus === "completed") {
      store.appendEvent({
        workstreamId: workstream.id,
        type: "agent_completed",
        message: "Build agent run completed.",
        payload: {
          runId: run.id,
          summary,
          diff: extractArtifactContent(artifacts, "diff") ?? null,
          artifacts: summarizeArtifacts(artifacts)
        }
      });
      store.updateWorkstreamStatus(workstream.id, "awaiting_review");
      store.updateWorkstreamSummary(workstream.id, summary);
    } else {
      store.appendEvent({
        workstreamId: workstream.id,
        type: "human_action_required",
        message: finalStatus === "cancelled" ? "Build agent run cancelled." : "Build agent run failed.",
        payload: {
          runId: run.id,
          status: finalStatus,
          summary,
          errorMessage: result.errorMessage ?? null
        }
      });
      store.updateWorkstreamStatus(workstream.id, finalStatus === "cancelled" ? "cancelled" : "awaiting_user_input");
      store.updateWorkstreamSummary(workstream.id, summary);
    }

      return run;
    } finally {
      this.activeBuildWorkstreamIds.delete(workstream.id);
    }
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

function selectApprovedPlan(plans: Plan[], planId?: string): Plan | null {
  const approved = plans.filter((plan) => plan.status === "approved");
  if (planId) {
    return approved.find((plan) => plan.id === planId) ?? null;
  }
  return approved.at(-1) ?? null;
}

function createRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAgentInstructions(goal: string, plan: Plan): string {
  return [
    "Execute one bounded build-agent task for the approved coordinator plan.",
    `Goal: ${goal}`,
    `Approved plan: ${plan.title}`,
    `Goal restatement: ${plan.goalRestatement}`,
    "Plan steps:",
    ...plan.steps.map((step, index) => `${index + 1}. ${step}`),
    "Expected outputs:",
    ...plan.expectedOutputs.map((output) => `- ${output}`),
    "Capture command/test output and produce a concise summary plus diff evidence. Do not push or open a pull request."
  ].join("\n");
}

function persistAdapterEvent(store: OrchestratorStore, workstreamId: string, runId: string, event: AdapterRunEvent): void {
  if (event.type === "command") {
    store.appendEvent({
      workstreamId,
      type: "command_ran",
      message: `Build agent ran ${event.command}.`,
      payload: {
        runId,
        command: event.command,
        cwd: event.cwd ?? null,
        exitCode: event.exitCode ?? null
      }
    });
    return;
  }

  if (event.type === "artifact" && event.artifactType === "log") {
    store.appendEvent({
      workstreamId,
      type: "command_ran",
      message: "Build agent emitted runtime log output.",
      payload: {
        runId,
        artifactType: event.artifactType,
        path: event.path ?? null,
        content: truncateForPayload(event.content) ?? null
      }
    });
  }
}

function extractArtifactContent(artifacts: AdapterRunResult["artifacts"], artifactType: "diff" | "summary" | "log"): string | undefined {
  return artifacts?.find((artifact) => artifact.artifactType === artifactType && artifact.content?.trim())?.content;
}

function summarizeArtifacts(artifacts: AdapterRunResult["artifacts"]): Array<{ type: string; path?: string }> {
  return (artifacts ?? [])
    .map((artifact) => {
      const summary: { type: string; path?: string } = { type: artifact.artifactType };
      if (artifact.path) {
        summary.path = artifact.path;
      }
      return summary;
    })
    .slice(0, 20);
}

function fallbackResultSummary(status: AdapterRunResult["status"]): string {
  return status === "completed" ? "Build agent completed." : status === "cancelled" ? "Build agent cancelled." : "Build agent failed.";
}

function truncateForPayload(content: string | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  return content.length > 4000 ? `${content.slice(0, 4000)}…` : content;
}

class DeterministicBuildAgentAdapter implements AgentAdapter {
  readonly metadata = {
    providerId: "local-build-agent",
    adapterId: "deterministic-build",
    displayName: "Deterministic Build Agent",
    capabilities: {
      streamingEvents: true,
      cancellation: false,
      structuredResults: true,
      sessionResume: false
    },
    labels: ["local", "mvp"]
  };

  async detect() {
    return {
      providerId: this.metadata.providerId,
      status: "available" as const,
      checkedAt: new Date().toISOString(),
      message: "Deterministic local build agent is available."
    };
  }

  async health() {
    return {
      providerId: this.metadata.providerId,
      status: "healthy" as const,
      checkedAt: new Date().toISOString(),
      message: "Deterministic local build agent is healthy."
    };
  }

  async run(input: AdapterRunInput): Promise<AgentRunHandle> {
    const startedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();
    const commandEvent: AdapterRunEvent = {
      type: "command",
      runId: input.runId,
      providerId: this.metadata.providerId,
      timestamp: startedAt,
      command: "mergepilot-build-agent --dry-run",
      cwd: input.workspacePath,
      exitCode: 0
    };
    const summary = `Prepared scoped build workspace for ${input.workstreamId}.`;
    const artifacts = [
      {
        type: "artifact" as const,
        runId: input.runId,
        providerId: this.metadata.providerId,
        timestamp: completedAt,
        artifactType: "summary" as const,
        content: summary
      },
      {
        type: "artifact" as const,
        runId: input.runId,
        providerId: this.metadata.providerId,
        timestamp: completedAt,
        artifactType: "diff" as const,
        content: "No file changes produced by deterministic MVP build-agent adapter."
      }
    ];
    return {
      runId: input.runId,
      providerId: this.metadata.providerId,
      adapterId: this.metadata.adapterId,
      events: (async function* () {
        yield commandEvent;
      })(),
      result: Promise.resolve({
        runId: input.runId,
        providerId: this.metadata.providerId,
        adapterId: this.metadata.adapterId,
        status: "completed",
        summary,
        startedAt,
        completedAt,
        artifacts
      }),
      cancel: async () => undefined
    };
  }
}

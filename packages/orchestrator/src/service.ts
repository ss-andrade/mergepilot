import path from "node:path";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
  CreatePullRequestInput,
  CreateWorkstreamInput,
  LocalOrchestratorService,
  OrchestratorStatus,
  OrchestratorStore,
  Plan,
  OpenPullRequestInput,
  PlanDecisionInput,
  ProposePlanInput,
  PullRequest,
  PullRequestHumanAction,
  PullRequestPublisher,
  PullRequestReviewProvider,
  PullRequestReviewResult,
  RecordPullRequestReviewInput,
  ReportGitHubRepositoryConnectionErrorInput,
  StartBuildAgentRunInput,
  UpdateAgentRunInput,
  WorkstreamStatus
} from "./types.js";
import { createSqliteOrchestratorStore } from "./sqlite-store.js";

const execFileAsync = promisify(execFile);

export interface LocalOrchestratorOptions extends BuildAgentRunnerOptions {
  dataDir: string;
}

export class InProcessLocalOrchestrator implements LocalOrchestratorService {
  private store: OrchestratorStore | null = null;
  private readonly databasePath: string;
  private readonly buildAgentAdapter: AgentAdapter;
  private readonly pullRequestPublisher: PullRequestPublisher;
  private readonly pullRequestReviewProvider: PullRequestReviewProvider;
  private readonly activeBuildWorkstreamIds = new Set<string>();
  private readonly activePullRequestRunIds = new Set<string>();

  constructor(private readonly options: LocalOrchestratorOptions) {
    this.databasePath = path.join(options.dataDir, "mergepilot.sqlite3");
    this.buildAgentAdapter = options.buildAgentAdapter ?? new DeterministicBuildAgentAdapter();
    this.pullRequestPublisher = options.pullRequestPublisher ?? new DeterministicPullRequestPublisher();
    this.pullRequestReviewProvider = options.pullRequestReviewProvider ?? new GitHubCliPullRequestReviewProvider();
  }

  async start(): Promise<void> {
    if (this.store) {
      return;
    }

    this.store = createSqliteOrchestratorStore({ dataDir: this.options.dataDir });
  }

  async stop(): Promise<void> {
    if (this.activeBuildWorkstreamIds.size > 0 || this.activePullRequestRunIds.size > 0) {
      throw new Error("Cannot stop the local orchestrator while agent lifecycle operations are active.");
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

  createPullRequest(input: CreatePullRequestInput) {
    return this.requireStore().createPullRequest(input);
  }

  listPullRequests(workstreamId: string) {
    return this.requireStore().listPullRequests(workstreamId);
  }

  recordPullRequestReview(input: RecordPullRequestReviewInput) {
    return this.requireStore().recordPullRequestReview(input);
  }

  async syncPullRequestReview(input: { workstreamId: string; pullRequestId: string }): Promise<PullRequest> {
    const store = this.requireStore();
    const workstream = store.getWorkstream(input.workstreamId);
    if (!workstream) {
      throw new Error(`Workstream ${input.workstreamId} was not found.`);
    }
    const pullRequest = store.listPullRequests(workstream.id).find((candidate) => candidate.id === input.pullRequestId);
    if (!pullRequest) {
      throw new Error(`Pull request ${input.pullRequestId} was not found for workstream ${workstream.id}.`);
    }
    if (pullRequest.status !== "open") {
      throw new Error("Only open pull requests can sync checks and review summaries.");
    }

    const review = await this.pullRequestReviewProvider.syncPullRequestReview({ workstream, pullRequest });
    return store.recordPullRequestReview({
      workstreamId: workstream.id,
      pullRequestId: pullRequest.id,
      ...review
    });
  }

  async openPullRequest(input: OpenPullRequestInput): Promise<PullRequest> {
    const store = this.requireStore();
    const workstream = store.getWorkstream(input.workstreamId);
    if (!workstream) {
      throw new Error(`Workstream ${input.workstreamId} was not found.`);
    }
    const run = store.listAgentRuns(workstream.id).find((candidate) => candidate.id === input.agentRunId);
    if (!run) {
      throw new Error(`Agent run ${input.agentRunId} was not found for workstream ${workstream.id}.`);
    }
    if (run.status !== "completed" || !run.branchName) {
      throw new Error("Pull requests can only be opened from completed build-agent runs with branch metadata.");
    }
    const existing = store.listPullRequests(workstream.id).find((pullRequest) => pullRequest.agentRunId === run.id && pullRequest.status === "open");
    if (existing) {
      return existing;
    }
    if (workstream.status !== "awaiting_review") {
      throw new Error("A completed build-agent run awaiting review is required before opening a pull request.");
    }
    if (this.activePullRequestRunIds.has(run.id)) {
      throw new Error("A pull request is already being opened for this agent run.");
    }

    const title = input.title?.trim() || `${workstream.title}: build-agent changes`;
    const body = input.body?.trim() || `Automated build-agent changes for workstream ${workstream.id}.`;
    this.activePullRequestRunIds.add(run.id);
    try {
      const published = await this.pullRequestPublisher.openPullRequest({ workstream, agentRun: run, title, body });
      return store.recordPublishedPullRequest({
        workstreamId: workstream.id,
        agentRunId: run.id,
        branchName: published.branchName,
        commitSha: published.commitSha,
        prNumber: published.prNumber,
        prUrl: published.prUrl,
        title,
        body,
        status: "open"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return store.recordFailedPullRequest({
        workstreamId: workstream.id,
        agentRunId: run.id,
        branchName: run.branchName,
        commitSha: "unpublished",
        prNumber: null,
        prUrl: null,
        title,
        body,
        status: "failed",
        errorMessage: message
      });
    } finally {
      this.activePullRequestRunIds.delete(run.id);
    }
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

class DeterministicPullRequestPublisher implements PullRequestPublisher {
  async openPullRequest(input: Parameters<PullRequestPublisher["openPullRequest"]>[0]): Promise<{ branchName: string; commitSha: string; prNumber: number; prUrl: string }> {
    const [owner, name] = input.workstream.repo.split("/");
    const safeOwner = owner || "local";
    const safeName = name || "repository";
    const branchName = input.agentRun.branchName ?? `mergepilot/${input.workstream.id}/build/${input.agentRun.id}`;
    const commitSha = `mp-${input.agentRun.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).padEnd(12, "0")}`;
    const prNumber = deterministicPullRequestNumber(input.workstream.id, input.agentRun.id);
    return {
      branchName,
      commitSha,
      prNumber,
      prUrl: `https://github.com/${safeOwner}/${safeName}/pull/${prNumber}`
    };
  }
}

function deterministicPullRequestNumber(workstreamId: string, agentRunId: string): number {
  const value = `${workstreamId}:${agentRunId}`;
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9000;
  }
  return hash + 1000;
}

class GitHubCliPullRequestReviewProvider implements PullRequestReviewProvider {
  async syncPullRequestReview(input: Parameters<PullRequestReviewProvider["syncPullRequestReview"]>[0]) {
    const repo = repositorySlug(input.workstream.repo);
    if (!repo || input.pullRequest.prNumber === null) {
      return blockedReview("fix_access", "Missing repository or PR number; connect GitHub access before syncing checks.");
    }

    try {
      const { stdout } = await execFileAsync("gh", [
        "pr",
        "view",
        String(input.pullRequest.prNumber),
        "--repo",
        repo,
        "--json",
        "files,statusCheckRollup,reviewDecision,mergeStateStatus,title,url"
      ], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const data = JSON.parse(stdout) as {
        files?: Array<{ path?: string }>;
        statusCheckRollup?: Array<Record<string, unknown>>;
        reviewDecision?: string;
        mergeStateStatus?: string;
        title?: string;
      };
      return deriveGitHubPullRequestReviewResult(data, input.pullRequest.branchName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return blockedReview("fix_access", `Unable to sync PR checks through GitHub CLI: ${message}`);
    }
  }
}

export function deriveGitHubPullRequestReviewResult(data: {
  files?: Array<{ path?: string }>;
  statusCheckRollup?: Array<Record<string, unknown>>;
  reviewDecision?: string;
  mergeStateStatus?: string;
}, fallbackChangedFile: string): PullRequestReviewResult {
  const changedFiles = (data.files ?? []).map((file) => file.path).filter((file): file is string => Boolean(file));
  const checks = data.statusCheckRollup ?? [];
  const checksStatus = deriveChecksStatus(checks);
  const reviewDecision = data.reviewDecision ?? "";
  const mergeStateStatus = data.mergeStateStatus ?? "UNKNOWN";
  const mergeStateReady = ["CLEAN", "HAS_HOOKS"].includes(mergeStateStatus);
  const reviewStatus = reviewDecision === "CHANGES_REQUESTED"
    ? "changes_requested"
    : checksStatus === "failed" || (checksStatus === "passed" && !mergeStateReady)
      ? "blocked"
      : checksStatus === "passed"
        ? "ready"
        : "not_started";
  const humanAction = checksStatus === "passed" && reviewStatus === "ready" && mergeStateReady ? "merge" : "review";
  const ciSummary = summarizeChecks(checksStatus, checks);
  const mergeSummary = mergeStateReady
    ? `GitHub merge state is ${mergeStateStatus}.`
    : `GitHub merge state is ${mergeStateStatus}; resolve branch protection, conflicts, draft status, or required review before merging.`;
  return {
    checksStatus,
    reviewStatus,
    changedFiles: changedFiles.length > 0 ? changedFiles : [fallbackChangedFile],
    testCommands: extractTestCommands(checks),
    ciSummary,
    riskSummary: checksStatus === "passed" && mergeStateReady
      ? "No blocking CI or merge-state risk detected from synced PR checks."
      : `PR is not merge-ready until checks and merge state are resolved. ${mergeSummary}`,
    reviewSummary: `${ciSummary} ${mergeSummary} ${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} synced for human review.`,
    humanAction
  };
}

function repositorySlug(repo: string): string | null {
  const match = repo.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function deriveChecksStatus(checks: Array<Record<string, unknown>>): "unknown" | "pending" | "passed" | "failed" {
  if (checks.length === 0) return "unknown";
  if (checks.some((check) => ["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "CANCELLED"].includes(String(check.conclusion ?? check.state ?? "")))) {
    return "failed";
  }
  if (checks.some((check) => ["PENDING", "QUEUED", "IN_PROGRESS", "REQUESTED", "WAITING", "EXPECTED"].includes(String(check.status ?? check.state ?? "")))) {
    return "pending";
  }
  return "passed";
}

function summarizeChecks(status: "unknown" | "pending" | "passed" | "failed", checks: Array<Record<string, unknown>>): string {
  const count = checks.length;
  if (status === "passed") return `CI passed (${count} check${count === 1 ? "" : "s"}).`;
  if (status === "failed") return `CI failed (${count} check${count === 1 ? "" : "s"}).`;
  if (status === "pending") return `CI is still pending (${count} check${count === 1 ? "" : "s"}).`;
  return "No CI checks were reported for this pull request.";
}

function extractTestCommands(checks: Array<Record<string, unknown>>): string[] {
  const names = checks.map((check) => String(check.name ?? check.context ?? "").trim()).filter(Boolean);
  return names.length > 0 ? names.slice(0, 20) : ["GitHub PR checks sync"];
}

function blockedReview(humanAction: "review" | "fix_access" | "answer_question", message: string) {
  return {
    checksStatus: "unknown" as const,
    reviewStatus: "blocked" as const,
    changedFiles: ["PR metadata unavailable"],
    testCommands: ["GitHub PR checks sync"],
    ciSummary: message,
    riskSummary: "Merge readiness could not be verified.",
    reviewSummary: message,
    humanAction
  };
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

import {
  ActivityIcon,
  BellIcon,
  BotIcon,
  CheckCircle2Icon,
  CommandIcon,
  GitPullRequestIcon,
  LaptopIcon,
  LayoutDashboardIcon,
  MoonIcon,
  PanelLeftIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  SunIcon,
  WorkflowIcon
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, Panel } from "./components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./components/ui/dialog";
import { Input, Label, Select, Textarea } from "./components/ui/form";
import { ThemePreference, useTheme } from "./hooks/useTheme";

interface TimelineState {
  selectedWorkstreamId: string | null;
  events: WorkstreamEvent[];
}

interface PlanState {
  selectedWorkstreamId: string | null;
  plans: Plan[];
}

interface AgentRunState {
  selectedWorkstreamId: string | null;
  runs: AgentRun[];
}

interface PullRequestState {
  selectedWorkstreamId: string | null;
  pullRequests: PullRequest[];
}

interface WorkstreamFormState {
  title: string;
  goal: string;
  repo: string;
  repositoryId: string;
  summary: string;
}

interface GitHubRepositoryFormState {
  owner: string;
  name: string;
  defaultBranch: string;
}

const fallbackSections = [
  {
    icon: WorkflowIcon,
    label: "Workstreams",
    title: "No active workstreams",
    body: "Create and track engineering goals from plan approval through PR review."
  },
  {
    icon: BellIcon,
    label: "Human Attention",
    title: "Queue clear",
    body: "Plan approvals, access requests, blockers, and merge decisions will appear here."
  },
  {
    icon: ShieldCheckIcon,
    label: "Run Evidence",
    title: "Awaiting first run",
    body: "Command output, branch changes, checks, and review summaries will be captured in the timeline."
  }
];

const navItems = [
  { href: "#workstreams", icon: LayoutDashboardIcon, label: "Workstreams" },
  { href: "#timeline", icon: ActivityIcon, label: "Timeline" },
  { href: "#agents", icon: BotIcon, label: "Agents" },
  { href: "#settings", icon: SettingsIcon, label: "Settings" }
];

const emptyForm: WorkstreamFormState = {
  title: "",
  goal: "",
  repo: "",
  repositoryId: "",
  summary: ""
};

const emptyRepositoryForm: GitHubRepositoryFormState = {
  owner: "",
  name: "",
  defaultBranch: "main"
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getStatusTone(status: Workstream["status"]) {
  if (status === "running" || status === "merge_ready") return "success";
  if (status === "awaiting_user_input" || status === "awaiting_review" || status === "awaiting_plan_approval") return "warning";
  if (status === "completed") return "accent";
  if (status === "failed" || status === "cancelled") return "danger";
  return "muted";
}

function deriveTitleFromGoal(goal: string) {
  const normalized = goal.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const sentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  const concise = sentence.split(/\s+(?:with|for|to|so that)\s+/i)[0]?.trim() || sentence;
  return concise.length > 32 ? `${concise.slice(0, 29).trim()}...` : concise;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mp-kbd">{children}</kbd>;
}

export function App() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [runtimeInfo, setRuntimeInfo] = useState<MergePilotRuntimeInfo | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositoryConnection[]>([]);
  const [timeline, setTimeline] = useState<TimelineState>({ selectedWorkstreamId: null, events: [] });
  const [planState, setPlanState] = useState<PlanState>({ selectedWorkstreamId: null, plans: [] });
  const [agentRunState, setAgentRunState] = useState<AgentRunState>({ selectedWorkstreamId: null, runs: [] });
  const [pullRequestState, setPullRequestState] = useState<PullRequestState>({ selectedWorkstreamId: null, pullRequests: [] });
  const [error, setError] = useState<string | null>(null);
  const [humanAttentionMessage, setHumanAttentionMessage] = useState<string | null>(null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newWorkstreamOpen, setNewWorkstreamOpen] = useState(false);
  const [repositoryDialogOpen, setRepositoryDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [formState, setFormState] = useState<WorkstreamFormState>(emptyForm);
  const [repositoryFormState, setRepositoryFormState] = useState<GitHubRepositoryFormState>(emptyRepositoryForm);

  const isRunning = orchestratorStatus?.state === "running";
  const selectedWorkstream = workstreams.find((workstream) => workstream.id === timeline.selectedWorkstreamId) ?? null;
  const selectedRepository = repositories.find((repository) => repository.id === formState.repositoryId) ?? null;
  const currentPlan = selectedWorkstream
    ? planState.plans.find((plan) => plan.status === "draft") ?? planState.plans.at(-1) ?? null
    : null;

  useEffect(() => {
    window.mergePilot.getRuntimeInfo().then(setRuntimeInfo).catch(() => {
      setRuntimeInfo(null);
    });
    refreshOrchestrator().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Unable to load orchestrator state.");
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandKey = event.metaKey || event.ctrlKey;
      if (isCommandKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function refreshOrchestrator(preferredWorkstreamId?: string | null) {
    const status = await window.mergePilot.orchestrator.status();
    setOrchestratorStatus(status);

    if (status.state !== "running") {
      setWorkstreams([]);
      setRepositories([]);
      setTimeline({ selectedWorkstreamId: null, events: [] });
      setPlanState({ selectedWorkstreamId: null, plans: [] });
      setAgentRunState({ selectedWorkstreamId: null, runs: [] });
      setPullRequestState({ selectedWorkstreamId: null, pullRequests: [] });
      return;
    }

    const [nextWorkstreams, nextRepositories] = await Promise.all([
      window.mergePilot.workstreams.list(),
      window.mergePilot.github.repositories.list()
    ]);
    setWorkstreams(nextWorkstreams);
    setRepositories(nextRepositories);
    const selected = preferredWorkstreamId ?? timeline.selectedWorkstreamId ?? nextWorkstreams[0]?.id ?? null;
    const selectedExists = selected ? nextWorkstreams.some((workstream) => workstream.id === selected) : false;
    const nextSelected = selectedExists ? selected : nextWorkstreams[0]?.id ?? null;
    const [nextEvents, nextPlans, nextAgentRuns, nextPullRequests] = nextSelected
      ? await Promise.all([
          window.mergePilot.events.list(nextSelected),
          window.mergePilot.plans.list(nextSelected),
          window.mergePilot.agents.listRuns(nextSelected),
          window.mergePilot.pullRequests.list(nextSelected)
        ])
      : [[], [], [], []];
    setTimeline({
      selectedWorkstreamId: nextSelected,
      events: nextEvents
    });
    setPlanState({ selectedWorkstreamId: nextSelected, plans: nextPlans });
    setAgentRunState({ selectedWorkstreamId: nextSelected, runs: nextAgentRuns });
    setPullRequestState({ selectedWorkstreamId: nextSelected, pullRequests: nextPullRequests });
  }

  async function startOrchestrator() {
    setError(null);
    try {
      await window.mergePilot.orchestrator.start();
      await refreshOrchestrator();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start orchestrator.");
    }
  }

  async function stopOrchestrator() {
    setError(null);
    try {
      const status = await window.mergePilot.orchestrator.stop();
      setOrchestratorStatus(status);
      setWorkstreams([]);
      setRepositories([]);
      setTimeline({ selectedWorkstreamId: null, events: [] });
      setPlanState({ selectedWorkstreamId: null, plans: [] });
      setAgentRunState({ selectedWorkstreamId: null, runs: [] });
      setPullRequestState({ selectedWorkstreamId: null, pullRequests: [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to stop orchestrator.");
    }
  }

  async function createWorkstream(input?: WorkstreamFormState) {
    setError(null);
    try {
      if (orchestratorStatus?.state !== "running") {
        await window.mergePilot.orchestrator.start();
      }
      const title = input?.title.trim() || `Workstream ${workstreams.length + 1}`;
      const repository = input?.repositoryId
        ? repositories.find((candidate) => candidate.id === input.repositoryId) ?? null
        : null;
      const created = await window.mergePilot.workstreams.create({
        title,
        goal: input?.goal.trim() || "Coordinate and verify a local engineering goal through MergePilot.",
        repo: repository ? `${repository.owner}/${repository.name}` : input?.repo.trim() || "local/workspace",
        githubRepository: repository
          ? {
              id: repository.id,
              owner: repository.owner,
              name: repository.name,
              defaultBranch: repository.defaultBranch,
              htmlUrl: repository.htmlUrl,
              apiUrl: repository.apiUrl
            }
          : null,
        createdBy: "renderer",
        summary: input?.summary.trim() || "Created through the secure Electron bridge."
      });
      await window.mergePilot.events.append({
        workstreamId: created.id,
        type: "user_message",
        message: "Workstream created from renderer",
        payload: { surface: "web", action: "workstream_created" }
      });
      setFormState(emptyForm);
      setNewWorkstreamOpen(false);
      await refreshOrchestrator(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create workstream.");
    }
  }

  async function appendTimelineEvent(workstreamId: string) {
    setError(null);
    try {
      await window.mergePilot.events.append({
        workstreamId,
        type: "coordinator_message",
        message: "Timeline note appended from renderer",
        payload: { surface: "web", action: "timeline_note" }
      });
      setTimeline({
        selectedWorkstreamId: workstreamId,
        events: await window.mergePilot.events.list(workstreamId)
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to append event.");
    }
  }

  async function selectWorkstream(workstreamId: string) {
    const [events, plans, runs, pullRequests] = await Promise.all([
      window.mergePilot.events.list(workstreamId),
      window.mergePilot.plans.list(workstreamId),
      window.mergePilot.agents.listRuns(workstreamId),
      window.mergePilot.pullRequests.list(workstreamId)
    ]);
    setTimeline({ selectedWorkstreamId: workstreamId, events });
    setPlanState({ selectedWorkstreamId: workstreamId, plans });
    setAgentRunState({ selectedWorkstreamId: workstreamId, runs });
    setPullRequestState({ selectedWorkstreamId: workstreamId, pullRequests });
    setSidebarOpen(false);
  }

  async function proposeCoordinatorPlan(workstreamId: string) {
    setError(null);
    try {
      await window.mergePilot.plans.propose({ workstreamId });
      await refreshOrchestrator(workstreamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate coordinator plan.");
    }
  }

  async function approveCoordinatorPlan(plan: Plan) {
    setError(null);
    try {
      await window.mergePilot.plans.approve({ workstreamId: plan.workstreamId, planId: plan.id });
      await refreshOrchestrator(plan.workstreamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve coordinator plan.");
    }
  }

  async function rejectCoordinatorPlan(plan: Plan) {
    setError(null);
    try {
      await window.mergePilot.plans.reject({
        workstreamId: plan.workstreamId,
        planId: plan.id,
        reason: "Needs edits before execution."
      });
      setHumanAttentionMessage("Coordinator plan rejected. Update the goal or generate a revised plan.");
      await refreshOrchestrator(plan.workstreamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reject coordinator plan.");
    }
  }

  async function startBuildAgentRun(workstreamId: string) {
    setError(null);
    try {
      const run = await window.mergePilot.agents.startBuildRun({ workstreamId });
      setHumanAttentionMessage(run.status === "completed" ? "Build agent finished and the workstream is ready for review." : `Build agent ${run.status}.`);
      await refreshOrchestrator(workstreamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start build agent run.");
    }
  }

  async function openPullRequestForRun(run: AgentRun) {
    setError(null);
    try {
      const pullRequest = await window.mergePilot.pullRequests.open({ workstreamId: run.workstreamId, agentRunId: run.id });
      setHumanAttentionMessage(
        pullRequest.status === "open" && pullRequest.prUrl
          ? `Pull request opened: ${pullRequest.prUrl}`
          : pullRequest.errorMessage ?? "Pull request creation needs human attention."
      );
      await refreshOrchestrator(run.workstreamId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open pull request.");
    }
  }

  function submitWorkstream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createWorkstream(formState);
  }

  function updateGoalPrompt(goal: string) {
    setFormState((current) => {
      const previousDerived = deriveTitleFromGoal(current.goal);
      const shouldDeriveTitle = !current.title.trim() || current.title === previousDerived;
      return {
        ...current,
        goal,
        title: shouldDeriveTitle ? deriveTitleFromGoal(goal) : current.title
      };
    });
  }

  async function submitRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRepositoryError(null);
    setHumanAttentionMessage(null);
    try {
      if (orchestratorStatus?.state !== "running") {
        await window.mergePilot.orchestrator.start();
      }
      const repository = await window.mergePilot.github.repositories.connect({
        owner: repositoryFormState.owner,
        name: repositoryFormState.name,
        defaultBranch: repositoryFormState.defaultBranch,
        htmlUrl: `https://github.com/${repositoryFormState.owner.trim()}/${repositoryFormState.name.trim()}`,
        apiUrl: `https://api.github.com/repos/${repositoryFormState.owner.trim()}/${repositoryFormState.name.trim()}`
      });
      const selected = await window.mergePilot.github.repositories.select(repository.id);
      setRepositoryFormState(emptyRepositoryForm);
      setRepositoryDialogOpen(false);
      setFormState((current) => ({ ...current, repo: `${selected.owner}/${selected.name}`, repositoryId: selected.id }));
      await refreshOrchestrator(timeline.selectedWorkstreamId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to connect GitHub repository.";
      setError(message);
      setRepositoryError(message);
      setHumanAttentionMessage(message);
      setRepositoryDialogOpen(false);
      if (selectedWorkstream) {
        try {
          await window.mergePilot.github.repositories.reportError({
            workstreamId: selectedWorkstream.id,
            repository: `${repositoryFormState.owner}/${repositoryFormState.name}`,
            message,
            reason: "repository_connection_failed"
          });
          setTimeline({
            selectedWorkstreamId: selectedWorkstream.id,
            events: await window.mergePilot.events.list(selectedWorkstream.id)
          });
        } catch {
          // Keep the visible human attention message even if there is no persisted workstream event yet.
        }
      }
    }
  }

  function selectRepository(repositoryId: string) {
    const repository = repositories.find((candidate) => candidate.id === repositoryId) ?? null;
    setFormState((current) => ({
      ...current,
      repositoryId,
      repo: repository ? `${repository.owner}/${repository.name}` : current.repo
    }));
    if (repository) {
      void window.mergePilot.github.repositories.select(repository.id).then(() => refreshOrchestrator(timeline.selectedWorkstreamId));
    }
  }

  const commandActions = useMemo(
    () => [
      {
        label: "Create new workstream",
        description: "Open the workstream form",
        icon: PlusIcon,
        run: () => setNewWorkstreamOpen(true)
      },
      {
        label: isRunning ? "Stop orchestrator" : "Start orchestrator",
        description: "Toggle the local coordinator process",
        icon: isRunning ? SquareIcon : PlayIcon,
        run: () => void (isRunning ? stopOrchestrator() : startOrchestrator())
      },
      {
        label: "Connect GitHub repo",
        description: "Add or select a repository scope",
        icon: GitPullRequestIcon,
        run: () => setRepositoryDialogOpen(true)
      },
      {
        label: "Open settings",
        description: "Change renderer preferences",
        icon: SettingsIcon,
        run: () => setSettingsOpen(true)
      },
      {
        label: "Refresh workspace",
        description: "Reload status, workstreams, and timeline",
        icon: ActivityIcon,
        run: () => void refreshOrchestrator()
      }
    ],
    [isRunning, workstreams.length]
  );

  const filteredCommands = commandActions.filter((action) => {
    const query = commandQuery.toLowerCase();
    return action.label.toLowerCase().includes(query) || action.description.toLowerCase().includes(query);
  });

  return (
    <main className="mp-app">
      <aside className={`mp-sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Primary">
        <div className="mp-sidebar__inner">
          <div className="mp-brand">
            <div className="mp-brand__mark" aria-hidden="true">
              MP
            </div>
            <div>
              <p className="mp-eyebrow">MergePilot</p>
              <h1>Delivery Control</h1>
            </div>
          </div>

          <button className="mp-command-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <SearchIcon aria-hidden="true" />
            <span>Search commands</span>
            <span className="mp-kbd-group">
              <Kbd>{navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <nav className="mp-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a href={item.href} key={item.href} aria-current={item.href === "#workstreams" ? "page" : undefined}>
                <item.icon aria-hidden="true" />
                {item.label}
              </a>
            ))}
          </nav>

          <div className="mp-sidebar-list">
            <div className="mp-sidebar-list__header">
              <span>Active queue</span>
              <Badge tone={isRunning ? "success" : "muted"}>{orchestratorStatus?.state ?? "checking"}</Badge>
            </div>
            {workstreams.length > 0 ? (
              workstreams.map((workstream) => (
                <button
                  className="mp-workstream-row"
                  data-selected={workstream.id === timeline.selectedWorkstreamId ? "true" : undefined}
                  key={workstream.id}
                  onClick={() => void selectWorkstream(workstream.id)}
                  type="button"
                >
                  <span>{workstream.title}</span>
                  <small>{workstream.status}</small>
                </button>
              ))
            ) : (
              <p className="mp-sidebar-empty">No saved workstreams yet.</p>
            )}
          </div>

          <div className="mp-sidebar__footer">
            <RuntimeTile label="Desktop shell" value={runtimeInfo?.electronVersion ? `Electron ${runtimeInfo.electronVersion}` : "Electron"} detail={runtimeInfo?.platform ?? "Loading runtime"} icon={<LaptopIcon aria-hidden="true" />} />
            <RuntimeTile label="Data path" value={orchestratorStatus?.dataDir ? "Local persistence" : "Pending"} detail={orchestratorStatus?.dataDir ?? "Orchestrator not checked"} icon={<GitPullRequestIcon aria-hidden="true" />} />
          </div>
        </div>
      </aside>

      {sidebarOpen ? <button className="mp-scrim" type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} /> : null}

      <section className="mp-workspace" id="workstreams">
        <header className="mp-topbar">
          <div className="mp-topbar__title">
            <Button aria-label="Open sidebar" className="mp-mobile-menu" size="icon" variant="ghost" onClick={() => setSidebarOpen(true)}>
              <PanelLeftIcon />
            </Button>
            <div>
              <p className="mp-eyebrow">Local-first workspace</p>
              <h2>{selectedWorkstream?.title ?? "Workstream workspace"}</h2>
            </div>
          </div>
          <div className="mp-topbar__actions">
            <Button variant="secondary" onClick={startOrchestrator} disabled={isRunning}>
              <PlayIcon aria-hidden="true" />
              Start
            </Button>
            <Button variant="destructive" onClick={stopOrchestrator} disabled={!isRunning}>
              <SquareIcon aria-hidden="true" />
              Stop
            </Button>
            <Dialog open={repositoryDialogOpen} onOpenChange={setRepositoryDialogOpen}>
              <DialogTrigger render={<Button variant="outline" />}>
                <GitPullRequestIcon aria-hidden="true" />
                Connect GitHub repo
              </DialogTrigger>
              <RepositoryDialog error={repositoryError} formState={repositoryFormState} onSubmit={submitRepository} setFormState={setRepositoryFormState} />
            </Dialog>
            <Dialog open={newWorkstreamOpen} onOpenChange={setNewWorkstreamOpen}>
              <DialogTrigger render={<Button />}>
                <PlusIcon aria-hidden="true" />
                New Workstream
              </DialogTrigger>
              <NewWorkstreamDialog
                formState={formState}
                repositories={repositories}
                selectedRepository={selectedRepository}
                setFormState={setFormState}
                onGoalChange={updateGoalPrompt}
                onRepositoryChange={selectRepository}
                onSubmit={submitWorkstream}
              />
            </Dialog>
          </div>
        </header>

        {error ? <p className="mp-error" role="alert">{error}</p> : null}

        <section className="mp-hero" aria-label="Current workstream overview">
          <div className="mp-hero__copy">
            <Badge tone={isRunning ? "success" : "warning"}>
              <span className={`mp-status-dot${isRunning ? "" : " is-idle"}`} aria-hidden="true" />
              {isRunning ? "Coordinator running" : "Coordinator stopped"}
            </Badge>
            <p>
              {selectedWorkstream
                ? selectedWorkstream.summary ?? selectedWorkstream.goal
                : "Coordinator, build agents, PR checks, and human decisions land in this desktop surface."}
            </p>
          </div>
          <div className="mp-hero__metrics">
            <Metric label="Workstreams" value={String(workstreams.length)} />
            <Metric label="Timeline events" value={String(timeline.events.length)} />
            <Metric label="Theme" value={resolvedTheme} />
          </div>
        </section>

        <div className="mp-content-grid">
          <section className="mp-main-column">
            <div className="mp-section-heading">
              <div>
                <p className="mp-eyebrow">Control plane</p>
                <h3>Workstreams</h3>
              </div>
              <Button variant="outline" onClick={() => void refreshOrchestrator()}>
                <ActivityIcon aria-hidden="true" />
                Refresh
              </Button>
            </div>
            <div className="mp-card-grid" role="region" aria-label="Workstream list">
              {workstreams.length > 0
                ? workstreams.map((workstream) => (
                    <Card className="mp-workstream-card" key={workstream.id}>
                      <div className="mp-card__header">
                        <Badge tone={getStatusTone(workstream.status)}>{workstream.status}</Badge>
                        <span>{formatDate(workstream.updatedAt)}</span>
                      </div>
                      <h4>{workstream.title}</h4>
                      <p>{workstream.summary ?? workstream.goal}</p>
                      <code>{workstream.repo}</code>
                      <div className="mp-card__footer">
                        <Button aria-label={`View timeline for ${workstream.title}`} variant="outline" onClick={() => void selectWorkstream(workstream.id)}>
                          View timeline
                        </Button>
                        <Button aria-label={`Add event to ${workstream.title}`} variant="ghost" onClick={() => void appendTimelineEvent(workstream.id)}>
                          Add event
                        </Button>
                      </div>
                    </Card>
                  ))
                : fallbackSections.map((section) => (
                    <Card className="mp-workstream-card" key={section.label}>
                      <section.icon aria-hidden="true" />
                      <p className="mp-eyebrow">{section.label}</p>
                      <h4>{section.title}</h4>
                      <p>{section.body}</p>
                    </Card>
                  ))}
            </div>

            <Panel className="mp-workstream-detail" role="region" aria-label="Workstream detail">
              {selectedWorkstream ? (
                <>
                  <div className="mp-section-heading">
                    <div>
                      <p className="mp-eyebrow">Workstream detail page</p>
                      <h3>{selectedWorkstream.title}</h3>
                    </div>
                    <Badge tone={getStatusTone(selectedWorkstream.status)}>{selectedWorkstream.status}</Badge>
                  </div>
                  <p className="mp-detail-summary">{selectedWorkstream.summary ?? selectedWorkstream.goal}</p>
                  <dl className="mp-detail-grid">
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedWorkstream.status}</dd>
                    </div>
                    <div>
                      <dt>Repository</dt>
                      <dd>{selectedWorkstream.repo}</dd>
                    </div>
                    <div>
                      <dt>Created by</dt>
                      <dd>{selectedWorkstream.createdBy}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDate(selectedWorkstream.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="mp-detail-goal">
                    <span>Goal prompt</span>
                    <p>{selectedWorkstream.goal}</p>
                  </div>
                  <div className="mp-card__footer">
                    <Button variant="outline" onClick={() => void appendTimelineEvent(selectedWorkstream.id)}>
                      Add event
                    </Button>
                    <Button variant="ghost" onClick={() => void refreshOrchestrator(selectedWorkstream.id)}>
                      Refresh detail
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mp-empty-state">
                  <WorkflowIcon aria-hidden="true" />
                  <strong>Select a workstream</strong>
                  <p>Create or select a workstream to inspect status, summary, goal, and repository context.</p>
                </div>
              )}
            </Panel>

            <Panel className="mp-github-repositories" role="region" aria-label="GitHub repositories">
              <div className="mp-section-heading">
                <div>
                  <p className="mp-eyebrow">GitHub integration</p>
                  <h3>Repositories</h3>
                </div>
                <Button variant="outline" onClick={() => setRepositoryDialogOpen(true)}>
                  <GitPullRequestIcon aria-hidden="true" />
                  Add repository
                </Button>
              </div>
              <div className="mp-repository-list">
                {repositories.length > 0 ? (
                  repositories.map((repository) => (
                    <button
                      className="mp-repository-row"
                      data-selected={repository.selectedAt ? "true" : undefined}
                      key={repository.id}
                      onClick={() => selectRepository(repository.id)}
                      type="button"
                    >
                      <span>{repository.owner}/{repository.name}</span>
                      <small>Default branch {repository.defaultBranch}</small>
                    </button>
                  ))
                ) : (
                  <div className="mp-empty-state">
                    <GitPullRequestIcon aria-hidden="true" />
                    <strong>No GitHub repositories connected</strong>
                    <p>Connect a repository to scope new workstreams to owner, name, and default branch metadata.</p>
                  </div>
                )}
              </div>
            </Panel>

            <Panel className="mp-coordinator-plan" role="region" aria-label="Coordinator plan">
              <div className="mp-section-heading">
                <div>
                  <p className="mp-eyebrow">Coordinator planning loop</p>
                  <h3>Coordinator plan</h3>
                </div>
                {selectedWorkstream ? (
                  <Button variant="outline" onClick={() => void proposeCoordinatorPlan(selectedWorkstream.id)}>
                    Generate plan
                  </Button>
                ) : null}
              </div>
              {currentPlan ? (
                <div className="mp-plan-card">
                  <div className="mp-section-heading">
                    <div>
                      <p className="mp-eyebrow">Goal restatement</p>
                      <h4>{currentPlan.goalRestatement}</h4>
                    </div>
                    <Badge tone={currentPlan.status === "approved" ? "success" : currentPlan.status === "rejected" ? "danger" : "warning"}>{currentPlan.status}</Badge>
                  </div>
                  <PlanList title="Steps" items={currentPlan.steps} ordered />
                  <PlanList title="Risks" items={currentPlan.risks} />
                  <PlanList title="Expected outputs" items={currentPlan.expectedOutputs} />
                  {currentPlan.status === "draft" ? (
                    <div className="mp-card__footer">
                      <Button variant="secondary" onClick={() => void approveCoordinatorPlan(currentPlan)}>Approve plan</Button>
                      <Button variant="outline" onClick={() => void rejectCoordinatorPlan(currentPlan)}>Reject plan</Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mp-empty-state">
                  <SparklesIcon aria-hidden="true" />
                  <strong>No coordinator plan yet</strong>
                  <p>Generate a plan to restate the goal, list steps, identify risks, and define expected outputs before execution.</p>
                </div>
              )}
            </Panel>

            <Panel className="mp-agent-runs" role="region" aria-label="Agent runs">
              <div className="mp-section-heading">
                <div>
                  <p className="mp-eyebrow">Build-agent execution loop</p>
                  <h3>Agent runs</h3>
                </div>
                {selectedWorkstream?.status === "running" ? (
                  <Button variant="secondary" onClick={() => void startBuildAgentRun(selectedWorkstream.id)}>
                    <BotIcon aria-hidden="true" />
                    Start build agent
                  </Button>
                ) : null}
              </div>
              {agentRunState.runs.length > 0 ? (
                <div className="mp-agent-run-list">
                  {agentRunState.runs.map((run) => (
                    <div className="mp-agent-run-row" key={run.id}>
                      <div>
                        <strong>{run.role} agent</strong>
                        <p>{run.summary ?? run.goal}</p>
                        {run.workspacePath ? <code>{run.workspacePath}</code> : null}
                      </div>
                      <div className="mp-agent-run-actions">
                        <Badge tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : "warning"}>{run.status}</Badge>
                        {pullRequestState.pullRequests.find((pullRequest) => pullRequest.agentRunId === run.id && pullRequest.status === "open") ? (
                          <a
                            href={pullRequestState.pullRequests.find((pullRequest) => pullRequest.agentRunId === run.id && pullRequest.status === "open")?.prUrl ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View PR
                          </a>
                        ) : selectedWorkstream?.status === "awaiting_review" && run.status === "completed" ? (
                          <Button variant="secondary" onClick={() => void openPullRequestForRun(run)}>
                            <GitPullRequestIcon aria-hidden="true" />
                            Open PR
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mp-empty-state">
                  <BotIcon aria-hidden="true" />
                  <strong>No build-agent runs yet</strong>
                  <p>Approve a coordinator plan, then start a scoped build-agent run to capture command output, summary, and diff evidence.</p>
                </div>
              )}
            </Panel>

            <Panel className="mp-timeline" id="timeline" aria-label="Event timeline">
              <div className="mp-section-heading">
                <div>
                  <p className="mp-eyebrow">Run evidence</p>
                  <h3>Timeline</h3>
                </div>
                {selectedWorkstream ? (
                  <Button variant="secondary" onClick={() => void appendTimelineEvent(selectedWorkstream.id)}>
                    <PlusIcon aria-hidden="true" />
                    Add note
                  </Button>
                ) : null}
              </div>
              <div className="mp-timeline__list">
                {timeline.events.length > 0 ? (
                  timeline.events.map((event) => (
                    <div className="mp-timeline-row" key={event.id}>
                      <span>{String(event.sequence).padStart(2, "0")}</span>
                      <div>
                        <strong>{event.type}</strong>
                        <p>{event.message}</p>
                      </div>
                      <time>{formatDate(event.createdAt)}</time>
                    </div>
                  ))
                ) : (
                  <div className="mp-empty-state">
                    <CheckCircle2Icon aria-hidden="true" />
                    <strong>No events yet</strong>
                    <p>This workstream timeline is ready for coordinator messages, plan updates, commands, and PR evidence.</p>
                  </div>
                )}
              </div>
            </Panel>
          </section>

          <aside className="mp-side-column" id="agents">
            <Panel className="mp-human-attention" role="region" aria-label="Human attention">
              <p className="mp-eyebrow">Human attention</p>
              <h3>Plan approvals, blockers, and access requests</h3>
              <p>
                MergePilot will surface decisions that need a human before agents continue: plan approval,
                credentials/access requests, failed checks, and merge readiness.
              </p>
              <div className="mp-attention-placeholder">
                <BellIcon aria-hidden="true" />
                <span>{humanAttentionMessage ?? "No human action required right now."}</span>
              </div>
            </Panel>

            <Panel className="mp-inspector">
              <p className="mp-eyebrow">Agent readiness</p>
              <h3>Operational lanes</h3>
              <StatusLine icon={<SparklesIcon />} label="Plan review" value="Ready" />
              <StatusLine icon={<BotIcon />} label="Build agents" value={isRunning ? "Available" : "Paused"} />
              <StatusLine icon={<GitPullRequestIcon />} label="PR checks" value="Waiting" />
            </Panel>

            <Panel className="mp-settings-card" id="settings">
              <div>
                <p className="mp-eyebrow">Preferences</p>
                <h3>Theme</h3>
                <p>Use system appearance or pin the renderer to a specific mode.</p>
              </div>
              <ThemeSelector preference={preference} setPreference={setPreference} />
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  <SettingsIcon aria-hidden="true" />
                  Open settings
                </DialogTrigger>
                <SettingsDialog preference={preference} setPreference={setPreference} />
              </Dialog>
            </Panel>
          </aside>
        </div>
      </section>

      <CommandPaletteDialog
        commands={filteredCommands}
        open={commandOpen}
        query={commandQuery}
        setOpen={setCommandOpen}
        setQuery={setCommandQuery}
      />
    </main>
  );
}

function PlanList({ items, ordered = false, title }: { items: string[]; ordered?: boolean; title: string }) {
  const ListTag = ordered ? "ol" : "ul";
  return (
    <div className="mp-plan-section">
      <strong>{title}</strong>
      <ListTag>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

function RuntimeTile({ detail, icon, label, value }: { detail: string; icon: ReactNode; label: string; value: string }) {
  return (
    <div className="mp-runtime-tile">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mp-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="mp-status-line">
      <span>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
    </div>
  );
}

function NewWorkstreamDialog({
  formState,
  onGoalChange,
  onRepositoryChange,
  onSubmit,
  repositories,
  selectedRepository,
  setFormState
}: {
  formState: WorkstreamFormState;
  onGoalChange: (goal: string) => void;
  onRepositoryChange: (repositoryId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  repositories: GitHubRepositoryConnection[];
  selectedRepository: GitHubRepositoryConnection | null;
  setFormState: (state: WorkstreamFormState) => void;
}) {
  return (
    <DialogContent>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>New workstream</DialogTitle>
          <DialogDescription>Describe the goal and repository scope to start local tracking.</DialogDescription>
        </DialogHeader>
        <DialogBody className="mp-form-grid">
          <div>
            <Label htmlFor="workstream-goal">Goal prompt</Label>
            <Textarea
              id="workstream-goal"
              onChange={(event) => onGoalChange(event.target.value)}
              placeholder="What should agents coordinate, verify, and report?"
              required
              rows={4}
              value={formState.goal}
            />
          </div>
          <div>
            <Label htmlFor="workstream-title">Title</Label>
            <Input
              id="workstream-title"
              onChange={(event) => setFormState({ ...formState, title: event.target.value })}
              placeholder="Derived from the goal, editable before creation"
              value={formState.title}
            />
          </div>
          <div>
            <Label htmlFor="workstream-repo">Repository</Label>
            {repositories.length > 0 ? (
              <Select id="workstream-repo" onChange={(event) => onRepositoryChange(event.target.value)} value={formState.repositoryId}>
                <option value="">Select a connected repository</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.owner}/{repository.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="workstream-repo"
                onChange={(event) => setFormState({ ...formState, repo: event.target.value, repositoryId: "" })}
                placeholder="ss-andrade/mergepilot"
                value={formState.repo}
              />
            )}
            {selectedRepository ? <p className="mp-field-description">Default branch: {selectedRepository.defaultBranch}</p> : null}
          </div>
          <div>
            <Label htmlFor="workstream-summary">Summary</Label>
            <Input
              id="workstream-summary"
              onChange={(event) => setFormState({ ...formState, summary: event.target.value })}
              placeholder="Short visible summary"
              value={formState.summary}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit">
            <PlusIcon aria-hidden="true" />
            Create workstream
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RepositoryDialog({
  error,
  formState,
  onSubmit,
  setFormState
}: {
  error: string | null;
  formState: GitHubRepositoryFormState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setFormState: (state: GitHubRepositoryFormState) => void;
}) {
  return (
    <DialogContent>
      <form onSubmit={onSubmit}>
        <DialogHeader>
          <DialogTitle>Connect GitHub repository</DialogTitle>
          <DialogDescription>Store owner, repository name, and default branch metadata for workstream scoping.</DialogDescription>
        </DialogHeader>
        <DialogBody className="mp-form-grid">
          <div>
            <Label htmlFor="github-owner">Owner</Label>
            <Input id="github-owner" onChange={(event) => setFormState({ ...formState, owner: event.target.value })} placeholder="ss-andrade" required value={formState.owner} />
          </div>
          <div>
            <Label htmlFor="github-name">Repository name</Label>
            <Input id="github-name" onChange={(event) => setFormState({ ...formState, name: event.target.value })} placeholder="mergepilot" required value={formState.name} />
          </div>
          <div>
            <Label htmlFor="github-default-branch">Default branch</Label>
            <Input id="github-default-branch" onChange={(event) => setFormState({ ...formState, defaultBranch: event.target.value })} placeholder="main" required value={formState.defaultBranch} />
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit">
            <GitPullRequestIcon aria-hidden="true" />
            Connect repository
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SettingsDialog({
  preference,
  setPreference
}: {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Adjust renderer preferences for this device.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ThemeSelector preference={preference} setPreference={setPreference} />
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button />}>Done</DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}

function ThemeSelector({
  preference,
  setPreference
}: {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}) {
  const options: Array<{ icon: ReactNode; label: string; value: ThemePreference }> = [
    { icon: <LaptopIcon aria-hidden="true" />, label: "System", value: "system" },
    { icon: <SunIcon aria-hidden="true" />, label: "Light", value: "light" },
    { icon: <MoonIcon aria-hidden="true" />, label: "Dark", value: "dark" }
  ];

  return (
    <div className="mp-theme-selector" role="radiogroup" aria-label="Theme preference">
      {options.map((option) => (
        <button
          aria-checked={preference === option.value}
          className="mp-theme-option"
          key={option.value}
          onClick={() => setPreference(option.value)}
          role="radio"
          type="button"
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CommandPaletteDialog({
  commands,
  open,
  query,
  setOpen,
  setQuery
}: {
  commands: Array<{ description: string; icon: typeof PlusIcon; label: string; run: () => void }>;
  open: boolean;
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="mp-command-dialog">
        <div className="mp-command-input">
          <CommandIcon aria-hidden="true" />
          <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Type a command or search..." value={query} />
        </div>
        <div className="mp-command-results">
          {commands.length > 0 ? (
            commands.map((command) => (
              <button
                className="mp-command-item"
                key={command.label}
                onClick={() => {
                  command.run();
                  setOpen(false);
                  setQuery("");
                }}
                type="button"
              >
                <span>
                  <command.icon aria-hidden="true" />
                </span>
                <div>
                  <strong>{command.label}</strong>
                  <small>{command.description}</small>
                </div>
              </button>
            ))
          ) : (
            <p className="mp-command-empty">No commands found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

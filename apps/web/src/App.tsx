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
import { Input, Label, Textarea } from "./components/ui/form";
import { ThemePreference, useTheme } from "./hooks/useTheme";

interface TimelineState {
  selectedWorkstreamId: string | null;
  events: WorkstreamEvent[];
}

interface WorkstreamFormState {
  title: string;
  goal: string;
  repo: string;
  summary: string;
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
  summary: ""
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

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="mp-kbd">{children}</kbd>;
}

export function App() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [runtimeInfo, setRuntimeInfo] = useState<MergePilotRuntimeInfo | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [timeline, setTimeline] = useState<TimelineState>({ selectedWorkstreamId: null, events: [] });
  const [error, setError] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newWorkstreamOpen, setNewWorkstreamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [formState, setFormState] = useState<WorkstreamFormState>(emptyForm);

  const isRunning = orchestratorStatus?.state === "running";
  const selectedWorkstream = workstreams.find((workstream) => workstream.id === timeline.selectedWorkstreamId) ?? null;

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
      setTimeline({ selectedWorkstreamId: null, events: [] });
      return;
    }

    const nextWorkstreams = await window.mergePilot.workstreams.list();
    setWorkstreams(nextWorkstreams);
    const selected = preferredWorkstreamId ?? timeline.selectedWorkstreamId ?? nextWorkstreams[0]?.id ?? null;
    const selectedExists = selected ? nextWorkstreams.some((workstream) => workstream.id === selected) : false;
    const nextSelected = selectedExists ? selected : nextWorkstreams[0]?.id ?? null;
    setTimeline({
      selectedWorkstreamId: nextSelected,
      events: nextSelected ? await window.mergePilot.events.list(nextSelected) : []
    });
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
      setTimeline({ selectedWorkstreamId: null, events: [] });
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
      const created = await window.mergePilot.workstreams.create({
        title,
        goal: input?.goal.trim() || "Coordinate and verify a local engineering goal through MergePilot.",
        repo: input?.repo.trim() || "local/workspace",
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
    setTimeline({
      selectedWorkstreamId: workstreamId,
      events: await window.mergePilot.events.list(workstreamId)
    });
    setSidebarOpen(false);
  }

  function submitWorkstream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createWorkstream(formState);
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
              <h2>{selectedWorkstream?.title ?? "MergePilot app shell"}</h2>
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
            <Dialog open={newWorkstreamOpen} onOpenChange={setNewWorkstreamOpen}>
              <DialogTrigger render={<Button />}>
                <PlusIcon aria-hidden="true" />
                New Workstream
              </DialogTrigger>
              <NewWorkstreamDialog formState={formState} setFormState={setFormState} onSubmit={submitWorkstream} />
            </Dialog>
          </div>
        </header>

        {error ? <p className="mp-error" role="alert">{error}</p> : null}

        <section className="mp-hero" aria-label="Current workstream summary">
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
            <div className="mp-card-grid">
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
                        <Button variant="outline" onClick={() => void selectWorkstream(workstream.id)}>
                          View timeline
                        </Button>
                        <Button variant="ghost" onClick={() => void appendTimelineEvent(workstream.id)}>
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
                    <strong>Awaiting persisted events</strong>
                    <p>Create a workstream to append and read local timeline data.</p>
                  </div>
                )}
              </div>
            </Panel>
          </section>

          <aside className="mp-side-column" id="agents">
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
  onSubmit,
  setFormState
}: {
  formState: WorkstreamFormState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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
            <Label htmlFor="workstream-title">Title</Label>
            <Input
              id="workstream-title"
              onChange={(event) => setFormState({ ...formState, title: event.target.value })}
              placeholder="Ship queued review fixes"
              required
              value={formState.title}
            />
          </div>
          <div>
            <Label htmlFor="workstream-goal">Goal</Label>
            <Textarea
              id="workstream-goal"
              onChange={(event) => setFormState({ ...formState, goal: event.target.value })}
              placeholder="What should agents coordinate, verify, and report?"
              rows={4}
              value={formState.goal}
            />
          </div>
          <div>
            <Label htmlFor="workstream-repo">Repository</Label>
            <Input
              id="workstream-repo"
              onChange={(event) => setFormState({ ...formState, repo: event.target.value })}
              placeholder="ss-andrade/mergepilot"
              value={formState.repo}
            />
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

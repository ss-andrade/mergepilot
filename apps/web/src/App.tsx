import { useEffect, useState } from "react";

interface RuntimeInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  platform: string;
}

interface TimelineState {
  selectedWorkstreamId: string | null;
  events: WorkstreamEvent[];
}

const shellSections = [
  {
    label: "Workstreams",
    title: "No active workstreams",
    body: "Create and track engineering goals from plan approval through PR review."
  },
  {
    label: "Human Attention",
    title: "Queue clear",
    body: "Plan approvals, access requests, blockers, and merge decisions will appear here."
  },
  {
    label: "Run Evidence",
    title: "Awaiting first run",
    body: "Command output, branch changes, checks, and review summaries will be captured in the timeline."
  }
];

export function App() {
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [timeline, setTimeline] = useState<TimelineState>({ selectedWorkstreamId: null, events: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.mergePilot.getRuntimeInfo().then(setRuntimeInfo).catch(() => {
      setRuntimeInfo(null);
    });
    refreshOrchestrator().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Unable to load orchestrator state.");
    });
  }, []);

  async function refreshOrchestrator() {
    const status = await window.mergePilot.orchestrator.status();
    setOrchestratorStatus(status);

    if (status.state !== "running") {
      setWorkstreams([]);
      setTimeline({ selectedWorkstreamId: null, events: [] });
      return;
    }

    const nextWorkstreams = await window.mergePilot.workstreams.list();
    setWorkstreams(nextWorkstreams);
    const selected = nextWorkstreams[0]?.id ?? null;
    setTimeline({
      selectedWorkstreamId: selected,
      events: selected ? await window.mergePilot.events.list(selected) : []
    });
  }

  async function startOrchestrator() {
    setError(null);
    await window.mergePilot.orchestrator.start();
    await refreshOrchestrator();
  }

  async function stopOrchestrator() {
    setError(null);
    const status = await window.mergePilot.orchestrator.stop();
    setOrchestratorStatus(status);
    setWorkstreams([]);
    setTimeline({ selectedWorkstreamId: null, events: [] });
  }

  async function createWorkstream() {
    setError(null);
    try {
      if (orchestratorStatus?.state !== "running") {
        await window.mergePilot.orchestrator.start();
      }
      const created = await window.mergePilot.workstreams.create({
        title: `Workstream ${workstreams.length + 1}`,
        description: "Created through the secure Electron bridge."
      });
      await window.mergePilot.events.append({
        workstreamId: created.id,
        type: "workstream.created",
        message: "Workstream created from renderer"
      });
      await refreshOrchestrator();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create workstream.");
    }
  }

  async function appendTimelineEvent(workstreamId: string) {
    setError(null);
    try {
      await window.mergePilot.events.append({
        workstreamId,
        type: "timeline.note",
        message: "Timeline note appended from renderer",
        payload: { surface: "web" }
      });
      setTimeline({
        selectedWorkstreamId: workstreamId,
        events: await window.mergePilot.events.list(workstreamId)
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to append event.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            MP
          </div>
          <div>
            <p className="eyebrow">MergePilot</p>
            <h1>Delivery Control</h1>
          </div>
        </div>

        <nav className="nav-list">
          <a href="#workstreams" aria-current="page">
            Workstreams
          </a>
          <a href="#timeline">Timeline</a>
          <a href="#agents">Agents</a>
          <a href="#settings">Settings</a>
        </nav>

        <div className="runtime-panel">
          <span>Desktop shell</span>
          <strong>{runtimeInfo?.electronVersion ? `Electron ${runtimeInfo.electronVersion}` : "Electron"}</strong>
          <small>{runtimeInfo?.platform ?? "Loading runtime"}</small>
        </div>
        <div className="runtime-panel">
          <span>Orchestrator</span>
          <strong>{orchestratorStatus?.state ?? "checking"}</strong>
          <small>{orchestratorStatus?.dataDir ?? "Local data path pending"}</small>
        </div>
      </aside>

      <section className="workspace" id="workstreams">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Local-first workspace</p>
            <h2>MergePilot app shell</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={startOrchestrator}>
              Start
            </button>
            <button type="button" className="secondary-button" onClick={stopOrchestrator}>
              Stop
            </button>
            <button type="button" onClick={createWorkstream}>
              New Workstream
            </button>
          </div>
        </header>

        {error ? <p className="error-banner">{error}</p> : null}

        <section className="summary-band" aria-label="Current workstream summary">
          <div>
            <span className="status-dot" aria-hidden="true" />
            <p>{workstreams.length > 0 ? `${workstreams.length} persisted workstream(s)` : "Ready for the first workstream"}</p>
          </div>
          <strong>
            {timeline.selectedWorkstreamId
              ? "Renderer calls are crossing the preload boundary into local persistence."
              : "Coordinator, build agents, PR checks, and human decisions will land in this desktop surface."}
          </strong>
        </section>

        <div className="section-grid">
          {workstreams.length > 0 ? workstreams.slice(0, 3).map((workstream) => (
            <article className="section-card" key={workstream.id}>
              <p className="eyebrow">{workstream.status}</p>
              <h3>{workstream.title}</h3>
              <p>{workstream.description ?? "No description"}</p>
              <button type="button" className="inline-button" onClick={() => appendTimelineEvent(workstream.id)}>
                Add event
              </button>
            </article>
          )) : shellSections.map((section) => (
            <article className="section-card" key={section.label}>
              <p className="eyebrow">{section.label}</p>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        <section className="timeline" id="timeline" aria-label="Event timeline">
          {timeline.events.length > 0 ? timeline.events.map((event) => (
            <div className="timeline-row" key={event.id}>
              <span>{String(event.sequence).padStart(2, "0")}</span>
              <div>
                <strong>{event.type}</strong>
                <p>{event.message}</p>
              </div>
            </div>
          )) : (
            <div className="timeline-row muted">
              <span>01</span>
              <div>
                <strong>Awaiting persisted events</strong>
                <p>Create a workstream to append and read local timeline data.</p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

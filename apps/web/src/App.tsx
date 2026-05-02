import { useEffect, useState } from "react";

interface RuntimeInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  platform: string;
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

  useEffect(() => {
    window.mergePilot.getRuntimeInfo().then(setRuntimeInfo).catch(() => {
      setRuntimeInfo(null);
    });
  }, []);

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
      </aside>

      <section className="workspace" id="workstreams">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Local-first workspace</p>
            <h2>MergePilot app shell</h2>
          </div>
          <button type="button">New Workstream</button>
        </header>

        <section className="summary-band" aria-label="Current workstream summary">
          <div>
            <span className="status-dot" aria-hidden="true" />
            <p>Ready for the first workstream</p>
          </div>
          <strong>Coordinator, build agents, PR checks, and human decisions will land in this desktop surface.</strong>
        </section>

        <div className="section-grid">
          {shellSections.map((section) => (
            <article className="section-card" key={section.label}>
              <p className="eyebrow">{section.label}</p>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}
        </div>

        <section className="timeline" id="timeline" aria-label="Event timeline">
          <div className="timeline-row">
            <span>01</span>
            <div>
              <strong>Desktop shell booted</strong>
              <p>Renderer is isolated from Node and talks through the typed preload API.</p>
            </div>
          </div>
          <div className="timeline-row muted">
            <span>02</span>
            <div>
              <strong>Orchestrator pending</strong>
              <p>Local Node services, persistence, and agent adapters will be added behind this shell.</p>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

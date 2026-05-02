# Local Orchestrator

MergePilot now includes an in-process local orchestrator service used by the Electron main process in dev mode. It is structured as the foundation for a separate local process later: renderer code talks through preload IPC, main owns lifecycle, and persistence lives behind the `@mergepilot/orchestrator` package.

## Persistence

The orchestrator stores data in SQLite through `better-sqlite3`.

- Package: `packages/orchestrator`
- Default database file: `mergepilot.sqlite3`
- Desktop location: `${app.getPath("userData")}/orchestrator/mergepilot.sqlite3`
- Tests use temporary directories under the OS temp folder and never touch user data.

Initial tables cover:

- `workstreams`
- `workstream_events`
- `plans`
- `agent_runs`

SQLite foreign keys are enabled and timeline events use a per-workstream sequence number for stable ordering.

## Desktop Lifecycle

In dev mode, the Electron main process starts the local orchestrator after `app.whenReady()` and stops it during `before-quit`. The renderer also has explicit start/stop controls for exercising lifecycle through the preload boundary.

Current lifecycle IPC:

- `orchestrator:start`
- `orchestrator:stop`
- `orchestrator:status`

This is currently an in-process service, not a spawned child process. The service boundary keeps startup, shutdown, status, and persistence ownership isolated so a separate process can replace the implementation without changing renderer calls.

## Renderer IPC Surface

The preload bridge exposes `window.mergePilot` with context isolation, disabled Node integration, and sandboxed renderer settings preserved.

Available renderer calls:

- `window.mergePilot.orchestrator.start()`
- `window.mergePilot.orchestrator.stop()`
- `window.mergePilot.orchestrator.status()`
- `window.mergePilot.workstreams.create(input)`
- `window.mergePilot.workstreams.list()`
- `window.mergePilot.workstreams.get(id)`
- `window.mergePilot.events.append(input)`
- `window.mergePilot.events.list(workstreamId)`

The renderer UI includes a small proof path: start/stop the orchestrator, create persisted workstreams, append timeline events, and read them back.

## Safeguards

- Renderer code cannot access Node APIs directly.
- IPC handlers validate object shapes, bounded strings, local IDs, event type format, and JSON-serializable payloads before calling services.
- No shell execution is used by the orchestrator or IPC layer.
- Service methods reject data operations while stopped.
- Tests cover persistence across store instances, service lifecycle behavior, timeline append/read ordering, plan/run persistence, and IPC validation.

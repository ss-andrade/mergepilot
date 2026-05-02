# Desktop Shell

MergePilot now has a minimal Electron desktop shell backed by an npm workspace.

## Commands

From the repository root:

```sh
npm install
npm run dev
npm run typecheck
npm run smoke
```

`npm run dev` starts the Vite renderer on `127.0.0.1:5173`, builds the Electron main/preload TypeScript, waits for the renderer port, and opens the local Electron window.

`npm run smoke` builds the desktop main/preload output and renderer bundle, then runs a headless Node smoke check. It verifies that the expected build artifacts exist and that the Electron window is configured with the secure defaults used by this shell.

## Process Boundaries

### Electron Main Process

Location: `apps/desktop/src/main/main.ts`

Responsibilities:

- create and own the desktop `BrowserWindow`
- load the Vite dev server in development
- load the built renderer HTML in production-style builds
- register IPC handlers for desktop capabilities

Security defaults:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

### Preload Boundary

Location: `apps/desktop/src/preload/preload.ts`

The preload script is the only bridge exposed to the renderer. It uses Electron's `contextBridge` to publish a small typed API at `window.mergePilot`.

Current API:

```ts
window.mergePilot.getRuntimeInfo();
```

Renderer code should not import Node or Electron modules directly. Future desktop and orchestrator capabilities should be added as explicit preload methods backed by IPC handlers.

### React/Vite Renderer

Location: `apps/web/src`

The renderer is a standard React/Vite app. It owns the visual app shell and calls the preload API for desktop runtime data. It runs without direct filesystem, process, or Electron access.

## Manual GUI Check

Use this command on a machine with a desktop session:

```sh
npm run dev
```

Expected result: an Electron window opens and shows the MergePilot app shell with Workstreams, Human Attention, Run Evidence, and Timeline sections.

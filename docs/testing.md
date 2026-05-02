# Testing

MergePilot keeps the default verification path fast and deterministic. Runtime browser and Electron checks are available as explicit commands and are not part of `npm run verify`.

## Fast Local Checks

```sh
npm run verify
```

This runs workspace typechecks, unit tests, and smoke checks. It does not start Playwright or Electron.

## Runtime Harness

```sh
npm run test:renderer
npm run test:e2e:web
npm run test:e2e:electron
npm run verify:runtime
```

`test:renderer` is an alias for the web Playwright suite. It builds the Vite renderer, serves it with `vite preview`, injects a mocked `window.mergePilot` API before app code runs, and fails on uncaught page errors or browser console errors.

`test:e2e:electron` builds the workspaces, rebuilds the `better-sqlite3` native module for the installed Electron ABI, runs a Linux Electron dependency preflight, and launches the built desktop main process with Playwright Electron. After the Electron run, it rebuilds `better-sqlite3` back for Node so regular Vitest/unit checks keep working. The suite uses temporary user data and data directories through `MERGEPILOT_USER_DATA_DIR` and does not read or write Claude or Codex credentials.

`verify:runtime` runs both runtime suites and is intended for local pre-release checks or CI jobs that provision browser and Electron dependencies.

On headless Linux, run Electron checks with a virtual display:

```sh
xvfb-run -a npm run test:e2e:electron
```

## Linux Electron Preflight

```sh
node scripts/preflight-electron-linux.mjs
```

On Linux this checks for common shared libraries needed by Electron, including `libgtk-3.so.0`. If a library is missing, the script exits non-zero and prints package installation guidance. On macOS and Windows it exits successfully without checks.

## CI Shape

A fast CI job should run:

```sh
npm ci
npm run verify
```

A runtime CI job should install Playwright browsers and Linux desktop packages, then run:

```sh
npm ci
npx playwright install chromium
npm run test:e2e:web
xvfb-run -a npm run test:e2e:electron
```

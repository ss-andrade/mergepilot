# Tech Stack Decision

**Decision date:** 2026-05-02  
**Status:** Accepted for MVP

## Decision

MergePilot will start as a **standalone Electron desktop app** with a local Node/TypeScript orchestration backend and an adapter system for coding-agent CLIs.

The first supported coding agents will be:

- **Claude Code CLI**
- **OpenAI Codex CLI**

The execution layer must be adapter-based so future coding agents can be added without changing the workstream, planning, event timeline, PR, or human-attention models.

## Why Electron

MergePilot needs to coordinate local developer tools, terminal processes, Git worktrees, credentials, and coding-agent CLIs. A desktop app is the right first surface because it can:

- run local child processes for coding agents
- manage PTY sessions for interactive CLIs
- use the user's existing Git, SSH, GitHub CLI, Claude Code, and Codex auth
- create local workspaces/worktrees safely
- capture stdout/stderr/tool logs for the event timeline
- feel like a persistent engineering control center rather than a hosted chat app

Hosted SaaS may come later, but local-first Electron gives the MVP the fastest path to a trustworthy vertical slice.

## Proposed app shape

```text
Electron Main Process
  ├─ Window lifecycle
  ├─ Local backend process lifecycle
  ├─ App settings and secure storage bridge
  └─ IPC boundary to renderer

Renderer App
  ├─ Workstream list/detail UI
  ├─ Plan approval UI
  ├─ Event timeline
  ├─ Agent run terminal/log viewer
  ├─ PR/check status panels
  └─ Human attention queue

Local Orchestrator Backend
  ├─ Workstream service
  ├─ Event log service
  ├─ Plan service
  ├─ Agent run service
  ├─ GitHub integration service
  ├─ Workspace/worktree service
  └─ Agent adapter registry

Execution Layer
  ├─ Claude Code adapter
  ├─ Codex adapter
  ├─ Future agent adapters
  ├─ PTY/process supervisor
  ├─ Log capture
  └─ Branch/commit/PR operations
```

## Recommended technical choices

### Language

- TypeScript across desktop, renderer, backend, contracts, and adapters.

### Desktop/runtime

- Electron for the desktop shell.
- Node.js child processes and PTY support for agent execution.
- Vite + React for the renderer.

### Persistence

- SQLite for local MVP persistence.
- Store structured objects: Workstream, Plan, AgentRun, PullRequest, WorkstreamEvent, HumanAttentionItem, AgentProfile.
- Keep secrets out of the database; use OS keychain/secure storage where needed.

### Repository shape

Use a small monorepo from the start:

```text
apps/desktop/        Electron main/preload code
apps/web/            React renderer UI
apps/orchestrator/   Local Node backend / orchestration service
packages/contracts/  Shared types/schemas/events
packages/agents/     Agent adapter interfaces and built-in adapters
packages/shared/     Shared utilities
```

This keeps the agent adapter layer reusable if a hosted/cloud worker or CLI version is added later.

## Agent adapter system

The core product should never special-case Claude Code or Codex in workstream logic. Workstreams should talk to a generic adapter contract.

### Adapter responsibilities

Each coding-agent adapter should support:

- health check: is the CLI installed and authenticated?
- capability discovery: print mode, PTY mode, JSON output, file editing, command execution, PR support, etc.
- run lifecycle: start, stream events, cancel, resume where possible
- workspace binding: run inside a specific repo/worktree
- log capture: stdout, stderr, structured events where available
- result normalization: summary, changed files, branch, commits, risks, test evidence

### Draft interface

```ts
export type AgentProviderId = "claude-code" | "codex" | string;

export type AgentRunMode = "oneshot" | "interactive";

export interface AgentAdapter {
  id: AgentProviderId;
  displayName: string;

  detect(): Promise<AgentDetectionResult>;
  getCapabilities(): Promise<AgentCapabilities>;

  startRun(input: AgentRunInput): Promise<AgentRunHandle>;
  cancelRun(runId: string): Promise<void>;
}

export interface AgentRunInput {
  runId: string;
  workstreamId: string;
  workspacePath: string;
  prompt: string;
  mode: AgentRunMode;
  env?: Record<string, string>;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface AgentRunHandle {
  runId: string;
  providerId: AgentProviderId;
  events: AsyncIterable<AgentRunEvent>;
  result: Promise<AgentRunResult>;
}
```

### Normalized agent events

```ts
export type AgentRunEvent =
  | { type: "run_started"; at: string }
  | { type: "stdout"; at: string; text: string }
  | { type: "stderr"; at: string; text: string }
  | { type: "tool_call"; at: string; name: string; input?: unknown }
  | { type: "command_started"; at: string; command: string }
  | { type: "command_finished"; at: string; command: string; exitCode: number }
  | { type: "file_changed"; at: string; path: string }
  | { type: "run_waiting_for_input"; at: string; prompt?: string }
  | { type: "run_completed"; at: string }
  | { type: "run_failed"; at: string; error: string };
```

## Built-in adapters

### Claude Code adapter

Use Claude Code primarily in non-interactive print mode for bounded tasks when possible:

```text
claude -p "<task>" --output-format json --max-turns <n>
```

Use interactive/PTY mode only when a task needs long-running multi-turn supervision, resumption, or live user steering.

The adapter should capture:

- result text / JSON result
- session id when available
- token/cost metadata when available
- stdout/stderr logs
- command/tool events when available

### Codex adapter

Use Codex through `codex exec` inside a git repo/worktree:

```text
codex exec --sandbox workspace-write "<task>"
```

Because Codex is an interactive terminal app, the adapter should support PTY execution from the start.

The adapter should capture:

- stdout/stderr terminal stream
- waiting-for-input states
- completion/failure status
- changed files and git diff after execution

## Security and trust implications

The desktop app will be able to run local processes and edit code. MVP guardrails:

- explicit user approval before starting an agent run
- per-run workspace/worktree isolation
- visible command/log timeline
- denylist obviously dangerous commands at the orchestrator layer where possible
- never display or persist secrets in event logs
- user-visible provider/auth health checks
- no autonomous force-push or merge in MVP

## Issue #1 conclusion

Issue #1 is resolved by choosing:

```text
Electron desktop app
+ TypeScript
+ React/Vite renderer
+ local Node orchestrator
+ SQLite persistence
+ adapter-based coding-agent execution
+ first adapters: Claude Code CLI and Codex CLI
```

# MergePilot

MergePilot is an agent-native software delivery workspace for coordinating coding agents from an engineering goal to a merge-ready pull request.

> Give MergePilot a scoped engineering goal. It plans the work, delegates implementation, tracks branches and PRs, watches CI/review signals, and surfaces the next human decision.

## Product thesis

Coding agents can write code, but software teams still need coordination, verification, PR context, and clear merge decisions. MergePilot treats each engineering goal as a durable **workstream** that contains the conversation, plan, agent runs, branches, PRs, CI checks, review summaries, and human attention items.

The user should not feel like they are managing a swarm of agents. They should feel like they are working with one reliable engineering partner that coordinates the swarm behind the scenes.

## MVP loop

```text
Goal
→ Coordinator plan
→ Human approval
→ Build agent run
→ Branch / PR
→ CI status
→ Review summary
→ Human merge decision
```

## Core objects

- **Workstream**: durable container for one engineering outcome.
- **Plan**: coordinator-proposed implementation path and risks.
- **Agent Run**: bounded execution attempt by a coordinator, build, or review agent.
- **Pull Request**: GitHub PR linked back to the workstream and agent run.
- **Event**: auditable timeline entry for messages, commands, commits, checks, and human actions.
- **Human Attention Item**: an explicit decision or action needed from the user.

## Initial wedge

GitHub PR delivery for scoped repo tasks:

- create a workstream from a prompt
- inspect a connected GitHub repo
- generate a visible plan
- run a coding agent in an isolated workspace
- open a PR
- sync check status
- produce a final review summary and recommended human action

## Docs

- [`docs/product-brief.md`](docs/product-brief.md) — full product brief and naming research
- [`docs/mvp.md`](docs/mvp.md) — initial MVP scope and milestones
- [`docs/architecture.md`](docs/architecture.md) — first-pass architecture and data model
- [`docs/agent-adapters.md`](docs/agent-adapters.md) — provider-neutral coding-agent adapter contract
- [`docs/tech-stack.md`](docs/tech-stack.md) — accepted MVP stack: Electron + local orchestrator + coding-agent adapters
- [`docs/desktop-shell.md`](docs/desktop-shell.md) — Electron main/preload/renderer boundaries and local commands
- [`docs/plans/2026-05-02-repo-bootstrap.md`](docs/plans/2026-05-02-repo-bootstrap.md) — implementation plan for the repo bootstrap
- [`docs/plans/2026-05-02-issue-1-tech-stack.md`](docs/plans/2026-05-02-issue-1-tech-stack.md) — implementation plan for Issue #1

## Desktop app

Install dependencies and start the Electron shell:

```sh
npm install
npm run dev
```

Headless verification:

```sh
npm run typecheck
npm run test
npm run smoke
```

The desktop app uses an Electron main process in `apps/desktop`, a secure preload bridge exposed as `window.mergePilot`, and a React/Vite renderer in `apps/web`.

## Status

Early product definition with the first Electron desktop shell scaffolded.

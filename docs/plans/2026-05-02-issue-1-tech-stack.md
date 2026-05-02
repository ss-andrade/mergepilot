# Issue #1 Tech Stack Decision Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Convert Issue #1 into a concrete technical direction for MergePilot.

**Architecture:** MergePilot starts as a local-first Electron desktop app with a React renderer, local Node/TypeScript orchestrator, SQLite persistence, and adapter-based coding-agent execution. Claude Code CLI and Codex CLI are first-party adapters; future coding agents plug into the same adapter contract.

**Tech Stack:** Electron, TypeScript, React, Vite, Node.js, SQLite, PTY/child process supervision, GitHub CLI/API, Claude Code CLI, Codex CLI.

---

### Task 1: Document accepted tech stack

**Objective:** Capture the stack decision and rationale.

**Files:**
- Create: `docs/tech-stack.md`
- Modify: `README.md`

**Verification:**
- `docs/tech-stack.md` explains why Electron is the first app shape.
- README links to the tech stack doc.

### Task 2: Define agent adapter architecture

**Objective:** Specify how Claude Code, Codex, and future agents plug into MergePilot.

**Files:**
- Modify: `docs/tech-stack.md`
- Modify: `docs/architecture.md`

**Verification:**
- Docs define an `AgentAdapter` contract.
- Docs describe normalized agent events.
- Docs explicitly state that workstream logic should not special-case providers.

### Task 3: Update Issue #1

**Objective:** Mark the stack decision as accepted and create the next implementation issues.

**GitHub:**
- Comment on Issue #1 with the decision summary.
- Close Issue #1 as completed.
- Create follow-up issues for Electron scaffold, adapter package, Claude Code adapter, and Codex adapter.

### Task 4: Commit and push

**Objective:** Persist the decision in the repo.

**Commands:**

```bash
git add README.md docs/tech-stack.md docs/architecture.md docs/plans/2026-05-02-issue-1-tech-stack.md
git commit -m "docs: decide initial Electron and agent adapter stack"
git push
```

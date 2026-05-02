# Repo Bootstrap Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Initialize the MergePilot repository with product documentation, MVP scope, architecture sketch, and actionable GitHub issues.

**Architecture:** This is a documentation-first bootstrap. No runtime framework is chosen yet; the repo captures product direction and decomposes the first implementation milestones.

**Tech Stack:** Markdown, GitHub Issues, Git.

---

### Task 1: Add initial README

**Objective:** Make the repository understandable from the GitHub landing page.

**Files:**
- Create: `README.md`

**Steps:**
1. Add product one-liner and thesis.
2. Add MVP loop.
3. Link to docs.
4. Verify by reading `README.md`.
5. Commit with `docs: add initial README`.

### Task 2: Add product brief

**Objective:** Preserve the complete product brief and naming research inside the repo.

**Files:**
- Create: `docs/product-brief.md`

**Steps:**
1. Copy current product brief into `docs/product-brief.md`.
2. Verify the document contains MergePilot, MVP scope, and naming research.
3. Commit with `docs: add product brief`.

### Task 3: Add MVP scope doc

**Objective:** Extract the actionable MVP boundary and milestones into a shorter planning doc.

**Files:**
- Create: `docs/mvp.md`

**Steps:**
1. Define goal, success criteria, include/exclude boundary, milestones, trust requirements.
2. Verify the doc is short enough to guide issue creation.
3. Commit with `docs: add MVP scope`.

### Task 4: Add architecture sketch

**Objective:** Define first-pass components and core data objects before choosing a framework.

**Files:**
- Create: `docs/architecture.md`

**Steps:**
1. Define web app, orchestrator/API, and execution layer.
2. Define Workstream, Plan, AgentRun, PullRequest, WorkstreamEvent, HumanAttentionItem.
3. Commit with `docs: add architecture sketch`.

### Task 5: Create GitHub issues

**Objective:** Convert the MVP into actionable repo work.

**Files:**
- GitHub Issues

**Steps:**
1. Create issues for repo foundation, tech stack decision, workstream model, GitHub integration, coordinator loop, build-agent execution, event timeline, human attention queue, and trust evidence.
2. Verify issues exist with `gh issue list`.

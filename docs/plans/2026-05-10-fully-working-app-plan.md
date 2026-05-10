# Fully Working MergePilot App Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Use Codex by default for implementation branches, then have Hermes independently verify, review, commit, push, and open PRs against latest `main`.

**Goal:** Move MergePilot from a passing local alpha scaffold into a fully working dogfoodable desktop app that can take one scoped GitHub repo task from workstream creation through visible plan, human approval, Codex execution, real branch/PR publication, check/review sync, final summary, and clear next human action.

**Architecture:** Keep the accepted local-first Electron architecture: React/Vite renderer, secure Electron preload bridge, local Node/TypeScript orchestrator, SQLite persistence, GitHub CLI integration, and provider-neutral coding-agent adapters. The immediate product should prove one reliable single-repo/single-workstream/single-build-agent loop before adding stacked PRs, Slack, automations, multi-repo, or autonomous review triage.

**Tech Stack:** Electron, React/Vite, TypeScript, SQLite, GitHub CLI, Codex adapter by default, Playwright runtime tests, Vitest/unit tests, local dogfood preflight.

---

## Current State Verified 2026-05-10

Repository: `ss-andrade/mergepilot` at `/tmp/gh-install/mergepilot`.

Git state:
- Local `main` fast-forwarded to `origin/main`.
- No open PRs from `gh pr list`.
- No open issues from `gh issue list`.
- Latest merged commits include:
  - `#38` / `feat/issue-35-dogfood-readiness`: dogfood workflow, preflight checks, release-readiness docs.
  - `#37` / `feat/issue-34-real-github-pr-publisher`: real GitHub PR publishing.
  - `#36` / `feat/issue-33-default-codex`: desktop builds default to Codex.
  - earlier PR/check/review sync, branch/PR, and build-agent execution work.

Verification run:
- `npm run verify` passed.
- `npm run test:e2e:web` passed.
- `npm run test:e2e:electron` exited successfully, but the Electron runtime test was skipped because this headless Linux host has no X11/Wayland display. The test itself says to run it under `xvfb-run` or on a desktop host.

Docs say the MVP is complete when MergePilot can produce:
- a sensible visible plan
- a visible execution trail
- a branch and pull request
- command/test/CI evidence
- a concise final summary
- a clear next human action

Dogfood docs now say alpha readiness additionally requires:
- preflight passes for the target repo
- one scoped repo task completes end-to-end through PR publication and check/review sync
- dogfood evidence maps to every MVP success criterion

Verdict:
- **Code/build readiness:** good; verification passes.
- **Structural MVP:** close; the building blocks are present.
- **Fully working dogfoodable app:** not proven until an end-to-end real repo task is run through the desktop UI and documented with evidence.

---

## Product Definition: “Fully Working App”

A fully working MergePilot alpha means a user can:

1. Open the desktop app.
2. Select/connect one local GitHub-backed repository.
3. Create a workstream from a scoped engineering goal.
4. See a coordinator plan that names expected files, steps, verification, and risks.
5. Approve or edit that plan.
6. Run Codex as the default build agent in an isolated workspace.
7. See timeline evidence for the agent run: lifecycle, commands, logs, artifacts, branch, diff, and summary.
8. Publish a real GitHub branch and PR from the agent workspace.
9. Sync GitHub checks and review summary into the workstream.
10. End with a final summary and one obvious human action: review, merge, rerun check, answer blocker, or repair.
11. Recover from common failures without hidden state: missing auth, invalid repo, no diff, failed checks, Codex error, PR publish error.

---

## Critical Next Step

The next milestone should be:

## **Dogfood MergePilot on a real scoped repo task, then close any gaps found.**

This is different from adding another feature in isolation. The latest merged PR created the dogfood readiness path; now we need to actually use the app as intended and turn the first real run into evidence plus fixes.

Recommended dogfood target:
- Use **MergePilot itself** as the first target repo: `ss-andrade/mergepilot` at `/tmp/gh-install/mergepilot`.
- Start with a small docs/test-only task so the first run validates orchestration, evidence, branch/PR publication, and check/review sync without taking on product-risky code changes.
- Good first self-dogfood task: clarify the Electron E2E/display requirement in docs, or add a narrow test/documentation improvement discovered by the first run.
- Avoid broad UI redesign, dependency upgrades, multi-package refactors, or new agent capabilities for the first proof run.

---

## Phase 1: Prove The End-To-End Dogfood Loop

### Task 1: Run dogfood preflight against the target repo

**Objective:** Prove the selected repo is safe and ready before any agent run.

**Files:**
- No code changes expected.

**Commands:**
```bash
node scripts/preflight-dogfood.mjs /absolute/path/to/target-repo
npm run verify
npm run test:e2e:web
```

**Expected:**
- Preflight passes for Codex, Git, GitHub CLI, auth, GitHub remote, writable worktree, and Electron Linux dependency checks.
- `npm run verify` passes.
- `npm run test:e2e:web` passes.

**Evidence to capture:**
- Target repo owner/name.
- Preflight result.
- Any remediation needed.

### Task 2: Run Electron E2E in a display-capable environment

**Objective:** Remove the current skipped Electron runtime test caveat.

**Files:**
- Possibly modify docs/scripts if `xvfb-run` support needs smoothing.

**Commands:**
```bash
xvfb-run -a npm run test:e2e:electron
```

or run on a desktop host with X11/Wayland.

**Expected:**
- Electron runtime test actually runs rather than skips.
- If it fails, capture missing dependency or runtime issue and fix before the first dogfood demo.

**Why this matters:**
The app is an Electron desktop product. A passing headless web renderer test is not enough to claim the desktop app is fully working.

### Task 3: Execute one scoped dogfood workstream manually through the app

**Objective:** Use the product exactly as an alpha user would.

**Suggested task shape:**
```text
Repository: ss-andrade/mergepilot
Local path: /tmp/gh-install/mergepilot
Goal: Add a short docs note clarifying that Electron E2E is skipped on headless Linux unless run under xvfb-run.
Definition of done:
- docs/testing.md or docs/dogfood.md explains the command
- verification command runs
- PR body includes summary, verification, risks, and workstream context
```

**Steps:**
1. Launch desktop app.
2. Start local orchestrator.
3. Connect/select the target GitHub repo.
4. Create a workstream with the scoped goal.
5. Generate/propose plan.
6. Human reviews and approves/edits plan.
7. Run Codex build agent.
8. Inspect timeline evidence.
9. Publish branch/PR.
10. Sync checks/review.
11. Confirm final summary and next human action.

**Evidence to capture:**
- Workstream id/title/status.
- Plan text.
- Agent run id/provider/workspace/branch.
- Commands/tests captured.
- PR URL.
- Check status summary.
- Final summary and next action.

### Task 4: Write the dogfood evidence report

**Objective:** Turn the first real run into a release-readiness artifact.

**Files:**
- Create: `docs/dogfood-runs/YYYY-MM-DD-first-real-workstream.md`

**Report template:**
```md
# Dogfood Run: <title>

Date:
Target repo:
Workstream id:
PR URL:

## Goal

## Plan Evidence

## Execution Evidence

## PR / CI / Review Evidence

## MVP Criteria Mapping
- Sensible visible plan:
- Visible execution trail:
- Branch and pull request:
- Command/test/CI evidence:
- Concise final summary:
- Clear next human action:

## Gaps Found

## Fixes Required Before Alpha
```

**Verification:**
- Report maps to every criterion in `docs/dogfood.md` and `docs/mvp.md`.

---

## Phase 2: Fix The First-Run UX Gaps

These tasks should be created from the dogfood run findings. If no run-specific blocker appears, use the default order below.

### Task 5: Add an in-app preflight panel

**Objective:** Make readiness visible inside MergePilot instead of relying only on CLI docs.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/desktop/src/main/orchestrator-ipc.ts`
- Modify: `apps/desktop/src/main/desktop-orchestrator.ts`
- Modify: orchestrator types as needed.
- Test: desktop IPC tests, web renderer test.

**Implementation:**
- Add “Run preflight” action for selected repo.
- Surface checks: Codex, Git, gh, auth, remote, writable worktree, Electron dependencies.
- Show remediation without leaking stderr, tokens, or secrets.
- Block agent execution until critical preflight checks pass.

**Verification:**
- Unit tests for pass/fail/sanitization.
- Renderer test shows failed preflight remediation.

### Task 6: Improve repository connection/select flow

**Objective:** Make the selected repo impossible to confuse.

**Files:**
- Modify renderer and orchestrator repository connection surfaces.
- Test persistence and UI selection.

**Implementation:**
- Display owner/repo, default branch, local path, current branch, dirty status, and auth state.
- Warn if repo is dirty before build-agent run.
- Warn if selected repo does not match workspace origin before PR publish.

**Verification:**
- Tests cover mismatched repo and dirty worktree warnings.

### Task 7: Add a guided workstream creation flow

**Objective:** Help users create tasks small enough for one PR.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Possibly add UI components.
- Test: renderer flow.

**Implementation:**
- Form fields:
  - title
  - goal
  - target repo
  - definition of done
  - verification command(s)
  - review focus
- Add copy that discourages broad refactors and multi-repo tasks in alpha.

**Verification:**
- Workstream detail shows all fields in plan context/timeline.

### Task 8: Strengthen plan approval UX

**Objective:** Ensure users can trust and edit the plan before execution.

**Files:**
- Modify renderer plan views and IPC methods if needed.
- Test: plan approve/edit/reject path.

**Implementation:**
- Show plan sections clearly: goal restatement, steps, expected outputs, verification, risks.
- Require explicit approval before Codex run.
- Support edit-and-approve without losing original plan event.

**Verification:**
- Tests prove Codex run cannot start without approved plan.

---

## Phase 3: Make Execution Evidence Reviewable

### Task 9: Add an agent-run detail drawer/page

**Objective:** Make Codex execution evidence readable.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Add component files if helpful.
- Test: renderer test.

**Implementation:**
- Show provider/adapter, run status, workspace path, branch, timestamps.
- Show command events with exit codes.
- Show artifacts: summary, diff, logs.
- Show failure reason and recommended next action.

**Verification:**
- Mocked renderer test includes a completed and failed run.

### Task 10: Add PR publish confirmation and result view

**Objective:** Make real GitHub PR publishing safe and auditable.

**Files:**
- Modify renderer and orchestrator PR actions.
- Test: service and renderer.

**Implementation:**
- Before publishing, show branch, target repo, base branch, changed files, and PR title/body preview.
- Require explicit human publish confirmation.
- After publish, show PR URL, commit SHA, branch, status, and next sync action.

**Verification:**
- Tests prove no PR publish occurs without confirmation.
- Tests prove no-publication path for no diff/mismatched origin.

### Task 11: Improve final summary generation

**Objective:** Ensure every run ends with the MVP trust answers.

**Files:**
- Modify orchestrator summary logic.
- Test: orchestrator service tests.

**Implementation:**
Final summary must answer:
- What changed?
- Why did it change?
- What commands/tests ran?
- Did CI pass?
- What risks remain?
- What should I review first?

**Verification:**
- Service tests validate summary fields after PR/check sync.

---

## Phase 4: Close GitHub/CI Review Loop

### Task 12: Make check/review sync actionable

**Objective:** Convert raw check/review state into next actions.

**Files:**
- Modify GitHub review provider and UI.
- Test: provider parsing and renderer display.

**Implementation:**
- Display check rollup: pending/success/failure.
- Show failed check names and URLs/log hints.
- Show review status: none/approved/changes requested/commented.
- Create human attention item based on state:
  - checks passing + no requested changes → review/merge
  - checks failing → repair/rerun
  - changes requested → inspect comments / run bounded fix

**Verification:**
- Tests cover success, failure, pending, and changes-requested states.

### Task 13: Add bounded “fix failed check” follow-up loop

**Objective:** Allow a second Codex run only when scoped to a failed check or review blocker.

**Files:**
- Modify orchestrator run model and UI.
- Test: service tests.

**Implementation:**
- Create follow-up plan from failed check/review comment.
- Require human approval.
- Run Codex in same PR branch/workspace or explicit fresh workspace with branch reuse rules.
- Update PR after fix.

**Verification:**
- Tests prove no infinite auto-fix loop; max one approved follow-up per blocker unless human explicitly starts another.

---

## Phase 5: Release-Quality Desktop App

### Task 14: Package and launch instructions

**Objective:** Make the app installable/runnable by someone other than us.

**Files:**
- Create/modify: `docs/install.md`
- Modify: `README.md`
- Add packaging scripts if appropriate.

**Implementation:**
- Document prerequisites: Node, npm, Git, gh auth, Codex auth, OS desktop dependencies.
- Provide dev launch and packaged app launch instructions.
- Include `xvfb-run` note for headless verification.

**Verification:**
- Fresh clone follows docs to launch app.

### Task 15: Add release checklist

**Objective:** Make alpha releases repeatable.

**Files:**
- Create: `docs/release-checklist.md`

**Checklist:**
- `npm run verify`
- `npm run test:e2e:web`
- display-capable `npm run test:e2e:electron`
- dogfood preflight on target repo
- one completed dogfood run report
- no secret leakage in logs/PR body
- known limitations updated

**Verification:**
- Checklist linked from README and dogfood docs.

### Task 16: Add crash/error observability for local alpha

**Objective:** Help debug user failures without SaaS telemetry.

**Files:**
- Modify desktop main/orchestrator logging.
- Add docs.

**Implementation:**
- Local log file path visible in app.
- Redact tokens/secrets.
- Export diagnostic bundle excluding secrets.

**Verification:**
- Test redaction and export shape.

---

## Recommended Next PR

Start with one of these depending on whether Jisko wants more product proof or more in-app polish:

### Option A — strongest product proof

**PR title:** `docs: add first MergePilot dogfood run evidence`

Do a real dogfood run first, then commit the evidence report and any tiny docs corrections found during the run.

Why:
- The latest merged PR explicitly created the dogfood readiness path.
- The product docs say a real end-to-end run is required before dogfood-ready claims.
- This will expose real gaps faster than guessing.

### Option B — strongest app UX next feature

**PR title:** `feat: add repository preflight panel`

Add in-app preflight so users can see readiness/remediation before starting a workstream.

Why:
- It converts the new CLI preflight into product UX.
- It prevents failed first runs due to missing gh/Codex/auth/repo readiness.
- It is a natural next step after PR #38.

My recommendation: **Option A first** if we can run on a display-capable host or tolerate documenting the Electron E2E caveat; otherwise **Option B first** to improve the app while arranging a real desktop dogfood run.

---

## GitHub Issue Queue To Create Next

If we want a clean roadmap after the merged PR, create these issues in order:

1. `Run and document first real MergePilot dogfood workstream`
2. `Add in-app dogfood preflight panel`
3. `Improve repository connection and selected repo safety checks`
4. `Add guided scoped-workstream creation flow`
5. `Strengthen plan approval and edit UX`
6. `Add agent-run evidence detail view`
7. `Add PR publish confirmation and result view`
8. `Generate final MVP trust summary after PR/check sync`
9. `Make check/review sync produce actionable human attention items`
10. `Support bounded follow-up Codex run for failed checks/review blockers`
11. `Document install, packaged launch, and release checklist`
12. `Add local diagnostic export with secret redaction`

---

## Alpha Readiness Bar

Do not call MergePilot fully working until all are true:

- A display-capable Electron E2E run passes, not just skips.
- One real repo task completes through the app from workstream → plan → approved Codex run → branch/PR → check/review sync → final human action.
- PR publication is confirmed against the intended owner/repo/branch and does not rely on deterministic/fake publisher in the desktop path.
- The final summary answers the six trust questions from `docs/mvp.md`.
- Dogfood evidence is committed under `docs/dogfood-runs/`.
- Known alpha limitations remain explicit: one repo, one workstream, human-approved plans, human-reviewed PRs, no multi-repo, no automations, no autonomous review triage.

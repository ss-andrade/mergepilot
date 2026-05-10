# MergePilot-on-MergePilot Dogfood Run — 2026-05-10

## Summary

MergePilot was launched through the Electron app bridge under `xvfb-run` and used against the MergePilot repository itself (`ss-andrade/mergepilot`) for a deliberately small docs-only task.

The run completed the MVP loop: repository connection, workstream creation, visible plan, plan approval, Codex build-agent execution, branch push, pull request creation, GitHub review/check sync, and a human-action recommendation.

## Target

- Repository: `ss-andrade/mergepilot`
- Local app/user data dir: `/tmp/mergepilot-self-dogfood-user-data-1778424703550`
- Workstream: `2ceb8b08-04cb-43c4-b423-af14604938c4`
- Plan: `0f7943c4-6081-446a-a4cc-853675eaa103`
- Agent run: `run-mozw5g3d-r63wou`
- Build-agent workspace: `/tmp/mergepilot-self-dogfood-user-data-1778424703550/orchestrator/workspaces/2ceb8b08-04cb-43c4-b423-af14604938c4/run-mozw5g3d-r63wou`
- Branch: `mergepilot/2ceb8b08-04cb-43c4-b423-af14604938c4/build/run-mozw5g3d-r63wou`
- PR: https://github.com/ss-andrade/mergepilot/pull/39

## Scoped Task

Add or update documentation explaining that Electron E2E tests are skipped on headless Linux without `DISPLAY` or `WAYLAND_DISPLAY`, and that developers should run them with `xvfb-run -a npm run test:e2e:electron` or from an X11/Wayland desktop session.

## App Timeline Evidence

- Runtime loaded: Electron `35.7.5` on Linux.
- Orchestrator started with SQLite at `/tmp/mergepilot-self-dogfood-user-data-1778424703550/orchestrator/mergepilot.sqlite3`.
- Repository connected: `ss-andrade/mergepilot` on default branch `main`.
- Workstream created: `Self-dogfood Electron E2E docs`.
- Coordinator plan proposed and approved before execution.
- Build agent run started with provider/adapter `codex`.
- Codex command was captured in the app timeline with prompt redacted: `codex exec --sandbox danger-full-access --skip-git-repo-check "[redacted]"`.
- Build agent completed and summarized a docs-only update to `docs/testing.md`.
- MergePilot committed changes, pushed the branch, and opened PR #39.
- MergePilot synced GitHub state and reported one changed file for human review.

## PR Evidence

- PR: https://github.com/ss-andrade/mergepilot/pull/39
- Status: open
- Merge state reported by GitHub after creation: `CLEAN`
- Changed file: `docs/testing.md`
- Diff size: 3 additions, 1 deletion
- CI/check rollup: no GitHub checks reported for the PR at sync time
- Next human action from MergePilot: review

Patch summary from PR #39:

````diff
-On headless Linux, run Electron checks with a virtual display:
+On headless Linux, the Electron E2E suite is skipped when neither `DISPLAY` nor `WAYLAND_DISPLAY` is set. To run the suite, use a virtual X11 display:
 
 ```sh
 xvfb-run -a npm run test:e2e:electron
 ```
 
+You can also run `npm run test:e2e:electron` directly from an active X11 or Wayland desktop session.
````

## Verification Run by Hermes After Dogfood

After the dogfood run exposed runtime issues in the local app path, Hermes applied local fixes to the Codex adapter and verified them with:

```sh
npm run test -w @mergepilot/codex-adapter
npm run build -w @mergepilot/codex-adapter
npm run verify
```

Result: all commands passed locally.

## Issues Discovered During First Attempts

1. `codex exec` could hang when spawned from the app because stdin was inherited. Local fix: spawn Codex with `stdio: ["ignore", "pipe", "pipe"]`.
2. The build-agent workspace starts as an empty directory, so Codex health/build execution needs `--skip-git-repo-check` when the agent is expected to clone into that workspace.
3. `workspace-write` sandboxing blocks the intended self-dogfood pattern where Codex clones into and edits the empty workspace. Local fix for dogfood viability: default Codex sandbox changed to `danger-full-access` for the adapter, matching the intended trusted-local-repo desktop default.
4. The generated PR body is too thin for the product standard in `docs/dogfood.md`; it does not include summary, verification, risks, or workstream context beyond the workstream ID.
5. GitHub check sync worked, but because there are no checks reported, the app surfaced a cautious human-review action instead of declaring merge readiness.

## MVP Success Criteria Mapping

- Sensible visible plan: passed. The app generated a coordinator plan and required approval before execution.
- Visible execution trail: passed. The timeline captured runtime load, repository connection, plan approval, Codex command/logs, completion, commit, branch push, PR open, check sync, and human action.
- Branch and pull request: passed. PR #39 was opened from a MergePilot-generated branch.
- Command/test/CI evidence: partial. The app captured the Codex command/log stream and GitHub check sync, but the generated PR did not include verification commands from the build agent.
- Concise final summary: partial. The run summary exists, but the PR/workstream summary should be richer for human trust.
- Clear next human action: passed. MergePilot surfaced `review` as the next action.

## Follow-Up Recommendations

1. Commit the local Codex adapter fixes as the next app-enablement PR.
2. Improve generated PR bodies so they include summary, verification, known risks, and a workstream reference.
3. Make empty-workspace clone behavior a first-class app workflow instead of encoding it in the workstream prompt.
4. Improve the final workstream summary so it explicitly answers: what changed, why, what ran, CI status, risks, and what to review first.

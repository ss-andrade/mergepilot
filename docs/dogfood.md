# Dogfood Workflow

This guide is the repeatable alpha path for proving MergePilot's MVP loop on a real local GitHub repository. Keep the task scoped, use a repository you are allowed to push to, and inspect every generated plan, branch, PR, check result, and summary before treating the run as release evidence.

## Preflight

Run the dogfood preflight from the MergePilot repository, passing the repository you want MergePilot to operate on:

```sh
node scripts/preflight-dogfood.mjs /absolute/path/to/target-repo
```

If no path is provided, the preflight checks the current working directory.

The preflight fails before any real run starts when required readiness is missing:

- Codex CLI: verifies `codex --version` is available.
- Git: verifies `git --version` is available.
- GitHub CLI: verifies `gh --version` is available.
- GitHub auth: verifies `gh auth status` succeeds.
- GitHub remote: verifies `origin` points at `github.com`.
- Writable worktree: verifies the current worktree accepts local writes.
- Electron Linux dependencies: invokes `scripts/preflight-electron-linux.mjs` on Linux so runtime dependency failures are visible early.

The output intentionally prints status and remediation, not command stderr, tokens, credentials, or connection strings.

## Scoped Repo Task

Choose a task small enough to review in one PR. Good dogfood candidates include a docs clarification, a narrow validation improvement, or a small UI state fix with one obvious test path. Avoid broad refactors, dependency upgrades, multi-repo work, scheduled automations, Slack entry points, and new agent capabilities.

Record the task in this shape:

```text
Repository: <owner>/<repo>
Local path: <absolute path>
Goal: <one scoped engineering goal>
Definition of done:
- <observable behavior or docs outcome>
- <test or command evidence expected>
- <review focus>
```

## End-to-End Loop

1. Connect the repository.

   Start MergePilot and select the GitHub-backed local repository that passed preflight. Confirm the selected repo owner/name and default branch match the intended target before creating a workstream.

2. Create a workstream.

   Create one workstream from the scoped task. The workstream should show the goal, repository, current status, and an empty or initial event timeline.

3. Propose a plan.

   Ask the coordinator to inspect the repository context and produce a visible plan. The plan must restate the goal, identify expected files or areas, list verification commands, and call out risks or assumptions.

4. Approve or edit the plan.

   Review the plan as a human gate. Edit it if the scope is too broad, if verification is missing, or if it proposes post-MVP behavior. Approve only when it is specific enough for one isolated build-agent run.

5. Run Codex.

   Start the approved build-agent run with Codex. Confirm the run is bounded to the target worktree or isolated workspace and that the timeline captures key actions, commands, test output, artifacts, and any blocker questions.

6. Publish the PR.

   Review the diff locally before publication. Publish a branch and pull request only for the approved scoped task. The PR body should include the goal, summary, commands/tests run, known risks, and a link or reference back to the workstream.

7. Sync checks and review.

   Sync GitHub PR status, CI/check rollup, and review state back into the workstream. If checks fail, the next action should point to the failed command/check and whether Codex should repair it or a human should intervene.

8. Review the next human action.

   Finish the run only when MergePilot shows a concise final summary and one clear recommended human action, such as "review PR diff first", "approve and merge", "rerun failed check", or "answer blocker question".

## MVP Success Criteria Verification

Use the success criteria in [`docs/mvp.md`](mvp.md) as the release evidence map for each dogfood run.

| MVP success criterion | Dogfood evidence to capture |
| --- | --- |
| Sensible visible plan | Workstream plan restates the goal, names the scoped approach, lists verification, and documents risks before execution. |
| Visible execution trail | Timeline contains coordinator messages, plan approval, Codex run lifecycle, commands/tests, artifacts, PR events, and final summary. |
| Branch and pull request | A branch exists for the workstream and the linked GitHub PR contains a focused diff for the approved goal. |
| Command/test/CI evidence | Local command output and GitHub check status are visible, including pass/fail state and enough context for review. |
| Concise final summary | Final workstream summary explains what changed, why, what ran, CI/review status, and known risks. |
| Clear next human action | Human attention item identifies the exact next decision or action needed before merge. |

For every PR, also answer the trust questions from [`docs/mvp.md`](mvp.md): what changed, why it changed, which commands/tests ran, whether CI passed, what risks remain, and what to review first.

## Manual Dogfood Checklist

- Preflight passes for the target local repository with `node scripts/preflight-dogfood.mjs /absolute/path/to/target-repo`.
- Task is scoped to one repo, one workstream, one branch, and one PR.
- Plan was visible before execution and was approved or edited by a human.
- Codex run produced timeline evidence and did not require hidden credentials in prompts or logs.
- Local diff matches the approved plan.
- PR body includes summary, verification, risks, and workstream context.
- GitHub checks/review state were synced back into the workstream.
- Final summary and next human action are visible.

## Release Readiness Checklist

Before tagging an alpha build as dogfood-ready:

- `npm run verify` passes.
- `npm run test:e2e:web` passes.
- `npm run test:e2e:electron` passes on a host with Electron runtime dependencies, or the release notes state why it was not run.
- A fresh dogfood preflight failure has been inspected to confirm missing tools/auth/remotes are obvious and sanitized.
- At least one scoped repo task has completed the end-to-end loop through PR publication and check/review sync.
- Dogfood evidence maps to every MVP success criterion above.
- Alpha limitations and post-MVP exclusions below are still accurate.

## Alpha Limitations

- MergePilot is a local alpha workflow, not a fully autonomous delivery system.
- Humans approve plans and review diffs before PR publication and merge.
- The dogfood path assumes one GitHub-backed repository and one scoped workstream at a time.
- GitHub CLI auth is local user auth; do not paste tokens or secrets into workstream prompts, docs, plans, or logs.
- Runtime Electron checks may require host-specific Linux desktop packages.
- Failed checks, review comments, and blocker questions may require manual repair or a new bounded Codex run.

## Post-MVP Exclusions

These remain outside the dogfood path:

- Native stacked PR automation beyond simple parent/child links.
- Slack entry points.
- Fully autonomous review-comment triage.
- Multi-repo workstreams.
- Long-running or scheduled automations.
- Agent-proposed skills or new agent capabilities.
- Complex enterprise permissions.

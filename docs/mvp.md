# MergePilot MVP

## Goal

Build the smallest product that proves a persistent AI workstream can coordinate code delivery from user goal to merge-ready GitHub PR.

## Success criteria

A user can say:

> Add a small scoped feature to this GitHub repo.

MergePilot can produce:

- a sensible visible plan
- a visible execution trail
- a branch and pull request
- command/test/CI evidence
- a concise final summary
- a clear next human action

## MVP boundary

### Include

- GitHub repo connection
- Create workstream from prompt
- Coordinator creates visible plan
- Human approves or edits plan
- One isolated build-agent run
- Branch creation and PR opening
- Event timeline with key actions
- CI/check status sync
- Final review summary and recommended human action

### Exclude for now

- Native stacked PR automation beyond simple parent/child links
- Slack entry point
- Fully autonomous review-comment triage
- Multi-repo workstreams
- Long-running automations
- Agent-proposed skills
- Complex enterprise permissions

## Milestones

### Milestone 0: Repo foundation

- Add README and docs
- Define MVP issues
- Pick initial tech stack

### Milestone 1: Product skeleton

- Web app shell
- Basic data model
- Workstream list/detail pages
- Local persistence

### Milestone 2: GitHub integration

- Connect a GitHub repository
- Read repository metadata
- Create branches
- Open pull requests
- Sync PR/check state

### Milestone 3: Coordinator planning loop

- Accept user goal
- Inspect repo context
- Generate plan
- Support approve/edit/reject
- Persist plan as timeline event

### Milestone 4: Build-agent execution loop

- Create isolated workspace
- Run agent with scoped task
- Capture command/test logs
- Commit branch
- Open/update PR

### Milestone 5: Human attention queue

- Surface plan approvals
- Surface questions/blockers
- Surface PR review/merge actions
- Produce final workstream summary

## Non-negotiable trust requirements

For every PR, the user must be able to answer:

- What changed?
- Why did it change?
- What commands/tests ran?
- Did CI pass?
- What risks remain?
- What should I review first?

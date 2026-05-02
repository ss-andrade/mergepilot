# MergePilot Architecture Sketch

## Architecture principle

MergePilot should be PR-native and event-sourced enough that every user-facing claim can be traced to a plan, event, command, diff, check, review, or human decision.

## Accepted MVP stack

MergePilot starts as a local-first **Electron desktop app** with a React/Vite renderer, local Node/TypeScript orchestrator, SQLite persistence, and an adapter system for coding-agent CLIs.

The first built-in coding-agent adapters are:

- Claude Code CLI
- OpenAI Codex CLI

Workstream orchestration should depend on a generic `AgentAdapter` contract, not on provider-specific logic. The provider-neutral contract lives in `@mergepilot/agents`; see [`agent-adapters.md`](agent-adapters.md) for adapter shape and extension guidance, and [`tech-stack.md`](tech-stack.md) for the full stack decision.

## First-pass components

```text
Web App
  ├─ Workstream UI
  ├─ Event Timeline
  ├─ Human Attention Queue
  └─ PR/CI Summary Views
Local Orchestrator Backend
  ├─ Workstream Service
  ├─ Event Log Service
  ├─ Plan Service
  ├─ Agent Run Service
  ├─ GitHub Integration
  ├─ Agent Adapter Registry
  ├─ Event Log
  └─ Context/Skill Store

Execution Layer
  ├─ Isolated workspaces / worktrees
  ├─ Claude Code adapter
  ├─ Codex adapter
  ├─ Future coding-agent adapters
  ├─ PTY/process supervisor
  ├─ Command/test capture
  └─ Branch/commit/PR creation
```

## Core data model

### Workstream

```text
id
title
goal
status
repo
createdBy
summary
createdAt
updatedAt
```

Statuses:

```text
draft
planning
awaiting_plan_approval
running
awaiting_user_input
awaiting_review
merge_ready
completed
failed
cancelled
```

### Plan

```text
id
workstreamId
goalRestatement
steps
risks
expectedOutputs
requiresApproval
status
```

### AgentRun

```text
id
workstreamId
parentAgentRunId
role: coordinator | build | review
status
model
workspaceRef
branch
startedAt
completedAt
cost
summary
```

### PullRequest

```text
id
workstreamId
provider
repo
number
url
title
branch
base
status
checksStatus
reviewStatus
stackParentId
stackOrder
```

### WorkstreamEvent

```text
id
workstreamId
type
payload
createdAt
```

Example event types:

```text
user_message
coordinator_message
plan_created
plan_approved
agent_started
agent_completed
command_ran
commit_created
branch_pushed
pr_opened
ci_started
ci_passed
ci_failed
review_summary_created
human_action_required
workstream_completed
```

### HumanAttentionItem

```text
id
workstreamId
type
status
title
description
relatedObjectType
relatedObjectId
createdAt
resolvedAt
```

Types:

```text
approve_plan
answer_question
grant_access
review_pr
approve_risky_operation
resolve_ambiguity
merge_pr
```

## Early implementation recommendation

Start with a thin vertical slice, not a broad platform:

1. Single-user local/dev app.
2. GitHub-only integration.
3. One connected repo per workstream.
4. One build-agent run per approved plan.
5. Store events and objects in a simple relational schema.
6. Add stacked PRs, multiple agents, and review autopilot only after the single-agent loop feels trustworthy.

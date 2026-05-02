# MergePilot Product Brief

**Date:** 2026-05-01  
**Status:** Standalone product direction / research synthesis  
**Working thesis:** Build a new product around thread-centric multi-agent software delivery.

---

## Executive Summary

The product opportunity is an **agent-native engineering workspace** where the primary unit of work is a persistent **workstream thread**.

A workstream contains the user conversation, coordinator-agent reasoning, spawned implementation agents, linked branches, stacked PRs, CI/review events, logs, artifacts, costs, and final merge-ready outputs.

The product should feel like:

> A persistent AI engineering coworker that can plan, delegate, code, review, test, fix CI, manage PR stacks, and remember context across workstreams.

The user should not feel like they are managing many agents. They should feel like they have one reliable engineering partner coordinating a team of agents behind the scenes.

---

## Product Thesis

Software teams are entering a phase where many coding agents can work in parallel. The bottleneck shifts from “who can write the code?” to:

- Who decomposes the goal?
- Who assigns the right work to the right agent?
- Who verifies the output?
- Who connects related PRs?
- Who handles CI and review feedback?
- Who decides when something is ready for human approval?

The winning product is not just an agent launcher. It is an **orchestration layer for software delivery**.

The core product should answer:

- What is this workstream trying to achieve?
- What plan did the coordinator create?
- Which agents are currently running?
- Which branches and PRs exist?
- Which PRs depend on each other?
- What did CI say?
- Which review comments matter?
- What needs human judgment?
- What is ready to merge?
- What has the system learned that should be reused next time?

---

## Research Basis: Capy.ai

Capy.ai publicly positions itself as:

> “The IDE for the parallel age.”

Source: https://capy.ai

Public evidence suggests their important product patterns are:

- Chat/work threads as orchestration containers.
- A coordinator persona, “Captain,” that plans and delegates work.
- Build agents that execute coding tasks in isolated environments.
- PRs and PR stacks as first-class outputs.
- CI/review feedback loops that can trigger fixes.
- Automations that create normal reviewable agent tasks.
- Context and skills as first-class navigation surfaces.

Important public X quote describing their thread model:

> “chat threads, where each thread contains a multitude of task agents/PRs. threads can interact with each other too. still very much WIP as we are slowly building towards what feels like just one single coworker you can talk to that remembers everything”

Source: https://x.com/justinsunyt/status/2050099660136845493

Another relevant public quote:

> “captain orchestrates build tasks by default with native PR stacking primitives and works end to end so all you have to review are merge-ready PRs”

Source: https://x.com/justinsunyt/status/2050138839197643077

And on end-to-end PR loops:

> “full self driving PRs… auto fix CI failures and triage review comments… plan + code + review + test + iterate and complete the SDLC all inside one web chat or slack thread”

Source: https://x.com/justinsunyt/status/2049526624039899184

This validates the direction: persistent workstreams, coordinator agents, PR-native output, and closed-loop delivery.

---

## Proposed Standalone Product

## Working Name

Possible names:

- **Threadship**
- **Crewline**
- **Stackflow AI**
- **AgentDesk**
- **MergePilot**
- **PR Captain**
- **ParallelWorks**

For now, this document uses the neutral name **MergePilot**.

---

## Core Product Concept

**MergePilot** is an AI-native software delivery workspace where each engineering goal becomes a persistent thread that can coordinate many agents and PRs.

The user does not manage individual agents directly. The user talks to a coordinator. The coordinator plans the work, spawns implementation agents, monitors their outputs, connects related PRs, reacts to CI and review events, and presents the human with merge-ready decisions.

### One-liner

> An AI-native engineering workspace for orchestrating parallel coding agents from goal to merge-ready PR.

### Longer pitch

> MergePilot lets engineering teams ship software through persistent AI workstreams. Start with a goal in chat; a coordinator agent decomposes the work, launches isolated coding agents, tracks branches and stacked PRs, watches CI and review feedback, and iterates until the output is ready for human approval.

---

## Main Abstractions

## 1. Workstream

The primary product object.

A workstream contains:

- User goal
- Conversation thread
- Coordinator plan
- Subtasks
- Agent runs
- Linked repositories
- Branches
- PRs
- PR stack/dependency graph
- CI checks
- Review comments
- Artifacts
- Runtime/cost/tool metrics
- Decisions and summaries
- Memory/context used by the agents

Example:

```text
Workstream: Implement team billing export
  Goal: Add CSV export for organization billing history
  Coordinator: active
  Repos: web-app, api
  Subtasks: 7
  Agent runs: 5
  PRs: 3
  Status: Awaiting final human review
```

---

## 2. Coordinator Agent

The user-facing agent. Similar to Capy’s “Captain” idea, but productized as a generic coordinator role.

Responsibilities:

- Understand user intent
- Ask clarifying questions only when needed
- Inspect codebase/repo state
- Create implementation plan
- Break work into subtasks
- Spawn coding agents
- Assign model/environment/tooling per subtask
- Monitor progress
- Review generated diffs
- Manage PR stacks
- React to CI failures
- Triage review comments
- Decide when work is ready for human review
- Produce concise summaries

The coordinator is the main “coworker” the user talks to.

---

## 3. Build Agents

Execution agents that perform coding tasks.

Responsibilities:

- Receive scoped task/spec from coordinator
- Run in isolated environment
- Edit files
- Run tests/builds/linters
- Commit changes
- Push branch
- Open or update PR
- Report back with evidence

Each build agent should have:

- Isolated workspace
- Branch/worktree
- Tool logs
- Test results
- Cost/runtime tracking
- Diff summary

---

## 4. Review Agents

Agents that inspect generated work before or after PR creation.

Responsibilities:

- Review diffs
- Identify bugs/security issues/test gaps
- Detect scope creep
- Verify plan compliance
- Triage external review comments
- Avoid endless nit loops

Important product challenge: review agents must not create infinite fix/review cycles. The coordinator needs triage judgment and stopping criteria.

---

## 5. PR Stack

PRs should be first-class orchestration artifacts, not just links.

A PR object should include:

```text
PullRequest
  provider
  repository
  number
  title
  branch
  base
  status
  checks
  reviews
  comments
  stackParent
  stackChildren
  owningWorkstreamId
  originatingAgentRunId
```

The product should understand:

- Which PR depends on which
- Which PR can merge now
- Which PR is blocked
- Which PR needs rebase
- Which review comments map to which branch
- Which agent should fix which issue

---

## 6. Context and Skills

Context and skills should be first-class product areas.

Context examples:

- Repo architecture summaries
- Team conventions
- API contracts
- Design system notes
- Deployment rules
- Testing instructions
- Product requirements

Skills examples:

- “How to add a new API endpoint in this repo”
- “How to write migrations safely”
- “How to run frontend tests”
- “How to triage failing CI”
- “How to create a stacked PR”

Agents should be able to use approved context/skills during workstream execution.

Later, the system can support agent-proposed skill creation, but with human approval and review gates.

---

## 7. Automations

Automations create normal workstreams on a schedule or event.

Examples:

- Daily dependency update scan
- Nightly failing test triage
- Weekly dead-code cleanup
- Security patch check
- “Review latest open PRs every morning”
- “Summarize stale branches every Friday”

Automation runs should not be a separate object type. Each run should create a normal reviewable workstream with logs, diffs, PRs, and human feedback.

---

## Agent-Native Execution Model

The product should represent software delivery as a live, inspectable execution graph.

A workstream should show:

- Current goal
- Current plan
- Subtasks and dependencies
- Active agents
- Agent outputs
- Branches
- PRs
- CI state
- Review state
- Human decisions required
- Final merge path

The main experience is a **thread + graph + event timeline**:

```text
User goal
→ Coordinator plan
→ Subtasks
→ Build agent runs
→ Branches/PRs
→ CI/review events
→ Fix loops
→ Merge-ready summary
```

This model keeps the user focused on outcomes and decisions instead of agent babysitting.

---

## Suggested UX

## Main Dashboard

Shows:

- Active workstreams
- Human attention needed
- Merge-ready PRs
- Running agents
- Failed CI needing triage
- Scheduled automations
- Cost/runtime summary
- Recent completions

Primary CTA:

```text
Ask the coordinator to build something...
```

---

## Workstream Page

Layout:

```text
Left sidebar:
  Dashboard
  Workstreams
  PRs
  Automations
  Context
  Skills
  Admin

Center:
  Persistent conversation with coordinator
  Agent event timeline
  User replies / approvals

Right panel:
  Subtasks
  Agent runs
  Pull requests
  PR stack graph
  CI checks
  Review comments
  Artifacts
  Cost/runtime/tool usage
```

---

## Example Workstream Flow

User:

> Implement signed URL uploads for avatars and update the docs.

Coordinator:

1. Inspects repo structure.
2. Finds upload service, API routes, frontend avatar settings, and docs.
3. Creates plan.
4. Spawns agents:
   - Agent A: backend signed URL endpoint
   - Agent B: frontend avatar upload UI
   - Agent C: docs and tests
5. Tracks branches.
6. Opens stacked PRs.
7. Watches CI.
8. Detects backend test failure.
9. Sends fix task to Agent A.
10. Reviews final diffs.
11. Presents human with:

```text
Ready for review:
- PR #142: backend signed URL endpoint
- PR #143: frontend avatar upload UI, stacked on #142
- PR #144: docs/tests, stacked on #143

CI: passing
Review agent: no blocking findings
Human action: review/merge PR #142 first
```

---

## MVP Scope

## MVP Goal

Build the smallest product that proves persistent workstreams can coordinate parallel coding agents from goal to merge-ready PR.

## MVP Features

### 1. Workstream Threads

- Create workstream from chat prompt
- Persist conversation and events
- Link to one or more repos
- Show status and summary

### 2. Coordinator Agent

- Understand goal
- Inspect repo
- Produce plan
- Spawn one or more build agents
- Summarize outputs

### 3. Build Agent Runs

- Run in isolated workspace
- Modify code
- Run tests/commands
- Create branch
- Push/open PR

### 4. PR Integration

- GitHub first
- Link PRs to workstream
- Show PR status/checks
- Track branch/base

### 5. Event Timeline

Show:

- User messages
- Coordinator decisions
- Spawned agents
- Command/test results
- Commits
- PR creation
- CI results
- Review summaries

### 6. Human Attention Queue

A focused queue of things requiring human action:

- Approve plan
- Answer question
- Review PR
- Approve risky fix
- Resolve credential/access issue

### 7. Basic Context/Skills

- Project instructions
- Repo setup commands
- Testing commands
- Coding conventions

---

## Post-MVP Features

### Native PR Stacking

- Visual PR dependency graph
- Auto-create stacked branches
- Rebase stack after merge
- Track review state per PR

### CI/Review Autopilot

- Watch failed checks
- Parse logs
- Spawn fix agents
- Triage review comments
- Avoid endless loops with max iteration rules

### Slack/Chat Entry Point

- Start a workstream from Slack
- Continue thread from Slack
- Receive merge-ready summaries
- Approve/reject from Slack

### Agent-Proposed Skills

Agents can propose reusable skills when they discover repeatable project-specific workflows.

Flow:

```text
Agent notices repeated workflow
→ proposes skill draft
→ coordinator reviews
→ human approves
→ skill is saved to project context
→ future workstreams can use it
```

### Automations

- Scheduled workstreams
- Event-triggered workstreams
- Daily/weekly agent tasks
- Recurring code health operations

### Multi-Repo Workstreams

- One workstream spans multiple repositories
- Coordinator handles dependency order
- PRs linked across repos

---

## Data Model Sketch

```text
Workstream
  id
  title
  status
  goal
  createdBy
  repoScope
  coordinatorAgentId
  summary
  createdAt
  updatedAt

WorkstreamMessage
  id
  workstreamId
  authorType: user | coordinator | build_agent | review_agent | system
  content
  metadata
  createdAt

AgentRun
  id
  workstreamId
  parentAgentRunId
  role: coordinator | build | review
  model
  status
  workspaceId
  branch
  cost
  runtime
  toolCalls
  resultSummary
  createdAt
  completedAt

Subtask
  id
  workstreamId
  parentSubtaskId
  title
  description
  status
  assignedAgentRunId
  dependencies

PullRequest
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

WorkstreamEvent
  id
  workstreamId
  type
  payload
  createdAt

Skill
  id
  scope: global | organization | project | repo
  title
  body
  status: draft | approved | archived
  createdBy
  approvedBy
```

---

## Differentiation

Potential differentiation:

1. **Open orchestration graph**  
   Make the workstream/agent/PR graph explicit and inspectable.

2. **Skill lifecycle**  
   First-class support for agent-proposed reusable project skills with approval gates.

3. **Human attention design**  
   Surface only decisions requiring human judgment instead of exposing every low-level detail equally.

4. **Portable agent backend**  
   Support different coding agents/models/runtimes instead of one proprietary agent stack.

5. **Team memory layer**  
   Turn repeated review comments, fixes, conventions, and workflows into durable context.

6. **PR-stack-native workflow**  
   Build dependency graphs and merge sequencing into the core product, not as an afterthought.

---

## Key Risks

### 1. Coordinator quality

The product only works if the coordinator can triage, stop, and delegate well. Bad coordinators create chaos.

Mitigation:

- Explicit iteration limits
- Human approval checkpoints
- Review/fix loop caps
- Confidence scoring
- Triage policies

### 2. Review loops

Review agents can create endless nit/fix cycles.

Mitigation:

- Separate blocking vs non-blocking findings
- Max review-fix cycles
- Coordinator must justify continuing
- Human escalation after threshold

### 3. Merge conflicts

Parallel agents increase branch conflicts.

Mitigation:

- Worktree/branch isolation
- PR stacking
- Coordinator-managed dependency graph
- Automated rebase/merge checks

### 4. Cost explosion

Parallel agents can burn tokens/compute quickly.

Mitigation:

- Per-workstream budgets
- Model routing
- Runtime caps
- Cost display in UI
- Approval for expensive operations

### 5. Trust and security

Agents running code need sandboxing and clear audit trails.

Mitigation:

- Isolated ephemeral environments
- Secret scoping
- Tool permission model
- Full event logs
- Audit history

---

## Product Principle

The product should optimize for:

- Fewer human interruptions
- Clearer merge decisions
- Better PR quality
- Visible execution evidence
- Durable project learning
- Safe parallelism

The user experience should converge toward:

> “Tell the system what outcome you want. It plans the work, coordinates the agents, manages the PRs, and comes back when human judgment is needed.”

---

## Recommended Next Step

Spec and validate a standalone MVP around:

```text
Persistent workstream thread
+ coordinator agent
+ isolated build agents
+ PR-native output
+ event timeline
+ human attention queue
```

The first prototype should prove this loop:

```text
User gives goal
→ coordinator plans
→ build agent implements
→ PR opens
→ CI/review events appear in thread
→ coordinator summarizes final human action
```

If that loop feels natural, the product has a real foundation.

---

## Product Definition v0.1

### Category

**Agent-native software delivery workspace.**

This is not primarily an IDE, chat app, CI tool, or project management tool. It is a coordination layer that turns an engineering goal into planned, delegated, verified, reviewable pull requests.

### Target Customer

Initial customer should be a small-to-mid software team already experimenting with coding agents.

Best-fit early users:

- Founder-led product engineering teams shipping quickly.
- Engineering managers who want agents to reduce backlog and maintenance work.
- Staff/principal engineers who already review lots of AI-generated code.
- Teams with GitHub-based PR workflows and reasonably good test coverage.
- Teams comfortable granting a tool repo access in exchange for speed.

Poor early-fit users:

- Teams without tests or CI.
- Teams with highly regulated change-control processes.
- Teams that want an autocomplete IDE replacement rather than delegated delivery.
- Solo users who only need one-off coding help and do not care about PR workflow.

### Core User

The primary user is the **engineering owner** of a piece of work.

They might be:

- A CTO/founder saying, “Ship this feature.”
- An EM saying, “Clean up this backlog area.”
- A senior engineer saying, “Implement this scoped change and bring me reviewable PRs.”

They do not want to manage agents. They want to make product and engineering judgments.

### Pain

Coding agents can write code, but they create a new management burden:

- Prompting many agents is fragmented.
- Agent outputs are hard to compare and audit.
- PRs appear without enough context.
- CI failures require manual babysitting.
- Review comments get lost between tools.
- Stacked changes are difficult for agents to manage.
- Team-specific conventions are not reused reliably.

The pain is not “I need code generated.” The pain is “I need software work driven to a trustworthy merge-ready state.”

### Promise

**Give the product an engineering goal; it coordinates agents until there is a clear human decision: approve plan, answer question, review PR, or merge.**

### Product Bet

The winning UX is not a screen full of agents. It is a single durable workstream where the system hides execution complexity but exposes enough evidence for trust.

### Initial Wedge

Start with **GitHub PR delivery for scoped repo tasks**.

The MVP should not try to support every software workflow. It should be excellent at:

```text
Goal → Plan → Agent implementation → Branch/PR → CI status → Review summary → Human merge decision
```

### Beachhead Use Cases

1. **Small feature implementation**
   - “Add CSV export to billing history.”
   - Requires repo inspection, code changes, tests, PR, and review summary.

2. **Bug fix with CI/test evidence**
   - “Fix the flaky avatar upload test.”
   - Requires diagnosis, minimal patch, test run, and explanation.

3. **Maintenance PR**
   - “Update this dependency and fix breaking changes.”
   - Requires dependency change, test feedback loop, and PR.

4. **Docs/tests companion PR**
   - “Add docs and tests for this recently merged feature.”
   - Lower risk, good for proving workstream traceability.

### MVP Boundary

The MVP should include:

- GitHub repo connection.
- Create workstream from a prompt.
- Coordinator creates a visible plan.
- Human approves or edits plan.
- One or more isolated build-agent runs.
- Branch creation and PR opening.
- Event timeline with key actions.
- CI/check status sync.
- Final review summary and recommended human action.

The MVP should exclude for now:

- Native stacked PR automation beyond basic parent/child linking.
- Slack entry point.
- Fully autonomous review-comment triage.
- Multi-repo workstreams.
- Long-running automations.
- Agent-proposed skills.
- Complex enterprise permissions.

### Core Objects to Define First

#### Workstream

A durable container for one engineering outcome.

Minimum fields:

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

#### Plan

The coordinator’s proposed path before execution.

Minimum fields:

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

#### Agent Run

A bounded execution attempt by a coordinator, build, or review agent.

Minimum fields:

```text
id
workstreamId
role
status
model
workspaceRef
branch
startedAt
completedAt
cost
summary
```

#### Event

The audit log and timeline primitive.

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

#### Pull Request

A PR linked to the workstream.

Minimum fields:

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
```

### Human Attention Queue Definition

The attention queue should only show items where human judgment or access is needed.

Queue item types:

- Approve plan.
- Answer blocking question.
- Grant/fix credentials.
- Review PR.
- Approve risky operation.
- Resolve ambiguous product requirement.
- Merge PR.

This queue is a key product surface because it expresses the core promise: less agent babysitting, more decision-making.

### First Prototype Success Criteria

A prototype is successful if a user can say:

> “Add a small scoped feature to this GitHub repo.”

And the system can produce:

- A sensible plan.
- A visible execution trail.
- A branch and PR.
- Test/CI evidence.
- A concise final summary.
- A clear next human action.

### Non-Negotiable Trust Requirements

For every PR, the user must be able to answer:

- What did the agent change?
- Why did it change it?
- What commands/tests ran?
- Did CI pass?
- What risks remain?
- What should I review first?

### Positioning Drafts

Option A:

> MergePilot is the AI workspace that coordinates coding agents from engineering goal to merge-ready PR.

Option B:

> The agent-native delivery layer for teams shipping through GitHub pull requests.

Option C:

> One coordinator for your AI engineering work: plan, delegate, test, open PRs, and surface only the decisions that need you.

### Product Principles

1. **One thread, many agents.** The user talks to one coordinator, not a swarm.
2. **PRs are the output.** Work is not done until it is reviewable in the team’s normal workflow.
3. **Evidence over vibes.** Every claim should link to a diff, command, check, review, or log.
4. **Human judgment is precious.** Interrupt only for meaningful decisions.
5. **Bounded autonomy.** Agents can act, but budgets, permissions, and loop limits are explicit.
6. **Reusable learning.** Successful patterns should become approved project context or skills.

### Open Questions

1. Is the product a standalone hosted SaaS, a self-hosted/on-prem tool, or both?
2. Should the first interface be web app only, GitHub app first, or Slack/GitHub hybrid?
3. Which coding-agent backend should the first prototype use?
4. How much autonomy is allowed before plan approval?
5. Should agents push directly to customer repos or through fork/sandbox repos first?
6. What is the minimum acceptable security model for repo credentials and secrets?
7. Who is the buyer: CTO/founder, EM, platform engineering, or individual developer?
8. What is the first paid use case: feature work, bug fixing, dependency updates, or maintenance?

### Next Definition Steps

1. Pick the initial ICP and buyer.
2. Pick the first beachhead use case.
3. Define the MVP user journey screen-by-screen.
4. Define the permission/security model.
5. Define the coordinator loop and stopping rules.
6. Build a clickable prototype or thin vertical slice around one GitHub repo.

---

## Naming Research: Fellow, Mason, Faro

Research date: 2026-05-01.

### Fellow

Assessment: **Weak candidate for this product.**

Reasons:

- `fellow.ai` is an active AI meeting assistant / note-taking product.
- `fellow.co` redirects to `fellow.ai`.
- `fellow.so` is an active community app.
- `fellow.com` is an ultra-premium domain listed for sale.
- `github.com/fellow` is taken.
- The word is also heavily used in job titles and fellowship programs, which may make search/discovery noisy.

Checked domains:

```text
fellow.com  registered / for sale
fellow.ai   active product: AI meeting assistant
fellow.dev  registered
fellow.app  registered
fellow.io   registered
fellow.co   active redirect to fellow.ai
fellow.so   active product/community app
fellow.xyz  registered
```

### Mason

Assessment: **Interesting word, but very crowded. Risky.**

Reasons:

- There is already `usemason.ai`, positioned as “The AI Platform for Development.” This is directly adjacent to the product category.
- `mason.tech` is an AI project agent product for residential remodeling.
- `getmason.dev` exists as developer-facing documentation/product surface.
- `masonteams.com`, `withmason.ai`, and `thisismason.com` are active Mason-branded products.
- `github.com/mason` is taken.
- There are popular GitHub projects named Mason/Masonry, including developer tooling/template systems.

Checked domains:

```text
mason.com  registered / site placeholder
mason.ai   active product/site
mason.dev  registered
mason.app  registered
mason.io   registered
mason.co   active site redirect
mason.so   registered / redirects
mason.xyz  registered
```

### Faro

Assessment: **Best of the three from a brand-feel standpoint, but conflict risk is real.**

Reasons:

- `faro.com` is an established 3D measurement/imaging/software company.
- `faro.ai` is registered and listed for sale.
- `faro.io` is an active AI trading product.
- `faro.so` is active.
- `github.com/faro` is taken.
- Grafana has `grafana/faro` and `grafana/faro-web-sdk`, a frontend observability/RUM project. This matters because it is developer-tooling adjacent.
- `faros.ai` is an engineering productivity/intelligence platform, which is highly adjacent in audience and positioning even though the name is plural.

Checked domains:

```text
faro.com  active established company
faro.ai   registered / listed for sale
faro.dev  registered
faro.app  likely registered
faro.io   active AI trading product
faro.co   active site
faro.so   active site
faro.xyz  registered
```

### Naming Conclusion

Of the three, **Faro** has the best sound for the product: short, memorable, and aligned with guidance/navigation. However, because `faros.ai` is an engineering intelligence platform and Grafana Faro is a developer observability project, the exact name may create avoidable confusion in the developer-tools market.

**Fellow** is too directly occupied by `fellow.ai`.  
**Mason** is too crowded and has a directly adjacent `usemason.ai` result.  
**Faro** is the strongest creatively, but should probably be modified rather than used as the exact brand.

Potential Faro-adjacent directions:

- Farolane
- Farowork
- Faroflow
- FaroRun
- FaroStack
- FaroWorks
- FaroHQ
- FaroPilot
- Lantern
- Beacon
- Waymark
- Northstar

---

## Naming Research: Beacon and Northstar

Research date: 2026-05-01.

### Beacon

Assessment: **Strong metaphor, but very crowded and likely not ownable as an exact brand.**

Reasons:

- `beacon.com` is an active AI supply-chain workspace / visibility platform.
- `beacon.dev` is active and appears to be Beacon Software, an AI implementation/orchestration company. This is meaningfully adjacent.
- Search results show Beacon Software as a large AI company, reportedly raising significant funding.
- `beacon.app` is an active login/app surface.
- `beacon.so` is registered and listed for sale.
- `github.com/beacon` is taken.
- Many GitHub repositories use Beacon, including open-source CMS/networking/location projects.

Checked domains:

```text
beacon.com  active product: AI supply-chain workspace
beacon.ai   registered / active
beacon.dev  active Beacon Software site
beacon.app  active app/login surface
beacon.io   registered / redirects to Clearwater investment platform
beacon.co   registered / connection issues during check
beacon.so   registered / for sale
beacon.xyz  active/registered
```

GitHub:

```text
github.com/beacon  taken
Top repo collisions include BeaconCMS/beacon and other established projects.
```

Conclusion: **Great word, weak availability.** If we like this direction, use a modified name rather than exact `Beacon`.

Possible Beacon-adjacent variants:

- BuildBeacon
- CodeBeacon
- BeaconWorks
- BeaconRun
- BeaconStack
- Beaconline
- WorkBeacon
- MergeBeacon
- BeaconHQ
- BeaconLane

### Northstar

Assessment: **Good strategic metaphor, but crowded and less distinctive.**

Reasons:

- `northstar.com`, `northstar.ai`, `northstar.dev`, `northstar.app`, `northstar.io`, and `northstar.xyz` are registered.
- `northstar.dev` redirects/serves `northstar.io`, a risk-based vulnerability management product. This is developer/security-tool adjacent.
- `northstar.so` is registered and listed for sale.
- `github.com/northstar` is taken.
- Search results include many AI/software companies using Northstar/North Star naming.
- GitHub has established Northstar projects, including R2Northstar/Northstar and other developer/open-source projects.

Checked domains:

```text
northstar.com  registered
northstar.ai   registered
northstar.dev  active / redirects to NorthStar vulnerability management
northstar.app  registered / index page
northstar.io   active product: risk-based vulnerability management
northstar.co   registered / connection refused during check
northstar.so   registered / for sale
northstar.xyz  registered
```

GitHub:

```text
github.com/northstar  taken
Top repo collisions include R2Northstar/Northstar and several established projects.
```

Conclusion: **Useful as a positioning metaphor, not ideal as the company/product name.** It is too common in AI, strategy, analytics, and developer/security tooling.

Possible Northstar-adjacent variants:

- Northline
- Northwork
- Northstack
- Starline
- Starboard
- Waystar
- Guidestar
- Workstar
- Northbeam
- Polar

### Updated Naming Preference

Current exact-name risk ranking from the explored set:

```text
Lowest risk / strongest creative fit: Faro, but only if modified
Medium-high risk: Beacon
High risk: Northstar
High risk: Mason
High risk: Fellow
```

Best directions to keep exploring:

- Faro-adjacent: **FaroWorks**, **FaroRun**, **Farolane**
- Beacon-adjacent: **BeaconWorks**, **BeaconRun**, **BeaconLane**
- Guidance/path names: **Waymark**, **Starboard**, **Guidestar**, **Lantern**

---

## Naming Research: Threadship and Cordant

**Date checked:** 2026-05-02  
**Context:** Candidate names for the agent-native software delivery / workstream-thread product.

### Threadship

**Verdict:** **Avoid as exact name, despite strong conceptual fit.**

Creative fit:

- Very strong literal product fit: “thread” + “ship” maps directly to persistent workstreams that ship PRs.
- It is memorable and explains the product quickly.
- But it now has a direct active AI-product collision.

Conflict findings:

- `https://threadship.ai/` is an active product titled **Threadship**.
- Their homepage says: “**Hire AI Agents for your trade operations**.”
- Positioning: specialized AI agents for shipment/trade operations; monitors inboxes, extracts B/Ls and P/Os, tracks tasks, and suggests next actions.
- Their terms page says Threadship is an early-stage tool for organizing shipment-related emails, tracking tasks, and suggesting next actions.
- This is not developer-tool adjacent, but it is an active **AI agents + operations workflow** product using the exact name.

Domain snapshot:

```text
threadship.com  registered, no DNS/active site found during check
threadship.ai   registered, active AI agents product
threadship.dev  RDAP 404, likely available
threadship.app  RDAP 404, likely available
threadship.io   RDAP 404 but DNS/HTTP behavior was inconsistent; treat as inconclusive, not cleanly available
threadship.co   RDAP 404, likely available
threadship.so   RDAP 404, likely available
```

GitHub:

```text
github.com/threadship  404 / appears available
Repo search: only minor non-adjacent collision found, dimayych02/ThreadShips, 0 stars
```

Conclusion: **Do not use Threadship as the exact product/company name.** The name is good, but `threadship.ai` is already an AI-agent workflow product. If the metaphor is still attractive, explore variants that move away from exact collision:

- Shipthread
- Threadlane
- Threadworks
- Workthread
- Shipline
- Workship
- Shipstack
- Threadpilot

### Cordant

**Verdict:** **Risky / probably avoid as exact name.**

Creative fit:

- Strong premium/company-like sound.
- Connotations: concord, coordination, harmonizing multiple parts — good fit for orchestrating agents and PRs.
- Less immediately explanatory than Threadship, but more ownable-sounding in abstract.

Conflict findings:

- `https://www.bakerhughes.com/cordant` is an active **Cordant** industrial software/product line by Baker Hughes.
- Baker Hughes describes Cordant as software for asset, process, and sustainability performance with actionable insights; search results also mention integrated AI updates.
- `https://cordant.dev/` is an active technology consultancy site titled **Cordant | Home**, with positioning around modernizing, securing, and delivering technology.
- `https://cordantadvisory.com/` is an active **Cordant Advisory** AI and technology consulting firm for finance firms.
- `cordant.com` redirects/serves **Alpine Partners** during the check, so the exact `.com` is not available as a clean primary domain.

Domain snapshot:

```text
cordant.com  registered; HTTPS resolved to Alpine Partners
cordant.ai   registered, no active DNS/site found during check
cordant.dev  registered, active technology consultancy site
cordant.app  registered, no active DNS/site found during check
cordant.io   RDAP 404, likely available
cordant.co   RDAP 404, likely available
cordant.so   RDAP 404, likely available
```

GitHub:

```text
github.com/cordant  taken by Cordant Group organization
Repo search: exact/near-exact Cordant repos exist, low star count, mostly not major OSS collisions
```

Conclusion: **Cordant is a nice brand word but not clean enough.** The Baker Hughes software line plus active `cordant.dev` consultancy make it risky for a dev/AI software product. It is better as inspiration than as the exact name.

Possible Cordant-adjacent variants:

- Accordant
- Cordline
- Cordium
- Concordia
- Concord
- Cadence
- Conductor
- Orchestrant
- Relay
- Loom

### Updated preference after Threadship / Cordant checks

```text
Threadship: strongest literal fit, but exact AI-product collision → avoid exact name
Cordant: premium feel, but crowded/active software conflicts → avoid exact name
Faro: still one of the better prior directions if modified
Beacon/Northstar: useful metaphors, but crowded exact names
```

Best next directions:

- Keep the “thread/workstream shipping” semantic, but avoid exact **Threadship**.
- Keep the “coordination/concord” semantic, but avoid exact **Cordant**.
- Explore ownable compounds around: **thread**, **lane**, **stack**, **ship**, **relay**, **cadence**, **waymark**, **faro**, **pilot**, **merge**, **run**.

---
## Naming Research: Top 12 Shortlist Availability Check
**Date checked:** 2026-05-02  
**Names checked:** Wayline, Shipline, Relay, Cadence, Stackline, Threadlane, Waymark, Trellis, Shipyard, Conductor, Meridian, Starboard.
**Method:** RDAP/domain checks for `.com`, `.ai`, `.dev`, `.app`, `.io`, `.co`, `.so`; HTTPS/title checks; GitHub exact-handle and repo search; web search for AI/software/developer-tool/product conflicts.
### Overall ranking
```text
Best surviving candidate: Threadlane, but not clean because threadlane.app is active.
Maybe usable only with modification: Wayline.
Avoid exact names: Shipline, Relay, Cadence, Stackline, Waymark, Trellis, Shipyard, Conductor, Meridian, Starboard.
Hardest avoid: Conductor, Shipyard, Trellis, Relay, Cadence.
```
### Wayline
**Verdict:** **Risky but interesting.**
Why: Active Wayline AI/property-management company; exact .com/.ai/.dev/.app registered; GitHub handle taken. Good word, but no longer clean.
Domain snapshot:
```text
wayline.com      registered / active or parked: Wayline
wayline.ai       registered
wayline.dev      registered
wayline.app      registered / active or parked: Wayline
wayline.io       RDAP 404 / likely available / active or parked: Wayline
wayline.co       RDAP 404 / likely available
wayline.so       RDAP 404 / likely available
```
GitHub:
```text
github.com/wayline  taken (User, wayline)
- cscape/wayline-miami ★6 Ⓜ📡 Web server that generates GTFS Realtime data for transit in South Florida
- YUVARAJ-R-ai/wayline ★0 MapsAPI
- AlexMarinucci99/WayLine ★1 
```
### Shipline
**Verdict:** **Avoid exact name.**
Why: Active Shipline AI and logistics/shipping products; GitHub handle taken; exact name collision plus same shipping semantic.
Domain snapshot:
```text
shipline.com     registered / active or parked: NCZONE.COM
shipline.ai      registered / active or parked: Shipline AI
shipline.dev     registered
shipline.app     registered
shipline.io      RDAP 404 / likely available
shipline.co      RDAP 404 / likely available / active or parked: Shipline
shipline.so      RDAP 404 / likely available
```
GitHub:
```text
github.com/shipline  taken (User, shipline)
- mayhemds/Shipline ★0 A multi-agent orchestration framework for Claude Code. 15 specialised AI agents 
- bogse/ShipLine ★0 
- kuldeepika7/ShipLine ★0 
```
### Relay
**Verdict:** **Avoid exact name.**
Why: Extremely crowded: Relay.app AI automation, Relay GraphQL/devtools, Relay Payments, facebook/relay; exact handle taken.
Domain snapshot:
```text
relay.com        registered / active or parked: Accueil Relay.com - 25 ans RELAY - Relay.com
relay.ai         registered / active or parked: Pay early, earn cashback | Relay
relay.dev        registered / active or parked: Relay
relay.app        registered / active or parked: Relay.app: The easiest way to automate with AI
relay.io         RDAP 404 / likely available / active or parked: Relay Payments - Fast, secure digital payments for logistics
relay.co         RDAP 404 / likely available
relay.so         RDAP 404 / likely available / active or parked: Relay — Next-generation caching for PHP
```
GitHub:
```text
github.com/relay  taken (Organization, Relay)
- facebook/relay ★18936 Relay is a JavaScript framework for building data-driven React applications.
- getsentry/relay ★376 Sentry event forwarding and ingestion service.
- chatmail/relay ★444 chatmail service deployment scripts and docs 
```
### Cadence
**Verdict:** **Avoid exact name.**
Why: Cadence Design Systems owns the software/AI association strongly; cadence.ai active; major Cadence workflow OSS project.
Domain snapshot:
```text
cadence.com      registered / active or parked: Cadence | Computational Software for Intelligent System Design | Caden
cadence.ai       registered / active or parked: AI for Intelligent Design | Cadence.AI | Cadence
cadence.dev      registered
cadence.app      registered
cadence.io       RDAP 404 / likely available
cadence.co       RDAP 404 / likely available
cadence.so       RDAP 404 / likely available / active or parked: cadence.so for sale | Spaceship.com
```
GitHub:
```text
github.com/cadence  taken (Organization, Cadence)
- cadence-workflow/cadence ★9278 Cadence is a distributed, scalable, durable, and highly available orchestration 
- onflow/cadence ★545 Cadence: the resource-oriented smart contract programming language of the Flow n
- falkTX/Cadence ★378 Collection of tools useful for audio production
```
### Stackline
**Verdict:** **Avoid exact name.**
Why: Stackline.com is active retail growth platform with AI products; GitHub handle taken; exact product/company collision.
Domain snapshot:
```text
stackline.com    registered / active or parked: Stackline - Retail Growth Platform
stackline.ai     registered / active or parked: Stackline
stackline.dev    registered / active or parked: STACKLINE – Digital Agency
stackline.app    RDAP 404 / likely available
stackline.io     RDAP 404 / likely available
stackline.co     RDAP 404 / likely available
stackline.so     RDAP 404 / likely available
```
GitHub:
```text
github.com/stackline  taken (User, Satoshi Matsubara)
- AdamWagner/stackline ★1052 Visualize yabai window stacks on macOS. Works with yabai & hammerspoon.
- brandonlamb/stackline ★0 
- adri326/stackline ★8 An esoteric language combining stack operations and cellular automatons, inspire
```
### Threadlane
**Verdict:** **Best of this batch, but with caution.**
Why: Most key startup TLDs look likely available and GitHub handle appears available, but threadlane.app is an active Trade Operations Platform and Threadline-adjacent AI products exist.
Domain snapshot:
```text
threadlane.com   registered
threadlane.ai    RDAP 404 / likely available
threadlane.dev   RDAP 404 / likely available
threadlane.app   registered / active or parked: Threadlane — Trade Case Operations Platform
threadlane.io    RDAP 404 / likely available
threadlane.co    RDAP 404 / likely available / active or parked: RevGen Labs | Fully Managed Outbound for B2B
threadlane.so    RDAP 404 / likely available
```
GitHub:
```text
github.com/threadlane  404 / appears available
- WebShield-Craft/ThreadLane ★0 Online Store for Clothes, Gadgets, and Home & Kitchen.
- thill/threadlanes ★0 parallel executors in rust
```
### Waymark
**Verdict:** **Risky / avoid exact name.**
Why: Waymark.com is active AI ad/video product; waymark.dev/docs active; GitHub handle taken; several mapping/workflow collisions.
Domain snapshot:
```text
waymark.com      registered / active or parked: Home
waymark.ai       registered / active or parked: Home
waymark.dev      registered / active or parked: Documentation – Waymark
waymark.app      registered
waymark.io       RDAP 404 / likely available
waymark.co       RDAP 404 / likely available / HTTPS 404
waymark.so       RDAP 404 / likely available / active or parked: Waymark — competitive intelligence, historically
```
GitHub:
```text
github.com/waymark  taken (User, Waymark)
- PunishedPineapple/WaymarkPresetPlugin ★38 Dalamud/XIVLauncher plugin to manage waymark presets.
- waymarkedtrails/waymarked-trails-site ★125 Main repository for issue tracking and discussions for waymarkedetrails
- waymarkedtrails/waymarkedtrails-backend ★23 Database backend and rendering styles for waymarkedtrails website.
```
### Trellis
**Verdict:** **Avoid exact name.**
Why: Very crowded: trellis.ai, trellis.dev active AI-native dev environment, mindfold-ai/Trellis agent harness, Microsoft TRELLIS, Roots Trellis.
Domain snapshot:
```text
trellis.com      registered / active or parked: Trellis Partners
trellis.ai       registered / active or parked: Streamline Your Pre-Service Operations with AI
trellis.dev      registered / active or parked: Trellis — AI-native development environment
trellis.app      registered
trellis.io       RDAP 404 / likely available
trellis.co       RDAP 404 / likely available / active or parked: Customer Experience-Led. Delivered through AI Workflows.
trellis.so       RDAP 404 / likely available
```
GitHub:
```text
github.com/trellis  taken (Organization, Fence Designs )
- microsoft/TRELLIS ★12408 Official repo for paper "Structured 3D Latents for Scalable and Versatile 3D Gen
- mindfold-ai/Trellis ★6994 The best agent harness.
- roots/trellis ★2562 WordPress LEMP stack with PHP 8.3, Composer, WP-CLI and more
```
### Shipyard
**Verdict:** **Avoid exact name.**
Why: Direct developer-tool conflict: Shipyard.build managed ephemeral PR environments; GitHub org shipyard; Shipyard AI by BigBear.ai.
Domain snapshot:
```text
shipyard.com     registered / active or parked: Shipyard Brewing Company
shipyard.ai      registered
shipyard.dev     registered
shipyard.app     registered / active or parked: shipyard.app for sale | Spaceship.com
shipyard.io      RDAP 404 / likely available
shipyard.co      RDAP 404 / likely available
shipyard.so      RDAP 404 / likely available
```
GitHub:
```text
github.com/shipyard  taken (Organization, Shipyard)
- ehazlett/shipyard ★6330 Composable Docker Management
- leudz/shipyard ★853 Entity Component System focused on usability and flexibility.
- submariner-io/shipyard ★74 Framework and scripts to create multiple Kubernetes clusters with kind (K8s in D
```
### Conductor
**Verdict:** **Hard avoid.**
Why: Direct collision: conductor.build is a coding-agent runner; Netflix/conductor and conductor-oss/conductor are major orchestration projects; conductor.com active.
Domain snapshot:
```text
conductor.com    registered / active or parked: Conductor — Win in AI Search
conductor.ai     registered
conductor.dev    registered
conductor.app    registered
conductor.io     RDAP 404 / likely available
conductor.co     RDAP 404 / likely available
conductor.so     RDAP 404 / likely available
```
GitHub:
```text
github.com/conductor  taken (Organization, Conductor)
- Netflix/conductor ★12772 Conductor is a microservices orchestration engine.
- conductor-oss/conductor ★31747 Conductor is an event driven agentic orchestration platform providing durable an
- bluelinelabs/Conductor ★3898 A small, yet full-featured framework that allows building View-based Android app
```
### Meridian
**Verdict:** **Avoid exact name.**
Why: Crowded in AI/finance/developer space: meridian.ai, meridian-ai.com, Google Meridian, multiple high-star repos.
Domain snapshot:
```text
meridian.com     registered
meridian.ai      registered / active or parked: Meridian | AI for Excel, Financial Modeling &amp; Finance Teams
meridian.dev     registered / active or parked: Meridian Development - Homepage
meridian.app     registered / active or parked: Meridian - The Future of Intelligent Investing
meridian.io      RDAP 404 / likely available
meridian.co      RDAP 404 / likely available / active or parked: Meridian Navigation
meridian.so      RDAP 404 / likely available
```
GitHub:
```text
github.com/meridian  taken (User, Meridian)
- iliane5/meridian ★2403 Meridian cuts through news noise by scraping hundreds of sources, analyzing stor
- google/meridian ★1350 Meridian is an MMM framework that enables advertisers to set up and run their ow
- rynfar/meridian ★1020 Use your Claude Max subscription with OpenCode, Pi, Droid, Aider, Crush, Cline. 
```
### Starboard
**Verdict:** **Risky / avoid exact name.**
Why: Starboard.biz AI freight quoting, Starboard AI, lots of product/company usage; GitHub handle taken; aquasecurity/starboard historical dev/security collision.
Domain snapshot:
```text
starboard.com    registered
starboard.ai     registered
starboard.dev    registered / HTTPS 404
starboard.app    registered / active or parked: Home | Starboard
starboard.io     RDAP 404 / likely available / active or parked: Hello
starboard.co     RDAP 404 / likely available / active or parked: Starboard
starboard.so     RDAP 404 / likely available
```
GitHub:
```text
github.com/starboard  taken (User, Ryan King)
- aquasecurity/starboard ★1374 Superseded by https://github.com/aquasecurity/trivy-operator
- heroku/starboard ★205 onboarding, offboarding, or crossboarding made easy
- naeruru/starboard ★42 starboard / smugboard discord bot for moonmoon discord server
```
### Recommendation
- Do not buy/build around the exact names **Conductor**, **Shipyard**, **Trellis**, **Relay**, **Cadence**, **Meridian**, **Stackline**, **Shipline**, **Waymark**, or **Starboard** without a very deliberate modifier.
- **Threadlane** is the only name from this batch that still looks directionally viable, but `threadlane.app` is already an active trade-operations product, so exact-name use still carries collision risk.
- **Wayline** has the best feel, but is already an active AI/property-management company with core domains taken. Treat it as inspiration, not a clean exact name.
- Next naming pass should favor invented/compound names with fewer exact matches, e.g. **Waydock**, **Shiploom**, **Stacklane**, **Mergelane**, **Prlane**, **Codelane**, **Runmark**, **FaroRun**, **FaroLane**, **Buildlane**, **Relaystack**, **Workpilot**.

import { expect, test } from "@playwright/test";

test("web renderer runs against a mocked mergePilot bridge", async ({ page }) => {
  const runtimeFailures: string[] = [];
  page.on("pageerror", (error) => runtimeFailures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeFailures.push(message.text());
    }
  });

  await page.addInitScript(() => {
    const now = new Date("2026-05-02T00:00:00.000Z").toISOString();
    let running = false;
    let sequence = 0;
    const createCalls: CreateWorkstreamInput[] = [];
    const plans: Plan[] = [
      {
        id: "plan-seeded",
        workstreamId: "ws-seeded",
        title: "Coordinator plan",
        body: "Show canonical events for an existing workstream.\n\n- Inspect repository context.\n- Implement the renderer timeline.\n- Verify runtime coverage.",
        goalRestatement: "Show canonical events for an existing workstream.",
        steps: ["Inspect repository context.", "Implement the renderer timeline.", "Verify runtime coverage."],
        risks: ["Timeline events must stay canonical."],
        expectedOutputs: ["Visible implementation plan.", "Plan approval event."],
        status: "draft",
        createdAt: now,
        updatedAt: now
      }
    ];
    const repositories: GitHubRepositoryConnection[] = [
      {
        id: "repo-existing",
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        htmlUrl: "https://github.com/ss-andrade/mergepilot",
        apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot",
        connectedAt: now,
        updatedAt: now,
        selectedAt: now
      }
    ];
    const workstreams: Workstream[] = [
      {
        id: "ws-empty",
        title: "Review dependency update",
        goal: "Review and merge the dependency update after checks pass.",
        repo: "ss-andrade/mergepilot",
        createdBy: "renderer",
        summary: "Dependency update is waiting for a review pass.",
        status: "awaiting_review",
        createdAt: now,
        updatedAt: now
      }
    ];
    const events: WorkstreamEvent[] = [
      {
        id: "event-existing-1",
        workstreamId: "ws-seeded",
        sequence: 1,
        type: "plan_created",
        message: "Initial implementation plan was drafted.",
        payload: { source: "mock" },
        createdAt: now
      },
      {
        id: "event-existing-2",
        workstreamId: "ws-seeded",
        sequence: 2,
        type: "human_action_required",
        message: "Plan approval is needed before agents continue.",
        payload: { reason: "plan_approval" },
        createdAt: now
      }
    ];
    workstreams.unshift({
      id: "ws-seeded",
      title: "Implement persisted timeline",
      goal: "Show canonical events for an existing workstream.",
      repo: "ss-andrade/mergepilot",
      createdBy: "renderer",
      summary: "Timeline events are ready for inspection.",
      status: "awaiting_plan_approval",
      createdAt: now,
      updatedAt: now
    });
    (window as typeof window & { __mergePilotCreateCalls: CreateWorkstreamInput[] }).__mergePilotCreateCalls = createCalls;
    const status = (): OrchestratorStatus => ({
      state: running ? "running" : "stopped",
      dataDir: "/tmp/mergepilot-renderer-mock/orchestrator",
      databasePath: "/tmp/mergepilot-renderer-mock/orchestrator/mergepilot.sqlite"
    });

    window.mergePilot = {
      appInfo: {
        name: "MergePilot",
        shell: "electron"
      },
      getRuntimeInfo: async () => ({
        appName: "MergePilot",
        appVersion: "0.0.0-test",
        electronVersion: "mocked",
        platform: "test"
      }),
      orchestrator: {
        start: async () => {
          running = true;
          return status();
        },
        stop: async () => {
          running = false;
          return status();
        },
        status: async () => status()
      },
      workstreams: {
        create: async (input) => {
          createCalls.push(input);
          const created: Workstream = {
            id: `ws-${workstreams.length + 1}`,
            title: input.title,
            goal: input.goal,
            repo: input.repo,
            createdBy: input.createdBy,
            summary: input.summary ?? null,
            status: "draft",
            createdAt: now,
            updatedAt: now
          };
          workstreams.push(created);
          return created;
        },
        list: async () => [...workstreams],
        get: async (id) => workstreams.find((workstream) => workstream.id === id) ?? null,
        updateStatus: async (id, nextStatus) => {
          const workstream = workstreams.find((item) => item.id === id);
          if (!workstream) {
            throw new Error(`Missing workstream ${id}`);
          }
          workstream.status = nextStatus;
          workstream.updatedAt = now;
          return workstream;
        }
      },
      github: {
        repositories: {
          connect: async (input) => {
            if (input.owner === "missing") {
              throw new Error("Repository not found or inaccessible.");
            }
            const created: GitHubRepositoryConnection = {
              id: `repo-${repositories.length + 1}`,
              owner: input.owner,
              name: input.name,
              defaultBranch: input.defaultBranch,
              htmlUrl: input.htmlUrl ?? null,
              apiUrl: input.apiUrl ?? null,
              connectedAt: now,
              updatedAt: now,
              selectedAt: null
            };
            repositories.push(created);
            return created;
          },
          list: async () => [...repositories],
          select: async (id) => {
            const selected = repositories.find((repository) => repository.id === id);
            if (!selected) {
              throw new Error(`Missing repository ${id}`);
            }
            for (const repository of repositories) {
              repository.selectedAt = repository.id === id ? now : null;
            }
            return selected;
          },
          reportError: async (input) => {
            const created: WorkstreamEvent = {
              id: `event-${sequence + 1}`,
              workstreamId: input.workstreamId,
              sequence: sequence + 1,
              type: "human_action_required",
              message: input.message,
              payload: {
                integration: "github",
                surface: "repository_connection",
                repository: input.repository,
                reason: input.reason
              },
              createdAt: now
            };
            sequence += 1;
            events.push(created);
            return created;
          }
        }
      },
      events: {
        append: async (input) => {
          const created: WorkstreamEvent = {
            id: `event-${sequence + 1}`,
            workstreamId: input.workstreamId,
            sequence: sequence + 1,
            type: input.type,
            message: input.message,
            payload: input.payload ?? null,
            createdAt: now
          };
          sequence += 1;
          events.push(created);
          return created;
        },
        list: async (workstreamId) => events.filter((event) => event.workstreamId === workstreamId)
      },
      plans: {
        propose: async ({ workstreamId }) => {
          const workstream = workstreams.find((item) => item.id === workstreamId);
          if (!workstream) {
            throw new Error(`Missing workstream ${workstreamId}`);
          }
          const created: Plan = {
            id: `plan-${plans.length + 1}`,
            workstreamId,
            title: "Coordinator plan",
            body: `${workstream.goal}\n\n- Inspect repository context.\n- Implement the requested change.\n- Verify targeted checks.`,
            goalRestatement: workstream.goal,
            steps: ["Inspect repository context.", "Implement the requested change.", "Verify targeted checks."],
            risks: ["Scope may need adjustment after inspection."],
            expectedOutputs: ["Visible implementation plan.", "Timeline event."],
            status: "draft",
            createdAt: now,
            updatedAt: now
          };
          plans.push(created);
          workstream.status = "awaiting_plan_approval";
          events.push({
            id: `event-${sequence + 1}`,
            workstreamId,
            sequence: sequence + 1,
            type: "plan_created",
            message: "Coordinator plan proposed.",
            payload: { planId: created.id },
            createdAt: now
          });
          sequence += 1;
          return created;
        },
        list: async (workstreamId) => plans.filter((plan) => plan.workstreamId === workstreamId),
        approve: async ({ workstreamId, planId }) => {
          const plan = plans.find((item) => item.id === planId && item.workstreamId === workstreamId);
          const workstream = workstreams.find((item) => item.id === workstreamId);
          if (!plan || !workstream) {
            throw new Error("Missing plan.");
          }
          plan.status = "approved";
          plan.updatedAt = now;
          workstream.status = "running";
          events.push({
            id: `event-${sequence + 1}`,
            workstreamId,
            sequence: sequence + 1,
            type: "plan_approved",
            message: "Coordinator plan approved.",
            payload: { planId, unlocksExecution: true },
            createdAt: now
          });
          sequence += 1;
          return plan;
        },
        reject: async ({ workstreamId, planId, reason }) => {
          const plan = plans.find((item) => item.id === planId && item.workstreamId === workstreamId);
          const workstream = workstreams.find((item) => item.id === workstreamId);
          if (!plan || !workstream) {
            throw new Error("Missing plan.");
          }
          plan.status = "rejected";
          plan.updatedAt = now;
          workstream.status = "planning";
          events.push({
            id: `event-${sequence + 1}`,
            workstreamId,
            sequence: sequence + 1,
            type: "human_action_required",
            message: "Coordinator plan rejected.",
            payload: { planId, reason },
            createdAt: now
          });
          sequence += 1;
          return plan;
        }
      }
    };
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Workstreams", exact: true })).toBeVisible();
  await expect(page.getByText("Electron mocked")).toBeVisible();
  await expect(page.getByText("stopped", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("region", { name: "Workstream list" })).toContainText("Implement persisted timeline");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("Status");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("awaiting_plan_approval");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("Timeline events are ready for inspection.");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("Show canonical events for an existing workstream.");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("ss-andrade/mergepilot");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("renderer");
  await expect(page.getByRole("region", { name: "GitHub repositories" })).toContainText("ss-andrade/mergepilot");
  await expect(page.getByRole("region", { name: "GitHub repositories" })).toContainText("main");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("plan_created");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("human_action_required");
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("Show canonical events for an existing workstream.");
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("Inspect repository context.");
  await page.getByRole("button", { name: "Approve plan" }).click();
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("approved");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("plan_approved");
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("running");
  await expect(page.getByRole("region", { name: "Human attention" })).toContainText("Plan approvals, blockers, and access requests");

  await page.getByRole("button", { name: /^Review dependency update awaiting_review$/ }).click();
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("Review and merge the dependency update after checks pass.");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("No events yet");
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("No coordinator plan yet");
  await page.getByRole("button", { name: "Generate plan" }).click();
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("Review and merge the dependency update after checks pass.");
  await page.getByRole("button", { name: "Reject plan" }).click();
  await expect(page.getByRole("region", { name: "Coordinator plan" })).toContainText("rejected");

  await page.getByRole("button", { name: "New Workstream" }).click();
  await page.getByLabel("Goal prompt").fill("Build a basic workstream UI with a list, detail page, and human attention placeholder.");
  await expect(page.getByLabel("Title")).toHaveValue("Build a basic workstream UI");
  await page.getByLabel("Summary").fill("Basic workstream UI is ready to track.");
  await page.getByLabel("Repository").selectOption("repo-existing");
  await page.getByRole("button", { name: "Create workstream" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Build a basic workstream UI" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workstream list" })).toContainText("Basic workstream UI is ready to track.");
  await expect(page.getByText("user_message")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mergePilotCreateCalls: CreateWorkstreamInput[] }).__mergePilotCreateCalls.at(-1))).toMatchObject({
    title: "Build a basic workstream UI",
    goal: "Build a basic workstream UI with a list, detail page, and human attention placeholder.",
    repo: "ss-andrade/mergepilot",
    githubRepository: {
      id: "repo-existing",
      owner: "ss-andrade",
      name: "mergepilot",
      defaultBranch: "main"
    },
    createdBy: "renderer",
    summary: "Basic workstream UI is ready to track."
  });

  await page.getByRole("button", { name: "Connect GitHub repo" }).click();
  await page.getByLabel("Owner").fill("openai");
  await page.getByLabel("Repository name").fill("codex");
  await page.getByLabel("Default branch").fill("main");
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("region", { name: "GitHub repositories" })).toContainText("openai/codex");

  await page.getByRole("button", { name: "Connect GitHub repo" }).click();
  await page.getByLabel("Owner").fill("missing");
  await page.getByLabel("Repository name").fill("private-repo");
  await page.getByLabel("Default branch").fill("main");
  await page.getByRole("button", { name: "Connect repository" }).click();
  await expect(page.getByRole("alert")).toContainText("Repository not found or inaccessible.");
  await expect(page.getByRole("region", { name: "Human attention" })).toContainText("Repository not found or inaccessible.");
  expect(runtimeFailures).toEqual([]);
});

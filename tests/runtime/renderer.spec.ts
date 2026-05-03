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
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("plan_created");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("human_action_required");
  await expect(page.getByRole("region", { name: "Human attention" })).toContainText("Plan approvals, blockers, and access requests");

  await page.getByRole("button", { name: /^Review dependency update awaiting_review$/ }).click();
  await expect(page.getByRole("region", { name: "Workstream detail" })).toContainText("Review and merge the dependency update after checks pass.");
  await expect(page.getByRole("region", { name: "Event timeline" })).toContainText("No events yet");

  await page.getByRole("button", { name: "New Workstream" }).click();
  await page.getByLabel("Goal prompt").fill("Build a basic workstream UI with a list, detail page, and human attention placeholder.");
  await expect(page.getByLabel("Title")).toHaveValue("Build a basic workstream UI");
  await page.getByLabel("Summary").fill("Basic workstream UI is ready to track.");
  await page.getByLabel("Repository").fill("ss-andrade/mergepilot");
  await page.getByRole("button", { name: "Create workstream" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Build a basic workstream UI" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Workstream list" })).toContainText("Basic workstream UI is ready to track.");
  await expect(page.getByText("user_message")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mergePilotCreateCalls: CreateWorkstreamInput[] }).__mergePilotCreateCalls.at(-1))).toMatchObject({
    title: "Build a basic workstream UI",
    goal: "Build a basic workstream UI with a list, detail page, and human attention placeholder.",
    repo: "ss-andrade/mergepilot",
    createdBy: "renderer",
    summary: "Basic workstream UI is ready to track."
  });
  expect(runtimeFailures).toEqual([]);
});

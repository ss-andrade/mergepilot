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
    const workstreams: Workstream[] = [];
    const events: WorkstreamEvent[] = [];
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
          const created: Workstream = {
            id: `ws-${workstreams.length + 1}`,
            title: input.title,
            description: input.description ?? null,
            repositoryPath: input.repositoryPath ?? null,
            status: "active",
            createdAt: now,
            updatedAt: now
          };
          workstreams.push(created);
          return created;
        },
        list: async () => [...workstreams],
        get: async (id) => workstreams.find((workstream) => workstream.id === id) ?? null
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

  await expect(page.getByRole("heading", { name: "MergePilot app shell" })).toBeVisible();
  await expect(page.getByText("Electron mocked")).toBeVisible();
  await expect(page.getByText("stopped", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New Workstream" }).click();
  await page.getByLabel("Title").fill("Workstream 1");
  await page.getByLabel("Description").fill("Created through the secure Electron bridge.");
  await page.getByRole("button", { name: "Create workstream" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Workstream 1" })).toBeVisible();
  await expect(page.getByText("workstream.created")).toBeVisible();
  expect(runtimeFailures).toEqual([]);
});

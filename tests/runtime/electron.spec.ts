import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

test("built Electron app persists workstreams across restarts in an isolated user data directory", async () => {
  test.skip(
    process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
    "Electron E2E requires an X11 or Wayland display; run under xvfb-run on headless Linux."
  );

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mergepilot-electron-e2e-"));
  const userDataDir = path.join(tempRoot, "user-data");
  const runtimeFailures: string[] = [];

  async function launchApp() {
    const electronApp = await electron.launch({
      args: [
        path.join(process.cwd(), "apps/desktop/dist/main/main.js"),
        `--user-data-dir=${userDataDir}`
      ],
      env: {
        ...process.env,
        MERGEPILOT_USER_DATA_DIR: userDataDir,
        NODE_ENV: "test"
      }
    });

    const page = await electronApp.firstWindow();
    page.on("pageerror", (error) => runtimeFailures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeFailures.push(message.text());
      }
    });

    await expect(page.getByRole("heading", { name: "Delivery Control" })).toBeVisible();
    await expect(page.getByText(/^Electron \d/)).toBeVisible();
    const actualUserDataDir = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    expect(actualUserDataDir).toBe(userDataDir);

    return { electronApp, page };
  }

  try {
    const firstRun = await launchApp();
    await firstRun.page.getByRole("button", { name: "Start" }).click();
    await expect(firstRun.page.getByText(userDataDir, { exact: false })).toBeVisible();

    const created = await firstRun.page.evaluate(async () => {
      const workstream = await (window as any).mergePilot.workstreams.create({
        title: "Persisted Electron workstream",
        goal: "Verify Electron persistence through the preload bridge.",
        repo: "ss-andrade/mergepilot",
        createdBy: "electron-e2e",
        summary: "Created by Electron E2E persistence test."
      });
      await (window as any).mergePilot.events.append({
        workstreamId: workstream.id,
        type: "coordinator_message",
        message: "Persisted coordinator event from Electron E2E."
      });
      return { workstreamId: workstream.id };
    });
    await firstRun.electronApp.close();

    const secondRun = await launchApp();
    await secondRun.page.getByRole("button", { name: "Start" }).click();
    await expect(secondRun.page.getByRole("region", { name: "Workstream detail" }).getByRole("heading", { name: "Persisted Electron workstream" })).toBeVisible();
    const persisted = await secondRun.page.evaluate(async (workstreamId) => {
      const workstream = await (window as any).mergePilot.workstreams.get(workstreamId);
      const events = await (window as any).mergePilot.events.list(workstreamId);
      return { workstream, events };
    }, created.workstreamId);
    expect(persisted.workstream?.title).toBe("Persisted Electron workstream");
    expect(persisted.events.some((event) => event.type === "coordinator_message")).toBe(true);
    await secondRun.electronApp.close();

    expect(runtimeFailures).toEqual([]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

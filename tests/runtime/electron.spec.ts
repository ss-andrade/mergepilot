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

    await expect(page.getByRole("heading", { name: "MergePilot app shell" })).toBeVisible();
    await expect(page.getByText(/^Electron \d/)).toBeVisible();
    const actualUserDataDir = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    expect(actualUserDataDir).toBe(userDataDir);

    return { electronApp, page };
  }

  try {
    const firstRun = await launchApp();
    await firstRun.page.getByRole("button", { name: "Start" }).click();
    await expect(firstRun.page.getByText(userDataDir, { exact: false })).toBeVisible();

    await firstRun.page.getByRole("button", { name: "New Workstream" }).click();
    await expect(firstRun.page.getByText("1 persisted workstream(s)")).toBeVisible();
    await expect(firstRun.page.getByText("workstream.created")).toBeVisible();

    await firstRun.page.getByRole("button", { name: "Add event" }).click();
    await expect(firstRun.page.getByText("timeline.note")).toBeVisible();
    await firstRun.electronApp.close();

    const secondRun = await launchApp();
    await secondRun.page.getByRole("button", { name: "Start" }).click();
    await expect(secondRun.page.getByText("1 persisted workstream(s)")).toBeVisible();
    await expect(secondRun.page.getByRole("heading", { name: "Workstream 1" })).toBeVisible();
    await expect(secondRun.page.getByText("workstream.created")).toBeVisible();
    await expect(secondRun.page.getByText("timeline.note")).toBeVisible();
    await secondRun.electronApp.close();

    expect(runtimeFailures).toEqual([]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

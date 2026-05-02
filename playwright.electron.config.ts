import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/runtime",
  testMatch: /electron\.spec\.ts/,
  timeout: 45_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure"
  }
});

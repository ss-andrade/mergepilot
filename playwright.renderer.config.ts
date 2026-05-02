import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/runtime",
  testMatch: /renderer\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build -w @mergepilot/web && npm run preview -w @mergepilot/web",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000
  }
});

import { describe, expect, it } from "vitest";
import { createDesktopOrchestratorOptions } from "./desktop-orchestrator.js";

describe("desktop orchestrator construction", () => {
  it("uses Codex as the production build-agent adapter by default", () => {
    const options = createDesktopOrchestratorOptions({ dataDir: "/tmp/mergepilot" });

    expect(options.dataDir).toBe("/tmp/mergepilot");
    expect(options.buildAgentAdapter).toMatchObject({
      metadata: {
        providerId: "codex",
        displayName: "OpenAI Codex"
      }
    });
    expect(options.buildAgentAdapter?.run).toEqual(expect.any(Function));
    expect(options.pullRequestPublisher?.constructor.name).toBe("GitHubCliPullRequestPublisher");
  });

  it("preserves deterministic adapter and publisher overrides for tests", () => {
    const fakeAdapter = {
      metadata: {
        providerId: "fake-agent",
        adapterId: "fake-build",
        displayName: "Fake Build Agent",
        capabilities: {
          streamingEvents: true,
          cancellation: true,
          structuredResults: true,
          sessionResume: false
        }
      },
      detect: async () => ({ providerId: "fake-agent", status: "available" as const, checkedAt: "2026-05-04T00:00:00.000Z" }),
      health: async () => ({ providerId: "fake-agent", status: "healthy" as const, checkedAt: "2026-05-04T00:00:00.000Z" }),
      run: async () => {
        throw new Error("not used");
      }
    };
    const fakePublisher = {
      openPullRequest: async () => ({
        branchName: "mergepilot/ws/build/run",
        commitSha: "abc123",
        prNumber: 1,
        prUrl: "https://github.com/ss-andrade/mergepilot/pull/1"
      })
    };

    const options = createDesktopOrchestratorOptions({
      dataDir: "/tmp/mergepilot",
      buildAgentAdapter: fakeAdapter,
      pullRequestPublisher: fakePublisher
    });

    expect(options.buildAgentAdapter).toBe(fakeAdapter);
    expect(options.pullRequestPublisher).toBe(fakePublisher);
  });
});

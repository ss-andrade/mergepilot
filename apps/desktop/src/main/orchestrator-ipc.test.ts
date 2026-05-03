import { describe, expect, it, vi } from "vitest";
import { registerOrchestratorIpcHandlers } from "./orchestrator-ipc.js";
import { TestableOrchestratorIpc } from "./orchestrator-ipc.js";

function createFakeIpc(): TestableOrchestratorIpc {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

  return {
    handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    async invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return handler({}, ...args);
    }
  };
}

describe("orchestrator IPC handlers", () => {
  it("registers lifecycle, workstream, and event handlers", async () => {
    const ipc = createFakeIpc();
    const orchestrator = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      status: vi.fn(() => ({ state: "running" as const, dataDir: "/tmp/data", databasePath: "/tmp/data/mergepilot.sqlite3" })),
      createWorkstream: vi.fn(() => ({
        id: "ws-1",
        title: "IPC work",
        goal: "Exercise IPC workstream creation.",
        repo: "ss-andrade/mergepilot",
        createdBy: "renderer",
        summary: null,
        status: "draft" as const,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      })),
      listWorkstreams: vi.fn(() => []),
      getWorkstream: vi.fn(() => ({
        id: "ws-1",
        title: "IPC work",
        goal: "Exercise IPC workstream creation.",
        repo: "ss-andrade/mergepilot",
        createdBy: "renderer",
        summary: null,
        status: "draft" as const,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      })),
      updateWorkstreamStatus: vi.fn(() => ({
        id: "ws-1",
        title: "IPC work",
        goal: "Exercise IPC workstream creation.",
        repo: "ss-andrade/mergepilot",
        createdBy: "renderer",
        summary: null,
        status: "planning" as const,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:01:00.000Z"
      })),
      appendEvent: vi.fn(() => ({
        id: "evt-1",
        workstreamId: "ws-1",
        sequence: 1,
        type: "user_message",
        message: "IPC event",
        payload: { ok: true },
        createdAt: "2026-05-01T00:02:00.000Z"
      })),
      listEvents: vi.fn(() => []),
      connectGitHubRepository: vi.fn(() => ({
        id: "repo-1",
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        htmlUrl: "https://github.com/ss-andrade/mergepilot",
        apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot",
        connectedAt: "2026-05-01T00:03:00.000Z",
        updatedAt: "2026-05-01T00:03:00.000Z",
        selectedAt: null
      })),
      listGitHubRepositories: vi.fn(() => []),
      selectGitHubRepository: vi.fn(() => ({
        id: "repo-1",
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        htmlUrl: null,
        apiUrl: null,
        connectedAt: "2026-05-01T00:03:00.000Z",
        updatedAt: "2026-05-01T00:04:00.000Z",
        selectedAt: "2026-05-01T00:04:00.000Z"
      })),
      recordGitHubRepositoryConnectionError: vi.fn(() => ({
        id: "evt-2",
        workstreamId: "ws-1",
        sequence: 2,
        type: "human_action_required",
        message: "GitHub repository access needs attention.",
        payload: { integration: "github" },
        createdAt: "2026-05-01T00:05:00.000Z"
      })),
      proposePlan: vi.fn(() => ({
        id: "plan-1",
        workstreamId: "ws-1",
        title: "Coordinator plan",
        body: "Restate goal\n\n- Inspect\n- Implement\n- Verify",
        goalRestatement: "Exercise IPC planning.",
        steps: ["Inspect repo context.", "Implement the change.", "Verify targeted checks."],
        risks: ["Scope may expand."],
        expectedOutputs: ["Structured plan.", "Timeline event."],
        status: "draft" as const,
        createdAt: "2026-05-01T00:06:00.000Z",
        updatedAt: "2026-05-01T00:06:00.000Z"
      })),
      listPlans: vi.fn(() => []),
      approvePlan: vi.fn(() => ({
        id: "plan-1",
        workstreamId: "ws-1",
        title: "Coordinator plan",
        body: "Restate goal\n\n- Inspect\n- Implement\n- Verify",
        goalRestatement: "Exercise IPC planning.",
        steps: ["Inspect repo context.", "Implement the change.", "Verify targeted checks."],
        risks: ["Scope may expand."],
        expectedOutputs: ["Structured plan.", "Timeline event."],
        status: "approved" as const,
        createdAt: "2026-05-01T00:06:00.000Z",
        updatedAt: "2026-05-01T00:07:00.000Z"
      })),
      rejectPlan: vi.fn(() => ({
        id: "plan-1",
        workstreamId: "ws-1",
        title: "Coordinator plan",
        body: "Restate goal\n\n- Inspect\n- Implement\n- Verify",
        goalRestatement: "Exercise IPC planning.",
        steps: ["Inspect repo context.", "Implement the change.", "Verify targeted checks."],
        risks: ["Scope may expand."],
        expectedOutputs: ["Structured plan.", "Timeline event."],
        status: "rejected" as const,
        createdAt: "2026-05-01T00:06:00.000Z",
        updatedAt: "2026-05-01T00:08:00.000Z"
      }))
    };

    registerOrchestratorIpcHandlers(ipc, orchestrator);

    await expect(ipc.invoke("orchestrator:start")).resolves.toMatchObject({ state: "running", dataDir: "/tmp/data" });
    await expect(
      ipc.invoke("workstreams:create", {
        title: "IPC work",
        goal: "Exercise IPC workstream creation.",
        repo: "ss-andrade/mergepilot",
        createdBy: "renderer"
      })
    ).resolves.toMatchObject({ id: "ws-1" });
    await ipc.invoke("events:append", {
      workstreamId: "ws-1",
      type: "user_message",
      message: "IPC event",
      payload: { ok: true }
    });
    await expect(ipc.invoke("workstreams:update-status", { workstreamId: "ws-1", status: "planning" })).resolves.toMatchObject({
      id: "ws-1",
      status: "planning"
    });
    await expect(
      ipc.invoke("github:repositories:connect", {
        owner: "ss-andrade",
        name: "mergepilot",
        defaultBranch: "main",
        htmlUrl: "https://github.com/ss-andrade/mergepilot",
        apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot"
      })
    ).resolves.toMatchObject({ id: "repo-1" });
    await expect(ipc.invoke("github:repositories:select", { repositoryId: "repo-1" })).resolves.toMatchObject({
      id: "repo-1",
      selectedAt: expect.any(String)
    });
    await expect(
      ipc.invoke("github:repositories:report-error", {
        workstreamId: "ws-1",
        repository: "ss-andrade/mergepilot",
        message: "GitHub repository access needs attention.",
        reason: "not_found"
      })
    ).resolves.toMatchObject({ type: "human_action_required" });
    await expect(ipc.invoke("plans:propose", { workstreamId: "ws-1" })).resolves.toMatchObject({
      id: "plan-1",
      goalRestatement: "Exercise IPC planning.",
      status: "draft"
    });
    await expect(ipc.invoke("plans:list", { workstreamId: "ws-1" })).resolves.toEqual([]);
    await expect(ipc.invoke("plans:approve", { workstreamId: "ws-1", planId: "plan-1" })).resolves.toMatchObject({
      id: "plan-1",
      status: "approved"
    });
    await expect(
      ipc.invoke("plans:reject", { workstreamId: "ws-1", planId: "plan-1", reason: "Needs edits." })
    ).resolves.toMatchObject({ id: "plan-1", status: "rejected" });

    expect(orchestrator.createWorkstream).toHaveBeenCalledWith({
      title: "IPC work",
      goal: "Exercise IPC workstream creation.",
      repo: "ss-andrade/mergepilot",
      createdBy: "renderer"
    });
    expect(orchestrator.appendEvent).toHaveBeenCalledWith({
      workstreamId: "ws-1",
      type: "user_message",
      message: "IPC event",
      payload: { ok: true }
    });
    expect(orchestrator.updateWorkstreamStatus).toHaveBeenCalledWith("ws-1", "planning");
    expect(orchestrator.connectGitHubRepository).toHaveBeenCalledWith({
      owner: "ss-andrade",
      name: "mergepilot",
      defaultBranch: "main",
      htmlUrl: "https://github.com/ss-andrade/mergepilot",
      apiUrl: "https://api.github.com/repos/ss-andrade/mergepilot"
    });
    expect(orchestrator.selectGitHubRepository).toHaveBeenCalledWith("repo-1");
    expect(orchestrator.recordGitHubRepositoryConnectionError).toHaveBeenCalledWith({
      workstreamId: "ws-1",
      repository: "ss-andrade/mergepilot",
      message: "GitHub repository access needs attention.",
      reason: "not_found"
    });
    expect(orchestrator.proposePlan).toHaveBeenCalledWith({ workstreamId: "ws-1" });
    expect(orchestrator.listPlans).toHaveBeenCalledWith("ws-1");
    expect(orchestrator.approvePlan).toHaveBeenCalledWith({ workstreamId: "ws-1", planId: "plan-1" });
    expect(orchestrator.rejectPlan).toHaveBeenCalledWith({
      workstreamId: "ws-1",
      planId: "plan-1",
      reason: "Needs edits."
    });
  });

  it("validates IPC input before calling services", async () => {
    const ipc = createFakeIpc();
    const orchestrator = {
      start: vi.fn(),
      stop: vi.fn(),
      status: vi.fn(),
      createWorkstream: vi.fn(),
      listWorkstreams: vi.fn(),
      getWorkstream: vi.fn(),
      updateWorkstreamStatus: vi.fn(),
      appendEvent: vi.fn(),
      listEvents: vi.fn(),
      connectGitHubRepository: vi.fn(),
      listGitHubRepositories: vi.fn(),
      selectGitHubRepository: vi.fn(),
      recordGitHubRepositoryConnectionError: vi.fn()
      ,
      proposePlan: vi.fn(),
      listPlans: vi.fn(),
      approvePlan: vi.fn(),
      rejectPlan: vi.fn()
    };

    registerOrchestratorIpcHandlers(ipc, orchestrator);

    await expect(ipc.invoke("workstreams:create", { title: "" })).rejects.toThrow(/title/i);
    await expect(ipc.invoke("workstreams:create", {
      title: "Needs goal",
      repo: "ss-andrade/mergepilot",
      createdBy: "renderer"
    })).rejects.toThrow(/goal/i);
    await expect(ipc.invoke("workstreams:update-status", { workstreamId: "ws-1", status: "active" })).rejects.toThrow(/status/i);
    await expect(
      ipc.invoke("events:append", { workstreamId: "ws-1", type: "workstream.created", message: "Invalid event" })
    ).rejects.toThrow(/event type/i);
    await expect(
      ipc.invoke("events:append", {
        workstreamId: "ws-1",
        type: "command_ran",
        message: "Invalid payload",
        payload: { elided: undefined }
      })
    ).rejects.toThrow(/payload/i);
    await expect(ipc.invoke("events:list", { workstreamId: "../bad" })).rejects.toThrow(/workstreamId/i);
    await expect(
      ipc.invoke("github:repositories:connect", { owner: "bad owner", name: "mergepilot", defaultBranch: "main" })
    ).rejects.toThrow(/owner/i);
    await expect(ipc.invoke("github:repositories:select", { repositoryId: "../bad" })).rejects.toThrow(/repositoryId/i);
    await expect(ipc.invoke("plans:propose", { workstreamId: "../bad" })).rejects.toThrow(/workstreamId/i);
    await expect(ipc.invoke("plans:approve", { workstreamId: "ws-1", planId: "../bad" })).rejects.toThrow(/planId/i);
    await expect(ipc.invoke("plans:reject", { workstreamId: "ws-1", planId: "plan-1", reason: "" })).rejects.toThrow(/reason/i);
    expect(orchestrator.createWorkstream).not.toHaveBeenCalled();
    expect(orchestrator.updateWorkstreamStatus).not.toHaveBeenCalled();
    expect(orchestrator.appendEvent).not.toHaveBeenCalled();
    expect(orchestrator.listEvents).not.toHaveBeenCalled();
    expect(orchestrator.connectGitHubRepository).not.toHaveBeenCalled();
    expect(orchestrator.selectGitHubRepository).not.toHaveBeenCalled();
    expect(orchestrator.proposePlan).not.toHaveBeenCalled();
    expect(orchestrator.approvePlan).not.toHaveBeenCalled();
    expect(orchestrator.rejectPlan).not.toHaveBeenCalled();
  });
});

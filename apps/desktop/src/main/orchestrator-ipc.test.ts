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
        type: "ipc.event",
        message: "IPC event",
        payload: { ok: true },
        createdAt: "2026-05-01T00:02:00.000Z"
      })),
      listEvents: vi.fn(() => [])
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
      type: "ipc.event",
      message: "IPC event",
      payload: { ok: true }
    });
    await expect(ipc.invoke("workstreams:update-status", { workstreamId: "ws-1", status: "planning" })).resolves.toMatchObject({
      id: "ws-1",
      status: "planning"
    });

    expect(orchestrator.createWorkstream).toHaveBeenCalledWith({
      title: "IPC work",
      goal: "Exercise IPC workstream creation.",
      repo: "ss-andrade/mergepilot",
      createdBy: "renderer"
    });
    expect(orchestrator.appendEvent).toHaveBeenCalledWith({
      workstreamId: "ws-1",
      type: "ipc.event",
      message: "IPC event",
      payload: { ok: true }
    });
    expect(orchestrator.updateWorkstreamStatus).toHaveBeenCalledWith("ws-1", "planning");
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
      listEvents: vi.fn()
    };

    registerOrchestratorIpcHandlers(ipc, orchestrator);

    await expect(ipc.invoke("workstreams:create", { title: "" })).rejects.toThrow(/title/i);
    await expect(ipc.invoke("workstreams:create", {
      title: "Needs goal",
      repo: "ss-andrade/mergepilot",
      createdBy: "renderer"
    })).rejects.toThrow(/goal/i);
    await expect(ipc.invoke("workstreams:update-status", { workstreamId: "ws-1", status: "active" })).rejects.toThrow(/status/i);
    await expect(ipc.invoke("events:list", { workstreamId: "../bad" })).rejects.toThrow(/workstreamId/i);
    expect(orchestrator.createWorkstream).not.toHaveBeenCalled();
    expect(orchestrator.updateWorkstreamStatus).not.toHaveBeenCalled();
    expect(orchestrator.listEvents).not.toHaveBeenCalled();
  });
});

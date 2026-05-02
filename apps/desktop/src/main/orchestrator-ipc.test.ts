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
      status: vi.fn(() => ({ state: "running", dataDir: "/tmp/data" })),
      createWorkstream: vi.fn(() => ({ id: "ws-1", title: "IPC work", status: "active" })),
      listWorkstreams: vi.fn(() => []),
      getWorkstream: vi.fn(() => ({ id: "ws-1", title: "IPC work" })),
      appendEvent: vi.fn(() => ({ id: "evt-1", workstreamId: "ws-1", sequence: 1 })),
      listEvents: vi.fn(() => [])
    };

    registerOrchestratorIpcHandlers(ipc, orchestrator);

    await expect(ipc.invoke("orchestrator:start")).resolves.toEqual({ state: "running", dataDir: "/tmp/data" });
    await expect(
      ipc.invoke("workstreams:create", { title: "IPC work", repositoryPath: "/tmp/repo" })
    ).resolves.toMatchObject({ id: "ws-1" });
    await ipc.invoke("events:append", {
      workstreamId: "ws-1",
      type: "ipc.event",
      message: "IPC event",
      payload: { ok: true }
    });

    expect(orchestrator.createWorkstream).toHaveBeenCalledWith({
      title: "IPC work",
      repositoryPath: "/tmp/repo"
    });
    expect(orchestrator.appendEvent).toHaveBeenCalledWith({
      workstreamId: "ws-1",
      type: "ipc.event",
      message: "IPC event",
      payload: { ok: true }
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
      appendEvent: vi.fn(),
      listEvents: vi.fn()
    };

    registerOrchestratorIpcHandlers(ipc, orchestrator);

    await expect(ipc.invoke("workstreams:create", { title: "" })).rejects.toThrow(/title/i);
    await expect(ipc.invoke("events:list", { workstreamId: "../bad" })).rejects.toThrow(/workstreamId/i);
    expect(orchestrator.createWorkstream).not.toHaveBeenCalled();
    expect(orchestrator.listEvents).not.toHaveBeenCalled();
  });
});

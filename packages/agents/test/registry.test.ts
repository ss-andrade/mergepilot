import { describe, expect, it } from "vitest";
import {
  AgentAdapter,
  AgentRunInput,
  AgentRunResult,
  createAgentAdapterRegistry,
} from "../src";

function createFakeAdapter(providerId = "fake-agent"): AgentAdapter {
  return {
    metadata: {
      providerId,
      displayName: "Fake Agent",
      version: "0.0.0-test",
      capabilities: {
        streamingEvents: true,
        cancellation: true,
        structuredResults: true,
      },
    },
    async detect() {
      return {
        providerId,
        status: "available",
        checkedAt: "2026-05-02T00:00:00.000Z",
        message: "Fake adapter is available for tests.",
      };
    },
    async health() {
      return {
        providerId,
        status: "healthy",
        checkedAt: "2026-05-02T00:00:00.000Z",
        message: "Fake adapter is healthy.",
      };
    },
    async run(input: AgentRunInput) {
      const result: AgentRunResult = {
        runId: input.runId,
        providerId,
        status: "completed",
        summary: "Fake run completed.",
        startedAt: "2026-05-02T00:00:00.000Z",
        completedAt: "2026-05-02T00:00:01.000Z",
      };

      return {
        runId: input.runId,
        providerId,
        events: (async function* () {
          yield {
            type: "lifecycle",
            runId: input.runId,
            providerId,
            timestamp: "2026-05-02T00:00:00.000Z",
            status: "started",
          } as const;
        })(),
        result: Promise.resolve(result),
        cancel: async () => undefined,
      };
    },
  };
}

describe("AgentAdapterRegistry", () => {
  it("registers and retrieves an adapter by provider id", () => {
    const registry = createAgentAdapterRegistry();
    const adapter = createFakeAdapter();

    registry.register(adapter);

    expect(registry.get("fake-agent")).toBe(adapter);
    expect(registry.require("fake-agent")).toBe(adapter);
  });

  it("rejects duplicate provider ids", () => {
    const registry = createAgentAdapterRegistry();

    registry.register(createFakeAdapter("fake-agent"));

    expect(() => registry.register(createFakeAdapter("fake-agent"))).toThrow(
      /already registered/i,
    );
  });

  it("rejects adapters without provider ids", () => {
    const registry = createAgentAdapterRegistry();
    const adapter = createFakeAdapter("");

    expect(() => registry.register(adapter)).toThrow(/providerId is required/i);
  });

  it("throws when requiring an unregistered provider id", () => {
    const registry = createAgentAdapterRegistry();

    expect(registry.get("missing-agent")).toBeUndefined();
    expect(() => registry.require("missing-agent")).toThrow(/not registered/i);
  });

  it("lists adapter metadata without exposing provider implementations", () => {
    const registry = createAgentAdapterRegistry();
    const adapter = createFakeAdapter();

    registry.register(adapter);
    const metadata = registry.listMetadata();

    expect(metadata).toEqual([adapter.metadata]);
    expect(metadata[0]).not.toBe(adapter.metadata);
    expect(metadata[0]?.capabilities).not.toBe(adapter.metadata.capabilities);
    expect(metadata[0]).not.toHaveProperty("run");
    expect(metadata[0]).not.toHaveProperty("health");
    expect(registry.list()).toEqual([adapter]);
  });

  it("returns provider health and detection status through the adapter contract", async () => {
    const registry = createAgentAdapterRegistry();
    registry.register(createFakeAdapter("fake-agent"));

    const adapter = registry.require("fake-agent");

    await expect(adapter.detect()).resolves.toMatchObject({
      providerId: "fake-agent",
      status: "available",
      checkedAt: expect.any(String),
    });
    await expect(adapter.health()).resolves.toMatchObject({
      providerId: "fake-agent",
      status: "healthy",
      checkedAt: expect.any(String),
    });
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalOrchestrator } from "../src/index.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "mergepilot-service-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalOrchestratorService", () => {
  it("starts, reports status, serves workstreams and stops", async () => {
    const dataDir = await createTempDir();
    const orchestrator = createLocalOrchestrator({ dataDir });

    expect(orchestrator.status()).toMatchObject({ state: "stopped" });

    await orchestrator.start();
    expect(orchestrator.status()).toMatchObject({ state: "running", dataDir });

    const workstream = orchestrator.createWorkstream({ title: "Service workstream" });
    orchestrator.appendEvent({
      workstreamId: workstream.id,
      type: "service.ready",
      message: "Service ready"
    });

    expect(orchestrator.listWorkstreams()).toEqual([expect.objectContaining({ id: workstream.id })]);
    expect(orchestrator.listEvents(workstream.id)).toEqual([
      expect.objectContaining({ type: "service.ready" })
    ]);

    await orchestrator.stop();
    expect(orchestrator.status()).toMatchObject({ state: "stopped" });
  });

  it("rejects data operations while stopped", async () => {
    const orchestrator = createLocalOrchestrator({ dataDir: await createTempDir() });

    expect(() => orchestrator.listWorkstreams()).toThrow(/not running/i);
  });
});

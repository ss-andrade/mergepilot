import type {
  AgentAdapter,
  AgentAdapterInstanceId,
  AgentAdapterMetadata,
} from "./types.js";

export class AgentAdapterRegistry {
  readonly #adapters = new Map<AgentAdapterInstanceId, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    const { providerId } = adapter.metadata;
    const adapterId = resolveAdapterId(adapter.metadata);

    if (!providerId) {
      throw new Error("Agent adapter providerId is required.");
    }

    if (!adapterId) {
      throw new Error("Agent adapter adapterId is required.");
    }

    if (this.#adapters.has(adapterId)) {
      throw new Error(`Agent adapter '${adapterId}' is already registered.`);
    }

    this.#adapters.set(adapterId, adapter);
  }

  get(adapterId: AgentAdapterInstanceId): AgentAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  require(adapterId: AgentAdapterInstanceId): AgentAdapter {
    const adapter = this.get(adapterId);

    if (!adapter) {
      throw new Error(`Agent adapter '${adapterId}' is not registered.`);
    }

    return adapter;
  }

  list(): AgentAdapter[] {
    return Array.from(this.#adapters.values());
  }

  listMetadata(): AgentAdapterMetadata[] {
    return this.list().map((adapter) => ({
      ...adapter.metadata,
      adapterId: resolveAdapterId(adapter.metadata),
      capabilities: { ...adapter.metadata.capabilities },
      labels: adapter.metadata.labels ? [...adapter.metadata.labels] : undefined,
    }));
  }
}

export function createAgentAdapterRegistry(): AgentAdapterRegistry {
  return new AgentAdapterRegistry();
}

function resolveAdapterId(
  metadata: AgentAdapterMetadata,
): AgentAdapterInstanceId {
  return metadata.adapterId ?? metadata.providerId;
}

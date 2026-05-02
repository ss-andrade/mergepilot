import type {
  AgentAdapter,
  AgentAdapterMetadata,
  AgentProviderId,
} from "./types.js";

export class AgentAdapterRegistry {
  readonly #adapters = new Map<AgentProviderId, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    const { providerId } = adapter.metadata;

    if (!providerId) {
      throw new Error("Agent adapter providerId is required.");
    }

    if (this.#adapters.has(providerId)) {
      throw new Error(`Agent adapter '${providerId}' is already registered.`);
    }

    this.#adapters.set(providerId, adapter);
  }

  get(providerId: AgentProviderId): AgentAdapter | undefined {
    return this.#adapters.get(providerId);
  }

  require(providerId: AgentProviderId): AgentAdapter {
    const adapter = this.get(providerId);

    if (!adapter) {
      throw new Error(`Agent adapter '${providerId}' is not registered.`);
    }

    return adapter;
  }

  list(): AgentAdapter[] {
    return Array.from(this.#adapters.values());
  }

  listMetadata(): AgentAdapterMetadata[] {
    return this.list().map((adapter) => ({
      ...adapter.metadata,
      capabilities: { ...adapter.metadata.capabilities },
    }));
  }
}

export function createAgentAdapterRegistry(): AgentAdapterRegistry {
  return new AgentAdapterRegistry();
}

# Agent Adapter Contract

MergePilot workstream and orchestration code depends on the provider-neutral `@mergepilot/agents` package. Provider-specific process handling, CLI arguments, auth checks, and output parsing belong inside concrete adapter implementations.

## Package

The neutral contract lives in `packages/agents` and exports:

- `AgentAdapter`
- `AgentAdapterInstanceId`
- `AgentRunInput`
- `AgentRunHandle`
- `AgentRunEvent`
- `AgentRunResult`
- `AgentAdapterRegistry`
- provider detection and health result types

## Adapter Shape

An adapter exposes metadata, environment detection, health checks, and a run method:

```ts
import type {
  AgentAdapter,
  AgentRunInput,
  AgentRunHandle,
} from "@mergepilot/agents";

export class FutureAgentAdapter implements AgentAdapter {
  readonly metadata = {
    adapterId: "future-agent",
    providerId: "future-agent",
    displayName: "Future Agent",
    capabilities: {
      streamingEvents: true,
      cancellation: true,
      structuredResults: true,
      sessionResume: true,
    },
  };

  async detect() {
    return {
      providerId: this.metadata.providerId,
      status: "unknown",
      checkedAt: new Date().toISOString(),
    };
  }

  async health() {
    return {
      providerId: this.metadata.providerId,
      status: "unknown",
      checkedAt: new Date().toISOString(),
    };
  }

  async run(input: AgentRunInput): Promise<AgentRunHandle> {
    throw new Error(`Run ${input.runId} is not implemented yet.`);
  }
}
```

## Registry

The registry is intentionally small. It registers adapters by `metadata.adapterId`, rejects duplicate adapter ids, returns adapters when orchestration needs to start a run, and lists metadata for UI or capability display without exposing implementation methods.

For simple one-instance providers, `adapterId` can be omitted and defaults to `providerId`. Use an explicit `adapterId` when the same provider can be configured more than once, such as separate local runtimes, auth homes, or workspace policies.

```ts
import { createAgentAdapterRegistry } from "@mergepilot/agents";

const registry = createAgentAdapterRegistry();
registry.register(new FutureAgentAdapter());

const metadata = registry.listMetadata();
const adapter = registry.require("future-agent");
```

## Claude Code Adapter

The first concrete adapter lives in `packages/claude-code-adapter` and exports `ClaudeCodeAdapter` from `@mergepilot/claude-code-adapter`.

It detects the local `claude` binary with `claude --version`, performs a bounded print-mode health check, and starts one-shot runs with:

```sh
claude -p "<task>" --output-format json --max-turns <n>
```

Register it at the application composition boundary:

```ts
import { createAgentAdapterRegistry } from "@mergepilot/agents";
import { ClaudeCodeAdapter } from "@mergepilot/claude-code-adapter";

const registry = createAgentAdapterRegistry();

registry.register(
  new ClaudeCodeAdapter({
    adapterId: "claude-code-local",
    defaultMaxTurns: 3,
  }),
);
```

The adapter reads bounded turn count from `AgentRunInput.metadata.claudeMaxTurns`, falling back to `metadata.maxTurns` and then the configured default. If `AgentRunInput.session.resumeSessionId` is present, it passes that value to Claude with `--resume`; if Claude JSON output includes `session_id`, the adapter returns it as `AgentRunResult.session.sessionId`.

Claude-specific process execution is isolated behind a small injected runner so tests and future orchestration code can fake CLI responses without requiring a real Claude installation or authenticated account.

The Claude adapter keeps local CLI calls bounded:

- detection runs use `detectTimeoutMs`, defaulting to 5 seconds;
- health checks use `healthTimeoutMs`, defaulting to 30 seconds;
- run output buffers are capped by `maxBufferBytes`, defaulting to 1 MiB per stream;
- run cancellation aborts the active process and resolves the run as `cancelled`;
- command lifecycle events redact the prompt and provider-native resume session id;
- `defaultMaxTurns`, `metadata.claudeMaxTurns`, and `metadata.maxTurns` are capped at 50.

## Session Continuation

Adapters that can resume provider-native sessions should declare `capabilities.sessionResume`. Orchestration passes continuation context through `AgentRunInput.session`:

- `sessionKey`: MergePilot's provider-neutral lookup key for a task, chat, or workstream.
- `resumeSessionId`: the provider-native session id returned by a previous run.
- `handoff`: optional text for adapters that need explicit context when resuming.

Adapters return new continuation state through `AgentRunResult.session`. MergePilot persistence should key that state by workstream, role, adapter id, session key, and workspace path so provider sessions do not cross repositories or configured instances.

The package is built as Node-compatible ESM so future local orchestrator code can import `@mergepilot/agents` directly after `npm run build`.

## Adding A Future Adapter

1. Create the provider-specific adapter in its own implementation package or module.
2. Implement `AgentAdapter` from `@mergepilot/agents`.
3. Keep provider CLI detection and health checks inside `detect` and `health`.
4. Convert provider-specific output into `AgentRunEvent` values before orchestration sees it.
5. Resolve `AgentRunHandle.result` with an `AgentRunResult`.
6. Add adapter-specific tests with faked process or CLI boundaries.
7. Register the adapter at the application composition boundary, not inside workstream domain logic.

Provider ids are stable machine-readable driver ids such as `claude-code` or `codex`. Adapter ids are stable configured-instance ids and are the registry lookup key. Display names are for UI only and should not be used for lookup.

import { CodexAdapter } from "@mergepilot/codex-adapter";
import { createLocalOrchestrator } from "@mergepilot/orchestrator";
import type {
  BuildAgentRunnerOptions,
  LocalOrchestratorOptions,
  LocalOrchestratorService
} from "@mergepilot/orchestrator";

export interface DesktopOrchestratorConstructionOptions extends BuildAgentRunnerOptions {
  dataDir: string;
}

export function createDesktopOrchestratorOptions(
  options: DesktopOrchestratorConstructionOptions
): LocalOrchestratorOptions {
  return {
    ...options,
    buildAgentAdapter: options.buildAgentAdapter ?? new CodexAdapter()
  };
}

export function createDesktopOrchestrator(
  options: DesktopOrchestratorConstructionOptions
): LocalOrchestratorService {
  return createLocalOrchestrator(createDesktopOrchestratorOptions(options));
}

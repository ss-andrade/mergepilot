const agents = await import("@mergepilot/agents");

const requiredExports = ["AgentAdapterRegistry", "createAgentAdapterRegistry"];
const missingExports = requiredExports.filter((exportName) => !(exportName in agents));

if (missingExports.length > 0) {
  console.error(
    `Agents smoke failed: missing exports ${missingExports.join(", ")}`,
  );
  process.exit(1);
}

const registry = agents.createAgentAdapterRegistry();

if (!(registry instanceof agents.AgentAdapterRegistry)) {
  console.error("Agents smoke failed: registry factory returned an unexpected object.");
  process.exit(1);
}

console.log("Agents smoke passed: @mergepilot/agents imports successfully.");

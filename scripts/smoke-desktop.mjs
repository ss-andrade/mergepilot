import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url)).replace(`${path.sep}scripts`, "");

const requiredFiles = [
  "apps/desktop/dist/main/main.js",
  "apps/desktop/dist/preload/preload.cjs",
  "apps/web/dist/index.html",
  "apps/web/dist/assets"
];

await Promise.all(
  requiredFiles.map((filePath) => access(path.join(repoRoot, filePath)))
);

const mainSource = await readFile(
  path.join(repoRoot, "apps/desktop/dist/main/main.js"),
  "utf8"
);
const preloadSource = await readFile(
  path.join(repoRoot, "apps/desktop/dist/preload/preload.cjs"),
  "utf8"
);
const rendererIndex = await readFile(path.join(repoRoot, "apps/web/dist/index.html"), "utf8");

const checks = [
  ["contextIsolation enabled", mainSource.includes("contextIsolation: true")],
  ["nodeIntegration disabled", mainSource.includes("nodeIntegration: false")],
  ["sandbox enabled", mainSource.includes("sandbox: true")],
  ["preload exposes mergePilot API", preloadSource.includes("mergePilot")],
  ["renderer bundle linked", rendererIndex.includes("script")]
];

const failedChecks = checks.filter(([, passed]) => !passed);

if (failedChecks.length > 0) {
  console.error(
    `Desktop smoke failed: ${failedChecks.map(([label]) => label).join(", ")}`
  );
  process.exit(1);
}

console.log("Desktop smoke passed: Electron shell, preload bridge, and renderer build are present.");

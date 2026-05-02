#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const requiredLinuxLibraries = [
  "libgtk-3.so.0",
  "libnss3.so",
  "libXss.so.1",
  "libasound.so.2",
  "libatk-bridge-2.0.so.0",
  "libcups.so.2",
  "libdrm.so.2",
  "libgbm.so.1",
  "libxkbcommon.so.0",
  "libXcomposite.so.1",
  "libXdamage.so.1",
  "libXfixes.so.3",
  "libXrandr.so.2",
  "libpango-1.0.so.0",
  "libcairo.so.2",
  "libglib-2.0.so.0"
];

if (process.platform !== "linux") {
  process.exit(0);
}

const ldconfig = spawnSync("ldconfig", ["-p"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

if (ldconfig.status !== 0) {
  console.error("Unable to inspect Linux shared libraries with `ldconfig -p`.");
  console.error("Install libc-bin or run the Electron runtime tests on a host with ldconfig available.");
  process.exit(1);
}

const availableLibraries = ldconfig.stdout;
const missing = requiredLinuxLibraries.filter((library) => !availableLibraries.includes(library));

if (missing.length > 0) {
  console.error("Electron runtime tests cannot start because Linux desktop libraries are missing.");
  console.error(`Missing: ${missing.join(", ")}`);
  console.error("Ubuntu/Debian example:");
  console.error("  sudo apt-get update && sudo apt-get install -y libgtk-3-0t64 libnss3 libxss1 libasound2t64 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libpango-1.0-0 libcairo2 libglib2.0-0");
  console.error("On older Ubuntu/Debian releases, use libgtk-3-0 and libasound2 if the t64 packages are unavailable.");
  process.exit(1);
}

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const targetTriple = (
  process.env.TAURI_TARGET_TRIPLE ??
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" })
).trim();

if (!targetTriple.includes("windows")) {
  console.log(`Skipping Windows subsystem verification for ${targetTriple}.`);
  process.exit(0);
}

const checks = [
  {
    label: "CloudSprocket desktop app",
    path: path.resolve(appRoot, "src-tauri", "target", "release", "cloudsprocket-desktop.exe"),
  },
  {
    label: "CloudSprocket Go sidecar",
    path: path.resolve(
      appRoot,
      "src-tauri",
      "binaries",
      `cloudsprocketd-${targetTriple}.exe`,
    ),
  },
];

let failed = false;

for (const check of checks) {
  if (!existsSync(check.path)) {
    console.error(`${check.label} was not found at ${check.path}.`);
    failed = true;
    continue;
  }

  const subsystem = readSubsystem(check.path);
  const subsystemLabel = subsystem === 2 ? "Windows GUI" : subsystem === 3 ? "Windows Console" : `Subsystem ${subsystem}`;
  console.log(`${check.label}: ${subsystemLabel}`);

  if (subsystem !== 2) {
    console.error(`${check.label} would open a command prompt on Windows.`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

function readSubsystem(filePath) {
  const binary = readFileSync(filePath);
  if (binary.length < 0x40 || binary.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${filePath} is not a Windows PE executable.`);
  }

  const peOffset = binary.readUInt32LE(0x3c);
  const optionalHeaderOffset = peOffset + 24;
  if (binary.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
    throw new Error(`${filePath} has an invalid PE header.`);
  }
  return binary.readUInt16LE(optionalHeaderOffset + 68);
}

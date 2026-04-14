import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const backendRoot = path.resolve(repoRoot, "backend", "daemon");
const binariesDir = path.resolve(appRoot, "src-tauri", "binaries");

mkdirSync(binariesDir, { recursive: true });

const targetTriple = (
  process.env.TAURI_TARGET_TRIPLE ??
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" })
).trim();
const isWindows = targetTriple.includes("windows");
const executableName = `cloudsprocketd-${targetTriple}${isWindows ? ".exe" : ""}`;
const outputPath = path.resolve(binariesDir, executableName);

execFileSync(
  "go",
  ["build", "-o", outputPath, "./cmd/cloudsprocketd"],
  {
    cwd: backendRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CGO_ENABLED: "0",
    },
  },
);

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = path.join(root, "backend", "daemon");
const result = spawnSync("golangci-lint", ["run", "./..."], {
  cwd,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);

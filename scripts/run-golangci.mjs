import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep in lockstep with .github/workflows/ci.yml golangci-lint version.
const GOLANGCI_LINT_MODULE =
  "github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.12.2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cwd = path.join(root, "backend", "daemon");

// Prefer a PATH binary when present, but always pin via `go run` when missing
// so local results match CI without a separate install step.
const pathProbe = spawnSync("golangci-lint", ["version"], {
  cwd,
  encoding: "utf8",
  shell: true,
});
const hasPathBinary =
  pathProbe.status === 0 &&
  typeof pathProbe.stdout === "string" &&
  pathProbe.stdout.includes("2.12.2");

const result = hasPathBinary
  ? spawnSync("golangci-lint", ["run", "./..."], {
      cwd,
      stdio: "inherit",
      shell: true,
      env: process.env,
    })
  : spawnSync(
      "go",
      ["run", GOLANGCI_LINT_MODULE, "run", "./..."],
      {
        cwd,
        stdio: "inherit",
        shell: true,
        env: process.env,
      },
    );

process.exit(result.status ?? 1);

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");

if (process.platform === "win32") {
  const wrapperDir = path.join(scriptDir, "esbuild-wrapper");
  const wrapperExe = path.join(wrapperDir, "esbuild-wrapper.exe");
  const wrapperSource = path.join(wrapperDir, "main.rs");

  if (!fs.existsSync(wrapperExe)) {
    const result = spawnSync(
      "rustc",
      ["-O", "-o", wrapperExe, wrapperSource],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  process.env.ESBUILD_BINARY_PATH = wrapperExe;
}

process.chdir(appRoot);

const { build } = await import("vite");
await build({ configFile: "vite.config.ts" });

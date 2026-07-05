// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

// Generates THIRD_PARTY_NOTICES.md covering everything that ships in the
// installers: the bundled frontend (npm), the Go sidecar binary, and the
// Rust/Tauri shell. Build-time tooling and type-only packages are excluded
// on purpose: they are never distributed, so no notice is owed for them.
//
// Run manually after dependency changes; the output is committed:
//   pnpm --dir apps/desktop run generate:notices
// Requires pnpm, go, and cargo on PATH.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const daemonRoot = path.join(repoRoot, "backend", "daemon");
const tauriRoot = path.join(appRoot, "src-tauri");
const licenseTextDir = path.join(scriptDir, "license-texts");
const outputPath = path.join(repoRoot, "THIRD_PARTY_NOTICES.md");

// Desktop release targets (tauri.conf.json targets: msi, dmg, appimage, deb).
const RUST_TARGETS = [
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
];

// Type-only packages ship no runtime code, so nothing of theirs is distributed.
const TYPE_ONLY = (name) =>
  name.startsWith("@types/") || name === "csstype" || name === "@oxc-project/types";

// When a package is offered under a choice of licences, we accept the first
// match in this order and comply with that licence alone.
const LICENSE_PREFERENCE = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Zlib",
  "0BSD",
  "Unicode-3.0",
  "Python-2.0",
  "MPL-2.0",
  "Apache-2.0 WITH LLVM-exception",
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    // pnpm is a .cmd shim on Windows and needs a shell; go and cargo are
    // real executables and must not go through cmd.exe, which would mangle
    // the | characters in Go templates.
    shell: process.platform === "win32" && command === "pnpm",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function listDirFiles(dir, pattern) {
  try {
    return fs
      .readdirSync(dir)
      .filter((entry) => pattern.test(entry))
      .map((entry) => path.join(dir, entry))
      .filter((file) => fs.statSync(file).isFile());
  } catch {
    return [];
  }
}

function licenseFilesIn(dir) {
  return listDirFiles(dir, /^(licen[cs]e|copying)(\.|-|_|$)/i);
}

function noticeFilesIn(dir) {
  return listDirFiles(dir, /^notice(\.|$)/i);
}

const COPYRIGHT_NOISE =
  /(copyright (notice|holder|owner|law|license|statement|interest)|above copyright|\[yyyy\]|their copyright|copyright, patent|united states copyright|copyright treaty|copyright doctrine)/i;

function extractCopyrightLines(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s/*#!;-]+/, "").trim();
    if (!/^(©|copyright)/i.test(line)) continue;
    if (COPYRIGHT_NOISE.test(line)) continue;
    if (line.length > 160) continue;
    if (!lines.includes(line)) lines.push(line);
    if (lines.length === 3) break;
  }
  return lines;
}

// Elect one licence per alternative group of an SPDX-ish expression.
// "A OR B" picks the preferred option; "A AND B" keeps every part.
function electLicense(expression) {
  const normalised = expression.replace(/\s*\/\s*/g, " OR ").trim();
  const parts = normalised.split(/\s+AND\s+/).map((part) => part.replace(/^\(|\)$/g, "").trim());
  const elected = parts.map((part) => {
    const options = part.split(/\s+OR\s+/).map((option) => option.trim());
    for (const preferred of LICENSE_PREFERENCE) {
      if (options.includes(preferred)) return preferred;
    }
    return options[0];
  });
  return [...new Set(elected)];
}

// Classify a licence file's text for ecosystems without licence metadata (Go).
function detectLicenseId(text) {
  if (/Apache License/i.test(text) && /Version 2\.0/i.test(text)) {
    return /LLVM Exceptions/i.test(text) ? "Apache-2.0 WITH LLVM-exception" : "Apache-2.0";
  }
  if (/Mozilla Public License/i.test(text)) return "MPL-2.0";
  if (/Permission is hereby granted, free of charge/i.test(text)) return "MIT";
  if (/Redistribution and use in source and binary forms/i.test(text)) {
    return /endorse or promote/i.test(text) ? "BSD-3-Clause" : "BSD-2-Clause";
  }
  if (/Permission to use, copy, modify/i.test(text)) {
    return /provided that the above/i.test(text) ? "ISC" : "0BSD";
  }
  return null;
}

// pkg: { name, version, licenses: [id], copyright: [line], inlineText?, notices: [text] }
function readPackageDir(dir, electedLicenses) {
  const files = licenseFilesIn(dir);
  let chosen = files;
  if (electedLicenses?.length && files.length > 1) {
    const matching = files.filter((file) =>
      electedLicenses.some((id) =>
        path.basename(file).toUpperCase().includes(id.split("-")[0].toUpperCase()),
      ),
    );
    if (matching.length > 0) chosen = matching;
  }
  const texts = chosen.map((file) => fs.readFileSync(file, "utf8"));
  const copyright = [];
  for (const text of texts) {
    for (const line of extractCopyrightLines(text)) {
      if (!copyright.includes(line)) copyright.push(line);
    }
  }
  const notices = noticeFilesIn(dir).map((file) => fs.readFileSync(file, "utf8").trim());
  return { texts, copyright: copyright.slice(0, 3), notices };
}

function collectNpm() {
  const json = JSON.parse(
    run("pnpm", ["licenses", "list", "-F", "@cloudsprocket/desktop", "--prod", "--json"], repoRoot),
  );
  const packages = new Map();
  for (const entries of Object.values(json)) {
    for (const entry of entries) {
      if (entry.name === "@cloudsprocket/desktop" || TYPE_ONLY(entry.name)) continue;
      const version = entry.versions?.[0] ?? "unknown";
      const key = `${entry.name}@${version}`;
      if (packages.has(key)) continue;
      const licenses = electLicense(entry.license ?? "UNKNOWN");
      const dir = entry.paths?.[0];
      const info = dir ? readPackageDir(dir, licenses) : { texts: [], copyright: [], notices: [] };
      if (info.copyright.length === 0 && entry.author) {
        info.copyright.push(`Copyright (c) ${entry.author}`);
      }
      packages.set(key, { name: entry.name, version, licenses, ...info });
    }
  }
  return [...packages.values()];
}

function collectGo() {
  const template =
    "{{if and .Module (not .Standard)}}{{.Module.Path}}|{{.Module.Version}}|{{.Module.Dir}}{{end}}";
  const output = run("go", ["list", "-deps", "-f", template, "./cmd/cloudsprocketd"], daemonRoot);
  const modules = new Map();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [modPath, version, dir] = line.split("|");
    if (!modPath || modPath === "cloudsprocket/backend/daemon") continue;
    if (modules.has(modPath)) continue;
    const info = readPackageDir(dir, null);
    const licenses = [];
    const unknownTexts = [];
    for (const text of info.texts) {
      const id = detectLicenseId(text);
      if (id && !licenses.includes(id)) licenses.push(id);
      if (!id) unknownTexts.push(text);
    }
    if (licenses.length === 0 && unknownTexts.length === 0) {
      console.error(`No licence file found for Go module ${modPath}; aborting.`);
      process.exit(1);
    }
    modules.set(modPath, {
      name: modPath,
      version: version || "",
      licenses: licenses.length > 0 ? licenses : ["UNKNOWN"],
      copyright: info.copyright,
      notices: info.notices,
      inlineText: unknownTexts.join("\n\n") || undefined,
    });
  }
  return [...modules.values()];
}

function collectRust() {
  const metadata = JSON.parse(run("cargo", ["metadata", "--format-version", "1"], tauriRoot));
  const byId = new Map();
  for (const pkg of metadata.packages) {
    if (!pkg.source) continue; // workspace members are first-party
    byId.set(`${pkg.name}@${pkg.version}`, {
      license: pkg.license,
      dir: path.dirname(pkg.manifest_path),
    });
  }
  const treeArgs = ["tree", "-e", "normal", "--prefix", "none", "--format", "{p}", "--color", "never"];
  for (const target of RUST_TARGETS) treeArgs.push("--target", target);
  const output = run("cargo", treeArgs, tauriRoot);
  const crates = new Map();
  for (const raw of output.split(/\r?\n/)) {
    const match = raw.trim().match(/^([A-Za-z0-9_-]+) v([^\s]+)/);
    if (!match) continue;
    const key = `${match[1]}@${match[2]}`;
    if (crates.has(key)) continue;
    const meta = byId.get(key);
    if (!meta) continue; // workspace member or path dependency
    const licenses = electLicense(meta.license ?? "UNKNOWN");
    const info = readPackageDir(meta.dir, licenses);
    crates.set(key, {
      name: match[1],
      version: match[2],
      licenses,
      copyright: info.copyright,
      notices: info.notices,
    });
  }
  return [...crates.values()];
}

function loadLicenseText(id) {
  const file = path.join(licenseTextDir, `${id.replace(/\s+/g, "-")}.txt`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").trim();
}

function renderSection(title, description, packages) {
  const groups = new Map();
  for (const pkg of packages) {
    const key = pkg.licenses.join(" AND ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pkg);
  }
  const orderedKeys = [...groups.keys()].sort((a, b) => {
    const ai = LICENSE_PREFERENCE.indexOf(a);
    const bi = LICENSE_PREFERENCE.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  const parts = [`## ${title}\n\n${description}\n`];
  for (const key of orderedKeys) {
    const entries = groups
      .get(key)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((pkg) => {
        const line = `- **${pkg.name}** ${pkg.version}`.trimEnd();
        const copyright = pkg.copyright.length > 0 ? `  \n  ${pkg.copyright.join("  \n  ")}` : "";
        const inline = pkg.inlineText
          ? `\n\n  <details><summary>Licence text</summary>\n\n\`\`\`\n${pkg.inlineText.trim()}\n\`\`\`\n\n  </details>`
          : "";
        return `${line}${copyright}${inline}`;
      })
      .join("\n");
    parts.push(`### ${key} (${groups.get(key).length})\n\n${entries}\n`);
  }
  return parts.join("\n");
}

function main() {
  const npm = collectNpm();
  const goModules = collectGo();
  const rustCrates = collectRust();
  const all = [...npm, ...goModules, ...rustCrates];

  const licenseIds = new Set();
  for (const pkg of all) {
    if (pkg.inlineText) continue;
    for (const id of pkg.licenses) licenseIds.add(id);
  }
  const missing = [...licenseIds].filter((id) => id !== "UNKNOWN" && !loadLicenseText(id));
  if (missing.length > 0) {
    console.error(
      `Missing licence texts under scripts/license-texts/: ${missing.join(", ")}.\n` +
        "Add the canonical text file(s) and re-run.",
    );
    process.exit(1);
  }

  // Deduplicate NOTICE files (Apache-2.0 clause 4d) by content.
  const noticeGroups = new Map();
  for (const pkg of all) {
    for (const notice of pkg.notices) {
      const hash = crypto.createHash("sha256").update(notice).digest("hex");
      if (!noticeGroups.has(hash)) noticeGroups.set(hash, { notice, packages: [] });
      noticeGroups.get(hash).packages.push(pkg.name);
    }
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  const sections = [
    `# Third-Party Notices

CloudSprocket is licensed under AGPL-3.0-or-later. Its installers redistribute the
third-party components listed below: JavaScript packages compiled into the
application bundle, Go modules compiled into the \`cloudsprocketd\` sidecar binary,
and Rust crates compiled into the desktop shell. Build-time tooling and type-only
packages are not distributed and are therefore not listed.

Where a component is offered under a choice of licences (for example
"MIT OR Apache-2.0"), CloudSprocket elects the first licence shown for that group
and complies with it alone. Full licence texts are reproduced in the appendix.

This file is generated. Regenerate after dependency changes with:

\`\`\`bash
pnpm --dir apps/desktop run generate:notices
\`\`\`

Generated: ${generatedAt}
`,
    renderSection(
      `Desktop frontend (${npm.length} npm packages)`,
      "Packages whose code is compiled into the application's JavaScript bundle.",
      npm,
    ),
    renderSection(
      `Go sidecar \`cloudsprocketd\` (${goModules.length} modules)`,
      "Modules compiled into the sidecar binary.",
      goModules,
    ),
    renderSection(
      `Desktop shell (${rustCrates.length} Rust crates)`,
      `Crates compiled into the Tauri shell for the release targets: ${RUST_TARGETS.join(", ")}.`,
      rustCrates,
    ),
  ];

  if (noticeGroups.size > 0) {
    const noticeParts = ["## NOTICE files\n\nReproduced as required by Apache License 2.0, clause 4(d).\n"];
    for (const { notice, packages } of noticeGroups.values()) {
      const names = [...new Set(packages)];
      const shown = names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} others` : names.join(", ");
      noticeParts.push(`From ${shown}:\n\n\`\`\`\n${notice}\n\`\`\`\n`);
    }
    sections.push(noticeParts.join("\n"));
  }

  const textParts = ["## Licence texts\n"];
  const orderedIds = [...licenseIds]
    .filter((id) => id !== "UNKNOWN")
    .sort((a, b) => {
      const ai = LICENSE_PREFERENCE.indexOf(a);
      const bi = LICENSE_PREFERENCE.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  for (const id of orderedIds) {
    textParts.push(`### ${id}\n\n\`\`\`\n${loadLicenseText(id)}\n\`\`\`\n`);
  }
  sections.push(textParts.join("\n"));

  sections.push(`## Additional notes

- MPL-2.0 licensed components (HashiCorp Go modules, Rust crates) are used
  unmodified; their source code is available from their upstream repositories,
  <https://pkg.go.dev>, and <https://crates.io>.
- OpenTofu (MPL-2.0) is not distributed with CloudSprocket; the application
  downloads official releases from upstream at the user's request.
- AWS, Amazon Web Services, Microsoft, Azure, Google Cloud, and related logos
  are trademarks of their respective owners, used solely to identify the
  corresponding services. No endorsement is implied.
`);

  fs.writeFileSync(outputPath, sections.join("\n"), "utf8");
  console.log(
    `Wrote ${outputPath} (${npm.length} npm packages, ${goModules.length} Go modules, ${rustCrates.length} Rust crates)`,
  );
}

main();

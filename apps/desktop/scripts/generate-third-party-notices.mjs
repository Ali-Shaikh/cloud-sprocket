// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appRoot, "../..");
const outputPath = path.join(repoRoot, "THIRD_PARTY_NOTICES.md");

function runPnpmLicenses() {
  const result = spawnSync(
    "pnpm",
    ["licenses", "list", "-F", "@cloudsprocket/desktop", "--prod", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return JSON.parse(result.stdout);
}

function flattenLicenses(byLicense) {
  const packages = new Map();
  for (const [license, entries] of Object.entries(byLicense)) {
    for (const entry of entries) {
      if (entry.name === "@cloudsprocket/desktop") {
        continue;
      }
      const version = entry.versions?.[0] ?? "unknown";
      const key = `${entry.name}@${version}`;
      if (packages.has(key)) {
        continue;
      }
      packages.set(key, {
        name: entry.name,
        version,
        license: entry.license ?? license,
        author: entry.author,
        homepage: entry.homepage,
      });
    }
  }
  return packages;
}

function formatPackageLine(pkg) {
  const bits = [`- **${pkg.name}** ${pkg.version} (${pkg.license})`];
  if (pkg.author) {
    bits.push(`  - Author: ${pkg.author}`);
  }
  if (pkg.homepage) {
    bits.push(`  - Homepage: ${pkg.homepage}`);
  }
  return bits.join("\n");
}

function renderNotices(packages) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const grouped = new Map();
  for (const pkg of packages.values()) {
    const license = pkg.license || "UNKNOWN";
    if (!grouped.has(license)) {
      grouped.set(license, []);
    }
    grouped.get(license).push(pkg);
  }

  const licenseOrder = ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "UNKNOWN"];
  const licenses = [...grouped.keys()].sort((a, b) => {
    const ai = licenseOrder.indexOf(a);
    const bi = licenseOrder.indexOf(b);
    if (ai === -1 && bi === -1) {
      return a.localeCompare(b);
    }
    if (ai === -1) {
      return 1;
    }
    if (bi === -1) {
      return -1;
    }
    return ai - bi;
  });

  const sections = licenses.map((license) => {
    const entries = grouped
      .get(license)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(formatPackageLine)
      .join("\n");
    return `### ${license}\n\n${entries}`;
  });

  return `# Third-Party Notices

CloudSprocket (AGPL-3.0-or-later) includes the following third-party software in the
desktop application production dependency tree. This file is generated from
\`@cloudsprocket/desktop\` production dependencies and is intended to satisfy MIT,
Apache-2.0, ISC, and BSD attribution requirements in binary distributions.

Regenerate after dependency changes:

\`\`\`bash
pnpm --dir apps/desktop run generate:notices
\`\`\`

Generated: ${generatedAt}

## Packages (${packages.size})

${sections.join("\n\n")}
`;
}

const byLicense = runPnpmLicenses();
const packages = flattenLicenses(byLicense);
const markdown = renderNotices(packages);
fs.writeFileSync(outputPath, markdown, "utf8");
console.log(`Wrote ${outputPath} (${packages.size} packages)`);
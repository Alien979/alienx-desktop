#!/usr/bin/env node

/**
 * Sync community YARA rule repositories and generate a local manifest.
 *
 * Output:
 * - src/yara-community/<source>/... (git clones)
 * - public/yara-rules/manifest.json (metadata summary)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const yaraRoot = path.join(projectRoot, "src", "yara-community");
const manifestDir = path.join(projectRoot, "public", "yara-rules");
const manifestPath = path.join(manifestDir, "manifest.json");

const SOURCES = [
  {
    id: "yara-rules",
    name: "Yara-Rules",
    repo: "https://github.com/Yara-Rules/rules.git",
    branch: "master",
  },
  {
    id: "signature-base",
    name: "Neo23x0 Signature-Base",
    repo: "https://github.com/Neo23x0/signature-base.git",
    branch: "master",
  },
  {
    id: "reversinglabs",
    name: "ReversingLabs YARA Rules",
    repo: "https://github.com/reversinglabs/reversinglabs-yara-rules.git",
    branch: null,
  },
  {
    id: "advanced-threat-research",
    name: "Advanced Threat Research YARA Rules",
    repo: "https://github.com/advanced-threat-research/Yara-Rules.git",
    branch: "master",
  },
  {
    id: "elastic-protections",
    name: "Elastic Protections Artifacts",
    repo: "https://github.com/elastic/protections-artifacts.git",
    branch: null,
  },
  {
    id: "bartblaze",
    name: "bartblaze Yara-Rules",
    repo: "https://github.com/bartblaze/Yara-Rules.git",
    branch: "master",
  },
  {
    id: "inquest",
    name: "InQuest Community YARA Rules",
    repo: "https://github.com/InQuest/yara-rules.git",
    branch: "master",
  },
  {
    id: "malpedia-signator",
    name: "Malpedia Signator Rules",
    repo: "https://github.com/malpedia/signator-rules.git",
    branch: "main",
  },
];

function run(command, cwd = projectRoot) {
  return execSync(command, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function runInherit(command, cwd = projectRoot) {
  execSync(command, {
    cwd,
    stdio: "inherit",
  });
}

function q(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listYaraFiles(dir, baseDir = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      files.push(...listYaraFiles(fullPath, baseDir));
      continue;
    }

    const lower = entry.name.toLowerCase();
    if (
      lower.endsWith(".yar") ||
      lower.endsWith(".yara") ||
      lower.endsWith(".rule")
    ) {
      files.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath).replace(/\\/g, "/"),
      });
    }
  }

  return files;
}

function classifyPlatform(filePath) {
  const lower = filePath.toLowerCase();
  const linuxHints = ["linux", "elf", "unix", "debian", "ubuntu", "rhel"];
  const windowsHints = [
    "windows",
    "win32",
    "win64",
    "pe",
    "powershell",
    "microsoft",
  ];

  const isLinux = linuxHints.some((hint) => lower.includes(hint));
  const isWindows = windowsHints.some((hint) => lower.includes(hint));

  if (isLinux && !isWindows) return "linux";
  if (isWindows && !isLinux) return "windows";
  return "all";
}

function getRepoRevision(repoDir) {
  try {
    const commit = run("git rev-parse HEAD", repoDir);
    return commit || "unknown";
  } catch {
    return "unknown";
  }
}

function syncSource(source) {
  const targetDir = path.join(yaraRoot, source.id);
  ensureDir(yaraRoot);

  if (fs.existsSync(path.join(targetDir, ".git"))) {
    console.log(`Updating ${source.name}...`);
    try {
      runInherit("git fetch --all --prune", targetDir);
      if (source.branch) {
        try {
          runInherit(`git checkout ${source.branch}`, targetDir);
        } catch {
          console.warn(
            `Warning: branch '${source.branch}' not found for ${source.name}; keeping current branch.`,
          );
        }
      }
      runInherit("git pull --ff-only", targetDir);
    } catch (error) {
      console.warn(
        `Warning: could not fast-forward ${source.name}. Keeping existing checkout.`,
      );
    }
    return targetDir;
  }

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    console.log(
      `Skipping ${source.name}: target exists but is not a git repo: ${targetDir}`,
    );
    return targetDir;
  }

  console.log(`Cloning ${source.name}...`);
  try {
    if (source.branch) {
      try {
        runInherit(
          `git clone --depth 1 --branch ${source.branch} ${q(source.repo)} ${q(targetDir)}`,
        );
      } catch {
        // Fallback to default branch if the named branch is unavailable.
        runInherit(`git clone --depth 1 ${q(source.repo)} ${q(targetDir)}`);
      }
    } else {
      runInherit(`git clone --depth 1 ${q(source.repo)} ${q(targetDir)}`);
    }
  } catch (error) {
    console.warn(
      `Warning: failed to clone ${source.name}. Skipping this source.`,
    );
  }
  return targetDir;
}

function buildManifest(sourceDirs) {
  const files = [];
  const summary = {
    totalFiles: 0,
    byPlatform: {
      windows: 0,
      linux: 0,
      all: 0,
    },
    bySource: {},
  };

  for (const source of SOURCES) {
    const dir = sourceDirs[source.id];
    const yaraFiles = dir ? listYaraFiles(dir, dir) : [];

    const sourceSummary = {
      name: source.name,
      repo: source.repo,
      branch: source.branch,
      revision: dir ? getRepoRevision(dir) : "unavailable",
      totalFiles: 0,
      byPlatform: {
        windows: 0,
        linux: 0,
        all: 0,
      },
    };

    for (const item of yaraFiles) {
      const stat = fs.statSync(item.fullPath);
      const platform = classifyPlatform(item.relativePath);

      files.push({
        source: source.id,
        path: item.relativePath,
        platform,
        sizeBytes: stat.size,
      });

      sourceSummary.totalFiles += 1;
      sourceSummary.byPlatform[platform] += 1;
      summary.totalFiles += 1;
      summary.byPlatform[platform] += 1;
    }

    summary.bySource[source.id] = sourceSummary;
  }

  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      repo: s.repo,
      branch: s.branch,
    })),
    summary,
    files,
  };
}

function main() {
  console.log("Syncing community YARA rules...\n");

  const sourceDirs = {};
  for (const source of SOURCES) {
    try {
      sourceDirs[source.id] = syncSource(source);
    } catch {
      console.warn(
        `Warning: source sync failed for ${source.name}; continuing.`,
      );
    }
  }

  const manifest = buildManifest(sourceDirs);

  ensureDir(manifestDir);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nYARA sync complete.");
  console.log(`Manifest: ${path.relative(projectRoot, manifestPath)}`);
  console.log(`Total rules: ${manifest.summary.totalFiles}`);
  console.log(`Windows-tagged: ${manifest.summary.byPlatform.windows}`);
  console.log(`Linux-tagged: ${manifest.summary.byPlatform.linux}`);
  console.log(`Cross-platform/other: ${manifest.summary.byPlatform.all}`);
}

main();

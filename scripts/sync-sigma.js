#!/usr/bin/env node

/**
 * Sync SIGMA and Chainsaw detection rules from upstream repositories
 *
 * This script updates the Git submodules to pull the latest detection rules
 * from SigmaHQ and Chainsaw before bundling them for use in ALIENX.
 *
 * If the submodule is not initialized, it will attempt to initialize it
 * automatically, falling back to a direct clone if the gitlink is missing.
 */

import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

console.log("🔄 Syncing detection rules from upstream repositories...\n");

// Check if running in a Git repository
try {
  execSync("git rev-parse --git-dir", {
    cwd: projectRoot,
    stdio: "ignore",
  });
} catch (error) {
  console.error("❌ Not a Git repository. Skipping submodule sync.");
  process.exit(0);
}

const sigmaPath = join(projectRoot, "src", "sigma-master");
const chainsawPath = join(projectRoot, "src", "chainsaw-rules");

function isInitialized(dirPath) {
  return existsSync(join(dirPath, ".git"));
}

function isDirEmpty(dirPath) {
  if (!existsSync(dirPath)) return true;
  const entries = readdirSync(dirPath);
  return entries.length === 0;
}

// Auto-initialize SIGMA submodule if needed
if (!isInitialized(sigmaPath)) {
  console.log("📦 SIGMA submodule not initialized. Attempting auto-setup...\n");

  // Try git submodule update --init first
  try {
    execSync("git submodule update --init src/sigma-master", {
      cwd: projectRoot,
      stdio: "inherit",
    });
  } catch (e) {
    // Ignore — may fail if gitlink is missing from index
  }

  // If still not initialized, fall back to direct clone
  if (!isInitialized(sigmaPath) && isDirEmpty(sigmaPath)) {
    console.log(
      "⚠️  Submodule gitlink missing from index. Cloning SigmaHQ directly...\n",
    );
    try {
      execSync(
        "git clone --depth 1 https://github.com/SigmaHQ/sigma.git src/sigma-master",
        {
          cwd: projectRoot,
          stdio: "inherit",
        },
      );
      console.log("✅ SIGMA rules cloned successfully\n");
    } catch (cloneError) {
      console.error("❌ Failed to clone SIGMA rules:", cloneError.message);
      console.error(
        "   You can manually clone: git clone https://github.com/SigmaHQ/sigma.git src/sigma-master",
      );
    }
  }
}

try {
  // Update SIGMA rules
  if (isInitialized(sigmaPath)) {
    console.log("📦 Updating SIGMA rules from SigmaHQ...");
    try {
      execSync("git -C src/sigma-master pull --ff-only", {
        cwd: projectRoot,
        stdio: "inherit",
      });
    } catch (e) {
      // Pull may fail on detached HEAD from submodule; that's fine
    }
    console.log("✅ SIGMA rules ready\n");
  } else {
    console.log("⚠️  SIGMA rules not available. Skipping...\n");
  }

  // Update Chainsaw rules
  if (isInitialized(chainsawPath)) {
    console.log("📦 Updating Chainsaw rules...");
    execSync("git submodule update --remote src/chainsaw-rules", {
      cwd: projectRoot,
      stdio: "inherit",
    });
    console.log("✅ Chainsaw rules updated\n");
  } else {
    console.log("ℹ️  Chainsaw submodule not initialized, skipping...\n");
  }

  console.log("🎉 Detection rules sync complete!");
} catch (error) {
  console.error("\n❌ Error syncing detection rules:");
  console.error(error.message);
  process.exit(1);
}

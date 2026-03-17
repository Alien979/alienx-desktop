/**
 * Bundle SIGMA rules by category and platform.
 *
 * Creates one JSON file per category in:
 * - public/sigma-rules/windows/
 * - public/sigma-rules/linux/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORMS = ["windows", "linux"];
const RULES_ROOT = path.join(__dirname, "../src/sigma-master/rules");
const OUTPUT_ROOT = path.join(__dirname, "../public/sigma-rules");

function findYamlFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findYamlFiles(fullPath));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function bundlePlatform(platform) {
  const rulesSource = path.join(RULES_ROOT, platform);
  const outputDir = path.join(OUTPUT_ROOT, platform);

  ensureDir(outputDir);
  cleanDir(outputDir);

  if (!fs.existsSync(rulesSource)) {
    fs.writeFileSync(
      path.join(outputDir, "manifest.json"),
      JSON.stringify({}, null, 2),
      "utf8",
    );
    return { platform, categoryCount: 0, totalRules: 0, totalSize: 0 };
  }

  const ruleFiles = findYamlFiles(rulesSource);
  if (ruleFiles.length === 0) {
    fs.writeFileSync(
      path.join(outputDir, "manifest.json"),
      JSON.stringify({}, null, 2),
      "utf8",
    );
    return { platform, categoryCount: 0, totalRules: 0, totalSize: 0 };
  }

  const categoryPaths = {};
  for (const filePath of ruleFiles) {
    const relativePath = path.relative(rulesSource, filePath);
    const parts = relativePath.split(path.sep);
    const category = parts[0];

    if (!categoryPaths[category]) {
      categoryPaths[category] = [];
    }
    categoryPaths[category].push({ filePath, relativePath });
  }

  let totalSize = 0;
  let totalRules = 0;
  const manifest = {};

  for (const [category, files] of Object.entries(categoryPaths)) {
    const rules = [];

    for (const { filePath, relativePath } of files) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        rules.push({ path: relativePath, content });
      } catch (error) {
        console.warn(
          `[${platform}] Failed to read ${relativePath}: ${error.message}`,
        );
      }
    }

    const outputFile = path.join(outputDir, `${category}.json`);
    const data = JSON.stringify(rules);
    fs.writeFileSync(outputFile, data, "utf8");

    totalSize += data.length;
    totalRules += rules.length;
    manifest[category] = {
      file: `${category}.json`,
      ruleCount: rules.length,
      sizeBytes: data.length,
    };

    console.log(
      `✅ [${platform}] ${category.padEnd(25)} ${String(rules.length).padStart(4)} rules`,
    );
  }

  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
  return {
    platform,
    categoryCount: Object.keys(categoryPaths).length,
    totalRules,
    totalSize,
  };
}

async function bundleRules() {
  console.log("📦 Bundling SIGMA rules by category and platform...\n");
  ensureDir(OUTPUT_ROOT);

  const stats = PLATFORMS.map((platform) => bundlePlatform(platform));

  console.log("\n📊 Bundle summary:");
  for (const stat of stats) {
    console.log(
      `- ${stat.platform}: ${stat.categoryCount} categories, ${stat.totalRules} rules, ${(stat.totalSize / 1024 / 1024).toFixed(2)} MB`,
    );
  }
  console.log("✅ Done! Files written to public/sigma-rules/<platform>/\n");
}

bundleRules().catch((error) => {
  console.error("❌ Error bundling rules:", error);
  process.exit(1);
});

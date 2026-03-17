import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(
  projectRoot,
  "public",
  "yara-rules",
  "manifest.json",
);
const sourceRoot = path.join(projectRoot, "src", "yara-community");
const outputRoot = path.join(projectRoot, "public", "yara-rules");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function extractRuleBlocks(content) {
  const blocks = [];
  const headerRegex =
    /(?:^|\n)\s*(?:global\s+)?(?:private\s+)?rule\s+([A-Za-z0-9_]+)(?:\s*:\s*([^\{\n]+))?\s*\{/g;
  let match;

  while ((match = headerRegex.exec(content)) !== null) {
    const ruleName = match[1];
    const tagText = (match[2] || "").trim();
    const openBrace = content.indexOf("{", match.index);
    if (openBrace === -1) continue;

    let depth = 0;
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let escaped = false;
    let closeBrace = -1;

    for (let i = openBrace; i < content.length; i++) {
      const ch = content[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (!inSingleQuote && ch === '"') {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }

      if (!inDoubleQuote && ch === "'") {
        inSingleQuote = !inSingleQuote;
        continue;
      }

      if (inDoubleQuote || inSingleQuote) {
        continue;
      }

      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          closeBrace = i;
          break;
        }
      }
    }

    if (closeBrace === -1) continue;

    blocks.push({
      name: ruleName,
      tags: tagText ? tagText.split(/\s+/).filter(Boolean) : [],
      body: content.slice(openBrace + 1, closeBrace),
    });
  }

  return blocks;
}

function extractSection(body, sectionName) {
  const regex = new RegExp(
    `(?:^|\\n)\\s*${sectionName}\\s*:\\s*([\\s\\S]*?)(?=(?:^|\\n)\\s*(?:meta|strings|condition)\\s*:|\\n\\s*}$)`,
    "mi",
  );
  const match = body.match(regex);
  return match ? match[1].trim() : "";
}

function unescapeYaraString(value) {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function extractMeta(metaSection) {
  const meta = {};
  for (const line of metaSection.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    meta[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return meta;
}

function extractLiterals(stringsSection) {
  const literals = [];
  const lineRegex =
    /^\s*\$([A-Za-z0-9_]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/gm;
  let match;

  while ((match = lineRegex.exec(stringsSection)) !== null) {
    const identifier = `$${match[1]}`;
    const rawLiteral = match[2] ?? match[3] ?? "";
    const literal = unescapeYaraString(rawLiteral).trim();
    if (literal.length < 4) continue;
    literals.push({ identifier, value: literal.toLowerCase() });
  }

  return literals;
}

function inferMinMatches(conditionSection, identifiers) {
  const lowerCondition = conditionSection.toLowerCase();
  if (!lowerCondition) return 1;

  if (lowerCondition.includes("all of them")) {
    return Math.max(1, identifiers.length);
  }

  const countMatch = lowerCondition.match(/(\d+)\s+of\s+them/);
  if (countMatch) {
    return Math.max(1, Number.parseInt(countMatch[1], 10));
  }

  const referenced = identifiers.filter((identifier) =>
    lowerCondition.includes(identifier.toLowerCase()),
  );

  if (referenced.length <= 1) return 1;
  if (lowerCondition.includes(" or ")) return 1;
  return referenced.length;
}

function parseYaraFile(content, fileMeta) {
  const parsedRules = [];

  for (const block of extractRuleBlocks(content)) {
    const metaSection = extractSection(block.body, "meta");
    const stringsSection = extractSection(block.body, "strings");
    const conditionSection = extractSection(block.body, "condition");
    const meta = extractMeta(metaSection);
    const literals = extractLiterals(stringsSection);

    if (literals.length === 0) continue;

    const uniqueLiterals = Array.from(
      new Set(literals.map((literal) => literal.value)),
    ).slice(0, 24);
    const minMatches = Math.min(
      uniqueLiterals.length,
      inferMinMatches(
        conditionSection,
        literals.map((literal) => literal.identifier),
      ),
    );

    parsedRules.push({
      id: `${fileMeta.source}:${fileMeta.path}:${block.name}`,
      name: block.name,
      title: meta.description || meta.title || block.name,
      description: meta.description || "",
      author: meta.author || "",
      source: fileMeta.source,
      sourceName: fileMeta.sourceName,
      path: fileMeta.path,
      platform: fileMeta.platform,
      tags: block.tags,
      literals: uniqueLiterals,
      minMatches: Math.max(1, minMatches || 1),
      anchor: uniqueLiterals.slice().sort((a, b) => b.length - a.length)[0],
    });
  }

  return parsedRules;
}

function main() {
  ensureDir(outputRoot);

  const manifest = readJson(manifestPath, { sources: [], files: [] });
  const sourceNameById = new Map(
    (manifest.sources || []).map((source) => [source.id, source.name]),
  );

  const bundles = {
    linux: [],
    windows: [],
  };

  for (const item of manifest.files || []) {
    const sourceFile = path.join(sourceRoot, item.source, item.path);
    if (!fs.existsSync(sourceFile)) continue;

    const content = fs.readFileSync(sourceFile, "utf8");
    const parsedRules = parseYaraFile(content, {
      source: item.source,
      sourceName: sourceNameById.get(item.source) || item.source,
      path: item.path,
      platform: item.platform,
    });

    if (item.platform === "linux" || item.platform === "all") {
      bundles.linux.push(...parsedRules);
    }
    if (item.platform === "windows" || item.platform === "all") {
      bundles.windows.push(...parsedRules);
    }
  }

  for (const platform of ["linux", "windows"]) {
    const deduped = Array.from(
      new Map(bundles[platform].map((rule) => [rule.id, rule])).values(),
    );
    writeJson(path.join(outputRoot, `${platform}.json`), {
      generatedAt: new Date().toISOString(),
      platform,
      ruleCount: deduped.length,
      rules: deduped,
    });
    console.log(
      `[YARA] Bundled ${deduped.length} ${platform} rules -> public/yara-rules/${platform}.json`,
    );
  }
}

main();

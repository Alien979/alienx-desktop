/**
 * Auto-load SIGMA rules from bundled category files
 *
 * Loads pre-bundled rule files from /public/sigma-rules/<platform>/
 */

import { SigmaEngine } from "../SigmaEngine";

export type SigmaPlatform = "windows" | "linux";

export interface PlatformInfo {
  id: SigmaPlatform;
  name: string;
  description: string;
  icon: string;
  ruleCount: number;
}

interface CategoryManifest {
  file: string;
  ruleCount: number;
  sizeBytes: number;
}

interface RuleFile {
  path: string;
  content: string;
}

const cachedSigmaManifests = new Map<
  SigmaPlatform,
  Record<string, CategoryManifest>
>();

async function getSigmaManifest(
  platform: SigmaPlatform,
): Promise<Record<string, CategoryManifest>> {
  const cached = cachedSigmaManifests.get(platform);
  if (cached) return cached;

  try {
    const response = await fetch(`/sigma-rules/${platform}/manifest.json`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${platform} manifest: ${response.statusText}`,
      );
    }
    const manifest = await response.json();
    cachedSigmaManifests.set(platform, manifest);
    return manifest;
  } catch (error) {
    console.error(`[SIGMA] Failed to fetch ${platform} manifest:`, error);
    return {};
  }
}

export function getAvailablePlatforms(): PlatformInfo[] {
  return [
    {
      id: "windows",
      name: "Windows - Official SIGMA",
      description:
        "Windows Event Logs (EVTX), Sysmon, PowerShell, Security events",
      icon: "",
      ruleCount: 0,
    },
    {
      id: "linux",
      name: "Linux - Official SIGMA",
      description: "Linux logs (auditd, auth, syslog, journal exports)",
      icon: "",
      ruleCount: 0,
    },
  ];
}

export async function getAvailablePlatformsWithCounts(): Promise<
  PlatformInfo[]
> {
  const platforms = getAvailablePlatforms();

  for (const platform of platforms) {
    try {
      const manifest = await getSigmaManifest(platform.id);
      platform.ruleCount = Object.values(manifest).reduce(
        (sum, cat) => sum + cat.ruleCount,
        0,
      );
    } catch {
      platform.ruleCount = 0;
    }
  }

  return platforms;
}

export async function autoLoadRules(
  engine: SigmaEngine,
  platform: SigmaPlatform,
  onProgress?: (loaded: number, total: number) => void,
  categories?: string[],
): Promise<{
  loaded: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    loaded: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const manifest = await getSigmaManifest(platform);

    let categoriesToLoad = Object.keys(manifest);
    if (categories && categories.length > 0) {
      categoriesToLoad = categoriesToLoad.filter((cat) =>
        categories.includes(cat),
      );
    }

    if (categoriesToLoad.length === 0) {
      result.errors.push(`No matching categories found for ${platform}`);
      return result;
    }

    const totalCategories = categoriesToLoad.length;
    let processedCategories = 0;

    for (const category of categoriesToLoad) {
      const categoryInfo = manifest[category];
      if (!categoryInfo) continue;

      try {
        const response = await fetch(
          `/sigma-rules/${platform}/${categoryInfo.file}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const rules: RuleFile[] = await response.json();

        for (const rule of rules) {
          try {
            const ruleIds = await engine.loadRules(rule.content);
            if (ruleIds.length > 0) {
              result.loaded += ruleIds.length;
            } else {
              result.failed++;
              result.errors.push(`${rule.path}: No valid rules found`);
            }
          } catch (error) {
            result.failed++;
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            result.errors.push(`${rule.path}: ${errorMsg}`);
          }
        }

        processedCategories++;
        if (onProgress) {
          onProgress(processedCategories, totalCategories);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to load category ${category}: ${errorMsg}`);
        processedCategories++;
        if (onProgress) {
          onProgress(processedCategories, totalCategories);
        }
      }
    }
  } catch (error) {
    result.errors.push(
      `Auto-load failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

export async function getAvailableCategories(
  platform: SigmaPlatform,
): Promise<string[]> {
  const manifest = await getSigmaManifest(platform);
  return Object.keys(manifest);
}

export function getAvailableRuleFiles(_platform: SigmaPlatform): string[] {
  return [];
}

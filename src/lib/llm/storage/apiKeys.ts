/**
 * API Key Storage Utility
 *
 * Stores API keys securely in localStorage with basic obfuscation
 * Note: This is client-side only storage. For production, consider
 * more secure options or backend proxy.
 */

const STORAGE_PREFIX = "alienx_llm_";
const OBFUSCATION_KEY = "alienx_obf_";

/**
 * Simple obfuscation (not encryption - just basic obfuscation)
 */
function obfuscate(key: string): string {
  return btoa(key + OBFUSCATION_KEY);
}

function deobfuscate(obfuscated: string): string {
  try {
    const decoded = atob(obfuscated);
    return decoded.replace(OBFUSCATION_KEY, "");
  } catch {
    return "";
  }
}

/**
 * Store API key for a provider
 */
export function storeAPIKey(provider: string, apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    removeAPIKey(provider);
    return;
  }

  try {
    const obfuscated = obfuscate(apiKey);
    localStorage.setItem(`${STORAGE_PREFIX}${provider}`, obfuscated);
  } catch (error) {
    throw new Error(
      "Failed to store API key. Check browser storage permissions.",
    );
  }
}

/**
 * Retrieve API key for a provider
 */
export function getAPIKey(provider: string): string | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${provider}`);
    if (!stored) return null;

    return deobfuscate(stored);
  } catch (error) {
    return null;
  }
}

/**
 * Remove API key for a provider
 */
export function removeAPIKey(provider: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${provider}`);
  } catch (error) {
    // Silently ignore errors
  }
}

/**
 * Check if API key exists for a provider
 */
export function hasAPIKey(provider: string): boolean {
  return getAPIKey(provider) !== null;
}

/**
 * Get all stored providers
 */
export function getStoredProviders(): string[] {
  const providers: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const provider = key.replace(STORAGE_PREFIX, "");
        providers.push(provider);
      }
    }
  } catch (error) {
    // Silently ignore errors
  }
  return providers;
}

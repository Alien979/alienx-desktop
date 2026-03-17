/**
 * Conversation History Storage
 * Persists LLM conversation history to sessionStorage (cleared when browser closes)
 * Only persists to saved sessions when user explicitly saves
 */

const STORAGE_KEY = 'llm_conversation_history';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface ConversationState {
  provider: string;
  model: string;
  messages: ConversationMessage[];
  lastUpdated: number;
}

/**
 * Save conversation history to sessionStorage (temporary, current session only)
 */
export function saveConversation(state: ConversationState): void {
  try {
    const data = {
      ...state,
      lastUpdated: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Silently ignore errors
  }
}

/**
 * Load conversation history from sessionStorage
 */
export function loadConversation(): ConversationState | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const data = JSON.parse(stored) as ConversationState;
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Clear conversation history from sessionStorage
 */
export function clearConversation(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Silently ignore errors
  }
}

/**
 * Check if a saved conversation exists
 */
export function hasConversation(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

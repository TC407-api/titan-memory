/**
 * LLM Turbo Layer - Type Definitions
 * Titan Memory v2.1
 *
 * Optional LLM-enhanced processing for improved benchmark scores.
 * LLM is OFF by default — the zero-LLM pipeline remains the fallback.
 */

export type LLMProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface LLMConfig {
  enabled: boolean;                    // default: false
  provider: LLMProvider;               // default: 'anthropic'
  model: string;                       // default: 'claude-sonnet-4-5-20250929'
  apiKey?: string;                     // env fallback: ANTHROPIC_API_KEY or OPENAI_API_KEY
  baseUrl?: string;                    // for openai-compatible (Ollama, Together, etc.)
  timeout: number;                     // default: 15000ms
  maxTokensPerRequest: number;         // default: 512

  // Per-capability toggles (all default true when enabled)
  classifyEnabled: boolean;
  classifyConfidenceThreshold: number; // Regex below this → LLM fallback. Default: 0.5
  extractEnabled: boolean;
  rerankEnabled: boolean;              // Highest impact on benchmarks
  summarizeEnabled: boolean;           // default: false (most expensive)
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  durationMs: number;
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  enabled: false,
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250929',
  timeout: 15000,
  maxTokensPerRequest: 512,

  classifyEnabled: true,
  classifyConfidenceThreshold: 0.5,
  extractEnabled: true,
  rerankEnabled: true,
  summarizeEnabled: false,
};

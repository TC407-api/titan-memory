/**
 * LLM Turbo Layer - Provider-Agnostic Client
 * Titan Memory v2.1
 *
 * Follows the Voyage embedding pattern: raw fetch(), AbortController timeout,
 * env var fallback. Zero npm dependencies.
 */

import {
  LLMConfig,
  LLMMessage,
  LLMCompletionResult,
  DEFAULT_LLM_CONFIG,
} from './types.js';

export class LLMClient {
  private readonly config: LLMConfig;
  private readonly apiKey: string;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = { ...DEFAULT_LLM_CONFIG, ...config };
    this.apiKey = this.resolveApiKey();
  }

  /**
   * Check if the LLM client is available and configured
   */
  isAvailable(): boolean {
    return this.config.enabled && !!this.apiKey;
  }

  /**
   * Send a completion request to the configured LLM provider
   */
  async complete(messages: LLMMessage[]): Promise<LLMCompletionResult> {
    if (!this.isAvailable()) {
      throw new Error('LLM client not available: disabled or missing API key');
    }

    const start = Date.now();

    switch (this.config.provider) {
      case 'anthropic':
        return this.completeAnthropic(messages, start);
      case 'openai':
      case 'openai-compatible':
        return this.completeOpenAI(messages, start);
      default:
        throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }
  }

  /**
   * Completion with JSON parsing — returns null on parse failure
   */
  async completeJSON<T>(messages: LLMMessage[]): Promise<T | null> {
    try {
      const result = await this.complete(messages);
      // Strip markdown code fences if present
      let content = result.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Get current config (for observability)
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  // ==================== Private Methods ====================

  private resolveApiKey(): string {
    if (this.config.apiKey) return this.config.apiKey;

    if (this.config.provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY || '';
    }
    // Check common env vars for openai-compatible providers
    return process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '';
  }

  private async completeAnthropic(
    messages: LLMMessage[],
    startMs: number
  ): Promise<LLMCompletionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Anthropic Messages API requires system as a top-level param
      const systemMsg = messages.find(m => m.role === 'system');
      const nonSystemMsgs = messages.filter(m => m.role !== 'system');

      const body: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: this.config.maxTokensPerRequest,
        messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      };
      if (systemMsg) {
        body.system = systemMsg.content;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
        model: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      return {
        content: data.content[0]?.text || '',
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        model: data.model,
        durationMs: Date.now() - startMs,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async completeOpenAI(
    messages: LLMMessage[],
    startMs: number
  ): Promise<LLMCompletionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const baseUrl = this.config.provider === 'openai-compatible' && this.config.baseUrl
      ? this.config.baseUrl
      : 'https://api.openai.com/v1';

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokensPerRequest,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        content: data.choices[0]?.message?.content || '',
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        model: data.model,
        durationMs: Date.now() - startMs,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

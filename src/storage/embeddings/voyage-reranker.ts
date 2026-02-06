/**
 * Voyage AI Reranker
 * Post-retrieval reranking using Voyage AI's rerank API
 * Improves retrieval accuracy beyond raw vector similarity
 */

export interface VoyageRerankerConfig {
  apiKey?: string;
  model?: string;
  timeout?: number;
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

const DEFAULT_CONFIG: Required<VoyageRerankerConfig> = {
  apiKey: process.env.VOYAGE_API_KEY || '',
  model: 'rerank-2',
  timeout: 15000,
};

/**
 * Voyage AI reranker for post-retrieval accuracy improvement.
 * Takes query + candidate documents and returns optimized relevance rankings.
 */
export class VoyageReranker {
  private readonly config: Required<VoyageRerankerConfig>;
  private readonly baseUrl = 'https://api.voyageai.com/v1';

  constructor(config?: VoyageRerankerConfig) {
    const cleanConfig: Partial<VoyageRerankerConfig> = {};
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) {
          (cleanConfig as Record<string, unknown>)[key] = value;
        }
      }
    }
    this.config = { ...DEFAULT_CONFIG, ...cleanConfig };

    if (!this.config.apiKey) {
      throw new Error('Voyage API key is required for reranker.');
    }
  }

  /**
   * Rerank documents by relevance to query.
   * Returns results sorted by relevance_score descending.
   */
  async rerank(
    query: string,
    documents: string[],
    topN?: number
  ): Promise<RerankResult[]> {
    if (documents.length <= 1) {
      return documents.map((_, i) => ({ index: i, relevance_score: 1.0 }));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        query,
        documents,
      };
      if (topN != null) {
        body.top_k = topN;
      }

      const response = await fetch(`${this.baseUrl}/rerank`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage Rerank API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as {
        data: Array<{ index: number; relevance_score: number }>;
        model: string;
        usage: { total_tokens: number };
      };

      // Already sorted by relevance_score descending from Voyage API
      return data.data.map(d => ({
        index: d.index,
        relevance_score: d.relevance_score,
      }));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getModel(): string {
    return this.config.model;
  }
}

/**
 * Semantic Highlighting Utility
 * Highlights relevant sentences in retrieved memories based on query
 *
 * Inspired by Zilliz semantic-highlight-bilingual-v1 model
 * Provides query-based relevance scoring and noise filtering
 */

import { HighlightResult, SemanticHighlightConfig } from '../types.js';
import { IEmbeddingGenerator } from '../storage/vector-storage.js';
import { cosineSimilarity } from '../storage/embeddings/index.js';

const DEFAULT_CONFIG: Required<SemanticHighlightConfig> = {
  enabled: true,
  threshold: 0.5,
  model: 'local',  // Use local similarity-based highlighting
  highlightOnRecall: true,
  maxSentences: 100,
};

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Handle common sentence boundaries
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Calculate term overlap between query and sentence (fallback method)
 */
function calculateTermOverlap(query: string, sentence: string): number {
  const queryTerms = new Set(
    query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  const sentenceTerms = new Set(
    sentence.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );

  if (queryTerms.size === 0) return 0;

  let matches = 0;
  for (const term of queryTerms) {
    if (sentenceTerms.has(term)) {
      matches++;
    }
  }

  return matches / queryTerms.size;
}

/**
 * Semantic Highlighter
 * Scores and highlights relevant sentences based on query
 */
export class SemanticHighlighter {
  private config: Required<SemanticHighlightConfig>;
  private embeddingGenerator?: IEmbeddingGenerator;

  constructor(config?: Partial<SemanticHighlightConfig>, embeddingGenerator?: IEmbeddingGenerator) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingGenerator = embeddingGenerator;
  }

  /**
   * Set the embedding generator (for semantic similarity)
   */
  setEmbeddingGenerator(generator: IEmbeddingGenerator): void {
    this.embeddingGenerator = generator;
  }

  /**
   * Highlight relevant sentences in content based on query
   */
  async highlight(query: string, content: string, threshold?: number): Promise<HighlightResult> {
    const effectiveThreshold = threshold ?? this.config.threshold;
    const sentences = splitIntoSentences(content);

    if (sentences.length === 0) {
      return {
        highlightedSentences: [],
        compressionRate: 1,
        sentenceProbabilities: [],
        originalSentenceCount: 0,
        highlightedSentenceCount: 0,
      };
    }

    // Limit sentences if configured
    const limitedSentences = this.config.maxSentences
      ? sentences.slice(0, this.config.maxSentences)
      : sentences;

    // Calculate relevance probabilities
    const probabilities = await this.calculateProbabilities(query, limitedSentences);

    // Filter by threshold
    const highlighted: string[] = [];
    const highlightedProbs: number[] = [];

    for (let i = 0; i < limitedSentences.length; i++) {
      if (probabilities[i] >= effectiveThreshold) {
        highlighted.push(limitedSentences[i]);
        highlightedProbs.push(probabilities[i]);
      }
    }

    // Calculate compression rate
    const originalLength = content.length;
    const highlightedLength = highlighted.join(' ').length;
    const compressionRate = originalLength > 0 ? highlightedLength / originalLength : 0;

    return {
      highlightedSentences: highlighted,
      compressionRate,
      sentenceProbabilities: highlightedProbs,
      originalSentenceCount: sentences.length,
      highlightedSentenceCount: highlighted.length,
    };
  }

  /**
   * Calculate relevance probabilities for sentences
   */
  private async calculateProbabilities(query: string, sentences: string[]): Promise<number[]> {
    // Use semantic embeddings if available
    if (this.embeddingGenerator) {
      return this.calculateSemanticProbabilities(query, sentences);
    }

    // Fallback to term overlap
    return sentences.map(sentence => calculateTermOverlap(query, sentence));
  }

  /**
   * Calculate semantic similarity using embeddings
   */
  private async calculateSemanticProbabilities(query: string, sentences: string[]): Promise<number[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingGenerator!.generateEmbedding(query);

      // Check if generator supports batch
      const generator = this.embeddingGenerator as { generateBatchEmbeddings?: (texts: string[]) => Promise<number[][]> };
      let sentenceEmbeddings: number[][];

      if (typeof generator.generateBatchEmbeddings === 'function') {
        sentenceEmbeddings = await generator.generateBatchEmbeddings(sentences);
      } else {
        // Fall back to sequential
        sentenceEmbeddings = await Promise.all(
          sentences.map(s => this.embeddingGenerator!.generateEmbedding(s))
        );
      }

      // Calculate cosine similarities
      return sentenceEmbeddings.map(embedding =>
        Math.max(0, cosineSimilarity(queryEmbedding, embedding))
      );
    } catch (error) {
      console.warn('Semantic highlighting failed, falling back to term overlap:', error);
      return sentences.map(sentence => calculateTermOverlap(query, sentence));
    }
  }

  /**
   * Highlight and return formatted output
   */
  async highlightFormatted(query: string, content: string, threshold?: number): Promise<string> {
    const result = await this.highlight(query, content, threshold);
    return result.highlightedSentences.join(' ');
  }

  /**
   * Get highlighting statistics
   */
  async getStats(query: string, content: string, threshold?: number): Promise<{
    originalTokens: number;
    highlightedTokens: number;
    tokenSavings: number;
    compressionRate: number;
    sentencesKept: number;
    sentencesRemoved: number;
  }> {
    const result = await this.highlight(query, content, threshold);

    // Rough token estimation (chars / 4)
    const originalTokens = Math.ceil(content.length / 4);
    const highlightedTokens = Math.ceil(result.highlightedSentences.join(' ').length / 4);

    return {
      originalTokens,
      highlightedTokens,
      tokenSavings: originalTokens - highlightedTokens,
      compressionRate: result.compressionRate,
      sentencesKept: result.highlightedSentenceCount,
      sentencesRemoved: result.originalSentenceCount - result.highlightedSentenceCount,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SemanticHighlightConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if highlighting is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a semantic highlighter instance
 */
export function createSemanticHighlighter(
  config?: Partial<SemanticHighlightConfig>,
  embeddingGenerator?: IEmbeddingGenerator
): SemanticHighlighter {
  return new SemanticHighlighter(config, embeddingGenerator);
}

/**
 * Quick highlight function for one-off usage
 */
export async function quickHighlight(
  query: string,
  content: string,
  threshold: number = 0.5,
  embeddingGenerator?: IEmbeddingGenerator
): Promise<HighlightResult> {
  const highlighter = new SemanticHighlighter({ threshold }, embeddingGenerator);
  return highlighter.highlight(query, content);
}

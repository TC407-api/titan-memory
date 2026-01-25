/**
 * Similarity Calculation Utilities
 * Centralized module for all similarity calculations to avoid code duplication
 */

/**
 * Calculate Jaccard similarity between two sets
 * Jaccard index = |A ∩ B| / |A ∪ B|
 */
export function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate content similarity using token-based Jaccard similarity
 * Useful for comparing text content
 */
export function contentSimilarity(content1: string, content2: string): number {
  if (!content1 || !content2) return 0;

  const tokens1 = new Set(content1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(content2.toLowerCase().split(/\s+/));

  return jaccardSimilarity(tokens1, tokens2);
}

/**
 * Calculate cosine similarity between two numeric vectors
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length || vec1.length === 0) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Calculate semantic similarity with optional weighting
 */
export interface SimilarityOptions {
  tokenWeight?: number;      // Weight for token overlap (default: 1.0)
  lengthPenalty?: boolean;   // Penalize length differences (default: false)
  caseSensitive?: boolean;   // Case-sensitive comparison (default: false)
}

export function semanticSimilarity(
  content1: string,
  content2: string,
  options: SimilarityOptions = {}
): number {
  const {
    tokenWeight = 1.0,
    lengthPenalty = false,
    caseSensitive = false,
  } = options;

  if (!content1 || !content2) return 0;

  const text1 = caseSensitive ? content1 : content1.toLowerCase();
  const text2 = caseSensitive ? content2 : content2.toLowerCase();

  const tokens1 = new Set(text1.split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(text2.split(/\s+/).filter(t => t.length > 0));

  let similarity = jaccardSimilarity(tokens1, tokens2) * tokenWeight;

  // Optional length penalty
  if (lengthPenalty) {
    const lengthRatio = Math.min(content1.length, content2.length) /
                        Math.max(content1.length, content2.length);
    similarity *= lengthRatio;
  }

  return Math.min(1.0, similarity);
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns normalized similarity (0-1)
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const len1 = str1.length;
  const len2 = str2.length;

  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill in the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  return maxLen > 0 ? 1 - (distance / maxLen) : 1;
}

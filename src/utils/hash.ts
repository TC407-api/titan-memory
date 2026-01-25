/**
 * N-gram Hash Functions (Engram-inspired)
 * Provides O(1) lookup for factual memory
 */

import crypto from 'crypto';

/**
 * Compute multi-head hash for n-gram lookup
 * h(x) = ((a * x) XOR b) mod M
 */
export function computeNgramHash(
  tokens: string[],
  n: number,
  k: number,
  tableSize: number = 1000000
): number {
  // Prime multipliers for each (n, k) combination
  const primes = [31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
  const a = primes[(n + k) % primes.length];
  const b = primes[(n * k) % primes.length];

  // Combine tokens into single hash
  let combined = 0;
  for (const token of tokens) {
    for (let i = 0; i < token.length; i++) {
      combined = (combined * 31 + token.charCodeAt(i)) & 0x7FFFFFFF;
    }
  }

  // Apply hash function: h(x) = ((a * x) XOR b) mod M
  // Ensure positive result using Math.abs
  const hash = ((a * combined) ^ b) % tableSize;
  return Math.abs(hash);
}

/**
 * Extract n-grams from text
 */
export function extractNgrams(text: string, n: number): string[][] {
  const words = tokenize(text);
  const ngrams: string[][] = [];

  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n));
  }

  return ngrams;
}

/**
 * Simple tokenization - split on whitespace and punctuation
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Create content hash for deduplication
 */
export function createContentHash(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generate multiple hash keys for a piece of content
 * Uses different n-gram sizes for robust matching
 */
export function generateHashKeys(
  content: string,
  tableSize: number = 1000000
): Map<string, number> {
  const hashKeys = new Map<string, number>();

  // Generate hashes for 1-grams, 2-grams, and 3-grams
  for (let n = 1; n <= 3; n++) {
    const ngrams = extractNgrams(content, n);
    for (let k = 0; k < ngrams.length; k++) {
      const hash = computeNgramHash(ngrams[k], n, k, tableSize);
      const key = `${n}-${k}`;
      hashKeys.set(key, hash);
    }
  }

  return hashKeys;
}

/**
 * Check if two hash key sets have significant overlap
 */
export function hashOverlap(
  keys1: Map<string, number>,
  keys2: Map<string, number>
): number {
  let matches = 0;
  let total = 0;

  for (const [key, hash1] of keys1) {
    const hash2 = keys2.get(key);
    if (hash2 !== undefined) {
      total++;
      if (hash1 === hash2) {
        matches++;
      }
    }
  }

  return total > 0 ? matches / total : 0;
}

/**
 * Locality-Sensitive Hashing for approximate similarity
 */
export function lshHash(
  content: string,
  numBands: number = 10,
  rowsPerBand: number = 5
): string[] {
  const shingles = new Set<string>();

  // Create 3-character shingles
  for (let i = 0; i <= content.length - 3; i++) {
    shingles.add(content.slice(i, i + 3).toLowerCase());
  }

  // Convert to minhash signature
  const signature: number[] = [];
  const numHashes = numBands * rowsPerBand;

  for (let h = 0; h < numHashes; h++) {
    let minHash = Infinity;
    for (const shingle of shingles) {
      const hash = computeNgramHash([shingle], 1, h, 0x7FFFFFFF);
      if (hash < minHash) {
        minHash = hash;
      }
    }
    signature.push(minHash);
  }

  // Create band signatures
  const bandSignatures: string[] = [];
  for (let b = 0; b < numBands; b++) {
    const bandStart = b * rowsPerBand;
    const bandSlice = signature.slice(bandStart, bandStart + rowsPerBand);
    const bandHash = crypto
      .createHash('md5')
      .update(bandSlice.join('-'))
      .digest('hex')
      .slice(0, 8);
    bandSignatures.push(`band${b}:${bandHash}`);
  }

  return bandSignatures;
}

/**
 * Simple hash function for deterministic embedding generation
 * Used by vector storage for pseudo-embeddings when no external API is available
 */
export function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

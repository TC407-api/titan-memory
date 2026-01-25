/**
 * Tests for Similarity Utility Functions
 */

import {
  jaccardSimilarity,
  contentSimilarity,
  cosineSimilarity,
  semanticSimilarity,
  levenshteinSimilarity,
} from '../src/utils/similarity';

describe('Similarity Utilities', () => {
  describe('jaccardSimilarity', () => {
    it('should return 1 for identical sets', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['a', 'b', 'c']);
      expect(jaccardSimilarity(set1, set2)).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['d', 'e', 'f']);
      expect(jaccardSimilarity(set1, set2)).toBe(0);
    });

    it('should return 0.5 for half-overlapping sets', () => {
      const set1 = new Set(['a', 'b']);
      const set2 = new Set(['a', 'c']);
      // intersection = {a}, union = {a, b, c}
      // 1/3 ≈ 0.333
      expect(jaccardSimilarity(set1, set2)).toBeCloseTo(1/3, 5);
    });

    it('should handle empty sets', () => {
      const empty = new Set<string>();
      const nonEmpty = new Set(['a']);
      expect(jaccardSimilarity(empty, empty)).toBe(0);
      expect(jaccardSimilarity(empty, nonEmpty)).toBe(0);
    });
  });

  describe('contentSimilarity', () => {
    it('should return 1 for identical content', () => {
      const content = 'hello world';
      expect(contentSimilarity(content, content)).toBe(1);
    });

    it('should return 0 for completely different content', () => {
      const content1 = 'hello world';
      const content2 = 'foo bar baz';
      expect(contentSimilarity(content1, content2)).toBe(0);
    });

    it('should be case insensitive', () => {
      const content1 = 'Hello World';
      const content2 = 'hello world';
      expect(contentSimilarity(content1, content2)).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(contentSimilarity('', '')).toBe(0);
      expect(contentSimilarity('hello', '')).toBe(0);
      expect(contentSimilarity('', 'world')).toBe(0);
    });

    it('should work with partial overlaps', () => {
      const content1 = 'the quick brown fox';
      const content2 = 'the lazy brown dog';
      // common: the, brown (2 words)
      // union: the, quick, brown, fox, lazy, dog (6 words)
      // 2/6 = 0.333
      expect(contentSimilarity(content1, content2)).toBeCloseTo(2/6, 2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      expect(cosineSimilarity(vec1, vec2)).toBe(0);
    });

    it('should return -1 for opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];
      expect(cosineSimilarity(vec1, vec2)).toBe(-1);
    });

    it('should handle zero vectors', () => {
      const zero = [0, 0, 0];
      const nonZero = [1, 2, 3];
      expect(cosineSimilarity(zero, zero)).toBe(0);
      expect(cosineSimilarity(zero, nonZero)).toBe(0);
    });

    it('should return 0 for mismatched lengths', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      expect(cosineSimilarity(vec1, vec2)).toBe(0);
    });
  });

  describe('semanticSimilarity', () => {
    it('should work with default options', () => {
      const content1 = 'hello world';
      const content2 = 'hello there';
      // common: hello (1)
      // union: hello, world, there (3)
      expect(semanticSimilarity(content1, content2)).toBeCloseTo(1/3, 2);
    });

    it('should apply length penalty when enabled', () => {
      const short = 'hello';
      const long = 'hello world and more words here';

      const withoutPenalty = semanticSimilarity(short, long, { lengthPenalty: false });
      const withPenalty = semanticSimilarity(short, long, { lengthPenalty: true });

      expect(withPenalty).toBeLessThan(withoutPenalty);
    });

    it('should be case sensitive when enabled', () => {
      const content1 = 'Hello World';
      const content2 = 'hello world';

      const caseInsensitive = semanticSimilarity(content1, content2, { caseSensitive: false });
      const caseSensitive = semanticSimilarity(content1, content2, { caseSensitive: true });

      expect(caseInsensitive).toBe(1);
      expect(caseSensitive).toBe(0);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for completely different strings of same length', () => {
      // 'abc' -> 'xyz' requires 3 substitutions out of 3 chars
      expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should handle empty strings', () => {
      expect(levenshteinSimilarity('', '')).toBe(1);
      expect(levenshteinSimilarity('hello', '')).toBe(0);
      expect(levenshteinSimilarity('', 'world')).toBe(0);
    });

    it('should calculate partial similarity', () => {
      // 'hello' -> 'hallo' is 1 edit (substitution) out of 5 chars
      // similarity = 1 - 1/5 = 0.8
      expect(levenshteinSimilarity('hello', 'hallo')).toBeCloseTo(0.8, 2);
    });

    it('should handle insertions and deletions', () => {
      // 'hello' -> 'helloo' is 1 insertion
      // max length = 6
      // similarity = 1 - 1/6 ≈ 0.833
      expect(levenshteinSimilarity('hello', 'helloo')).toBeCloseTo(5/6, 2);
    });
  });
});

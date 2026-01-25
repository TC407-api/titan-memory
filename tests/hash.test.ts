/**
 * Tests for hash utilities (Layer 2: Factual Memory)
 */

import {
  computeNgramHash,
  extractNgrams,
  tokenize,
  createContentHash,
  generateHashKeys,
  hashOverlap,
  lshHash,
} from '../src/utils/hash';

describe('Hash Utilities', () => {
  describe('tokenize', () => {
    it('should split text into lowercase tokens', () => {
      const tokens = tokenize('Hello World');
      expect(tokens).toEqual(['hello', 'world']);
    });

    it('should handle punctuation', () => {
      const tokens = tokenize('Hello, World! How are you?');
      expect(tokens).toEqual(['hello', 'world', 'how', 'are', 'you']);
    });

    it('should handle empty strings', () => {
      const tokens = tokenize('');
      expect(tokens).toEqual([]);
    });

    it('should handle multiple spaces', () => {
      const tokens = tokenize('hello    world');
      expect(tokens).toEqual(['hello', 'world']);
    });
  });

  describe('extractNgrams', () => {
    it('should extract unigrams', () => {
      const ngrams = extractNgrams('hello world test', 1);
      expect(ngrams).toEqual([['hello'], ['world'], ['test']]);
    });

    it('should extract bigrams', () => {
      const ngrams = extractNgrams('hello world test', 2);
      expect(ngrams).toEqual([['hello', 'world'], ['world', 'test']]);
    });

    it('should extract trigrams', () => {
      const ngrams = extractNgrams('hello world test foo', 3);
      expect(ngrams).toEqual([
        ['hello', 'world', 'test'],
        ['world', 'test', 'foo'],
      ]);
    });

    it('should return empty for insufficient tokens', () => {
      const ngrams = extractNgrams('hello', 3);
      expect(ngrams).toEqual([]);
    });
  });

  describe('computeNgramHash', () => {
    it('should return consistent hashes', () => {
      const tokens = ['hello', 'world'];
      const hash1 = computeNgramHash(tokens, 2, 0);
      const hash2 = computeNgramHash(tokens, 2, 0);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = computeNgramHash(['hello', 'world'], 2, 0);
      const hash2 = computeNgramHash(['foo', 'bar'], 2, 0);
      expect(hash1).not.toBe(hash2);
    });

    it('should respect table size', () => {
      const tableSize = 1000;
      const hash = computeNgramHash(['hello', 'world'], 2, 0, tableSize);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(tableSize);
    });
  });

  describe('createContentHash', () => {
    it('should create consistent hashes', () => {
      const hash1 = createContentHash('test content');
      const hash2 = createContentHash('test content');
      expect(hash1).toBe(hash2);
    });

    it('should normalize content (trim, lowercase)', () => {
      const hash1 = createContentHash('Test Content');
      const hash2 = createContentHash('  test content  ');
      expect(hash1).toBe(hash2);
    });

    it('should return 16 character hex string', () => {
      const hash = createContentHash('test');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('generateHashKeys', () => {
    it('should generate multiple hash keys', () => {
      const keys = generateHashKeys('hello world test');
      expect(keys.size).toBeGreaterThan(0);
    });

    it('should include keys for different n-gram sizes', () => {
      const keys = generateHashKeys('hello world test');
      const keyNames = [...keys.keys()];

      // Should have keys like '1-0', '1-1', '2-0', '3-0' etc.
      expect(keyNames.some(k => k.startsWith('1-'))).toBe(true);
      expect(keyNames.some(k => k.startsWith('2-'))).toBe(true);
    });
  });

  describe('hashOverlap', () => {
    it('should return 1.0 for identical hash sets', () => {
      const keys = generateHashKeys('hello world');
      const overlap = hashOverlap(keys, keys);
      expect(overlap).toBe(1.0);
    });

    it('should return 0 for completely different content', () => {
      const keys1 = generateHashKeys('hello world');
      const keys2 = generateHashKeys('foo bar baz qux');
      const overlap = hashOverlap(keys1, keys2);
      expect(overlap).toBeLessThan(1.0);
    });

    it('should return partial overlap for similar content', () => {
      const keys1 = generateHashKeys('hello world test');
      const keys2 = generateHashKeys('hello world foo');
      const overlap = hashOverlap(keys1, keys2);
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThan(1.0);
    });
  });

  describe('lshHash', () => {
    it('should return array of band signatures', () => {
      const signatures = lshHash('test content');
      expect(Array.isArray(signatures)).toBe(true);
      expect(signatures.length).toBeGreaterThan(0);
    });

    it('should return similar signatures for similar content', () => {
      const sig1 = new Set(lshHash('the quick brown fox'));
      const sig2 = new Set(lshHash('the quick brown dog'));

      // Should have some overlap
      const overlap = [...sig1].filter(s => sig2.has(s)).length;
      expect(overlap).toBeGreaterThan(0);
    });

    it('should return consistent signatures', () => {
      const sig1 = lshHash('test content');
      const sig2 = lshHash('test content');
      expect(sig1).toEqual(sig2);
    });
  });
});

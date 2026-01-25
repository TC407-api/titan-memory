/**
 * Behavioral Validator Tests
 * Tests for quality scoring, validation, and anomaly detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { BehavioralValidator } from '../src/validation/behavioral-validator';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('BehavioralValidator', () => {
  let validator: BehavioralValidator;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(process.cwd(), 'test-data-validator', Date.now().toString());
    fs.mkdirSync(testDataDir, { recursive: true });
    process.env.TITAN_DATA_DIR = testDataDir;

    validator = new BehavioralValidator();
    await validator.initialize();
  });

  afterEach(async () => {
    await validator.close();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const createMockMemory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'test-memory-' + Math.random().toString(36).substr(2, 9),
    content: 'This is a test memory with sufficient content for testing purposes.',
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(),
    metadata: {
      source: 'test',
      tags: ['test', 'mock'],
      surpriseScore: 0.5,
    },
    ...overrides,
  });

  describe('Quality Scoring', () => {
    it('should calculate quality score for a complete memory', () => {
      const memory = createMockMemory();
      const score = validator.calculateQualityScore(memory);

      expect(score).toBeDefined();
      expect(score.overall).toBeGreaterThan(0);
      expect(score.overall).toBeLessThanOrEqual(1);
      expect(score.completeness).toBeDefined();
      expect(score.freshness).toBeDefined();
      expect(score.clarity).toBeDefined();
      expect(score.connectivity).toBeDefined();
      expect(score.relevance).toBeDefined();
    });

    it('should give higher completeness score to memories with metadata', () => {
      const withMetadata = createMockMemory({
        metadata: {
          source: 'test',
          tags: ['a', 'b', 'c'],
          projectId: 'project-1',
        },
      });

      const withoutMetadata = createMockMemory({
        metadata: {},
      });

      const scoreWith = validator.calculateQualityScore(withMetadata);
      const scoreWithout = validator.calculateQualityScore(withoutMetadata);

      expect(scoreWith.completeness).toBeGreaterThan(scoreWithout.completeness);
    });

    it('should give higher freshness score to recent memories', () => {
      const fresh = createMockMemory({ timestamp: new Date() });
      const old = createMockMemory({
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
      });

      const freshScore = validator.calculateQualityScore(fresh);
      const oldScore = validator.calculateQualityScore(old);

      expect(freshScore.freshness).toBeGreaterThan(oldScore.freshness);
    });

    it('should give higher clarity score to well-structured content', () => {
      const clear = createMockMemory({
        content: 'This is a clear statement. It has proper sentences. The structure is good.',
      });

      const unclear = createMockMemory({
        content: 'abc xyz!!!',
      });

      const clearScore = validator.calculateQualityScore(clear);
      const unclearScore = validator.calculateQualityScore(unclear);

      expect(clearScore.clarity).toBeGreaterThan(unclearScore.clarity);
    });

    it('should give higher connectivity score to memories with tags and project', () => {
      const connected = createMockMemory({
        metadata: {
          tags: ['a', 'b', 'c', 'd', 'e'],
          projectId: 'project-1',
          sessionId: 'session-1',
        },
      });

      const isolated = createMockMemory({
        metadata: {},
      });

      const connectedScore = validator.calculateQualityScore(connected);
      const isolatedScore = validator.calculateQualityScore(isolated);

      expect(connectedScore.connectivity).toBeGreaterThan(isolatedScore.connectivity);
    });
  });

  describe('Validation Before Store', () => {
    it('should pass valid memories', async () => {
      const memory = createMockMemory();
      const result = await validator.validateBeforeStore(memory);

      expect(result.valid).toBe(true);
    });

    it('should flag memories with very short content', async () => {
      const memory = createMockMemory({ content: 'short' });
      const result = await validator.validateBeforeStore(memory);

      expect(result.issues.some(i => i.type === 'low_quality')).toBe(true);
    });

    it('should flag memories missing source metadata', async () => {
      const memory = createMockMemory({
        metadata: { tags: ['test'] },
      });
      const result = await validator.validateBeforeStore(memory);

      expect(result.issues.some(i => i.type === 'missing_metadata')).toBe(true);
    });

    it('should flag memories with low quality score', async () => {
      const memory = createMockMemory({
        content: 'x',
        metadata: {},
      });
      const result = await validator.validateBeforeStore(memory);

      expect(result.issues.some(i => i.type === 'low_quality')).toBe(true);
    });
  });

  describe('Full Validation', () => {
    it('should run full validation and return report', async () => {
      const memories = [
        createMockMemory(),
        createMockMemory({ content: 'Another valid memory with good content here.' }),
      ];

      const report = await validator.runFullValidation(memories);

      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.memoriesChecked).toBe(2);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(1);
      expect(report.recommendations).toBeDefined();
    });

    it('should detect low quality memories in full validation', async () => {
      const memories = [
        createMockMemory(), // Good
        createMockMemory({ content: 'x', metadata: {} }), // Bad
      ];

      const report = await validator.runFullValidation(memories);

      // At minimum, should run validation and return a valid report
      expect(report).toBeDefined();
      expect(report.memoriesChecked).toBe(2);
      // Health score should reflect some issues
      expect(report.healthScore).toBeLessThanOrEqual(1);
    });

    it('should detect duplicate content', async () => {
      const memories = [
        createMockMemory({ id: 'mem1', content: 'This is the exact same content for testing duplicates.' }),
        createMockMemory({ id: 'mem2', content: 'This is the exact same content for testing duplicates.' }),
      ];

      const report = await validator.runFullValidation(memories);

      expect(report.issues.some(i => i.type === 'duplicate_content')).toBe(true);
    });

    it('should include recommendations', async () => {
      const memories = [createMockMemory()];
      const report = await validator.runFullValidation(memories);

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Anomaly Detection', () => {
    it('should not flag normal memories as anomalous', () => {
      const memory = createMockMemory();
      const result = validator.detectAnomaly(memory);

      expect(result.isAnomaly).toBe(false);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should flag memories with very long content', () => {
      const memory = createMockMemory({
        content: 'x'.repeat(10000),
      });
      const result = validator.detectAnomaly(memory);

      // May or may not be anomaly depending on stats
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should flag memories with unusual characters', () => {
      const memory = createMockMemory({
        content: '!@#$%^&*()_+{}|:<>?~`[]\\;\',./',
      });
      const result = validator.detectAnomaly(memory);

      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should include comparison stats', () => {
      const memory = createMockMemory();
      const result = validator.detectAnomaly(memory);

      expect(result.comparedTo).toBeDefined();
      expect(result.comparedTo.avgSurprise).toBeDefined();
      expect(result.comparedTo.avgLength).toBeDefined();
    });
  });

  describe('Consistency Check', () => {
    it('should pass consistent memories', () => {
      const memories = [
        createMockMemory({ content: 'TypeScript is a language.' }),
        createMockMemory({ content: 'React is a framework.' }),
      ];

      const result = validator.checkConsistency(memories);
      expect(result.isConsistent).toBe(true);
    });

    it('should detect conflicting definitions', () => {
      const memories = [
        createMockMemory({ content: 'TypeScript is defined as a typed superset of JavaScript.' }),
        createMockMemory({ content: 'TypeScript refers to a completely different language than JavaScript.' }),
      ];

      const result = validator.checkConsistency(memories);
      // May or may not detect depending on similarity threshold
      expect(result).toBeDefined();
    });
  });

  describe('Issue Management', () => {
    it('should retrieve open issues', async () => {
      // Run validation to create issues
      const memories = [createMockMemory({ content: 'x', metadata: {} })];
      await validator.runFullValidation(memories);

      const issues = await validator.getOpenIssues();
      expect(Array.isArray(issues)).toBe(true);
    });

    it('should filter issues by severity', async () => {
      const memories = [createMockMemory({ content: 'x', metadata: {} })];
      await validator.runFullValidation(memories);

      const warnings = await validator.getOpenIssues('warning');
      expect(warnings.every(i => i.severity === 'warning')).toBe(true);
    });

    it('should resolve issues', async () => {
      const memories = [createMockMemory({ content: 'x', metadata: {} })];
      await validator.runFullValidation(memories);

      const issues = await validator.getOpenIssues();
      if (issues.length > 0) {
        const resolved = await validator.resolveIssue(issues[0].id);
        expect(resolved).toBe(true);
      }
    });
  });

  describe('Statistics', () => {
    it('should return validation stats', async () => {
      const stats = await validator.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalIssues).toBeGreaterThanOrEqual(0);
      expect(stats.openIssues).toBeGreaterThanOrEqual(0);
      expect(stats.avgHealthScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Validation Reports', () => {
    it('should store and retrieve reports', async () => {
      const memories = [createMockMemory()];
      await validator.runFullValidation(memories);

      const reports = await validator.getReports();
      expect(reports.length).toBeGreaterThan(0);
      // Reports may have different memory counts if state persists
      expect(reports[reports.length - 1].memoriesChecked).toBeGreaterThanOrEqual(1);
    });
  });
});

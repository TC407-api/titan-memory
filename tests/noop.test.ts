/**
 * Tests for NOOP/Skip Operation
 * Titan Memory v2.0 - Competitive Upgrade
 */

import * as fs from 'fs';
import * as path from 'path';
import { NoopLogger, NoopReason } from '../src/trace/noop-log';

// Test-specific logger that uses isolated test data
class TestNoopLogger extends NoopLogger {
  private testLogPath: string;

  constructor(testDir: string) {
    super();
    this.testLogPath = path.join(testDir, 'noop-log.json');
    // Override the log path
    (this as unknown as { logPath: string }).logPath = this.testLogPath;
  }
}

describe('NoopLogger', () => {
  let logger: NoopLogger;
  const testDataDir = path.join(__dirname, '..', 'test-data-noop');

  beforeEach(async () => {
    // Clean up test data directory to ensure isolation
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Create a new logger instance for each test with isolated data
    logger = new TestNoopLogger(testDataDir);
    await logger.initialize();
  });

  afterEach(async () => {
    await logger.close();
    // Clean up
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  });

  describe('logNoop', () => {
    it('should log a NOOP decision with reason', async () => {
      const decision = await logger.logNoop({
        reason: 'routine',
        context: 'User said hello',
      });

      expect(decision.id).toBeDefined();
      expect(decision.reason).toBe('routine');
      expect(decision.context).toBe('User said hello');
      expect(decision.timestamp).toBeDefined();
    });

    it('should log NOOP with content preview truncated to 100 chars', async () => {
      const longContent = 'A'.repeat(200);
      const decision = await logger.logNoop({
        reason: 'low_value',
        contentPreview: longContent,
      });

      expect(decision.contentPreview).toHaveLength(100);
    });

    it('should support all NOOP reasons', async () => {
      const reasons: NoopReason[] = [
        'routine',
        'duplicate',
        'low_value',
        'temporary',
        'off_topic',
        'noise',
      ];

      for (const reason of reasons) {
        const decision = await logger.logNoop({ reason });
        expect(decision.reason).toBe(reason);
      }
    });

    it('should include session and project IDs', async () => {
      const decision = await logger.logNoop({
        reason: 'duplicate',
        sessionId: 'session-123',
        projectId: 'project-456',
      });

      expect(decision.sessionId).toBe('session-123');
      expect(decision.projectId).toBe('project-456');
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', async () => {
      const stats = await logger.getStats();

      expect(stats.totalNoops).toBe(0);
      expect(stats.memoryWriteRatio).toBe(1);
      expect(stats.last24Hours).toBe(0);
      expect(stats.last7Days).toBe(0);
    });

    it('should count NOOPs by reason', async () => {
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'duplicate' });

      const stats = await logger.getStats();

      expect(stats.totalNoops).toBe(3);
      expect(stats.byReason.routine).toBe(2);
      expect(stats.byReason.duplicate).toBe(1);
      expect(stats.byReason.low_value).toBe(0);
    });

    it('should calculate memory write ratio', async () => {
      // 2 writes, 3 noops = 2/5 = 0.4 ratio
      await logger.recordMemoryWrite();
      await logger.recordMemoryWrite();
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'routine' });

      const stats = await logger.getStats();

      expect(stats.memoryWriteRatio).toBeCloseTo(0.4);
    });

    it('should count last 24 hours and 7 days', async () => {
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'duplicate' });

      const stats = await logger.getStats();

      expect(stats.last24Hours).toBe(2);
      expect(stats.last7Days).toBe(2);
    });
  });

  describe('getRecent', () => {
    it('should return recent NOOPs in reverse order', async () => {
      await logger.logNoop({ reason: 'routine', context: 'first' });
      await logger.logNoop({ reason: 'duplicate', context: 'second' });
      await logger.logNoop({ reason: 'low_value', context: 'third' });

      const recent = await logger.getRecent(2);

      expect(recent).toHaveLength(2);
      expect(recent[0].context).toBe('third');
      expect(recent[1].context).toBe('second');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await logger.logNoop({ reason: 'routine' });
      }

      const recent = await logger.getRecent(5);
      expect(recent).toHaveLength(5);
    });
  });

  describe('pruneOld', () => {
    it('should remove old entries when cutoff is in the future', async () => {
      // Log some entries
      await logger.logNoop({ reason: 'routine' });
      await logger.logNoop({ reason: 'duplicate' });

      // Get count before pruning
      const statsBefore = await logger.getStats();
      expect(statsBefore.totalNoops).toBe(2);

      // Prune with negative days to force removal (cutoff in the future)
      const pruned = await logger.pruneOld(-1);

      expect(pruned).toBeGreaterThanOrEqual(2);

      const stats = await logger.getStats();
      expect(stats.totalNoops).toBe(0);
    });

    it('should keep recent entries', async () => {
      await logger.logNoop({ reason: 'routine' });

      // Prune with 30 days (keep recent)
      const pruned = await logger.pruneOld(30);

      expect(pruned).toBe(0);

      const stats = await logger.getStats();
      expect(stats.totalNoops).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist and reload data', async () => {
      await logger.logNoop({ reason: 'routine', context: 'test1' });
      await logger.logNoop({ reason: 'duplicate', context: 'test2' });
      await logger.recordMemoryWrite();

      // Close and create new instance with same test dir
      await logger.close();
      logger = new TestNoopLogger(testDataDir);
      await logger.initialize();

      const stats = await logger.getStats();
      expect(stats.totalNoops).toBe(2);
      expect(stats.byReason.routine).toBe(1);
      expect(stats.byReason.duplicate).toBe(1);
    });
  });
});

// Singleton test moved to separate file to avoid state pollution
describe('NoopLogger singleton behavior', () => {
  it('should create new instances with different configs', () => {
    const testDir1 = path.join(__dirname, '..', 'test-data-noop-1');
    const testDir2 = path.join(__dirname, '..', 'test-data-noop-2');

    fs.mkdirSync(testDir1, { recursive: true });
    fs.mkdirSync(testDir2, { recursive: true });

    const logger1 = new TestNoopLogger(testDir1);
    const logger2 = new TestNoopLogger(testDir2);

    expect(logger1).not.toBe(logger2);

    // Cleanup
    fs.rmSync(testDir1, { recursive: true });
    fs.rmSync(testDir2, { recursive: true });
  });
});

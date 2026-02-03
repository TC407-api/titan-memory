/**
 * CatBrain Drift Monitor Tests
 */

import { DriftMonitor } from '../src/catbrain/drift-monitor';

describe('CatBrain Drift Monitor', () => {
  describe('When Disabled', () => {
    it('should not record entries', () => {
      const monitor = new DriftMonitor({ enabled: false });
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      const stats = monitor.getStats();
      expect(stats.totalClassifications).toBe(0);
    });
  });

  describe('When Enabled', () => {
    let monitor: DriftMonitor;

    beforeEach(() => {
      monitor = new DriftMonitor({ enabled: true, alertThreshold: 0.7 });
    });

    it('should record helpful feedback as correct', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      const stats = monitor.getStats();
      expect(stats.totalClassifications).toBe(1);
      expect(stats.correctClassifications).toBe(1);
    });

    it('should record harmful feedback as incorrect', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'harmful');
      const stats = monitor.getStats();
      expect(stats.totalClassifications).toBe(1);
      expect(stats.correctClassifications).toBe(0);
    });

    it('should calculate accuracy', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      monitor.recordFeedback('mem2', 'knowledge', 'helpful');
      monitor.recordFeedback('mem3', 'knowledge', 'harmful');
      const stats = monitor.getStats();
      expect(stats.accuracy).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate per-category accuracy', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      monitor.recordFeedback('mem2', 'profile', 'harmful');
      const stats = monitor.getStats();
      expect(stats.byCategoryAccuracy.knowledge.accuracy).toBe(1);
      expect(stats.byCategoryAccuracy.profile.accuracy).toBe(0);
    });

    it('should detect alert when below threshold', () => {
      // Need at least 10 entries
      for (let i = 0; i < 8; i++) {
        monitor.recordFeedback(`harmful-${i}`, 'knowledge', 'harmful');
      }
      for (let i = 0; i < 4; i++) {
        monitor.recordFeedback(`helpful-${i}`, 'knowledge', 'helpful');
      }
      // accuracy = 4/12 = 0.33, below 0.7 threshold
      expect(monitor.isAlertTriggered()).toBe(true);
    });

    it('should not trigger alert with few entries', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'harmful');
      expect(monitor.isAlertTriggered()).toBe(false);
    });

    it('should get entries for category', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      monitor.recordFeedback('mem2', 'profile', 'helpful');
      const entries = monitor.getEntriesForCategory('knowledge');
      expect(entries).toHaveLength(1);
    });

    it('should get recent entries', () => {
      for (let i = 0; i < 5; i++) {
        monitor.recordFeedback(`mem-${i}`, 'knowledge', 'helpful');
      }
      const recent = monitor.getRecentEntries(3);
      expect(recent).toHaveLength(3);
    });

    it('should detect stable trend with few entries', () => {
      for (let i = 0; i < 10; i++) {
        monitor.recordFeedback(`mem-${i}`, 'knowledge', 'helpful');
      }
      const stats = monitor.getStats();
      expect(stats.recentTrend).toBe('stable');
    });

    it('should clear entries', () => {
      monitor.recordFeedback('mem1', 'knowledge', 'helpful');
      monitor.clear();
      expect(monitor.getStats().totalClassifications).toBe(0);
    });
  });
});

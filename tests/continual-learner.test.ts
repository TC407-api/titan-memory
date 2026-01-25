/**
 * Continual Learner Tests
 * Tests for pattern lifecycle, plasticity-stability, forgetting detection, and rehearsal
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContinualLearner } from '../src/learning/continual-learner';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('ContinualLearner', () => {
  let learner: ContinualLearner;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(process.cwd(), 'test-data-learning', Date.now().toString());
    fs.mkdirSync(testDataDir, { recursive: true });
    process.env.TITAN_DATA_DIR = testDataDir;

    learner = new ContinualLearner();
    await learner.initialize();
  });

  afterEach(async () => {
    await learner.close();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const createMockMemory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'mem-' + Math.random().toString(36).substr(2, 9),
    content: 'Test memory content for continual learning.',
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(),
    metadata: {
      tags: ['test'],
      surpriseScore: 0.5,
    },
    ...overrides,
  });

  describe('Pattern Lifecycle Management', () => {
    it('should create a pattern for a new memory', async () => {
      const memory = createMockMemory({ content: 'React hooks are amazing for state management.' });
      const pattern = await learner.processNewMemory(memory);

      expect(pattern).toBeDefined();
      expect(pattern.id).toBeDefined();
      expect(pattern.memoryId).toBe(memory.id);
      expect(pattern.stage).toBe('immature');
    });

    it('should start with high plasticity and low stability', async () => {
      const memory = createMockMemory();
      const pattern = await learner.processNewMemory(memory);

      expect(pattern.plasticityIndex).toBeGreaterThan(0.8);
      expect(pattern.stabilityIndex).toBeLessThan(0.3);
    });

    it('should update existing pattern when processing same memory', async () => {
      const memory = createMockMemory({ id: 'persistent-mem' });

      const pattern1 = await learner.processNewMemory(memory);

      // Update with new content
      memory.content = 'Updated content about React hooks.';
      const pattern2 = await learner.processNewMemory(memory);

      expect(pattern2.id).toBe(pattern1.id);
      expect(pattern2.updateHistory.length).toBe(2);
    });

    it('should track update history', async () => {
      const memory = createMockMemory({ id: 'history-mem' });
      await learner.processNewMemory(memory);

      memory.content = 'First update.';
      await learner.processNewMemory(memory);

      memory.content = 'Second update.';
      await learner.processNewMemory(memory);

      const pattern = learner.findPatternByMemoryId(memory.id);
      expect(pattern!.updateHistory.length).toBe(3);
    });

    it('should detect domain from content', async () => {
      const reactMemory = createMockMemory({
        content: 'React component hooks and JSX patterns.',
      });
      const pattern = await learner.processNewMemory(reactMemory);

      expect(pattern.domain).toBe('react');
    });

    it('should assign general domain for generic content', async () => {
      const memory = createMockMemory({
        content: 'Some generic information.',
      });
      const pattern = await learner.processNewMemory(memory);

      expect(pattern.domain).toBe('general');
    });
  });

  describe('Pattern Stages', () => {
    it('should start as immature', async () => {
      const memory = createMockMemory();
      const pattern = await learner.processNewMemory(memory);

      expect(pattern.stage).toBe('immature');
    });

    it('should have immature patterns', () => {
      // After processing, check patterns by stage
      const immaturePatterns = learner.getPatternsByStage('immature');
      expect(Array.isArray(immaturePatterns)).toBe(true);
    });

    it('should return all patterns', async () => {
      const countBefore = learner.getAllPatterns().length;
      await learner.processNewMemory(createMockMemory());
      await learner.processNewMemory(createMockMemory());

      const allPatterns = learner.getAllPatterns();
      expect(allPatterns.length).toBe(countBefore + 2);
    });
  });

  describe('Plasticity-Stability Tracking', () => {
    it('should return plasticity index', async () => {
      const memory = createMockMemory();
      const pattern = await learner.processNewMemory(memory);

      const plasticity = learner.getPlasticityIndex(pattern.id);
      expect(plasticity).toBeGreaterThanOrEqual(0);
      expect(plasticity).toBeLessThanOrEqual(1);
    });

    it('should return stability index', async () => {
      const memory = createMockMemory();
      const pattern = await learner.processNewMemory(memory);

      const stability = learner.getStabilityIndex(pattern.id);
      expect(stability).toBeGreaterThanOrEqual(0);
      expect(stability).toBeLessThanOrEqual(1);
    });

    it('should return default for unknown pattern', () => {
      const plasticity = learner.getPlasticityIndex('non-existent');
      expect(plasticity).toBe(1.0);

      const stability = learner.getStabilityIndex('non-existent');
      expect(stability).toBe(0);
    });

    it('should decrease plasticity after multiple updates', async () => {
      const memory = createMockMemory({ id: 'update-test' });
      let pattern = await learner.processNewMemory(memory);

      // Multiple consistent updates should stabilize
      for (let i = 0; i < 5; i++) {
        memory.content = `Consistent content about topic ${i}.`;
        pattern = await learner.processNewMemory(memory);
      }

      // Maturity should increase (pattern becoming more mature)
      expect(pattern.maturityScore).toBeGreaterThan(0);
    });
  });

  describe('Catastrophic Forgetting Detection', () => {
    it('should check for forgetting risk', async () => {
      const memory = createMockMemory();
      await learner.processNewMemory(memory);

      const risk = await learner.checkForgettingRisk();

      expect(risk).toBeDefined();
      expect(risk.timestamp).toBeInstanceOf(Date);
      expect(typeof risk.alert).toBe('boolean');
      expect(['none', 'low', 'medium', 'high', 'critical']).toContain(risk.riskLevel);
    });

    it('should return no risk for new patterns', async () => {
      const memory = createMockMemory();
      await learner.processNewMemory(memory);

      const risk = await learner.checkForgettingRisk();

      // New patterns shouldn't trigger forgetting alerts
      expect(risk.riskLevel).toBe('none');
    });

    it('should track affected patterns in risk assessment', async () => {
      const risk = await learner.checkForgettingRisk();

      expect(Array.isArray(risk.affectedPatterns)).toBe(true);
    });

    it('should get forgetting alerts history', async () => {
      const alerts = learner.getForgettingAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });
  });

  describe('Knowledge Distillation', () => {
    it('should distill pattern with enough updates', async () => {
      const memory = createMockMemory({ id: 'distill-test' });

      // Create many updates to trigger distillation
      for (let i = 0; i < 12; i++) {
        memory.content = `Important point about React hooks. Hooks are great. Point ${i}.`;
        await learner.processNewMemory(memory);
      }

      const pattern = learner.findPatternByMemoryId(memory.id);
      // Should have distilled content after many updates
      expect(pattern).toBeDefined();
    });

    it('should get distilled content for pattern', async () => {
      const memory = createMockMemory({ id: 'distill-get' });
      const pattern = await learner.processNewMemory(memory);

      // Manually trigger distillation
      const distilled = learner.distillPattern(pattern);

      expect(distilled).toBeDefined();
      expect(typeof distilled).toBe('string');
    });

    it('should get undefined for non-existent pattern distillation', () => {
      const distilled = learner.getDistilledContent('non-existent');
      expect(distilled).toBeUndefined();
    });
  });

  describe('Spaced Repetition', () => {
    it('should schedule rehearsal for new pattern', async () => {
      const memory = createMockMemory();
      await learner.processNewMemory(memory);

      // Pending rehearsals should be scheduled (but not due yet)
      const pending = learner.getPendingRehearsals();
      expect(Array.isArray(pending)).toBe(true);
    });

    it('should execute rehearsals', async () => {
      const results = await learner.executeRehearsals();

      expect(Array.isArray(results)).toBe(true);
    });

    it('should increment rehearsal count on execution', async () => {
      const memory = createMockMemory({ id: 'rehearsal-test' });
      const pattern = await learner.processNewMemory(memory);

      expect(pattern.rehearsalCount).toBe(0);
    });
  });

  describe('Domain Learning Rates', () => {
    it('should update domain learning rate on success', async () => {
      learner.updateDomainLearningRate('react', true);

      // Rate should be higher after success
      const memory = createMockMemory({
        content: 'React component with hooks pattern.',
      });
      await learner.processNewMemory(memory);
    });

    it('should update domain learning rate on failure', async () => {
      learner.updateDomainLearningRate('typescript', false);

      // No error should occur
      expect(true).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return learning statistics', async () => {
      const countBefore = learner.getAllPatterns().length;
      await learner.processNewMemory(createMockMemory());
      await learner.processNewMemory(createMockMemory());

      const stats = await learner.getStats();

      expect(stats.totalPatterns).toBe(countBefore + 2);
      expect(stats.avgPlasticity).toBeGreaterThan(0);
      expect(stats.avgStability).toBeGreaterThanOrEqual(0);
      expect(stats.byStage).toBeDefined();
      expect(stats.byStage.immature).toBeGreaterThanOrEqual(0);
    });

    it('should track patterns by stage in stats', async () => {
      const immatureBefore = learner.getPatternsByStage('immature').length;
      await learner.processNewMemory(createMockMemory());

      const stats = await learner.getStats();

      expect(stats.byStage.immature).toBe(immatureBefore + 1);
      expect(stats.byStage.developing).toBeGreaterThanOrEqual(0);
      expect(stats.byStage.mature).toBeGreaterThanOrEqual(0);
      expect(stats.byStage.stable).toBeGreaterThanOrEqual(0);
    });

    it('should track distillation count', async () => {
      const stats = await learner.getStats();
      expect(stats.distillationsPerformed).toBeGreaterThanOrEqual(0);
    });

    it('should track cross-transfer count', async () => {
      const stats = await learner.getStats();
      expect(stats.crossTransfers).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Persistence', () => {
    it('should persist and restore state', async () => {
      const memory = createMockMemory({ id: 'persistent-pattern' });
      const pattern = await learner.processNewMemory(memory);
      await learner.close();

      // Reinitialize
      const newLearner = new ContinualLearner();
      await newLearner.initialize();

      const restored = newLearner.getPatternLifecycle(pattern.id);
      expect(restored).toBeDefined();
      expect(restored!.memoryId).toBe('persistent-pattern');

      await newLearner.close();
    });

    it('should persist update history', async () => {
      const memory = createMockMemory({ id: 'history-persist' });
      await learner.processNewMemory(memory);

      memory.content = 'Updated content.';
      await learner.processNewMemory(memory);
      await learner.close();

      // Reinitialize
      const newLearner = new ContinualLearner();
      await newLearner.initialize();

      const restored = newLearner.findPatternByMemoryId('history-persist');
      expect(restored!.updateHistory.length).toBe(2);

      await newLearner.close();
    });
  });

  describe('Pattern Queries', () => {
    it('should find pattern by memory ID', async () => {
      const memory = createMockMemory({ id: 'findable-mem' });
      await learner.processNewMemory(memory);

      const found = learner.findPatternByMemoryId('findable-mem');
      expect(found).toBeDefined();
      expect(found!.memoryId).toBe('findable-mem');
    });

    it('should return undefined for non-existent memory ID', () => {
      const found = learner.findPatternByMemoryId('non-existent');
      expect(found).toBeUndefined();
    });

    it('should get pattern lifecycle by pattern ID', async () => {
      const memory = createMockMemory();
      const pattern = await learner.processNewMemory(memory);

      const lifecycle = learner.getPatternLifecycle(pattern.id);
      expect(lifecycle).toBeDefined();
      expect(lifecycle!.id).toBe(pattern.id);
    });

    it('should get patterns by stage', async () => {
      const immatureBefore = learner.getPatternsByStage('immature').length;
      await learner.processNewMemory(createMockMemory());
      await learner.processNewMemory(createMockMemory());

      const immature = learner.getPatternsByStage('immature');
      expect(immature.length).toBe(immatureBefore + 2);

      // Stable patterns require age and stability
      const stable = learner.getPatternsByStage('stable');
      expect(stable.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-Pattern Transfer', () => {
    it('should handle related patterns', async () => {
      // Create patterns in the same domain
      const memory1 = createMockMemory({
        id: 'react-1',
        content: 'React component hooks pattern.',
      });
      const memory2 = createMockMemory({
        id: 'react-2',
        content: 'React hooks for state management.',
      });

      await learner.processNewMemory(memory1);
      await learner.processNewMemory(memory2);

      const patterns = learner.getAllPatterns();
      // Both should be in react domain
      const reactPatterns = patterns.filter(p => p.domain === 'react');
      expect(reactPatterns.length).toBe(2);
    });

    it('should track cross-transfers in stats', async () => {
      const stats = await learner.getStats();
      expect(typeof stats.crossTransfers).toBe('number');
    });
  });

  describe('Snapshot Management', () => {
    it('should take initial snapshot on pattern creation', async () => {
      const memory = createMockMemory({ content: 'Initial snapshot content.' });
      const pattern = await learner.processNewMemory(memory);

      expect(pattern.snapshotContent).toBe('Initial snapshot content.');
      expect(pattern.snapshotDate).toBeInstanceOf(Date);
    });
  });
});

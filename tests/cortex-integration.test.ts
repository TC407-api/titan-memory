/**
 * Cortex Integration Tests
 * Tests Cortex integrated into TitanMemory
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { TitanMemory } from '../src/titan';
import { updateConfig, resetConfig } from '../src/utils/config';

describe('Cortex Integration', () => {
  let titan: TitanMemory;
  let testDir: string;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `titan-cortex-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    resetConfig();
    updateConfig({
      dataDir: testDir,
      episodicDir: path.join(testDir, 'episodic'),
      factualDbPath: path.join(testDir, 'facts.db'),
      memoryMdPath: path.join(testDir, 'MEMORY.md'),
      offlineMode: true,
      cortex: {
        enabled: true,
        retrieveCount: 50,
        highlightThreshold: 0.3,
        classifierConfidenceThreshold: 0.6,
        enableGuardrails: true,
        enableDriftMonitor: true,
        enableProjectHooks: false,
        bedrockRulesPath: '',
      },
    });

    titan = new TitanMemory();
    await titan.initialize();
  });

  afterAll(async () => {
    await titan.close();
    fs.rmSync(testDir, { recursive: true, force: true });
    resetConfig();
  });

  describe('With Cortex Enabled', () => {
    it('should classify content via titan API', () => {
      const result = titan.classifyContent('API rate limit is 1000 per hour');
      expect(result.category).toBe('knowledge');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should add memory with category metadata', async () => {
      const entry = await titan.add('API rate limit is defined as 1000 requests per hour');
      expect(entry).toBeDefined();
      expect(entry.metadata.category).toBe('knowledge');
      expect(entry.metadata.categoryConfidence).toBeGreaterThan(0);
      expect(entry.metadata.entityStatus).toBeDefined();
    });

    it('should add event memory with correct category', async () => {
      const entry = await titan.add('The app crashed and an outage occurred yesterday at 3pm');
      expect(entry.metadata.category).toBe('event');
    });

    it('should add profile memory with correct category', async () => {
      const entry = await titan.add('I prefer TypeScript over JavaScript for new projects');
      expect(entry.metadata.category).toBe('profile');
    });

    it('should get Cortex status', () => {
      const status = titan.getCortexStatus();
      expect(status.enabled).toBe(true);
      expect(status.pipelineActive).toBe(true);
      expect(status.guardrailsEnabled).toBe(true);
      expect(status.driftMonitorEnabled).toBe(true);
    });

    it('should inspect intent via guardrails', () => {
      const result = titan.inspectIntent('titan_add', { content: 'Normal memory' });
      expect(result.action).toBe('allow');
    });

    it('should block destructive intent', () => {
      const result = titan.inspectIntent('titan_prune', { content: 'delete all memories' });
      expect(result.action).toBe('deny');
    });

    it('should check category sufficiency', async () => {
      // Add some memories first
      await titan.add('TypeScript is a typed superset of JavaScript');
      await titan.add('We deployed the app last week');

      const result = await titan.recall('TypeScript', { limit: 10 });
      if ('fusedMemories' in result) {
        const sufficiency = titan.checkCategorySufficiency(result.fusedMemories, 'TypeScript deployment');
        expect(sufficiency).toHaveProperty('sufficient');
        expect(sufficiency).toHaveProperty('coverageRatio');
        expect(sufficiency).toHaveProperty('categoryBreakdown');
      }
    });

    it('should record drift feedback', () => {
      // Should not throw
      titan.recordDriftFeedback('test-id', 'knowledge', 'helpful');
    });
  });

  describe('With Cortex Disabled', () => {
    let titanDisabled: TitanMemory;
    let disabledDir: string;

    beforeAll(async () => {
      disabledDir = path.join(os.tmpdir(), `titan-cortex-disabled-${Date.now()}`);
      fs.mkdirSync(disabledDir, { recursive: true });

      resetConfig();
      updateConfig({
        dataDir: disabledDir,
        episodicDir: path.join(disabledDir, 'episodic'),
        factualDbPath: path.join(disabledDir, 'facts.db'),
        memoryMdPath: path.join(disabledDir, 'MEMORY.md'),
        offlineMode: true,
        cortex: {
          enabled: false,
          retrieveCount: 50,
          highlightThreshold: 0.8,
          classifierConfidenceThreshold: 0.6,
          enableGuardrails: false,
          enableDriftMonitor: false,
          enableProjectHooks: false,
          bedrockRulesPath: '',
        },
      });

      titanDisabled = new TitanMemory();
      await titanDisabled.initialize();
    });

    afterAll(async () => {
      await titanDisabled.close();
      fs.rmSync(disabledDir, { recursive: true, force: true });
    });

    it('should add memories without category metadata', async () => {
      const entry = await titanDisabled.add('Simple test memory');
      expect(entry).toBeDefined();
      // Category may not be set since Cortex is disabled
      expect(entry.metadata.category).toBeUndefined();
    });

    it('should show Cortex as disabled', () => {
      const status = titanDisabled.getCortexStatus();
      expect(status.enabled).toBe(false);
      expect(status.pipelineActive).toBe(false);
    });

    it('should allow all intents when guardrails disabled', () => {
      const result = titanDisabled.inspectIntent('titan_prune', { content: 'delete all' });
      expect(result.action).toBe('allow');
    });

    it('should return null for category summary', () => {
      const summary = titanDisabled.getCategorySummary('knowledge');
      expect(summary).toBeNull();
    });
  });
});

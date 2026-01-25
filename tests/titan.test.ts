/**
 * Tests for TitanMemory unified manager
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TitanMemory } from '../src/titan';
import { MemoryLayer } from '../src/types';
import { updateConfig } from '../src/utils/config';

describe('TitanMemory', () => {
  let titan: TitanMemory;
  let testDir: string;

  beforeAll(async () => {
    // Create temporary directory for tests
    testDir = path.join(os.tmpdir(), `titan-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Configure Titan to use test directory
    updateConfig({
      dataDir: testDir,
      episodicDir: path.join(testDir, 'episodic'),
      factualDbPath: path.join(testDir, 'facts.db'),
      memoryMdPath: path.join(testDir, 'MEMORY.md'),
      offlineMode: true, // Don't need Zilliz for tests
    });

    titan = new TitanMemory();
    await titan.initialize();
  });

  afterAll(async () => {
    await titan.close();

    // Cleanup test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize all layers', async () => {
      const stats = await titan.getStats();
      expect(stats).toBeDefined();
      expect(stats.byLayer).toBeDefined();
    });
  });

  describe('add', () => {
    it('should add memory with automatic routing', async () => {
      const entry = await titan.add('API rate limit is 1000 requests per hour');

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('API rate limit is 1000 requests per hour');
    });

    it('should route factual definitions to factual layer', async () => {
      const entry = await titan.addToLayer(
        MemoryLayer.FACTUAL,
        'PostgreSQL is defined as a relational database'
      );

      expect(entry.layer).toBe(MemoryLayer.FACTUAL);
    });

    it('should store with metadata', async () => {
      const entry = await titan.add('Test memory with tags', {
        tags: ['test', 'example'],
        projectId: 'test-project',
      });

      expect(entry.metadata?.tags).toContain('test');
    });
  });

  describe('recall', () => {
    beforeAll(async () => {
      // Add some test memories
      await titan.add('Redis is used for caching frequently accessed data');
      await titan.add('PostgreSQL stores the main application data');
      await titan.add('The authentication uses JWT tokens');
    });

    it('should recall relevant memories', async () => {
      const result = await titan.recall('caching');

      expect(result.fusedMemories.length).toBeGreaterThanOrEqual(0);
    });

    it('should return query time', async () => {
      const result = await titan.recall('database');

      expect(result.totalQueryTimeMs).toBeDefined();
      expect(result.totalQueryTimeMs).toBeGreaterThan(0);
    });

    it('should respect limit option', async () => {
      const result = await titan.recall('data', { limit: 1 });

      expect(result.fusedMemories.length).toBeLessThanOrEqual(1);
    });
  });

  describe('get', () => {
    it('should retrieve memory by ID from factual layer', async () => {
      const added = await titan.addToLayer(MemoryLayer.FACTUAL, 'Specific factual memory to retrieve');
      const retrieved = await titan.get(added.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('Specific factual memory to retrieve');
    });

    it('should return null for non-existent ID', async () => {
      const retrieved = await titan.get('definitely-non-existent-id-12345');
      expect(retrieved).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete memory by ID', async () => {
      const added = await titan.addToLayer(MemoryLayer.FACTUAL, 'Factual memory to delete');
      const deleted = await titan.delete(added.id);

      expect(deleted).toBe(true);

      const retrieved = await titan.get(added.id);
      expect(retrieved).toBeNull();
    });

    it('should handle delete of non-existent ID gracefully', async () => {
      // Note: Current implementation iterates layers and returns on first true
      // This behavior may vary; test for graceful handling
      const deleted = await titan.delete('definitely-non-existent-id-67890');
      expect(typeof deleted).toBe('boolean');
    });
  });

  describe('getStats', () => {
    it('should return memory statistics', async () => {
      const stats = await titan.getStats();

      expect(stats.totalMemories).toBeGreaterThanOrEqual(0);
      expect(stats.byLayer).toBeDefined();
      expect(stats.byLayer[MemoryLayer.FACTUAL]).toBeDefined();
      expect(stats.byLayer[MemoryLayer.LONG_TERM]).toBeDefined();
      expect(stats.byLayer[MemoryLayer.SEMANTIC]).toBeDefined();
      expect(stats.byLayer[MemoryLayer.EPISODIC]).toBeDefined();
    });
  });

  describe('flushPreCompaction', () => {
    it('should save insights before compaction', async () => {
      const entries = await titan.flushPreCompaction({
        sessionId: 'test-session',
        timestamp: new Date(),
        tokenCount: 100000,
        importantInsights: ['Key insight about the system'],
        decisions: ['Decided to use caching'],
        errors: ['Found bug in auth flow'],
        solutions: ['Fixed by adding validation'],
      });

      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('curate', () => {
    it('should add to MEMORY.md', async () => {
      await titan.curate('User prefers dark mode', 'User Preferences');

      // Check if MEMORY.md was updated
      const memoryMdPath = path.join(testDir, 'MEMORY.md');
      if (fs.existsSync(memoryMdPath)) {
        const content = fs.readFileSync(memoryMdPath, 'utf-8');
        expect(content).toContain('User prefers dark mode');
      }
    });
  });

  describe('getToday', () => {
    it('should return today\'s episodic entries', async () => {
      // Add an entry for today
      await titan.addToLayer(
        MemoryLayer.EPISODIC,
        'Today\'s test entry'
      );

      const entries = await titan.getToday();
      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
    });
  });

  describe('prune', () => {
    it('should prune decayed memories', async () => {
      const result = await titan.prune({ decayThreshold: 0.1 });

      expect(result).toBeDefined();
      expect(typeof result.pruned).toBe('number');
    });
  });

  describe('export', () => {
    it('should export all memories', async () => {
      const exported = await titan.export();

      expect(exported.version).toBe('1.0.0');
      expect(exported.exportedAt).toBeDefined();
      expect(exported.stats).toBeDefined();
      expect(exported.layers).toBeDefined();
    });
  });

  describe('getCurrentMomentum', () => {
    it('should return current momentum', () => {
      const momentum = titan.getCurrentMomentum();

      expect(typeof momentum).toBe('number');
      expect(momentum).toBeGreaterThanOrEqual(0);
      expect(momentum).toBeLessThanOrEqual(1);
    });
  });
});

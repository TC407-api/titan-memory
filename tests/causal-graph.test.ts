/**
 * Tests for Causal Graph Structure
 * Titan Memory v2.0 - Competitive Upgrade
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  CausalGraph,
  CausalRelationType,
} from '../src/graphs/causal';

// Test-specific subclass for isolated testing
class TestCausalGraph extends CausalGraph {
  private static testCounter = 0;

  constructor() {
    super();
    // Override the data path for test isolation
    const testDir = path.join(__dirname, '..', 'data', 'test-graphs');
    const testFile = `causal-test-${Date.now()}-${TestCausalGraph.testCounter++}.json`;
    (this as any).dataPath = path.join(testDir, testFile);

    // Ensure test directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  }

  // Clean up test file after tests
  async cleanup(): Promise<void> {
    const dataPath = (this as any).dataPath;
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
  }
}

describe('CausalGraph', () => {
  let graph: TestCausalGraph;

  beforeEach(async () => {
    graph = new TestCausalGraph();
    await graph.initialize();
  });

  afterEach(async () => {
    await graph.close();
    await graph.cleanup();
  });

  describe('link', () => {
    it('should create a causal link between memories', async () => {
      const edge = await graph.link({
        fromMemoryId: 'memory-1',
        toMemoryId: 'memory-2',
        relationship: 'causes',
        strength: 0.9,
        evidence: 'Direct causation observed',
      });

      expect(edge).toBeDefined();
      expect(edge.id).toBeDefined();
      expect(edge.fromMemoryId).toBe('memory-1');
      expect(edge.toMemoryId).toBe('memory-2');
      expect(edge.relationship).toBe('causes');
      expect(edge.strength).toBe(0.9);
      expect(edge.evidence).toBe('Direct causation observed');
      expect(edge.createdAt).toBeInstanceOf(Date);
    });

    it('should use default strength of 0.5 when not specified', async () => {
      const edge = await graph.link({
        fromMemoryId: 'memory-1',
        toMemoryId: 'memory-2',
        relationship: 'enables',
      });

      expect(edge.strength).toBe(0.5);
    });

    it('should handle all relationship types', async () => {
      const types: CausalRelationType[] = [
        'causes', 'enables', 'blocks', 'follows',
        'contradicts', 'requires', 'supports', 'refutes'
      ];

      for (const relType of types) {
        const edge = await graph.link({
          fromMemoryId: `from-${relType}`,
          toMemoryId: `to-${relType}`,
          relationship: relType,
        });

        expect(edge.relationship).toBe(relType);
      }
    });

    it('should update existing edge if one exists', async () => {
      // Create initial edge
      const edge1 = await graph.link({
        fromMemoryId: 'memory-1',
        toMemoryId: 'memory-2',
        relationship: 'causes',
        strength: 0.5,
      });

      // Create same edge with different strength
      const edge2 = await graph.link({
        fromMemoryId: 'memory-1',
        toMemoryId: 'memory-2',
        relationship: 'causes',
        strength: 0.9,
      });

      // Should have same ID but updated strength
      expect(edge2.id).toBe(edge1.id);
      expect(edge2.strength).toBe(0.9);
      expect(edge2.updatedAt).toBeDefined();
    });
  });

  describe('trace', () => {
    beforeEach(async () => {
      // Create a chain: A -> B -> C -> D
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'C', relationship: 'enables' });
      await graph.link({ fromMemoryId: 'C', toMemoryId: 'D', relationship: 'follows' });
    });

    it('should trace forward causal chain', async () => {
      const chain = await graph.trace('A', { direction: 'forward', depth: 10 });

      expect(chain.rootMemoryId).toBe('A');
      expect(chain.chain.length).toBe(3);
      expect(chain.chain[0].fromMemoryId).toBe('A');
      expect(chain.chain[0].toMemoryId).toBe('B');
      expect(chain.chain[2].toMemoryId).toBe('D');
    });

    it('should trace backward causal chain', async () => {
      const chain = await graph.trace('D', { direction: 'backward', depth: 10 });

      expect(chain.rootMemoryId).toBe('D');
      expect(chain.chain.length).toBe(3);
      expect(chain.chain[0].toMemoryId).toBe('D');
      expect(chain.chain[2].fromMemoryId).toBe('A');
    });

    it('should respect depth limit', async () => {
      const chain = await graph.trace('A', { direction: 'forward', depth: 1 });

      expect(chain.chain.length).toBe(1);
      expect(chain.chain[0].toMemoryId).toBe('B');
    });

    it('should return empty chain for unknown memory', async () => {
      const chain = await graph.trace('unknown-memory');

      expect(chain.rootMemoryId).toBe('unknown-memory');
      expect(chain.chain.length).toBe(0);
    });

    it('should detect and avoid cycles', async () => {
      // Add a cycle: D -> A
      await graph.link({ fromMemoryId: 'D', toMemoryId: 'A', relationship: 'causes' });

      const chain = await graph.trace('A', { direction: 'forward', depth: 10 });

      // Should not infinite loop, should visit each node once
      expect(chain.chain.length).toBe(4); // A->B, B->C, C->D, D->A
      expect(chain.hasCycle).toBe(true);
    });
  });

  describe('why', () => {
    beforeEach(async () => {
      // Create a decision tree:
      //   A (root cause)
      //   ├── B (enables)
      //   │   └── D (causes)
      //   └── C (causes)
      //       └── D (enables)
      // Note: why() only tracks 'causes', 'enables', 'requires' relationships
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'enables', evidence: 'A enabled B' });
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'C', relationship: 'causes', evidence: 'A caused C' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'D', relationship: 'causes', evidence: 'B caused D' });
      await graph.link({ fromMemoryId: 'C', toMemoryId: 'D', relationship: 'enables', evidence: 'C enabled D' });
    });

    it('should generate explanation tree for a memory', async () => {
      const explanation = await graph.why('D');

      expect(explanation.memoryId).toBe('D');
      expect(explanation.directCauses.length).toBeGreaterThan(0);
    });

    it('should include evidence in explanation', async () => {
      const explanation = await graph.why('D');

      // Should have explanations from the incoming edges
      const allEvidence = explanation.directCauses.map(c => c.evidence).filter(Boolean);
      expect(allEvidence.length).toBeGreaterThan(0);
    });

    it('should respect maxDepth in explanation', async () => {
      const explanation = await graph.why('D', 1);

      // Should only show direct causes
      expect(explanation.indirectCauses.length).toBe(0);
    });

    it('should return empty explanation for root cause', async () => {
      const explanation = await graph.why('A');

      expect(explanation.memoryId).toBe('A');
      expect(explanation.directCauses.length).toBe(0);
    });

    it('should identify root causes', async () => {
      const explanation = await graph.why('D', 5);

      // A should be identified as root cause
      expect(explanation.rootCauses).toContain('A');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'C', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'C', relationship: 'enables' });

      const stats = await graph.getStats();

      expect(stats.totalEdges).toBe(3);
      expect(stats.byRelationType['causes']).toBe(2);
      expect(stats.byRelationType['enables']).toBe(1);
    });

    it('should calculate average strength', async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes', strength: 0.8 });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'C', relationship: 'causes', strength: 0.6 });

      const stats = await graph.getStats();

      expect(stats.avgStrength).toBe(0.7); // (0.8 + 0.6) / 2
    });

    it('should track memories with links', async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'C', relationship: 'causes' });

      const stats = await graph.getStats();

      expect(stats.memoriesWithLinks).toBe(3); // A, B, C
    });
  });

  describe('getEdgesForMemory', () => {
    beforeEach(async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'C', toMemoryId: 'B', relationship: 'enables' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'D', relationship: 'follows' });
    });

    it('should get all edges for a memory', async () => {
      const result = await graph.getEdgesForMemory('B');

      expect(result.incoming.length).toBe(2);
      expect(result.outgoing.length).toBe(1);
      expect(result.incoming.every(e => e.toMemoryId === 'B')).toBe(true);
      expect(result.outgoing.every(e => e.fromMemoryId === 'B')).toBe(true);
    });
  });

  describe('unlink', () => {
    it('should remove an edge by ID', async () => {
      const edge = await graph.link({
        fromMemoryId: 'A',
        toMemoryId: 'B',
        relationship: 'causes',
      });

      const removed = await graph.unlink(edge.id);
      expect(removed).toBe(true);

      const result = await graph.getEdgesForMemory('A');
      expect(result.outgoing.length).toBe(0);
    });

    it('should return false for non-existent edge', async () => {
      const result = await graph.unlink('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('removeMemory', () => {
    it('should remove all edges for a memory', async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'C', toMemoryId: 'B', relationship: 'enables' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'D', relationship: 'follows' });

      const removed = await graph.removeMemory('B');

      expect(removed).toBe(3); // All 3 edges involving B

      const stats = await graph.getStats();
      expect(stats.totalEdges).toBe(0);
    });
  });

  describe('findContradictions', () => {
    it('should find contradicting memories', async () => {
      await graph.link({
        fromMemoryId: 'statement-1',
        toMemoryId: 'statement-2',
        relationship: 'contradicts',
      });

      const contradictions = await graph.findContradictions('statement-1');

      expect(contradictions.length).toBe(1);
      expect(contradictions[0].relationship).toBe('contradicts');
    });

    it('should return empty array if no contradictions', async () => {
      await graph.link({
        fromMemoryId: 'A',
        toMemoryId: 'B',
        relationship: 'causes',
      });

      const contradictions = await graph.findContradictions('A');

      expect(contradictions.length).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should persist edges across reinitialize', async () => {
      await graph.link({ fromMemoryId: 'A', toMemoryId: 'B', relationship: 'causes' });
      await graph.link({ fromMemoryId: 'B', toMemoryId: 'C', relationship: 'enables' });

      // Close and reinitialize (simulating restart)
      await graph.close();

      // Create new instance pointing to same file
      const dataPath = (graph as any).dataPath;
      const graph2 = new CausalGraph();
      (graph2 as any).dataPath = dataPath;
      await graph2.initialize();

      const stats = await graph2.getStats();
      expect(stats.totalEdges).toBe(2);

      await graph2.close();
    });
  });
});

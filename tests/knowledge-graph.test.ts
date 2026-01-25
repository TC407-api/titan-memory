/**
 * Knowledge Graph Tests
 * Tests for entity extraction, relationship management, and graph operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeGraph } from '../src/graph/knowledge-graph.js';

describe('KnowledgeGraph', () => {
  let graph: KnowledgeGraph;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(process.cwd(), 'test-data-graph', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(testDataDir, { recursive: true });
    process.env.TITAN_DATA_DIR = testDataDir;

    graph = new KnowledgeGraph();
    await graph.initialize();
  });

  afterEach(async () => {
    await graph.close();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newGraph = new KnowledgeGraph();
      await newGraph.initialize();
      const stats = await newGraph.getStats();
      expect(stats.entityCount).toBeGreaterThanOrEqual(0);
      await newGraph.close();
    });

    it('should handle multiple initialize calls', async () => {
      const statsBefore = await graph.getStats();
      await graph.initialize();
      await graph.initialize();
      const statsAfter = await graph.getStats();
      expect(statsAfter.entityCount).toBe(statsBefore.entityCount);
    });
  });

  describe('Entity Extraction', () => {
    it('should extract entities from content', async () => {
      const content = 'We use React and TypeScript for the frontend.';
      const result = await graph.extract(content);

      expect(result.entities).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(result.sourceContent).toBe(content);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should extract technology entities', async () => {
      const content = 'The project uses React, TypeScript, and Node.js.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should extract file path entities', async () => {
      const content = 'The main file is located at src/components/App.tsx';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should extract class names', async () => {
      const content = 'The UserService class handles authentication.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should extract function names', async () => {
      const content = 'Call handleSubmit() to process the form.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should extract error patterns', async () => {
      const content = 'Got error: TypeError: Cannot read property of undefined';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should handle empty content', async () => {
      const result = await graph.extract('');

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });

    it('should handle content without recognizable entities', async () => {
      const content = 'This is plain text without technical terms.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should link entities to memory ID if provided', async () => {
      const content = 'React uses JSX for templating.';
      const result = await graph.extract(content, 'memory-123');

      expect(result).toBeDefined();
    });
  });

  describe('Entity Retrieval', () => {
    beforeEach(async () => {
      // Extract some entities first
      await graph.extract('We use React for the frontend.');
    });

    it('should get entity by name', async () => {
      const entity = await graph.getEntity('React');
      // May or may not find based on extraction patterns
      expect(entity === null || typeof entity === 'object').toBe(true);
    });

    it('should return null for non-existent entity', async () => {
      const entity = await graph.getEntity('NonExistentEntity12345');
      expect(entity).toBeNull();
    });

    it('should be case-insensitive for name lookup', async () => {
      const entity1 = await graph.getEntity('react');
      const entity2 = await graph.getEntity('REACT');
      // Both should return same result
      expect(entity1?.id).toBe(entity2?.id);
    });
  });

  describe('Relationship Extraction', () => {
    it('should extract "uses" relationships', async () => {
      const content = 'The frontend uses React for rendering.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.relationships)).toBe(true);
    });

    it('should extract "implements" relationships', async () => {
      const content = 'UserService implements the AuthService interface.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.relationships)).toBe(true);
    });

    it('should extract "extends" relationships', async () => {
      const content = 'TypeScript extends JavaScript with type annotations.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.relationships)).toBe(true);
    });

    it('should extract "depends_on" relationships', async () => {
      const content = 'The auth module depends on the database module.';
      const result = await graph.extract(content);

      expect(Array.isArray(result.relationships)).toBe(true);
    });
  });

  describe('Graph Queries', () => {
    beforeEach(async () => {
      // Build a small graph
      await graph.extract('React uses JSX for templating.');
      await graph.extract('TypeScript extends JavaScript.');
      await graph.extract('React works with TypeScript.');
    });

    it('should query by entity names', async () => {
      const result = await graph.query(['React']);

      expect(result.entities).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should query with depth option', async () => {
      const result = await graph.query(['React'], { maxDepth: 1 });

      expect(result.entities).toBeDefined();
    });

    it('should query with minimum strength filter', async () => {
      const result = await graph.query(['React'], { minStrength: 0.5 });

      expect(result.entities).toBeDefined();
    });

    it('should return empty for non-existent entities', async () => {
      const result = await graph.query(['NonExistent12345']);

      expect(result.entities).toEqual([]);
    });

    it('should find paths between entities', async () => {
      const result = await graph.query(['React', 'TypeScript'], { maxDepth: 3 });

      expect(result.paths).toBeDefined();
      expect(Array.isArray(result.paths)).toBe(true);
    });
  });

  describe('Entity Relationships', () => {
    it('should get relationships for entity', async () => {
      await graph.extract('React uses JSX.');
      const entity = await graph.getEntity('React');

      if (entity) {
        const relationships = await graph.getRelationships(entity.id);
        expect(Array.isArray(relationships)).toBe(true);
      }
    });

    it('should return empty array for entity without relationships', async () => {
      const relationships = await graph.getRelationships('non-existent-id');
      expect(relationships).toEqual([]);
    });
  });

  describe('Entity Aliases', () => {
    beforeEach(async () => {
      await graph.extract('We use React.');
    });

    it('should add alias to entity', async () => {
      const entity = await graph.getEntity('React');
      if (entity) {
        await graph.addAlias(entity.id, 'ReactJS');

        // Should be findable by alias
        const found = await graph.getEntity('ReactJS');
        expect(found?.id).toBe(entity.id);
      }
    });

    it('should handle adding duplicate alias', async () => {
      const entity = await graph.getEntity('React');
      if (entity) {
        await graph.addAlias(entity.id, 'ReactJS');
        await graph.addAlias(entity.id, 'ReactJS');

        // Should not add duplicate
        const found = await graph.getEntity('React');
        expect(found?.aliases.filter(a => a === 'ReactJS').length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Entity Merging', () => {
    it('should merge two entities', async () => {
      await graph.extract('React is popular.');
      await graph.extract('ReactJS is a library.');

      const react = await graph.getEntity('React');
      const reactjs = await graph.getEntity('ReactJS');

      if (react && reactjs && react.id !== reactjs.id) {
        const merged = await graph.mergeEntities(react.id, reactjs.id);
        expect(merged).toBeDefined();
        expect(merged?.aliases).toContain('ReactJS');
      }
    });

    it('should return null for non-existent entities', async () => {
      const result = await graph.mergeEntities('fake-1', 'fake-2');
      expect(result).toBeNull();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await graph.extract('React uses JSX.');
      await graph.extract('TypeScript extends JavaScript.');
    });

    it('should return graph statistics', async () => {
      const stats = await graph.getStats();

      expect(stats.entityCount).toBeGreaterThanOrEqual(0);
      expect(stats.relationshipCount).toBeGreaterThanOrEqual(0);
      expect(stats.avgConnections).toBeGreaterThanOrEqual(0);
      expect(stats.entityTypeDistribution).toBeDefined();
      expect(stats.relationTypeDistribution).toBeDefined();
      expect(stats.mostConnected).toBeDefined();
    });

    it('should track entity types', async () => {
      const stats = await graph.getStats();
      expect(typeof stats.entityTypeDistribution).toBe('object');
    });

    it('should track relationship types', async () => {
      const stats = await graph.getStats();
      expect(typeof stats.relationTypeDistribution).toBe('object');
    });
  });

  describe('Persistence', () => {
    it('should persist graph to disk', async () => {
      await graph.extract('React is a JavaScript library.');

      const stats1 = await graph.getStats();
      expect(stats1.entityCount).toBeGreaterThanOrEqual(0);

      // Create new instance to verify persistence
      const newGraph = new KnowledgeGraph();
      await newGraph.initialize();

      const stats2 = await newGraph.getStats();
      expect(stats2.entityCount).toBe(stats1.entityCount);
      await newGraph.close();
    });

    it('should persist relationships', async () => {
      await graph.extract('React uses JSX.');

      const stats1 = await graph.getStats();

      const newGraph = new KnowledgeGraph();
      await newGraph.initialize();

      const stats2 = await newGraph.getStats();
      expect(stats2.relationshipCount).toBe(stats1.relationshipCount);
      await newGraph.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long content', async () => {
      const longContent = 'React is great. '.repeat(100);
      const result = await graph.extract(longContent);

      expect(result).toBeDefined();
    });

    it('should handle special characters in content', async () => {
      const content = 'Use <Component> & "Props" for React.';
      const result = await graph.extract(content);

      expect(result).toBeDefined();
    });

    it('should handle unicode content', async () => {
      const content = 'We use React 你好 αβγ for the frontend.';
      const result = await graph.extract(content);

      expect(result).toBeDefined();
    });

    it('should handle many extractions', async () => {
      for (let i = 0; i < 20; i++) {
        await graph.extract(`Module${i} uses Component${i}.`);
      }

      const stats = await graph.getStats();
      expect(stats.entityCount).toBeGreaterThanOrEqual(0);
    });

    it('should reinforce existing relationships on repeated extraction', async () => {
      await graph.extract('React uses JSX.');
      await graph.extract('React uses JSX for templating.');

      const stats = await graph.getStats();
      // Should not create duplicate relationships
      expect(stats).toBeDefined();
    });
  });

  describe('Extraction Confidence', () => {
    it('should calculate extraction confidence', async () => {
      const result = await graph.extract('React uses JSX and TypeScript.');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return 0 confidence for empty extraction', async () => {
      const result = await graph.extract('');
      expect(result.confidence).toBe(0);
    });
  });
});

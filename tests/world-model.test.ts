/**
 * World Model Tests
 * Tests for meta nodes, context inheritance, and world state management
 */

import * as fs from 'fs';
import * as path from 'path';
import { WorldModel } from '../src/world/world-model';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('WorldModel', () => {
  let worldModel: WorldModel;
  let testDataDir: string;

  beforeEach(async () => {
    // Create test data directory
    testDataDir = path.join(process.cwd(), 'test-data-world', Date.now().toString());
    fs.mkdirSync(testDataDir, { recursive: true });

    // Set up config to use test directory
    process.env.TITAN_DATA_DIR = testDataDir;

    worldModel = new WorldModel();
    await worldModel.initialize();
  });

  afterEach(async () => {
    await worldModel.close();

    // Cleanup test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Meta Node CRUD', () => {
    it('should create a project node', async () => {
      const node = await worldModel.createNode({
        type: 'project',
        name: 'TestProject',
        description: 'A test project',
      });

      expect(node).toBeDefined();
      expect(node.id).toBeDefined();
      expect(node.type).toBe('project');
      expect(node.name).toBe('TestProject');
      expect(node.description).toBe('A test project');
      expect(node.state.status).toBe('active');
    });

    it('should create child nodes with parent relationship', async () => {
      const parent = await worldModel.createNode({
        type: 'project',
        name: 'ParentProject',
      });

      const child = await worldModel.createNode({
        type: 'context',
        name: 'ChildContext',
        parentId: parent.id,
      });

      expect(child.parentId).toBe(parent.id);

      const children = await worldModel.getChildren(parent.id);
      expect(children).toHaveLength(1);
      expect(children[0].id).toBe(child.id);
    });

    it('should get or create node by name', async () => {
      const node1 = await worldModel.getOrCreate('project', 'UniqueProject');
      const node2 = await worldModel.getOrCreate('project', 'UniqueProject');

      expect(node1.id).toBe(node2.id);
    });

    it('should get node by ID', async () => {
      const created = await worldModel.createNode({
        type: 'user',
        name: 'TestUser',
      });

      const retrieved = await worldModel.getNode(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('TestUser');
    });

    it('should get nodes by type', async () => {
      await worldModel.createNode({ type: 'project', name: 'Project1' });
      await worldModel.createNode({ type: 'project', name: 'Project2' });
      await worldModel.createNode({ type: 'user', name: 'User1' });

      const projects = await worldModel.getNodesByType('project');
      expect(projects.length).toBeGreaterThanOrEqual(2);
      expect(projects.every(p => p.type === 'project')).toBe(true);
    });

    it('should update node state', async () => {
      const node = await worldModel.createNode({
        type: 'session',
        name: 'TestSession',
      });

      const updated = await worldModel.updateNodeState(node.id, {
        memoryCount: 10,
        importance: 0.8,
      });

      expect(updated?.state.memoryCount).toBe(10);
      expect(updated?.state.importance).toBe(0.8);
    });

    it('should archive a node', async () => {
      const node = await worldModel.createNode({
        type: 'context',
        name: 'ToArchive',
      });

      const result = await worldModel.archiveNode(node.id);
      expect(result).toBe(true);

      const archived = await worldModel.getNode(node.id);
      expect(archived?.state.status).toBe('archived');
    });
  });

  describe('Memory Linking', () => {
    it('should link a memory to a meta node', async () => {
      const node = await worldModel.createNode({
        type: 'project',
        name: 'MemoryProject',
      });

      const link = await worldModel.linkMemory(
        node.id,
        'memory-123',
        MemoryLayer.LONG_TERM,
        'contains'
      );

      expect(link).toBeDefined();
      expect(link?.metaNodeId).toBe(node.id);
      expect(link?.memoryId).toBe('memory-123');
      expect(link?.relationship).toBe('contains');
    });

    it('should reinforce link strength on repeated linking', async () => {
      const node = await worldModel.createNode({
        type: 'project',
        name: 'ReinforcedProject',
      });

      const link1 = await worldModel.linkMemory(node.id, 'memory-456', MemoryLayer.SEMANTIC);
      const initialStrength = link1?.strength || 0;

      const link2 = await worldModel.linkMemory(node.id, 'memory-456', MemoryLayer.SEMANTIC);
      expect(link2?.strength).toBeGreaterThan(initialStrength);
    });

    it('should get nodes for a memory', async () => {
      const uniqueMemId = 'shared-memory-' + Date.now();
      const node1 = await worldModel.createNode({ type: 'project', name: 'P1-unique' });
      const node2 = await worldModel.createNode({ type: 'context', name: 'C1-unique' });

      await worldModel.linkMemory(node1.id, uniqueMemId, MemoryLayer.EPISODIC);
      await worldModel.linkMemory(node2.id, uniqueMemId, MemoryLayer.EPISODIC);

      const nodes = await worldModel.getNodesForMemory(uniqueMemId);
      expect(nodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should get memories for a node', async () => {
      const node = await worldModel.createNode({ type: 'domain', name: 'TestDomain' });

      await worldModel.linkMemory(node.id, 'mem1', MemoryLayer.LONG_TERM);
      await worldModel.linkMemory(node.id, 'mem2', MemoryLayer.SEMANTIC);
      await worldModel.linkMemory(node.id, 'mem3', MemoryLayer.EPISODIC);

      const memories = await worldModel.getMemoriesForNode(node.id);
      expect(memories).toHaveLength(3);
      expect(memories).toContain('mem1');
      expect(memories).toContain('mem2');
      expect(memories).toContain('mem3');
    });
  });

  describe('Context Inheritance', () => {
    it('should return null for empty active context', async () => {
      const inheritance = await worldModel.getContextInheritance([]);
      expect(inheritance).toBeNull();
    });

    it('should inherit tags from active context', async () => {
      const node = await worldModel.createNode({
        type: 'project',
        name: 'TaggedProject',
      });

      // Simulate aggregation that sets common tags
      const mockMemories: MemoryEntry[] = [
        {
          id: '1',
          content: 'Test content',
          layer: MemoryLayer.LONG_TERM,
          timestamp: new Date(),
          metadata: { tags: ['typescript', 'testing'] },
        },
      ];
      await worldModel.aggregate(node.id, mockMemories);

      const inheritance = await worldModel.getContextInheritance([node.id]);
      expect(inheritance).toBeDefined();
      expect(inheritance?.metaNodeId).toBe(node.id);
    });

    it('should detect context from content', async () => {
      await worldModel.createNode({
        type: 'skill',
        name: 'React',
      });

      const detected = await worldModel.detectContext('We are using React for the frontend');
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some(n => n.name === 'React')).toBe(true);
    });
  });

  describe('World State', () => {
    it('should get initial world state', () => {
      const state = worldModel.getWorldState();

      expect(state).toBeDefined();
      expect(Array.isArray(state.activeContext)).toBe(true);
      expect(Array.isArray(state.recentMemories)).toBe(true);
      expect(typeof state.focusScore).toBe('number');
    });

    it('should set active context', async () => {
      const node = await worldModel.createNode({ type: 'session', name: 'ActiveSession' });

      await worldModel.setActiveContext([node.id]);

      const state = worldModel.getWorldState();
      expect(state.activeContext).toContain(node.id);
      expect(state.focusScore).toBe(1.0); // Single context = full focus
    });

    it('should record memory activity', async () => {
      await worldModel.recordMemoryActivity('recent-memory-1');
      await worldModel.recordMemoryActivity('recent-memory-2');

      const state = worldModel.getWorldState();
      expect(state.recentMemories).toContain('recent-memory-1');
      expect(state.recentMemories).toContain('recent-memory-2');
    });

    it('should record anomaly', async () => {
      await worldModel.recordAnomaly('Unusual memory pattern detected');

      const state = worldModel.getWorldState();
      expect(state.anomalies).toContain('Unusual memory pattern detected');
    });
  });

  describe('Aggregation', () => {
    it('should aggregate memories for a node', async () => {
      const node = await worldModel.createNode({
        type: 'project',
        name: 'AggregatedProject',
      });

      const memories: MemoryEntry[] = [
        {
          id: '1',
          content: 'Using React and TypeScript',
          layer: MemoryLayer.LONG_TERM,
          timestamp: new Date('2024-01-01'),
          metadata: { tags: ['react', 'typescript'] },
        },
        {
          id: '2',
          content: 'Implement user authentication with React',
          layer: MemoryLayer.SEMANTIC,
          timestamp: new Date('2024-01-15'),
          metadata: { tags: ['react', 'auth'] },
        },
      ];

      const result = await worldModel.aggregate(node.id, memories);

      expect(result.metaNodeId).toBe(node.id);
      expect(result.memoryCount).toBe(2);
      expect(result.commonTags.some(t => t.tag === 'react')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', async () => {
      await worldModel.createNode({ type: 'project', name: 'P1' });
      await worldModel.createNode({ type: 'project', name: 'P2' });
      await worldModel.createNode({ type: 'user', name: 'U1' });

      const stats = await worldModel.getStats();

      expect(stats.totalNodes).toBeGreaterThanOrEqual(3);
      expect(stats.byType.project).toBeGreaterThanOrEqual(2);
      expect(stats.byType.user).toBeGreaterThanOrEqual(1);
    });
  });
});

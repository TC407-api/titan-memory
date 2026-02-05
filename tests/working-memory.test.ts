/**
 * Tests for Working Memory Layer
 * Titan Memory v2.0 - Competitive Upgrade
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  WorkingMemory,
  resetWorkingMemory,
} from '../src/layers/working';

// Test-specific subclass for isolated testing
class TestWorkingMemory extends WorkingMemory {
  private static testCounter = 0;

  constructor(config?: { maxFocusItems?: number; autoEvictMs?: number; persistSession?: boolean }) {
    super(config);
    // Override the data path for test isolation
    const testDir = path.join(__dirname, '..', 'data', 'test-working-memory');
    const testFile = `working-test-${Date.now()}-${TestWorkingMemory.testCounter++}.json`;
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

describe('WorkingMemory', () => {
  let wm: TestWorkingMemory;

  beforeEach(async () => {
    resetWorkingMemory();
    wm = new TestWorkingMemory();
    await wm.initialize();
  });

  afterEach(async () => {
    await wm.close();
    await wm.cleanup();
  });

  describe('addFocus', () => {
    it('should add an item to focus', async () => {
      const item = await wm.addFocus({
        content: 'Test focus item',
        priority: 'normal',
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.content).toBe('Test focus item');
      expect(item.priority).toBe('normal');
      expect(item.addedAt).toBeInstanceOf(Date);
    });

    it('should use default priority of normal', async () => {
      const item = await wm.addFocus({ content: 'Test' });
      expect(item.priority).toBe('normal');
    });

    it('should handle high priority items', async () => {
      const item = await wm.addFocus({
        content: 'Important task',
        priority: 'high',
      });

      expect(item.priority).toBe('high');
    });

    it('should update existing item with same content', async () => {
      await wm.addFocus({ content: 'Same content' });
      await wm.addFocus({ content: 'Same content', priority: 'high' });

      const focus = await wm.getFocus();
      expect(focus.length).toBe(1);
      expect(focus[0].priority).toBe('high');
    });

    it('should set TTL when specified', async () => {
      const item = await wm.addFocus({
        content: 'Expiring item',
        ttlMs: 5000,
      });

      expect(item.expiresAt).toBeDefined();
      expect(item.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should track source', async () => {
      const item = await wm.addFocus({
        content: 'From recall',
        source: 'recall',
      });

      expect(item.source).toBe('recall');
    });
  });

  describe('maxFocusItems', () => {
    it('should enforce max focus items (default 5)', async () => {
      for (let i = 0; i < 7; i++) {
        await wm.addFocus({ content: `Item ${i}` });
      }

      const focus = await wm.getFocus();
      expect(focus.length).toBe(5);
    });

    it('should evict lowest priority items first', async () => {
      await wm.addFocus({ content: 'Low 1', priority: 'low' });
      await wm.addFocus({ content: 'High 1', priority: 'high' });
      await wm.addFocus({ content: 'Normal 1', priority: 'normal' });
      await wm.addFocus({ content: 'Normal 2', priority: 'normal' });
      await wm.addFocus({ content: 'Normal 3', priority: 'normal' });
      await wm.addFocus({ content: 'High 2', priority: 'high' });

      const focus = await wm.getFocus();
      expect(focus.length).toBe(5);

      // Low priority should be evicted
      expect(focus.find(f => f.content === 'Low 1')).toBeUndefined();
      // High priority should remain
      expect(focus.find(f => f.content === 'High 1')).toBeDefined();
      expect(focus.find(f => f.content === 'High 2')).toBeDefined();
    });

    it('should respect custom maxFocusItems', async () => {
      const customWm = new TestWorkingMemory({ maxFocusItems: 3 });
      await customWm.initialize();

      for (let i = 0; i < 5; i++) {
        await customWm.addFocus({ content: `Item ${i}` });
      }

      const focus = await customWm.getFocus();
      expect(focus.length).toBe(3);

      await customWm.close();
      await customWm.cleanup();
    });
  });

  describe('getFocus', () => {
    it('should return focus items sorted by priority then recency', async () => {
      await wm.addFocus({ content: 'Low', priority: 'low' });
      await wm.addFocus({ content: 'High', priority: 'high' });
      await wm.addFocus({ content: 'Normal', priority: 'normal' });

      const focus = await wm.getFocus();

      expect(focus[0].content).toBe('High');
      expect(focus[1].content).toBe('Normal');
      expect(focus[2].content).toBe('Low');
    });

    it('should exclude expired items', async () => {
      await wm.addFocus({ content: 'Permanent' });
      await wm.addFocus({ content: 'Expiring', ttlMs: 1 });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const focus = await wm.getFocus();
      expect(focus.length).toBe(1);
      expect(focus[0].content).toBe('Permanent');
    });
  });

  describe('getFocusContext', () => {
    it('should return formatted context string', async () => {
      await wm.addFocus({ content: 'Task 1', priority: 'high' });
      await wm.addFocus({ content: 'Task 2', priority: 'normal' });

      const context = await wm.getFocusContext();

      expect(context).toContain('## Current Focus');
      expect(context).toContain('[HIGH] Task 1');
      expect(context).toContain('Task 2');
    });

    it('should return empty string when no focus items', async () => {
      const context = await wm.getFocusContext();
      expect(context).toBe('');
    });
  });

  describe('removeFocus', () => {
    it('should remove a focus item by ID', async () => {
      const item = await wm.addFocus({ content: 'To remove' });
      expect((await wm.getFocus()).length).toBe(1);

      const removed = await wm.removeFocus(item.id);
      expect(removed).toBe(true);
      expect((await wm.getFocus()).length).toBe(0);
    });

    it('should return false for non-existent ID', async () => {
      const removed = await wm.removeFocus('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clearFocus', () => {
    it('should clear all focus items', async () => {
      await wm.addFocus({ content: 'Item 1' });
      await wm.addFocus({ content: 'Item 2' });
      await wm.addFocus({ content: 'Item 3' });

      const count = await wm.clearFocus();

      expect(count).toBe(3);
      expect((await wm.getFocus()).length).toBe(0);
    });
  });

  describe('scratchpad', () => {
    it('should set and get scratchpad', async () => {
      await wm.setScratchpad('My notes');
      const content = await wm.getScratchpad();
      expect(content).toBe('My notes');
    });

    it('should append to scratchpad', async () => {
      await wm.setScratchpad('Line 1');
      await wm.appendScratchpad('Line 2');

      const content = await wm.getScratchpad();
      expect(content).toBe('Line 1\nLine 2');
    });

    it('should clear scratchpad', async () => {
      await wm.setScratchpad('Notes');
      await wm.clearScratchpad();

      const content = await wm.getScratchpad();
      expect(content).toBe('');
    });

    it('should handle empty scratchpad append', async () => {
      await wm.appendScratchpad('First line');
      const content = await wm.getScratchpad();
      expect(content).toBe('First line');
    });
  });

  describe('getState', () => {
    it('should return full working memory state', async () => {
      await wm.addFocus({ content: 'Focus item' });
      await wm.setScratchpad('Notes');

      const state = await wm.getState();

      expect(state.focus.length).toBe(1);
      expect(state.scratchpad).toBe('Notes');
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('persistence', () => {
    it('should persist state when configured', async () => {
      const persistWm = new TestWorkingMemory({ persistSession: true });
      await persistWm.initialize();

      await persistWm.addFocus({ content: 'Persistent item' });
      await persistWm.setScratchpad('Persistent notes');
      await persistWm.close();

      // Create new instance pointing to same file
      const dataPath = (persistWm as any).dataPath;
      const persistWm2 = new WorkingMemory({ persistSession: true });
      (persistWm2 as any).dataPath = dataPath;
      await persistWm2.initialize();

      const focus = await persistWm2.getFocus();
      const scratchpad = await persistWm2.getScratchpad();

      expect(focus.length).toBe(1);
      expect(focus[0].content).toBe('Persistent item');
      expect(scratchpad).toBe('Persistent notes');

      await persistWm2.close();
      await persistWm.cleanup();
    });

    it('should not persist by default', async () => {
      await wm.addFocus({ content: 'Item' });

      // Check that file doesn't exist (since persistSession is false by default)
      const dataPath = (wm as any).dataPath;
      expect(fs.existsSync(dataPath)).toBe(false);
    });
  });

  describe('session tracking', () => {
    it('should track session ID', async () => {
      const persistWm = new TestWorkingMemory({ persistSession: true });
      await persistWm.initialize();

      await persistWm.setSessionId('session-123');
      const state = await persistWm.getState();

      expect(state.sessionId).toBe('session-123');

      await persistWm.close();
      await persistWm.cleanup();
    });
  });
});

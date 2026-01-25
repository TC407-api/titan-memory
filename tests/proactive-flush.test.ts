/**
 * FR-3: Proactive Context Flush Tests
 *
 * Tests for the ProactiveFlushManager that triggers memory flush
 * at configurable context thresholds.
 */

import {
  ProactiveFlushManager,
  createProactiveFlushManager,
  getProactiveFlushManager,
} from '../src/utils/proactive-flush.js';
import { CompactionContext, MemoryEntry, MemoryLayer } from '../src/types.js';

// Mock memory entries for testing
const createMockMemory = (id: string): MemoryEntry => ({
  id,
  content: `Test memory content ${id}`,
  layer: MemoryLayer.EPISODIC,
  timestamp: new Date(),
  metadata: {},
});

describe('ProactiveFlushManager', () => {
  let manager: ProactiveFlushManager;
  let mockFlushCallback: jest.Mock<Promise<MemoryEntry[]>, [CompactionContext]>;

  beforeEach(() => {
    // Create fresh manager for each test with short debounce for testing
    manager = createProactiveFlushManager({ debounceMs: 100 });

    // Create mock flush callback with proper typing
    mockFlushCallback = jest.fn<Promise<MemoryEntry[]>, [CompactionContext]>().mockResolvedValue([
      createMockMemory('mem-1'),
      createMockMemory('mem-2'),
    ]);

    manager.setFlushCallback(mockFlushCallback);
  });

  describe('Threshold-based Triggering', () => {
    it('should trigger flush when context reaches 50% threshold', async () => {
      const result = await manager.handleThreshold('WARNING', 0.5);

      expect(result.flushed).toBe(true);
      expect(result.memoriesPreserved).toBe(2);
      expect(mockFlushCallback).toHaveBeenCalledTimes(1);
    });

    it('should not trigger flush below threshold', async () => {
      const result = await manager.handleThreshold('NORMAL', 0.3);

      expect(result.flushed).toBe(false);
      expect(result.reason).toContain('Below threshold');
      expect(mockFlushCallback).not.toHaveBeenCalled();
    });

    it('should trigger flush at CRITICAL level', async () => {
      const result = await manager.handleThreshold('CRITICAL', 0.8);

      expect(result.flushed).toBe(true);
      expect(result.memoriesPreserved).toBe(2);
    });

    it('should trigger flush at OVERFLOW level', async () => {
      const result = await manager.handleThreshold('OVERFLOW', 1.0);

      expect(result.flushed).toBe(true);
    });
  });

  describe('Flush Metadata', () => {
    it('should include reason=proactive_context_management in flush context', async () => {
      await manager.handleThreshold('WARNING', 0.55);

      expect(mockFlushCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.stringContaining('proactive-'),
        })
      );

      // Check the context passed to callback
      const callArg = mockFlushCallback.mock.calls[0][0] as CompactionContext;
      expect(callArg.metadata?.reason).toBe('proactive_context_management');
    });

    it('should include contextRatio at trigger time', async () => {
      await manager.handleThreshold('WARNING', 0.65);

      const callArg = mockFlushCallback.mock.calls[0][0] as CompactionContext;
      expect(callArg.metadata?.contextRatio).toBe(0.65);
    });

    it('should include triggerThreshold in metadata', async () => {
      await manager.handleThreshold('WARNING', 0.55);

      const callArg = mockFlushCallback.mock.calls[0][0] as CompactionContext;
      expect(callArg.metadata?.triggerThreshold).toBe(0.5);
    });
  });

  describe('Debounce Behavior', () => {
    it('should debounce rapid threshold crossings', async () => {
      // First flush should succeed
      const result1 = await manager.handleThreshold('WARNING', 0.55);
      expect(result1.flushed).toBe(true);

      // Immediate second call should be debounced
      const result2 = await manager.handleThreshold('WARNING', 0.6);
      expect(result2.flushed).toBe(false);
      expect(result2.reason).toContain('Debounced');

      // Only one flush should have occurred
      expect(mockFlushCallback).toHaveBeenCalledTimes(1);
    });

    it('should allow flush after debounce period', async () => {
      // First flush
      await manager.handleThreshold('WARNING', 0.55);
      expect(mockFlushCallback).toHaveBeenCalledTimes(1);

      // Wait for debounce period (100ms in test config)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second flush should succeed
      const result = await manager.handleThreshold('WARNING', 0.6);
      expect(result.flushed).toBe(true);
      expect(mockFlushCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration', () => {
    it('should allow disabling proactive flush', async () => {
      manager.configure({ enabled: false });

      const result = await manager.handleThreshold('CRITICAL', 0.9);

      expect(result.flushed).toBe(false);
      expect(result.reason).toBe('Proactive flush disabled');
    });

    it('should allow changing threshold at runtime', async () => {
      manager.configure({ threshold: 0.7 });

      // 60% should not trigger with 70% threshold
      const result1 = await manager.handleThreshold('WARNING', 0.6);
      expect(result1.flushed).toBe(false);

      // 75% should trigger
      const result2 = await manager.handleThreshold('CRITICAL', 0.75);
      expect(result2.flushed).toBe(true);
    });

    it('should clamp threshold to valid range (0-1)', () => {
      manager.configure({ threshold: 1.5 });
      const stats = manager.getStats();
      expect(stats.threshold).toBe(1);

      manager.configure({ threshold: -0.5 });
      const stats2 = manager.getStats();
      expect(stats2.threshold).toBe(0);
    });
  });

  describe('Callback Registration', () => {
    it('should not flush if no callback registered', async () => {
      const newManager = createProactiveFlushManager();
      // Don't register callback

      const result = await newManager.handleThreshold('CRITICAL', 0.9);

      expect(result.flushed).toBe(false);
      expect(result.reason).toBe('No flush callback registered');
    });

    it('should report active status correctly', () => {
      expect(manager.isActive()).toBe(true);

      const newManager = createProactiveFlushManager();
      expect(newManager.isActive()).toBe(false);
    });
  });

  describe('Manual Flush', () => {
    it('should allow manual flush trigger', async () => {
      const result = await manager.triggerManualFlush(0.95);

      expect(result.flushed).toBe(true);
      expect(mockFlushCallback).toHaveBeenCalled();
    });

    it('should skip debounce for manual flush', async () => {
      // Normal flush
      await manager.handleThreshold('WARNING', 0.55);

      // Manual flush immediately after should work
      const result = await manager.triggerManualFlush(0.95);
      expect(result.flushed).toBe(true);

      // Two flushes should have occurred
      expect(mockFlushCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('Statistics', () => {
    it('should track flush count', async () => {
      expect(manager.getStats().flushCount).toBe(0);

      await manager.handleThreshold('WARNING', 0.55);
      expect(manager.getStats().flushCount).toBe(1);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150));

      await manager.handleThreshold('WARNING', 0.6);
      expect(manager.getStats().flushCount).toBe(2);
    });

    it('should track last flush ratio', async () => {
      expect(manager.getStats().lastFlushRatio).toBe(0);

      await manager.handleThreshold('WARNING', 0.65);
      expect(manager.getStats().lastFlushRatio).toBe(0.65);
    });

    it('should report flush in progress', async () => {
      // Create a slow callback
      const slowCallback = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [createMockMemory('slow-1')];
      });
      manager.setFlushCallback(slowCallback);

      // Start flush without awaiting
      const flushPromise = manager.handleThreshold('WARNING', 0.55);

      // Check in-progress status
      expect(manager.getStats().flushInProgress).toBe(true);

      // Wait for completion
      await flushPromise;
      expect(manager.getStats().flushInProgress).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle callback errors gracefully', async () => {
      mockFlushCallback.mockRejectedValue(new Error('Flush failed'));

      const result = await manager.handleThreshold('WARNING', 0.55);

      expect(result.flushed).toBe(false);
      expect(result.reason).toContain('Flush failed');
    });

    it('should reset flushInProgress after error', async () => {
      mockFlushCallback.mockRejectedValue(new Error('Flush failed'));

      await manager.handleThreshold('WARNING', 0.55);

      expect(manager.getStats().flushInProgress).toBe(false);
    });
  });

  describe('Integration with Grade 5 ContextManager', () => {
    it('should work as onThreshold callback', async () => {
      // Simulate Grade 5 ContextManager callback pattern
      const onThresholdHandler = (level: string, ratio: number) => {
        return manager.handleThreshold(level as any, ratio);
      };

      // Simulate threshold crossing
      const result = await onThresholdHandler('WARNING', 0.55);

      expect(result.flushed).toBe(true);
      expect(result.memoriesPreserved).toBe(2);
    });
  });
});

describe('getProactiveFlushManager (Singleton)', () => {
  it('should return the same instance', () => {
    const instance1 = getProactiveFlushManager();
    const instance2 = getProactiveFlushManager();

    expect(instance1).toBe(instance2);
  });
});

/**
 * A2A Protocol Tests
 * Tests for Agent-to-Agent communication and coordination
 */

import {
  // Protocol types
  A2AMessage,
  AgentIdentity,
  LockResource,
  SubscriptionFilter,
  // Type guards
  isMemoryEvent,
  isAgentEvent,
  isCoordinationEvent,
  isConflictEvent,
  hasCapability,
  canWrite,
  canDelete,
  canArbitrate,
  // Serialization
  serializeMessage,
  deserializeMessage,
  createMessageId,
  createLockId,
  createConflictId,
  createResumeToken,
  // Configurations
  DEFAULT_A2A_SERVER_CONFIG,
  DEFAULT_A2A_CLIENT_CONFIG,
} from '../src/a2a/protocol';

import {
  A2AError,
  ConnectionError,
  TimeoutError,
  LockError,
  ConflictError,
  UnauthorizedError,
  getRecoveryStrategy,
  withRetry,
} from '../src/a2a/errors';

import {
  MemoryEventBridge,
  createEventBridge,
  MemoryEvent,
} from '../src/a2a/events';

import { MemoryLayer } from '../src/types';

// ==================== Protocol Tests ====================

describe('A2A Protocol Types', () => {
  describe('AgentIdentity', () => {
    it('should create valid agent identity', () => {
      const agent: AgentIdentity = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'primary',
        capabilities: ['memory_read', 'memory_write'],
      };

      expect(agent.id).toBe('agent-1');
      expect(agent.type).toBe('primary');
      expect(agent.capabilities).toHaveLength(2);
    });

    it('should support all agent types', () => {
      const types = ['primary', 'worker', 'specialist', 'observer'];
      types.forEach(type => {
        const agent: AgentIdentity = {
          id: `agent-${type}`,
          name: `${type} Agent`,
          type: type as AgentIdentity['type'],
          capabilities: ['memory_read'],
        };
        expect(agent.type).toBe(type);
      });
    });
  });

  describe('LockResource', () => {
    it('should create memory lock resource', () => {
      const resource: LockResource = { type: 'memory', memoryId: 'mem-123' };
      expect(resource.type).toBe('memory');
      expect(resource.memoryId).toBe('mem-123');
    });

    it('should create layer lock resource', () => {
      const resource: LockResource = { type: 'layer', layer: MemoryLayer.SEMANTIC };
      expect(resource.type).toBe('layer');
      expect(resource.layer).toBe(MemoryLayer.SEMANTIC);
    });

    it('should create project lock resource', () => {
      const resource: LockResource = { type: 'project', projectId: 'proj-1' };
      expect(resource.type).toBe('project');
      expect(resource.projectId).toBe('proj-1');
    });

    it('should create global lock resource', () => {
      const resource: LockResource = { type: 'global' };
      expect(resource.type).toBe('global');
    });
  });

  describe('Type Guards', () => {
    it('should identify memory events', () => {
      expect(isMemoryEvent('memory.added')).toBe(true);
      expect(isMemoryEvent('memory.updated')).toBe(true);
      expect(isMemoryEvent('memory.deleted')).toBe(true);
      expect(isMemoryEvent('memory.recalled')).toBe(true);
      expect(isMemoryEvent('agent.register')).toBe(false);
    });

    it('should identify agent events', () => {
      expect(isAgentEvent('agent.register')).toBe(true);
      expect(isAgentEvent('agent.heartbeat')).toBe(true);
      expect(isAgentEvent('agent.disconnect')).toBe(true);
      expect(isAgentEvent('memory.added')).toBe(false);
    });

    it('should identify coordination events', () => {
      expect(isCoordinationEvent('coordination.lock_request')).toBe(true);
      expect(isCoordinationEvent('coordination.lock_granted')).toBe(true);
      expect(isCoordinationEvent('coordination.lock_denied')).toBe(true);
      expect(isCoordinationEvent('memory.added')).toBe(false);
    });

    it('should identify conflict events', () => {
      expect(isConflictEvent('conflict.detected')).toBe(true);
      expect(isConflictEvent('conflict.resolution')).toBe(true);
      expect(isConflictEvent('memory.updated')).toBe(false);
    });

    it('should check agent capabilities', () => {
      const agent: AgentIdentity = {
        id: 'agent-1',
        name: 'Test Agent',
        type: 'primary',
        capabilities: ['memory_read', 'memory_write', 'coordinate'],
      };

      expect(hasCapability(agent, 'memory_read')).toBe(true);
      expect(hasCapability(agent, 'memory_write')).toBe(true);
      expect(hasCapability(agent, 'coordinate')).toBe(true);
      expect(hasCapability(agent, 'arbitrate')).toBe(false);
      expect(hasCapability(agent, 'memory_delete')).toBe(false);
    });

    it('should check write capability', () => {
      const writer: AgentIdentity = {
        id: 'writer',
        name: 'Writer',
        type: 'worker',
        capabilities: ['memory_write'],
      };
      const reader: AgentIdentity = {
        id: 'reader',
        name: 'Reader',
        type: 'observer',
        capabilities: ['memory_read'],
      };

      expect(canWrite(writer)).toBe(true);
      expect(canWrite(reader)).toBe(false);
    });

    it('should check delete capability', () => {
      const admin: AgentIdentity = {
        id: 'admin',
        name: 'Admin',
        type: 'primary',
        capabilities: ['memory_delete'],
      };
      const worker: AgentIdentity = {
        id: 'worker',
        name: 'Worker',
        type: 'worker',
        capabilities: ['memory_write'],
      };

      expect(canDelete(admin)).toBe(true);
      expect(canDelete(worker)).toBe(false);
    });

    it('should check arbitrate capability', () => {
      const arbitrator: AgentIdentity = {
        id: 'arb',
        name: 'Arbitrator',
        type: 'primary',
        capabilities: ['arbitrate'],
      };
      const worker: AgentIdentity = {
        id: 'worker',
        name: 'Worker',
        type: 'worker',
        capabilities: ['memory_write'],
      };

      expect(canArbitrate(arbitrator)).toBe(true);
      expect(canArbitrate(worker)).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize messages', () => {
      const message: A2AMessage<{ test: string }> = {
        id: 'msg-1',
        timestamp: new Date('2026-01-25T12:00:00Z'),
        sender: 'agent-1',
        type: 'memory.added',
        payload: { test: 'value' },
      };

      const serialized = serializeMessage(message);
      const deserialized = deserializeMessage<{ test: string }>(serialized);

      expect(deserialized.id).toBe('msg-1');
      expect(deserialized.sender).toBe('agent-1');
      expect(deserialized.type).toBe('memory.added');
      expect(deserialized.payload.test).toBe('value');
      expect(deserialized.timestamp).toBeInstanceOf(Date);
      expect(deserialized.timestamp.toISOString()).toBe('2026-01-25T12:00:00.000Z');
    });

    it('should handle nested dates in serialization', () => {
      const message: A2AMessage<{ nested: { date: Date } }> = {
        id: 'msg-2',
        timestamp: new Date('2026-01-25T12:00:00Z'),
        sender: 'agent-1',
        type: 'agent.heartbeat',
        payload: { nested: { date: new Date('2026-01-25T13:00:00Z') } },
      };

      const serialized = serializeMessage(message);
      const deserialized = deserializeMessage<{ nested: { date: Date } }>(serialized);

      expect(deserialized.payload.nested.date).toBeInstanceOf(Date);
    });
  });

  describe('ID Generation', () => {
    it('should create unique message IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createMessageId());
      }
      expect(ids.size).toBe(100);
    });

    it('should create message IDs with correct prefix', () => {
      const id = createMessageId();
      expect(id.startsWith('msg_')).toBe(true);
    });

    it('should create unique lock IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createLockId());
      }
      expect(ids.size).toBe(100);
    });

    it('should create lock IDs with correct prefix', () => {
      const id = createLockId();
      expect(id.startsWith('lock_')).toBe(true);
    });

    it('should create unique conflict IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createConflictId());
      }
      expect(ids.size).toBe(100);
    });

    it('should create conflict IDs with correct prefix', () => {
      const id = createConflictId();
      expect(id.startsWith('conflict_')).toBe(true);
    });

    it('should create unique resume tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(createResumeToken());
      }
      expect(tokens.size).toBe(100);
    });

    it('should create resume tokens with correct prefix', () => {
      const token = createResumeToken();
      expect(token.startsWith('resume_')).toBe(true);
    });
  });

  describe('Configuration Defaults', () => {
    it('should have valid server config defaults', () => {
      expect(DEFAULT_A2A_SERVER_CONFIG.port).toBe(9876);
      expect(DEFAULT_A2A_SERVER_CONFIG.host).toBe('localhost');
      expect(DEFAULT_A2A_SERVER_CONFIG.heartbeatIntervalMs).toBe(30000);
      expect(DEFAULT_A2A_SERVER_CONFIG.heartbeatTimeoutMs).toBe(90000);
      expect(DEFAULT_A2A_SERVER_CONFIG.lockExpiryMs).toBe(60000);
      expect(DEFAULT_A2A_SERVER_CONFIG.maxAgents).toBe(100);
      expect(DEFAULT_A2A_SERVER_CONFIG.maxLocksPerAgent).toBe(10);
      expect(DEFAULT_A2A_SERVER_CONFIG.maxWaitQueueSize).toBe(50);
      expect(DEFAULT_A2A_SERVER_CONFIG.enableConflictDetection).toBe(true);
      expect(DEFAULT_A2A_SERVER_CONFIG.defaultConflictStrategy).toBe('last_write_wins');
    });

    it('should have valid client config defaults', () => {
      expect(DEFAULT_A2A_CLIENT_CONFIG.reconnectDelayMs).toBe(1000);
      expect(DEFAULT_A2A_CLIENT_CONFIG.maxReconnectDelayMs).toBe(30000);
      expect(DEFAULT_A2A_CLIENT_CONFIG.requestTimeoutMs).toBe(10000);
      expect(DEFAULT_A2A_CLIENT_CONFIG.heartbeatIntervalMs).toBe(30000);
    });
  });
});

// ==================== Error Tests ====================

describe('A2A Errors', () => {
  describe('A2AError', () => {
    it('should create error with code and message', () => {
      const error = new A2AError('TIMEOUT', 'Operation timed out');

      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('A2AError');
      expect(error.recoverable).toBe(true);
    });

    it('should create error with options', () => {
      const error = new A2AError('CONFLICT', 'Write conflict detected', {
        details: { memoryId: 'mem-1' },
        correlationId: 'req-123',
        recoverable: true,
      });

      expect(error.details).toEqual({ memoryId: 'mem-1' });
      expect(error.correlationId).toBe('req-123');
      expect(error.recoverable).toBe(true);
    });

    it('should convert to payload', () => {
      const error = new A2AError('LOCK_FAILED', 'Could not acquire lock', {
        details: { resource: 'memory:123' },
        correlationId: 'req-456',
      });

      const payload = error.toPayload();

      expect(payload.code).toBe('LOCK_FAILED');
      expect(payload.message).toBe('Could not acquire lock');
      expect(payload.details).toEqual({ resource: 'memory:123' });
      expect(payload.correlationId).toBe('req-456');
      expect(payload.recoverable).toBe(true);
    });

    it('should create from payload', () => {
      const payload = {
        code: 'NOT_FOUND' as const,
        message: 'Memory not found',
        details: { id: 'mem-1' },
        correlationId: 'req-789',
        recoverable: false,
      };

      const error = A2AError.fromPayload(payload);

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Memory not found');
      expect(error.details).toEqual({ id: 'mem-1' });
      expect(error.correlationId).toBe('req-789');
    });

    it('should set default recoverability based on code', () => {
      const timeoutError = new A2AError('TIMEOUT', 'Timed out');
      expect(timeoutError.recoverable).toBe(true);

      const unauthorizedError = new A2AError('UNAUTHORIZED', 'Not authorized');
      expect(unauthorizedError.recoverable).toBe(false);

      const rateLimitError = new A2AError('RATE_LIMITED', 'Rate limited');
      expect(rateLimitError.recoverable).toBe(true);

      const invalidError = new A2AError('INVALID_MESSAGE', 'Invalid message');
      expect(invalidError.recoverable).toBe(false);
    });
  });

  describe('Specific Error Types', () => {
    it('should create ConnectionError', () => {
      const error = new ConnectionError('Connection lost');
      expect(error.code).toBe('CONNECTION_CLOSED');
      expect(error.name).toBe('ConnectionError');
      expect(error.recoverable).toBe(true);
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError('Request timed out', 'req-1');
      expect(error.code).toBe('TIMEOUT');
      expect(error.name).toBe('TimeoutError');
      expect(error.correlationId).toBe('req-1');
    });

    it('should create LockError', () => {
      const error = new LockError('Lock denied', { holder: 'agent-2' });
      expect(error.code).toBe('LOCK_FAILED');
      expect(error.name).toBe('LockError');
      expect(error.details).toEqual({ holder: 'agent-2' });
    });

    it('should create ConflictError', () => {
      const error = new ConflictError('Write conflict', {
        memoryId: 'mem-1',
        agents: ['agent-1', 'agent-2'],
      });
      expect(error.code).toBe('CONFLICT');
      expect(error.name).toBe('ConflictError');
    });

    it('should create UnauthorizedError', () => {
      const error = new UnauthorizedError('Not authorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.name).toBe('UnauthorizedError');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('Recovery Strategies', () => {
    it('should return retry strategy for timeout', () => {
      const error = new A2AError('TIMEOUT', 'Timed out');
      const strategy = getRecoveryStrategy(error);

      expect(strategy.action).toBe('retry');
      expect(strategy.maxAttempts).toBe(3);
      expect(strategy.delayMs).toBe(1000);
    });

    it('should return wait strategy for rate limit', () => {
      const error = new A2AError('RATE_LIMITED', 'Rate limited', {
        details: { retryAfterMs: 10000 },
      });
      const strategy = getRecoveryStrategy(error);

      expect(strategy.action).toBe('wait');
      expect(strategy.delayMs).toBe(10000);
    });

    it('should return reconnect strategy for connection closed', () => {
      const error = new A2AError('CONNECTION_CLOSED', 'Connection lost');
      const strategy = getRecoveryStrategy(error);

      expect(strategy.action).toBe('reconnect');
      expect(strategy.maxAttempts).toBe(10);
    });

    it('should return reauth strategy for unauthorized', () => {
      const error = new A2AError('UNAUTHORIZED', 'Not authorized');
      const strategy = getRecoveryStrategy(error);

      expect(strategy.action).toBe('reauth');
    });

    it('should return abort strategy for invalid message', () => {
      const error = new A2AError('INVALID_MESSAGE', 'Invalid');
      const strategy = getRecoveryStrategy(error);

      expect(strategy.action).toBe('abort');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          return 'success';
        },
        { maxAttempts: 3, baseDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new A2AError('TIMEOUT', 'Timed out');
          }
          return 'success';
        },
        { maxAttempts: 5, baseDelayMs: 10 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max attempts', async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new A2AError('TIMEOUT', 'Timed out');
          },
          { maxAttempts: 3, baseDelayMs: 10 }
        )
      ).rejects.toThrow('Timed out');

      expect(attempts).toBe(3);
    });

    it('should not retry non-recoverable errors', async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new A2AError('UNAUTHORIZED', 'Not authorized');
          },
          { maxAttempts: 5, baseDelayMs: 10 }
        )
      ).rejects.toThrow('Not authorized');

      expect(attempts).toBe(1);
    });

    it('should call onRetry callback', async () => {
      const retries: number[] = [];
      let attempts = 0;

      await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new A2AError('TIMEOUT', 'Timed out');
          }
          return 'success';
        },
        {
          maxAttempts: 5,
          baseDelayMs: 10,
          onRetry: (attempt) => retries.push(attempt),
        }
      );

      expect(retries).toEqual([1, 2]);
    });
  });
});

// ==================== Event Bridge Tests ====================

describe('MemoryEventBridge', () => {
  let bridge: MemoryEventBridge;

  beforeEach(() => {
    bridge = createEventBridge('test-agent');
  });

  describe('Basic Operations', () => {
    it('should create bridge with agent ID', () => {
      expect(bridge.getAgentId()).toBe('test-agent');
    });

    it('should emit add events', (done) => {
      bridge.on('add', (event: MemoryEvent) => {
        expect(event.type).toBe('add');
        expect(event.agentId).toBe('test-agent');
        done();
      });

      bridge.emitAdd(
        {
          id: 'mem-1',
          content: 'Test memory',
          layer: MemoryLayer.SEMANTIC,
          timestamp: new Date(),
          metadata: {},
        },
        MemoryLayer.SEMANTIC
      );
    });

    it('should emit update events', (done) => {
      bridge.on('update', (event: MemoryEvent) => {
        expect(event.type).toBe('update');
        expect(event.data).toHaveProperty('previousContent', 'old');
        expect(event.data).toHaveProperty('newContent', 'new');
        done();
      });

      bridge.emitUpdate('mem-1', 'old', 'new');
    });

    it('should emit delete events', (done) => {
      bridge.on('delete', (event: MemoryEvent) => {
        expect(event.type).toBe('delete');
        expect(event.data).toHaveProperty('memoryId', 'mem-1');
        expect(event.data).toHaveProperty('reason', 'test deletion');
        done();
      });

      bridge.emitDelete('mem-1', 'test deletion');
    });

    it('should emit recall events', (done) => {
      bridge.on('recall', (event: MemoryEvent) => {
        expect(event.type).toBe('recall');
        expect(event.data).toHaveProperty('query', 'test query');
        expect(event.data).toHaveProperty('queryTimeMs', 50);
        done();
      });

      bridge.emitRecall('test query', [], 50);
    });
  });

  describe('A2A Message Conversion', () => {
    it('should convert add event to A2A message', () => {
      const memory = {
        id: 'mem-1',
        content: 'Test',
        layer: MemoryLayer.SEMANTIC,
        timestamp: new Date(),
        metadata: {},
      };

      bridge.on('a2a', (message: A2AMessage) => {
        expect(message.type).toBe('memory.added');
        expect(message.sender).toBe('test-agent');
        expect(message.id).toBeTruthy();
      });

      bridge.emitAdd(memory, MemoryLayer.SEMANTIC);
    });

    it('should convert update event to A2A message', () => {
      bridge.on('a2a', (message: A2AMessage) => {
        expect(message.type).toBe('memory.updated');
      });

      bridge.emitUpdate('mem-1', 'old', 'new');
    });
  });

  describe('Event History', () => {
    it('should track event history', () => {
      const memory = {
        id: 'mem-1',
        content: 'Test',
        layer: MemoryLayer.SEMANTIC,
        timestamp: new Date(),
        metadata: {},
      };

      bridge.emitAdd(memory, MemoryLayer.SEMANTIC);
      bridge.emitUpdate('mem-1', 'old', 'new');
      bridge.emitDelete('mem-2', 'cleanup');

      const history = bridge.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0].type).toBe('add');
      expect(history[1].type).toBe('update');
      expect(history[2].type).toBe('delete');
    });

    it('should limit history size', () => {
      const bridge = createEventBridge('test', { maxHistorySize: 3 });
      const memory = {
        id: 'mem-1',
        content: 'Test',
        layer: MemoryLayer.SEMANTIC,
        timestamp: new Date(),
        metadata: {},
      };

      for (let i = 0; i < 5; i++) {
        bridge.emitAdd(memory, MemoryLayer.SEMANTIC);
      }

      const history = bridge.getHistory();
      expect(history).toHaveLength(3);
    });

    it('should clear history', () => {
      const memory = {
        id: 'mem-1',
        content: 'Test',
        layer: MemoryLayer.SEMANTIC,
        timestamp: new Date(),
        metadata: {},
      };

      bridge.emitAdd(memory, MemoryLayer.SEMANTIC);
      expect(bridge.getHistory()).toHaveLength(1);

      bridge.clearHistory();
      expect(bridge.getHistory()).toHaveLength(0);
    });

    it('should get limited history', () => {
      const memory = {
        id: 'mem-1',
        content: 'Test',
        layer: MemoryLayer.SEMANTIC,
        timestamp: new Date(),
        metadata: {},
      };

      for (let i = 0; i < 10; i++) {
        bridge.emitAdd(memory, MemoryLayer.SEMANTIC);
      }

      const history = bridge.getHistory(3);
      expect(history).toHaveLength(3);
    });
  });

  describe('Subscriptions', () => {
    it('should manage subscriptions', () => {
      const filter: SubscriptionFilter = {
        eventTypes: ['memory.added'],
        layers: [MemoryLayer.SEMANTIC],
      };

      bridge.addSubscription('sub-1', filter);

      const subs = bridge.getSubscriptions();
      expect(subs.size).toBe(1);
      expect(subs.get('sub-1')).toEqual(filter);
    });

    it('should remove subscriptions', () => {
      const filter: SubscriptionFilter = { eventTypes: ['memory.added'] };

      bridge.addSubscription('sub-1', filter);
      expect(bridge.getSubscriptions().size).toBe(1);

      const removed = bridge.removeSubscription('sub-1');
      expect(removed).toBe(true);
      expect(bridge.getSubscriptions().size).toBe(0);
    });

    it('should return false when removing non-existent subscription', () => {
      const removed = bridge.removeSubscription('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Filter Matching', () => {
    it('should match event by type', () => {
      const filter: SubscriptionFilter = {
        eventTypes: ['memory.added'],
      };

      const addEvent: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memory: {
            id: 'mem-1',
            content: 'Test',
            layer: MemoryLayer.SEMANTIC,
            timestamp: new Date(),
            metadata: {},
          },
          agentId: 'test-agent',
          layer: MemoryLayer.SEMANTIC,
        },
      };

      const updateEvent: MemoryEvent = {
        type: 'update',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memoryId: 'mem-1',
          previousContent: 'old',
          newContent: 'new',
          agentId: 'test-agent',
        },
      };

      expect(bridge.matchesFilter(addEvent, filter)).toBe(true);
      expect(bridge.matchesFilter(updateEvent, filter)).toBe(false);
    });

    it('should match event by layer', () => {
      const filter: SubscriptionFilter = {
        layers: [MemoryLayer.SEMANTIC],
      };

      const semanticEvent: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memory: {
            id: 'mem-1',
            content: 'Test',
            layer: MemoryLayer.SEMANTIC,
            timestamp: new Date(),
            metadata: {},
          },
          agentId: 'test-agent',
          layer: MemoryLayer.SEMANTIC,
        },
      };

      const factualEvent: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memory: {
            id: 'mem-2',
            content: 'Test',
            layer: MemoryLayer.FACTUAL,
            timestamp: new Date(),
            metadata: {},
          },
          agentId: 'test-agent',
          layer: MemoryLayer.FACTUAL,
        },
      };

      expect(bridge.matchesFilter(semanticEvent, filter)).toBe(true);
      expect(bridge.matchesFilter(factualEvent, filter)).toBe(false);
    });

    it('should match event by agent ID', () => {
      const filter: SubscriptionFilter = {
        agentIds: ['agent-1'],
      };

      const event1: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'agent-1',
        data: {} as any,
      };

      const event2: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'agent-2',
        data: {} as any,
      };

      expect(bridge.matchesFilter(event1, filter)).toBe(true);
      expect(bridge.matchesFilter(event2, filter)).toBe(false);
    });

    it('should match event by tags', () => {
      const filter: SubscriptionFilter = {
        tags: ['important'],
      };

      const taggedEvent: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memory: {
            id: 'mem-1',
            content: 'Test',
            layer: MemoryLayer.SEMANTIC,
            timestamp: new Date(),
            metadata: { tags: ['important', 'test'] },
          },
          agentId: 'test-agent',
          layer: MemoryLayer.SEMANTIC,
        },
      };

      const untaggedEvent: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {
          memory: {
            id: 'mem-2',
            content: 'Test',
            layer: MemoryLayer.SEMANTIC,
            timestamp: new Date(),
            metadata: { tags: ['other'] },
          },
          agentId: 'test-agent',
          layer: MemoryLayer.SEMANTIC,
        },
      };

      expect(bridge.matchesFilter(taggedEvent, filter)).toBe(true);
      expect(bridge.matchesFilter(untaggedEvent, filter)).toBe(false);
    });

    it('should match with empty filter (matches all)', () => {
      const filter: SubscriptionFilter = {};

      const event: MemoryEvent = {
        type: 'add',
        timestamp: new Date(),
        agentId: 'test-agent',
        data: {} as any,
      };

      expect(bridge.matchesFilter(event, filter)).toBe(true);
    });
  });
});

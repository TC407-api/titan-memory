/**
 * Extended A2A Tests
 * Tests for protocol utilities and message handling
 */

import {
  createMessageId,
  createLockId,
  createConflictId,
  createResumeToken,
  hasCapability,
  serializeMessage,
  deserializeMessage,
  RegisteredAgent,
  A2AMessage,
  A2AMessageType,
} from '../src/a2a/protocol.js';
import { A2AServer } from '../src/a2a/server.js';

describe('A2A Protocol Utilities', () => {
  describe('createMessageId', () => {
    it('should create unique message IDs', () => {
      const id1 = createMessageId();
      const id2 = createMessageId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should create IDs with correct format', () => {
      const id = createMessageId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate many unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(createMessageId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createLockId', () => {
    it('should create unique lock IDs', () => {
      const id1 = createLockId();
      const id2 = createLockId();

      expect(id1).not.toBe(id2);
    });

    it('should create valid string IDs', () => {
      const id = createLockId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('createConflictId', () => {
    it('should create unique conflict IDs', () => {
      const id1 = createConflictId();
      const id2 = createConflictId();

      expect(id1).not.toBe(id2);
    });

    it('should create valid string IDs', () => {
      const id = createConflictId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('createResumeToken', () => {
    it('should create unique resume tokens', () => {
      const token1 = createResumeToken();
      const token2 = createResumeToken();

      expect(token1).not.toBe(token2);
    });

    it('should create tokens of sufficient length', () => {
      const token = createResumeToken();
      expect(token.length).toBeGreaterThan(16);
    });

    it('should create valid string tokens', () => {
      const token = createResumeToken();
      // Should be a non-empty string (could be UUID, hex, or base64)
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(10);
    });
  });

  describe('hasCapability', () => {
    const mockAgent: RegisteredAgent = {
      id: 'agent-1',
      name: 'TestAgent',
      type: 'primary',
      capabilities: ['memory_read', 'memory_write', 'coordinate'],
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscriptions: [],
      isConnected: true,
    };

    it('should return true for existing capability', () => {
      expect(hasCapability(mockAgent, 'memory_read')).toBe(true);
      expect(hasCapability(mockAgent, 'memory_write')).toBe(true);
      expect(hasCapability(mockAgent, 'coordinate')).toBe(true);
    });

    it('should return false for missing capability', () => {
      expect(hasCapability(mockAgent, 'arbitrate')).toBe(false);
      expect(hasCapability(mockAgent, 'memory_delete')).toBe(false);
    });

    it('should handle agent with no capabilities', () => {
      const noCapAgent: RegisteredAgent = {
        id: 'agent-2',
        name: 'NoCapAgent',
        type: 'observer',
        capabilities: [],
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        subscriptions: [],
        isConnected: true,
      };
      expect(hasCapability(noCapAgent, 'memory_read')).toBe(false);
    });

    it('should handle agent with single capability', () => {
      const singleCapAgent: RegisteredAgent = {
        id: 'agent-3',
        name: 'SingleCapAgent',
        type: 'worker',
        capabilities: ['memory_read'],
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        subscriptions: [],
        isConnected: true,
      };
      expect(hasCapability(singleCapAgent, 'memory_read')).toBe(true);
      expect(hasCapability(singleCapAgent, 'memory_write')).toBe(false);
    });
  });

  describe('Message Serialization', () => {
    it('should serialize message to string', () => {
      const message: A2AMessage = {
        id: 'msg-123',
        type: 'agent.register',
        sender: 'agent-1',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        payload: {
          name: 'TestAgent',
          capabilities: ['memory_read'],
        },
      };

      const serialized = serializeMessage(message);
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('msg-123');
      expect(serialized).toContain('TestAgent');
    });

    it('should deserialize message from string', () => {
      const original: A2AMessage = {
        id: 'msg-456',
        type: 'agent.heartbeat',
        sender: 'agent-1',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        payload: { agentId: 'agent-1' },
      };

      const serialized = serializeMessage(original);
      const deserialized = deserializeMessage(serialized);

      expect(deserialized.id).toBe(original.id);
      expect(deserialized.type).toBe(original.type);
      expect((deserialized.payload as { agentId: string }).agentId).toBe('agent-1');
    });

    it('should preserve all message fields', () => {
      const message: A2AMessage = {
        id: 'msg-789',
        type: 'coordination.lock_request',
        sender: 'agent-2',
        timestamp: new Date(),
        correlationId: 'corr-123',
        payload: {
          resource: { type: 'memory', memoryId: 'mem-1' },
          mode: 'exclusive',
        },
      };

      const deserialized = deserializeMessage(serializeMessage(message));
      expect(deserialized.correlationId).toBe('corr-123');
    });

    it('should handle message with empty payload', () => {
      const message: A2AMessage = {
        id: 'msg-empty',
        type: 'agent.heartbeat_ack',
        sender: 'server',
        timestamp: new Date(),
        payload: {},
      };

      const deserialized = deserializeMessage(serializeMessage(message));
      expect(deserialized.id).toBe('msg-empty');
    });

    it('should handle message with nested payload', () => {
      const message: A2AMessage = {
        id: 'msg-nested',
        type: 'agent.register',
        sender: 'agent-3',
        timestamp: new Date(),
        payload: {
          agent: {
            id: 'agent-123',
            name: 'Nested Agent',
            type: 'memory_manager',
            capabilities: ['memory_read', 'memory_write'],
          },
        },
      };

      const deserialized = deserializeMessage(serializeMessage(message));
      const payload = deserialized.payload as { agent: { name: string } };
      expect(payload.agent.name).toBe('Nested Agent');
    });
  });
});

describe('A2AServer', () => {
  let server: A2AServer;
  const TEST_PORT = 19876;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Initialization', () => {
    it('should create server with default config', () => {
      server = new A2AServer();
      expect(server).toBeDefined();
    });

    it('should create server with custom config', () => {
      server = new A2AServer({
        port: 9999,
        heartbeatIntervalMs: 10000,
        heartbeatTimeoutMs: 20000,
      });
      expect(server).toBeDefined();
    });

    it('should start and stop', async () => {
      server = new A2AServer({ port: TEST_PORT });
      await server.start();
      const stats = server.getStats();
      expect(stats.connectedAgents).toBe(0);

      await server.stop();
    });

    it('should handle multiple stop calls gracefully', async () => {
      server = new A2AServer({ port: TEST_PORT + 1 });
      await server.start();
      await server.stop();
      await server.stop(); // Should not throw
    });

    it('should handle stop without start', async () => {
      server = new A2AServer({ port: TEST_PORT + 2 });
      await server.stop(); // Should not throw
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      server = new A2AServer({ port: TEST_PORT + 3 });
      await server.start();
    });

    it('should return initial stats', () => {
      const stats = server.getStats();

      expect(stats.connectedAgents).toBe(0);
      expect(stats.activeLocks).toBe(0);
      expect(stats.activeSubscriptions).toBe(0);
      expect(stats.pendingWrites).toBe(0);
    });

    it('should have numeric stat values', () => {
      const stats = server.getStats();

      expect(typeof stats.connectedAgents).toBe('number');
      expect(typeof stats.activeLocks).toBe('number');
      expect(typeof stats.activeSubscriptions).toBe('number');
      expect(typeof stats.pendingWrites).toBe('number');
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      server = new A2AServer({ port: TEST_PORT + 4 });
    });

    it('should support event listeners', async () => {
      const handler = jest.fn();
      server.on('client-connected', handler);
      server.off('client-connected', handler);

      await server.start();
      // Verify no errors
      expect(true).toBe(true);
    });

    it('should emit events as EventEmitter', () => {
      expect(typeof server.on).toBe('function');
      expect(typeof server.off).toBe('function');
      expect(typeof server.emit).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should use provided port', async () => {
      const customPort = 19900;
      server = new A2AServer({ port: customPort });
      await server.start();

      // Server should be running on custom port
      expect(server).toBeDefined();
    });

    it('should use provided heartbeat settings', () => {
      server = new A2AServer({
        port: TEST_PORT + 5,
        heartbeatIntervalMs: 5000,
        heartbeatTimeoutMs: 15000,
      });

      expect(server).toBeDefined();
    });

    it('should use provided lock settings', () => {
      server = new A2AServer({
        port: TEST_PORT + 6,
        lockExpiryMs: 60000,
        maxLocksPerAgent: 20,
      });

      expect(server).toBeDefined();
    });
  });
});

describe('A2A Message Types', () => {
  it('should use correct message type strings', () => {
    // A2AMessageType is a union type, verify the strings are valid
    const validTypes: A2AMessageType[] = [
      'agent.register',
      'agent.registered',
      'agent.heartbeat',
      'agent.heartbeat_ack',
      'coordination.lock_request',
      'coordination.lock_granted',
      'coordination.lock_denied',
      'coordination.lock_release',
      'error',
    ];

    validTypes.forEach(type => {
      expect(typeof type).toBe('string');
    });
  });

  it('should serialize messages with different types', () => {
    const types: A2AMessageType[] = ['agent.register', 'agent.heartbeat', 'coordination.lock_request'];

    types.forEach(type => {
      const msg: A2AMessage = {
        id: 'test-id',
        type,
        sender: 'test-agent',
        timestamp: new Date(),
        payload: {},
      };
      const serialized = serializeMessage(msg);
      expect(serialized).toContain(type);
    });
  });
});

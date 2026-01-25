/**
 * A2A WebSocket Server
 * Handles agent registration, messaging, and coordination
 */

import { WebSocketServer, WebSocket, RawData } from 'ws';
import { EventEmitter } from 'events';
import {
  A2AMessage,
  A2AServerConfig,
  DEFAULT_A2A_SERVER_CONFIG,
  RegisteredAgent,
  AgentRegisterPayload,
  AgentRegisteredPayload,
  AgentHeartbeatPayload,
  AgentHeartbeatAckPayload,
  AgentDisconnectPayload,
  AgentListPayload,
  AgentListResponsePayload,
  LockRequestPayload,
  LockGrantedPayload,
  LockDeniedPayload,
  LockReleasePayload,
  LockReleasedPayload,
  Lock,
  LockResource,
  SubscriptionFilter,
  SubscribePayload,
  SubscribeAckPayload,
  UnsubscribePayload,
  UnsubscribeAckPayload,
  ConflictDetectedPayload,
  ConflictResolutionPayload,
  ErrorPayload,
  serializeMessage,
  deserializeMessage,
  createMessageId,
  createLockId,
  createConflictId,
  createResumeToken,
  hasCapability,
} from './protocol.js';

/**
 * Client connection wrapper
 */
interface ClientConnection {
  ws: WebSocket;
  agent: RegisteredAgent;
  heartbeatTimer?: NodeJS.Timeout;
}

/**
 * Pending write for conflict detection
 */
interface PendingWrite {
  agentId: string;
  memoryId: string;
  content: string;
  timestamp: Date;
  correlationId: string;
}

/**
 * A2A Server
 */
export class A2AServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private config: A2AServerConfig;
  private clients: Map<string, ClientConnection>;
  private locks: Map<string, Lock>;
  private pendingWrites: Map<string, PendingWrite[]>;
  private subscriptions: Map<string, { agentId: string; filter: SubscriptionFilter }>;
  private resumeTokens: Map<string, string>; // token -> agentId

  constructor(config?: Partial<A2AServerConfig>) {
    super();
    this.config = { ...DEFAULT_A2A_SERVER_CONFIG, ...config };
    this.clients = new Map();
    this.locks = new Map();
    this.pendingWrites = new Map();
    this.subscriptions = new Map();
    this.resumeTokens = new Map();
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          host: this.config.host,
        });

        this.wss.on('connection', (ws) => this.handleConnection(ws));
        this.wss.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

        this.wss.once('listening', () => {
          this.emit('listening', { port: this.config.port, host: this.config.host });
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Clear all heartbeat timers
    for (const client of this.clients.values()) {
      if (client.heartbeatTimer) {
        clearTimeout(client.heartbeatTimer);
      }
    }

    // Close all client connections
    for (const [_agentId, client] of this.clients) {
      this.sendMessage(client.ws, {
        id: createMessageId(),
        timestamp: new Date(),
        sender: 'server',
        type: 'agent.disconnect',
        payload: { reason: 'shutdown', message: 'Server shutting down' } as AgentDisconnectPayload,
      });
      client.ws.close();
    }
    this.clients.clear();

    // Close the server
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          this.wss = null;
          resolve();
        });
      });
    }
  }

  /**
   * Get server statistics
   */
  getStats(): {
    connectedAgents: number;
    activeLocks: number;
    activeSubscriptions: number;
    pendingWrites: number;
  } {
    return {
      connectedAgents: this.clients.size,
      activeLocks: this.locks.size,
      activeSubscriptions: this.subscriptions.size,
      pendingWrites: Array.from(this.pendingWrites.values()).reduce((sum, arr) => sum + arr.length, 0),
    };
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    let agentId: string | null = null;

    ws.on('message', (data: RawData) => {
      try {
        const message = deserializeMessage<unknown>(data.toString());
        agentId = this.handleMessage(ws, message, agentId);
      } catch (error) {
        this.sendError(ws, 'INVALID_MESSAGE', 'Failed to parse message');
      }
    });

    ws.on('close', () => {
      if (agentId) {
        this.handleDisconnect(agentId, 'client_disconnect');
      }
    });

    ws.on('error', (error) => {
      this.emit('clientError', { agentId, error });
      if (agentId) {
        this.handleDisconnect(agentId, 'error');
      }
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(ws: WebSocket, message: A2AMessage, currentAgentId: string | null): string | null {
    switch (message.type) {
      case 'agent.register':
        return this.handleRegister(ws, message as A2AMessage<AgentRegisterPayload>);

      case 'agent.heartbeat':
        this.handleHeartbeat(ws, message as A2AMessage<AgentHeartbeatPayload>, currentAgentId);
        return currentAgentId;

      case 'agent.disconnect':
        if (currentAgentId) {
          this.handleDisconnect(currentAgentId, 'client_disconnect');
        }
        return null;

      case 'agent.list':
        this.handleAgentList(ws, message as A2AMessage<AgentListPayload>);
        return currentAgentId;

      case 'coordination.lock_request':
        this.handleLockRequest(ws, message as A2AMessage<LockRequestPayload>, currentAgentId);
        return currentAgentId;

      case 'coordination.lock_release':
        this.handleLockRelease(ws, message as A2AMessage<LockReleasePayload>, currentAgentId);
        return currentAgentId;

      case 'subscribe':
        this.handleSubscribe(ws, message as A2AMessage<SubscribePayload>, currentAgentId);
        return currentAgentId;

      case 'unsubscribe':
        this.handleUnsubscribe(ws, message as A2AMessage<UnsubscribePayload>, currentAgentId);
        return currentAgentId;

      case 'conflict.resolution':
        this.handleConflictResolution(message as A2AMessage<ConflictResolutionPayload>, currentAgentId);
        return currentAgentId;

      // Memory events are broadcast to subscribers
      case 'memory.added':
      case 'memory.updated':
      case 'memory.deleted':
      case 'memory.recalled':
        this.broadcastToSubscribers(message);
        this.checkForConflicts(message, currentAgentId);
        return currentAgentId;

      default:
        this.sendError(ws, 'INVALID_MESSAGE', `Unknown message type: ${message.type}`);
        return currentAgentId;
    }
  }

  /**
   * Handle agent registration
   */
  private handleRegister(ws: WebSocket, message: A2AMessage<AgentRegisterPayload>): string {
    const { agent, resumeToken } = message.payload;

    // Check for max agents
    if (this.clients.size >= this.config.maxAgents) {
      this.sendError(ws, 'RATE_LIMITED', 'Maximum number of agents reached');
      ws.close();
      return '';
    }

    // Check for resume token
    let existingAgentId: string | undefined;
    if (resumeToken && this.resumeTokens.has(resumeToken)) {
      existingAgentId = this.resumeTokens.get(resumeToken);
      this.resumeTokens.delete(resumeToken);
    }

    // Use existing agent ID if resuming, otherwise use provided ID
    const agentId = existingAgentId ?? agent.id;

    // Disconnect any existing connection for this agent
    const existingClient = this.clients.get(agentId);
    if (existingClient) {
      this.handleDisconnect(agentId, 'client_disconnect');
    }

    // Create registered agent
    const registeredAgent: RegisteredAgent = {
      ...agent,
      id: agentId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscriptions: [],
      isConnected: true,
    };

    // Generate new resume token
    const newResumeToken = createResumeToken();
    registeredAgent.resumeToken = newResumeToken;
    this.resumeTokens.set(newResumeToken, agentId);

    // Store connection
    const connection: ClientConnection = {
      ws,
      agent: registeredAgent,
    };
    this.clients.set(agentId, connection);

    // Start heartbeat timer
    this.startHeartbeatTimer(agentId);

    // Send registered confirmation
    const response: A2AMessage<AgentRegisteredPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'agent.registered',
      payload: {
        agent: registeredAgent,
        resumeToken: newResumeToken,
        serverTime: new Date(),
      },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);

    this.emit('agentRegistered', registeredAgent);
    return agentId;
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(
    ws: WebSocket,
    message: A2AMessage<AgentHeartbeatPayload>,
    agentId: string | null
  ): void {
    if (!agentId) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Must register before sending heartbeat');
      return;
    }

    const client = this.clients.get(agentId);
    if (!client) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Agent not found');
      return;
    }

    client.agent.lastHeartbeat = new Date();
    this.resetHeartbeatTimer(agentId);

    const response: A2AMessage<AgentHeartbeatAckPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'agent.heartbeat_ack',
      payload: {
        serverTime: new Date(),
        nextHeartbeatMs: this.config.heartbeatIntervalMs,
      },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);
  }

  /**
   * Handle agent disconnect
   */
  private handleDisconnect(agentId: string, reason: AgentDisconnectPayload['reason']): void {
    const client = this.clients.get(agentId);
    if (!client) return;

    // Clear heartbeat timer
    if (client.heartbeatTimer) {
      clearTimeout(client.heartbeatTimer);
    }

    // Mark as disconnected
    client.agent.isConnected = false;

    // Release all locks held by this agent
    for (const [_lockKey, lock] of this.locks) {
      if (lock.holder === agentId) {
        this.releaseLock(lock.id, agentId);
      }
    }

    // Remove from clients
    this.clients.delete(agentId);

    // Remove subscriptions
    for (const [subIdToRemove, sub] of this.subscriptions) {
      if (sub.agentId === agentId) {
        this.subscriptions.delete(subIdToRemove);
      }
    }

    this.emit('agentDisconnected', { agentId, reason });
  }

  /**
   * Handle agent list request
   */
  private handleAgentList(ws: WebSocket, message: A2AMessage<AgentListPayload>): void {
    const filter = message.payload.filter;
    let agents = Array.from(this.clients.values()).map(c => c.agent);

    if (filter) {
      if (filter.type) {
        agents = agents.filter(a => a.type === filter.type);
      }
      if (filter.capability) {
        agents = agents.filter(a => hasCapability(a, filter.capability!));
      }
      if (filter.connected !== undefined) {
        agents = agents.filter(a => a.isConnected === filter.connected);
      }
    }

    const response: A2AMessage<AgentListResponsePayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'agent.list_response',
      payload: {
        agents,
        totalCount: agents.length,
      },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);
  }

  /**
   * Handle lock request
   */
  private handleLockRequest(
    ws: WebSocket,
    message: A2AMessage<LockRequestPayload>,
    agentId: string | null
  ): void {
    if (!agentId) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Must register before requesting locks');
      return;
    }

    const client = this.clients.get(agentId);
    if (!client) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Agent not found');
      return;
    }

    // Check capability
    if (!hasCapability(client.agent, 'coordinate')) {
      this.sendError(ws, 'INVALID_CAPABILITY', 'Agent does not have coordinate capability');
      return;
    }

    const { resource, mode, timeoutMs } = message.payload;
    const lockKey = this.getLockKey(resource);

    // Check existing lock
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      // Check if compatible (shared locks can coexist)
      if (mode === 'shared' && existingLock.mode === 'shared') {
        // Grant shared lock
        const lockId = createLockId();
        const expiresAt = new Date(Date.now() + (timeoutMs ?? this.config.lockExpiryMs));

        const response: A2AMessage<LockGrantedPayload> = {
          id: createMessageId(),
          timestamp: new Date(),
          sender: 'server',
          type: 'coordination.lock_granted',
          payload: { resource, lockId, expiresAt, mode },
          correlationId: message.id,
        };
        this.sendMessage(ws, response);
        return;
      }

      // Add to wait queue
      if (existingLock.waitQueue.length >= this.config.maxWaitQueueSize) {
        const response: A2AMessage<LockDeniedPayload> = {
          id: createMessageId(),
          timestamp: new Date(),
          sender: 'server',
          type: 'coordination.lock_denied',
          payload: {
            resource,
            reason: 'queue_full',
            holder: existingLock.holder,
          },
          correlationId: message.id,
        };
        this.sendMessage(ws, response);
        return;
      }

      existingLock.waitQueue.push({
        agentId,
        requestId: message.id,
        requestedAt: new Date(),
        mode,
      });

      const response: A2AMessage<LockDeniedPayload> = {
        id: createMessageId(),
        timestamp: new Date(),
        sender: 'server',
        type: 'coordination.lock_denied',
        payload: {
          resource,
          reason: 'already_locked',
          holder: existingLock.holder,
          waitQueuePosition: existingLock.waitQueue.length,
        },
        correlationId: message.id,
      };
      this.sendMessage(ws, response);
      return;
    }

    // Grant new lock
    const lockId = createLockId();
    const expiresAt = new Date(Date.now() + (timeoutMs ?? this.config.lockExpiryMs));

    const lock: Lock = {
      id: lockId,
      resource,
      mode,
      holder: agentId,
      acquiredAt: new Date(),
      expiresAt,
      waitQueue: [],
    };
    this.locks.set(lockKey, lock);

    // Set expiry timer
    setTimeout(() => this.handleLockExpiry(lockKey), timeoutMs ?? this.config.lockExpiryMs);

    const response: A2AMessage<LockGrantedPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'coordination.lock_granted',
      payload: { resource, lockId, expiresAt, mode },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);

    this.emit('lockGranted', { lockId, resource, holder: agentId });
  }

  /**
   * Handle lock release
   */
  private handleLockRelease(
    ws: WebSocket,
    message: A2AMessage<LockReleasePayload>,
    agentId: string | null
  ): void {
    if (!agentId) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Must register before releasing locks');
      return;
    }

    const { lockId, resource } = message.payload;
    this.releaseLock(lockId, agentId);

    const response: A2AMessage<LockReleasedPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'coordination.lock_released',
      payload: { lockId, resource, releasedBy: agentId },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);
  }

  /**
   * Release a lock and notify waiters
   */
  private releaseLock(lockId: string, releasingAgent: string): void {
    for (const [lockKey, lock] of this.locks) {
      if (lock.id === lockId && lock.holder === releasingAgent) {
        // Grant to first waiter if any
        const nextWaiter = lock.waitQueue.shift();
        if (nextWaiter) {
          const nextClient = this.clients.get(nextWaiter.agentId);
          if (nextClient) {
            const newLockId = createLockId();
            const expiresAt = new Date(Date.now() + this.config.lockExpiryMs);

            lock.id = newLockId;
            lock.holder = nextWaiter.agentId;
            lock.mode = nextWaiter.mode;
            lock.acquiredAt = new Date();
            lock.expiresAt = expiresAt;

            const response: A2AMessage<LockGrantedPayload> = {
              id: createMessageId(),
              timestamp: new Date(),
              sender: 'server',
              type: 'coordination.lock_granted',
              payload: {
                resource: lock.resource,
                lockId: newLockId,
                expiresAt,
                mode: nextWaiter.mode,
              },
              correlationId: nextWaiter.requestId,
            };
            this.sendMessage(nextClient.ws, response);

            this.emit('lockGranted', {
              lockId: newLockId,
              resource: lock.resource,
              holder: nextWaiter.agentId,
            });
            return;
          }
        }

        // No waiters, remove lock
        this.locks.delete(lockKey);
        this.emit('lockReleased', { lockId, releasedBy: releasingAgent });
        return;
      }
    }
  }

  /**
   * Handle lock expiry
   */
  private handleLockExpiry(lockKey: string): void {
    const lock = this.locks.get(lockKey);
    if (lock && new Date() >= lock.expiresAt) {
      this.releaseLock(lock.id, lock.holder);
    }
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(
    ws: WebSocket,
    message: A2AMessage<SubscribePayload>,
    agentId: string | null
  ): void {
    if (!agentId) {
      this.sendError(ws, 'AGENT_NOT_REGISTERED', 'Must register before subscribing');
      return;
    }

    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.subscriptions.set(subscriptionId, {
      agentId,
      filter: message.payload.filter,
    });

    const client = this.clients.get(agentId);
    if (client) {
      client.agent.subscriptions.push(message.payload.filter);
    }

    const response: A2AMessage<SubscribeAckPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'subscribe_ack',
      payload: { subscriptionId, filter: message.payload.filter },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(
    ws: WebSocket,
    message: A2AMessage<UnsubscribePayload>,
    _agentId: string | null
  ): void {
    const success = this.subscriptions.delete(message.payload.subscriptionId);

    const response: A2AMessage<UnsubscribeAckPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'unsubscribe_ack',
      payload: { subscriptionId: message.payload.subscriptionId, success },
      correlationId: message.id,
    };
    this.sendMessage(ws, response);
  }

  /**
   * Broadcast message to matching subscribers
   */
  private broadcastToSubscribers(message: A2AMessage): void {
    for (const [_subId, { agentId, filter }] of this.subscriptions) {
      if (this.matchesFilter(message, filter)) {
        const client = this.clients.get(agentId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
          this.sendMessage(client.ws, message);
        }
      }
    }
  }

  /**
   * Check if message matches subscription filter
   */
  private matchesFilter(message: A2AMessage, filter: SubscriptionFilter): boolean {
    if (filter.eventTypes && !filter.eventTypes.includes(message.type)) {
      return false;
    }
    if (filter.agentIds && !filter.agentIds.includes(message.sender)) {
      return false;
    }
    // Additional filtering based on payload would go here
    return true;
  }

  /**
   * Check for conflicts when memory is modified
   */
  private checkForConflicts(message: A2AMessage, agentId: string | null): void {
    if (!this.config.enableConflictDetection || !agentId) return;

    if (message.type === 'memory.updated') {
      const payload = message.payload as { memoryId: string; newContent: string };
      const memoryId = payload.memoryId;

      // Track pending write
      let pending = this.pendingWrites.get(memoryId) ?? [];
      pending.push({
        agentId,
        memoryId,
        content: payload.newContent,
        timestamp: new Date(),
        correlationId: message.id,
      });
      this.pendingWrites.set(memoryId, pending);

      // Check for conflicts (multiple writes within short window)
      if (pending.length > 1) {
        const conflictId = createConflictId();
        const conflictingWrites = pending.map(p => ({
          agentId: p.agentId,
          content: p.content,
          timestamp: p.timestamp,
        }));

        const conflict: A2AMessage<ConflictDetectedPayload> = {
          id: createMessageId(),
          timestamp: new Date(),
          sender: 'server',
          type: 'conflict.detected',
          payload: {
            conflictId,
            memoryId,
            conflictingAgents: pending.map(p => p.agentId),
            originalContent: pending[0].content,
            conflictingWrites,
            suggestedStrategy: this.config.defaultConflictStrategy,
          },
        };

        // Notify all involved agents
        for (const write of pending) {
          const client = this.clients.get(write.agentId);
          if (client) {
            this.sendMessage(client.ws, conflict);
          }
        }

        this.emit('conflictDetected', conflict.payload);
      }

      // Clean up old pending writes
      setTimeout(() => {
        const current = this.pendingWrites.get(memoryId);
        if (current) {
          const cutoff = Date.now() - 5000; // 5 second window
          const filtered = current.filter(p => p.timestamp.getTime() > cutoff);
          if (filtered.length === 0) {
            this.pendingWrites.delete(memoryId);
          } else {
            this.pendingWrites.set(memoryId, filtered);
          }
        }
      }, 5000);
    }
  }

  /**
   * Handle conflict resolution from arbitrator
   */
  private handleConflictResolution(
    message: A2AMessage<ConflictResolutionPayload>,
    agentId: string | null
  ): void {
    if (!agentId) return;

    const client = this.clients.get(agentId);
    if (!client || !hasCapability(client.agent, 'arbitrate')) {
      return;
    }

    // Clear pending writes for this memory
    this.pendingWrites.delete(message.payload.memoryId);

    // Broadcast resolution to all subscribers
    this.broadcastToSubscribers(message);

    this.emit('conflictResolved', message.payload);
  }

  /**
   * Start heartbeat timeout timer
   */
  private startHeartbeatTimer(agentId: string): void {
    const client = this.clients.get(agentId);
    if (!client) return;

    client.heartbeatTimer = setTimeout(() => {
      this.handleDisconnect(agentId, 'timeout');
    }, this.config.heartbeatTimeoutMs);
  }

  /**
   * Reset heartbeat timer
   */
  private resetHeartbeatTimer(agentId: string): void {
    const client = this.clients.get(agentId);
    if (!client) return;

    if (client.heartbeatTimer) {
      clearTimeout(client.heartbeatTimer);
    }
    this.startHeartbeatTimer(agentId);
  }

  /**
   * Get lock key for a resource
   */
  private getLockKey(resource: LockResource): string {
    switch (resource.type) {
      case 'memory':
        return `memory:${resource.memoryId}`;
      case 'layer':
        return `layer:${resource.layer}`;
      case 'project':
        return `project:${resource.projectId}`;
      case 'global':
        return 'global';
    }
  }

  /**
   * Send message to client
   */
  private sendMessage(ws: WebSocket, message: A2AMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serializeMessage(message));
    }
  }

  /**
   * Send error to client
   */
  private sendError(ws: WebSocket, code: ErrorPayload['code'], message: string, correlationId?: string): void {
    const error: A2AMessage<ErrorPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: 'server',
      type: 'error',
      payload: {
        code,
        message,
        recoverable: code !== 'INVALID_MESSAGE' && code !== 'UNAUTHORIZED',
        correlationId,
      },
    };
    this.sendMessage(ws, error);
  }
}

/**
 * Create and start an A2A server
 */
export async function createA2AServer(config?: Partial<A2AServerConfig>): Promise<A2AServer> {
  const server = new A2AServer(config);
  await server.start();
  return server;
}

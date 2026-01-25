/**
 * A2A WebSocket Client
 * Handles connection, messaging, and automatic reconnection
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  A2AMessage,
  A2AMessageType,
  A2AClientConfig,
  DEFAULT_A2A_CLIENT_CONFIG,
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
  LockResource,
  LockMode,
  SubscriptionFilter,
  SubscribePayload,
  SubscribeAckPayload,
  UnsubscribePayload,
  ErrorPayload,
  RegisteredAgent,
  serializeMessage,
  deserializeMessage,
  createMessageId,
} from './protocol.js';
import { A2AError, TimeoutError, ConnectionError } from './errors.js';

/**
 * Pending request waiting for response
 */
interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Client connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * A2A Client
 */
export class A2AClient extends EventEmitter {
  private config: A2AClientConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private registeredAgent: RegisteredAgent | null = null;
  private resumeToken: string | null = null;
  private pendingRequests: Map<string, PendingRequest>;
  private subscriptions: Map<string, SubscriptionFilter>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private manualDisconnect: boolean = false;

  constructor(config: A2AClientConfig) {
    super();
    this.config = { ...DEFAULT_A2A_CLIENT_CONFIG, ...config } as A2AClientConfig;
    this.pendingRequests = new Map();
    this.subscriptions = new Map();
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get registered agent info
   */
  getAgent(): RegisteredAgent | null {
    return this.registeredAgent;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the server
   */
  async connect(): Promise<RegisteredAgent> {
    if (this.state === 'connected') {
      throw new A2AError('INVALID_MESSAGE', 'Already connected');
    }

    this.manualDisconnect = false;
    this.state = 'connecting';
    this.emit('stateChange', this.state);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.on('open', () => {
          this.registerAgent()
            .then(agent => {
              this.state = 'connected';
              this.reconnectAttempts = 0;
              this.emit('stateChange', this.state);
              this.emit('connected', agent);
              this.startHeartbeat();
              resolve(agent);
            })
            .catch(error => {
              this.state = 'disconnected';
              this.emit('stateChange', this.state);
              reject(error);
            });
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          this.handleClose();
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          if (this.state === 'connecting') {
            reject(new ConnectionError('Failed to connect', error));
          }
        });
      } catch (error) {
        this.state = 'disconnected';
        this.emit('stateChange', this.state);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true;
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      // Send disconnect message
      const message: A2AMessage<AgentDisconnectPayload> = {
        id: createMessageId(),
        timestamp: new Date(),
        sender: this.config.agent.id,
        type: 'agent.disconnect',
        payload: { reason: 'client_disconnect' },
      };
      this.sendMessage(message);

      // Close connection
      this.ws.close();
      this.ws = null;
    }

    this.state = 'disconnected';
    this.registeredAgent = null;
    this.pendingRequests.clear();
    this.emit('stateChange', this.state);
    this.emit('disconnected');
  }

  /**
   * Request a lock on a resource
   */
  async requestLock(
    resource: LockResource,
    mode: LockMode = 'exclusive',
    timeoutMs?: number
  ): Promise<LockGrantedPayload> {
    const message: A2AMessage<LockRequestPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'coordination.lock_request',
      payload: { resource, mode, timeoutMs },
    };

    const response = await this.sendRequest<LockGrantedPayload | LockDeniedPayload>(
      message,
      ['coordination.lock_granted', 'coordination.lock_denied']
    );

    if ('reason' in response) {
      throw new A2AError('LOCK_FAILED', `Lock denied: ${response.reason}`, {
        details: response as unknown as Record<string, unknown>,
      });
    }

    return response as LockGrantedPayload;
  }

  /**
   * Release a lock
   */
  async releaseLock(lockId: string, resource: LockResource): Promise<void> {
    const message: A2AMessage<LockReleasePayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'coordination.lock_release',
      payload: { lockId, resource },
    };

    await this.sendRequest<LockReleasedPayload>(message, ['coordination.lock_released']);
  }

  /**
   * Subscribe to events
   */
  async subscribe(filter: SubscriptionFilter): Promise<string> {
    const message: A2AMessage<SubscribePayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'subscribe',
      payload: { filter },
    };

    const response = await this.sendRequest<SubscribeAckPayload>(message, ['subscribe_ack']);
    this.subscriptions.set(response.subscriptionId, filter);
    return response.subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const message: A2AMessage<UnsubscribePayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'unsubscribe',
      payload: { subscriptionId },
    };

    await this.sendRequest(message, ['unsubscribe_ack']);
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * List connected agents
   */
  async listAgents(filter?: AgentListPayload['filter']): Promise<RegisteredAgent[]> {
    const message: A2AMessage<AgentListPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'agent.list',
      payload: { filter },
    };

    const response = await this.sendRequest<AgentListResponsePayload>(message, ['agent.list_response']);
    return response.agents;
  }

  /**
   * Send a memory event
   */
  sendMemoryEvent<T>(type: A2AMessageType, payload: T): void {
    const message: A2AMessage<T> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type,
      payload,
    };
    this.sendMessage(message);
  }

  /**
   * Register the agent with the server
   */
  private async registerAgent(): Promise<RegisteredAgent> {
    const message: A2AMessage<AgentRegisterPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'agent.register',
      payload: {
        agent: this.config.agent,
        resumeToken: this.resumeToken ?? undefined,
      },
    };

    const response = await this.sendRequest<AgentRegisteredPayload>(message, ['agent.registered']);
    this.registeredAgent = response.agent;
    this.resumeToken = response.resumeToken;
    return response.agent;
  }

  /**
   * Send a request and wait for response
   */
  private sendRequest<T>(
    message: A2AMessage,
    expectedTypes: A2AMessageType[]
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new TimeoutError(`Request timed out: ${message.type}`, message.id));
      }, this.config.requestTimeoutMs);

      this.pendingRequests.set(message.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      // Store expected types for response matching
      (this.pendingRequests.get(message.id) as PendingRequest & { expectedTypes: A2AMessageType[] }).expectedTypes = expectedTypes;

      this.sendMessage(message);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = deserializeMessage<unknown>(data);
      this.emit('message', message);

      // Check if this is a response to a pending request
      if (message.correlationId) {
        const pending = this.pendingRequests.get(message.correlationId) as PendingRequest & { expectedTypes?: A2AMessageType[] };
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.correlationId);

          if (message.type === 'error') {
            const error = A2AError.fromPayload(message.payload as ErrorPayload);
            pending.reject(error);
            return;
          }

          if (pending.expectedTypes && pending.expectedTypes.includes(message.type)) {
            pending.resolve(message.payload);
            return;
          }
        }
      }

      // Handle specific message types
      switch (message.type) {
        case 'agent.heartbeat_ack':
          this.handleHeartbeatAck(message as A2AMessage<AgentHeartbeatAckPayload>);
          break;

        case 'memory.added':
        case 'memory.updated':
        case 'memory.deleted':
        case 'memory.recalled':
          this.emit('memoryEvent', message);
          break;

        case 'conflict.detected':
          this.emit('conflict', message.payload);
          break;

        case 'coordination.lock_granted':
        case 'coordination.lock_denied':
        case 'coordination.lock_released':
          this.emit('lockEvent', message);
          break;

        case 'error':
          this.emit('serverError', A2AError.fromPayload(message.payload as ErrorPayload));
          break;

        case 'agent.disconnect':
          this.handleServerDisconnect(message.payload as AgentDisconnectPayload);
          break;
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle heartbeat acknowledgment
   */
  private handleHeartbeatAck(message: A2AMessage<AgentHeartbeatAckPayload>): void {
    // Server tells us when to send next heartbeat
    const nextInterval = message.payload.nextHeartbeatMs;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), nextInterval);
  }

  /**
   * Handle server-initiated disconnect
   */
  private handleServerDisconnect(payload: AgentDisconnectPayload): void {
    this.emit('serverDisconnect', payload);
    this.handleClose();
  }

  /**
   * Handle connection close
   */
  private handleClose(): void {
    this.stopHeartbeat();

    if (this.manualDisconnect) {
      this.state = 'disconnected';
      this.emit('stateChange', this.state);
      return;
    }

    // Attempt reconnection
    this.state = 'reconnecting';
    this.emit('stateChange', this.state);
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.manualDisconnect) return;

    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelayMs
    );
    this.reconnectAttempts++;

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.emit('reconnected', this.registeredAgent);
      } catch (error) {
        // Will trigger handleClose which schedules another reconnect
      }
    }, delay);
  }

  /**
   * Stop reconnection attempts
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setTimeout(
      () => this.sendHeartbeat(),
      this.config.heartbeatIntervalMs
    );
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    if (!this.isConnected()) return;

    const message: A2AMessage<AgentHeartbeatPayload> = {
      id: createMessageId(),
      timestamp: new Date(),
      sender: this.config.agent.id,
      type: 'agent.heartbeat',
      payload: { timestamp: new Date() },
    };
    this.sendMessage(message);
  }

  /**
   * Send message to server
   */
  private sendMessage(message: A2AMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(message));
    }
  }
}

/**
 * Create an A2A client
 */
export function createA2AClient(config: A2AClientConfig): A2AClient {
  return new A2AClient(config);
}

/**
 * Create and connect an A2A client
 */
export async function connectA2AClient(config: A2AClientConfig): Promise<A2AClient> {
  const client = new A2AClient(config);
  await client.connect();
  return client;
}

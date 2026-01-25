/**
 * A2A (Agent-to-Agent) Protocol Type Definitions
 * Enables multi-agent coordination with shared memory
 */

import { MemoryEntry, MemoryLayer, MemoryMetadata } from '../types.js';

// ==================== Agent Identity ====================

/**
 * Agent type determines capabilities and priority
 */
export type AgentType = 'primary' | 'worker' | 'specialist' | 'observer';

/**
 * Capabilities an agent can have
 */
export type AgentCapability =
  | 'memory_write'
  | 'memory_read'
  | 'memory_delete'
  | 'coordinate'
  | 'arbitrate';

/**
 * Agent identity for registration and authentication
 */
export interface AgentIdentity {
  id: string;
  name: string;
  type: AgentType;
  capabilities: AgentCapability[];
  metadata?: Record<string, unknown>;
}

/**
 * Registered agent with connection state
 */
export interface RegisteredAgent extends AgentIdentity {
  connectedAt: Date;
  lastHeartbeat: Date;
  subscriptions: SubscriptionFilter[];
  resumeToken?: string;
  isConnected: boolean;
}

// ==================== Message Types ====================

/**
 * All supported A2A message types
 */
export type A2AMessageType =
  // Agent lifecycle
  | 'agent.register'
  | 'agent.registered'
  | 'agent.heartbeat'
  | 'agent.heartbeat_ack'
  | 'agent.disconnect'
  | 'agent.list'
  | 'agent.list_response'
  // Memory events
  | 'memory.added'
  | 'memory.updated'
  | 'memory.deleted'
  | 'memory.recalled'
  // Coordination
  | 'coordination.lock_request'
  | 'coordination.lock_granted'
  | 'coordination.lock_denied'
  | 'coordination.lock_release'
  | 'coordination.lock_released'
  // Conflict handling
  | 'conflict.detected'
  | 'conflict.resolution'
  // Subscriptions
  | 'subscribe'
  | 'subscribe_ack'
  | 'unsubscribe'
  | 'unsubscribe_ack'
  // Errors
  | 'error';

/**
 * Base A2A message envelope
 */
export interface A2AMessage<T = unknown> {
  id: string;
  timestamp: Date;
  sender: string;
  type: A2AMessageType;
  payload: T;
  correlationId?: string;
  ttl?: number;
}

// ==================== Agent Messages ====================

export interface AgentRegisterPayload {
  agent: AgentIdentity;
  resumeToken?: string;
}

export interface AgentRegisteredPayload {
  agent: RegisteredAgent;
  resumeToken: string;
  serverTime: Date;
}

export interface AgentHeartbeatPayload {
  timestamp: Date;
}

export interface AgentHeartbeatAckPayload {
  serverTime: Date;
  nextHeartbeatMs: number;
}

export interface AgentDisconnectPayload {
  reason: 'client_disconnect' | 'timeout' | 'error' | 'shutdown';
  message?: string;
}

export interface AgentListPayload {
  filter?: {
    type?: AgentType;
    capability?: AgentCapability;
    connected?: boolean;
  };
}

export interface AgentListResponsePayload {
  agents: RegisteredAgent[];
  totalCount: number;
}

// ==================== Memory Event Payloads ====================

export interface MemoryAddedPayload {
  memory: MemoryEntry;
  agentId: string;
  layer: MemoryLayer;
}

export interface MemoryUpdatedPayload {
  memoryId: string;
  previousContent: string;
  newContent: string;
  agentId: string;
  metadata?: Partial<MemoryMetadata>;
}

export interface MemoryDeletedPayload {
  memoryId: string;
  agentId: string;
  reason?: string;
}

export interface MemoryRecalledPayload {
  query: string;
  results: MemoryEntry[];
  agentId: string;
  queryTimeMs: number;
}

// ==================== Lock Management ====================

/**
 * Resource types that can be locked
 */
export type LockResourceType = 'memory' | 'layer' | 'project' | 'global';

/**
 * Lock resource specification
 */
export type LockResource =
  | { type: 'memory'; memoryId: string }
  | { type: 'layer'; layer: MemoryLayer }
  | { type: 'project'; projectId: string }
  | { type: 'global' };

/**
 * Lock mode
 */
export type LockMode = 'exclusive' | 'shared';

export interface LockRequestPayload {
  resource: LockResource;
  mode: LockMode;
  timeoutMs?: number;
  reason?: string;
}

export interface LockGrantedPayload {
  resource: LockResource;
  lockId: string;
  expiresAt: Date;
  mode: LockMode;
}

export interface LockDeniedPayload {
  resource: LockResource;
  reason: 'already_locked' | 'timeout' | 'no_permission' | 'queue_full';
  holder?: string;
  waitQueuePosition?: number;
}

export interface LockReleasePayload {
  lockId: string;
  resource: LockResource;
}

export interface LockReleasedPayload {
  lockId: string;
  resource: LockResource;
  releasedBy: string;
}

/**
 * Internal lock state
 */
export interface Lock {
  id: string;
  resource: LockResource;
  mode: LockMode;
  holder: string;
  acquiredAt: Date;
  expiresAt: Date;
  waitQueue: Array<{
    agentId: string;
    requestId: string;
    requestedAt: Date;
    mode: LockMode;
  }>;
}

// ==================== Conflict Handling ====================

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy =
  | 'last_write_wins'
  | 'first_write_wins'
  | 'merge'
  | 'arbitrate'
  | 'manual';

export interface ConflictDetectedPayload {
  conflictId: string;
  memoryId: string;
  conflictingAgents: string[];
  originalContent: string;
  conflictingWrites: Array<{
    agentId: string;
    content: string;
    timestamp: Date;
  }>;
  suggestedStrategy: ConflictStrategy;
}

export interface ConflictResolutionPayload {
  conflictId: string;
  memoryId: string;
  strategy: ConflictStrategy;
  resolvedContent: string;
  resolvedBy: string;
  winningAgent?: string;
}

// ==================== Subscription Management ====================

/**
 * Filter for event subscriptions
 */
export interface SubscriptionFilter {
  eventTypes?: A2AMessageType[];
  layers?: MemoryLayer[];
  projectIds?: string[];
  tags?: string[];
  agentIds?: string[];
}

export interface SubscribePayload {
  filter: SubscriptionFilter;
}

export interface SubscribeAckPayload {
  subscriptionId: string;
  filter: SubscriptionFilter;
}

export interface UnsubscribePayload {
  subscriptionId: string;
}

export interface UnsubscribeAckPayload {
  subscriptionId: string;
  success: boolean;
}

// ==================== Error Handling ====================

export type A2AErrorCode =
  | 'INVALID_MESSAGE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LOCK_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'CONNECTION_CLOSED'
  | 'AGENT_NOT_REGISTERED'
  | 'INVALID_CAPABILITY';

export interface ErrorPayload {
  code: A2AErrorCode;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  recoverable: boolean;
}

// ==================== Server Configuration ====================

export interface A2AServerConfig {
  port: number;
  host: string;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  lockExpiryMs: number;
  maxAgents: number;
  maxLocksPerAgent: number;
  maxWaitQueueSize: number;
  enableConflictDetection: boolean;
  defaultConflictStrategy: ConflictStrategy;
}

export const DEFAULT_A2A_SERVER_CONFIG: A2AServerConfig = {
  port: 9876,
  host: 'localhost',
  heartbeatIntervalMs: 30000,
  heartbeatTimeoutMs: 90000,
  lockExpiryMs: 60000,
  maxAgents: 100,
  maxLocksPerAgent: 10,
  maxWaitQueueSize: 50,
  enableConflictDetection: true,
  defaultConflictStrategy: 'last_write_wins',
};

// ==================== Client Configuration ====================

export interface A2AClientConfig {
  serverUrl: string;
  agent: AgentIdentity;
  reconnectDelayMs: number;
  maxReconnectDelayMs: number;
  requestTimeoutMs: number;
  heartbeatIntervalMs: number;
}

export const DEFAULT_A2A_CLIENT_CONFIG: Partial<A2AClientConfig> = {
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  requestTimeoutMs: 10000,
  heartbeatIntervalMs: 30000,
};

// ==================== Type Guards ====================

export function isMemoryEvent(type: A2AMessageType): boolean {
  return type.startsWith('memory.');
}

export function isAgentEvent(type: A2AMessageType): boolean {
  return type.startsWith('agent.');
}

export function isCoordinationEvent(type: A2AMessageType): boolean {
  return type.startsWith('coordination.');
}

export function isConflictEvent(type: A2AMessageType): boolean {
  return type.startsWith('conflict.');
}

export function hasCapability(
  agent: AgentIdentity,
  capability: AgentCapability
): boolean {
  return agent.capabilities.includes(capability);
}

export function canWrite(agent: AgentIdentity): boolean {
  return hasCapability(agent, 'memory_write');
}

export function canDelete(agent: AgentIdentity): boolean {
  return hasCapability(agent, 'memory_delete');
}

export function canArbitrate(agent: AgentIdentity): boolean {
  return hasCapability(agent, 'arbitrate');
}

// ==================== Serialization Helpers ====================

// ISO 8601 date string regex
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function serializeMessage<T>(message: A2AMessage<T>): string {
  return JSON.stringify(message, (_key, value) => {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    return value;
  });
}

export function deserializeMessage<T>(data: string): A2AMessage<T> {
  return JSON.parse(data, (_key, value) => {
    // Handle our custom date format
    if (value && typeof value === 'object' && value.__type === 'Date') {
      return new Date(value.value);
    }
    // Also handle plain ISO date strings (for compatibility)
    if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
      return new Date(value);
    }
    return value;
  });
}

export function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createLockId(): string {
  return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createConflictId(): string {
  return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createResumeToken(): string {
  return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
}

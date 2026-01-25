/**
 * A2A (Agent-to-Agent) Protocol Module
 * Enables multi-agent coordination with shared memory
 */

// Protocol types and helpers
export {
  // Agent types
  AgentType,
  AgentCapability,
  AgentIdentity,
  RegisteredAgent,
  // Message types
  A2AMessageType,
  A2AMessage,
  // Agent message payloads
  AgentRegisterPayload,
  AgentRegisteredPayload,
  AgentHeartbeatPayload,
  AgentHeartbeatAckPayload,
  AgentDisconnectPayload,
  AgentListPayload,
  AgentListResponsePayload,
  // Memory event payloads
  MemoryAddedPayload,
  MemoryUpdatedPayload,
  MemoryDeletedPayload,
  MemoryRecalledPayload,
  // Lock types
  LockResourceType,
  LockResource,
  LockMode,
  Lock,
  LockRequestPayload,
  LockGrantedPayload,
  LockDeniedPayload,
  LockReleasePayload,
  LockReleasedPayload,
  // Conflict types
  ConflictStrategy,
  ConflictDetectedPayload,
  ConflictResolutionPayload,
  // Subscription types
  SubscriptionFilter,
  SubscribePayload,
  SubscribeAckPayload,
  UnsubscribePayload,
  UnsubscribeAckPayload,
  // Error types
  A2AErrorCode,
  ErrorPayload,
  // Configuration
  A2AServerConfig,
  A2AClientConfig,
  DEFAULT_A2A_SERVER_CONFIG,
  DEFAULT_A2A_CLIENT_CONFIG,
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
} from './protocol.js';

// Error handling
export {
  A2AError,
  ConnectionError,
  TimeoutError,
  LockError,
  ConflictError,
  UnauthorizedError,
  RecoveryStrategy,
  getRecoveryStrategy,
  withRetry,
} from './errors.js';

// Event bridge
export {
  MemoryEvent,
  MemoryEventType,
  MemoryEventListener,
  MemoryEventBridge,
  createEventBridge,
} from './events.js';

// Server
export {
  A2AServer,
  createA2AServer,
} from './server.js';

// Client
export {
  A2AClient,
  ConnectionState,
  createA2AClient,
  connectA2AClient,
} from './client.js';

// Coordinated memory
export {
  CoordinatedMemory,
  CoordinatedOptions,
  TitanMemoryOperations,
  createCoordinatedMemory,
} from './coordinated-memory.js';

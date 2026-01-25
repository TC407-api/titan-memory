/**
 * Memory Event Bridge
 * Connects TitanMemory events to A2A protocol
 */

import { EventEmitter } from 'events';
import { MemoryEntry, MemoryLayer } from '../types.js';
import {
  A2AMessage,
  A2AMessageType,
  MemoryAddedPayload,
  MemoryUpdatedPayload,
  MemoryDeletedPayload,
  MemoryRecalledPayload,
  SubscriptionFilter,
  createMessageId,
} from './protocol.js';

/**
 * Memory event types
 */
export type MemoryEventType = 'add' | 'update' | 'delete' | 'recall';

/**
 * Memory event data
 */
export interface MemoryEvent {
  type: MemoryEventType;
  timestamp: Date;
  agentId: string;
  data: MemoryAddedPayload | MemoryUpdatedPayload | MemoryDeletedPayload | MemoryRecalledPayload;
}

/**
 * Event listener callback
 */
export type MemoryEventListener = (event: MemoryEvent) => void;

/**
 * Bridge between TitanMemory and A2A protocol
 * Handles event emission and subscription filtering
 */
export class MemoryEventBridge extends EventEmitter {
  private agentId: string;
  private subscriptions: Map<string, SubscriptionFilter>;
  private eventHistory: MemoryEvent[];
  private maxHistorySize: number;

  constructor(agentId: string, options?: { maxHistorySize?: number }) {
    super();
    this.agentId = agentId;
    this.subscriptions = new Map();
    this.eventHistory = [];
    this.maxHistorySize = options?.maxHistorySize ?? 100;
  }

  /**
   * Get the agent ID associated with this bridge
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Emit a memory added event
   */
  emitAdd(memory: MemoryEntry, layer: MemoryLayer): void {
    const event: MemoryEvent = {
      type: 'add',
      timestamp: new Date(),
      agentId: this.agentId,
      data: {
        memory,
        agentId: this.agentId,
        layer,
      },
    };
    this.processEvent(event);
  }

  /**
   * Emit a memory updated event
   */
  emitUpdate(
    memoryId: string,
    previousContent: string,
    newContent: string,
    metadata?: Record<string, unknown>
  ): void {
    const event: MemoryEvent = {
      type: 'update',
      timestamp: new Date(),
      agentId: this.agentId,
      data: {
        memoryId,
        previousContent,
        newContent,
        agentId: this.agentId,
        metadata,
      },
    };
    this.processEvent(event);
  }

  /**
   * Emit a memory deleted event
   */
  emitDelete(memoryId: string, reason?: string): void {
    const event: MemoryEvent = {
      type: 'delete',
      timestamp: new Date(),
      agentId: this.agentId,
      data: {
        memoryId,
        agentId: this.agentId,
        reason,
      },
    };
    this.processEvent(event);
  }

  /**
   * Emit a memory recalled event
   */
  emitRecall(query: string, results: MemoryEntry[], queryTimeMs: number): void {
    const event: MemoryEvent = {
      type: 'recall',
      timestamp: new Date(),
      agentId: this.agentId,
      data: {
        query,
        results,
        agentId: this.agentId,
        queryTimeMs,
      },
    };
    this.processEvent(event);
  }

  /**
   * Add a subscription filter
   */
  addSubscription(subscriptionId: string, filter: SubscriptionFilter): void {
    this.subscriptions.set(subscriptionId, filter);
  }

  /**
   * Remove a subscription
   */
  removeSubscription(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): Map<string, SubscriptionFilter> {
    return new Map(this.subscriptions);
  }

  /**
   * Get recent event history
   */
  getHistory(limit?: number): MemoryEvent[] {
    const count = limit ?? this.eventHistory.length;
    return this.eventHistory.slice(-count);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Convert a memory event to A2A message
   */
  toA2AMessage(event: MemoryEvent): A2AMessage {
    const typeMap: Record<MemoryEventType, A2AMessageType> = {
      add: 'memory.added',
      update: 'memory.updated',
      delete: 'memory.deleted',
      recall: 'memory.recalled',
    };

    return {
      id: createMessageId(),
      timestamp: event.timestamp,
      sender: event.agentId,
      type: typeMap[event.type],
      payload: event.data,
    };
  }

  /**
   * Process and emit an event
   */
  private processEvent(event: MemoryEvent): void {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Emit the raw event
    this.emit('event', event);
    this.emit(event.type, event);

    // Convert to A2A message
    const message = this.toA2AMessage(event);
    this.emit('a2a', message);
  }

  /**
   * Check if an event matches a subscription filter
   */
  matchesFilter(event: MemoryEvent, filter: SubscriptionFilter): boolean {
    // Check event type
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      const a2aType = this.toA2AMessage(event).type;
      if (!filter.eventTypes.includes(a2aType)) {
        return false;
      }
    }

    // Check layer (only for add events)
    if (filter.layers && filter.layers.length > 0) {
      if (event.type === 'add') {
        const addData = event.data as MemoryAddedPayload;
        if (!filter.layers.includes(addData.layer)) {
          return false;
        }
      }
    }

    // Check project ID
    if (filter.projectIds && filter.projectIds.length > 0) {
      const projectId = this.getProjectId(event);
      if (projectId && !filter.projectIds.includes(projectId)) {
        return false;
      }
    }

    // Check tags (for add events)
    if (filter.tags && filter.tags.length > 0) {
      if (event.type === 'add') {
        const addData = event.data as MemoryAddedPayload;
        const memoryTags = addData.memory.metadata.tags ?? [];
        const hasMatchingTag = filter.tags.some(tag =>
          memoryTags.includes(tag)
        );
        if (!hasMatchingTag) {
          return false;
        }
      }
    }

    // Check agent IDs
    if (filter.agentIds && filter.agentIds.length > 0) {
      if (!filter.agentIds.includes(event.agentId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get project ID from an event
   */
  private getProjectId(event: MemoryEvent): string | undefined {
    if (event.type === 'add') {
      const addData = event.data as MemoryAddedPayload;
      return addData.memory.metadata.projectId;
    }
    return undefined;
  }
}

/**
 * Create a memory event bridge for an agent
 */
export function createEventBridge(
  agentId: string,
  options?: { maxHistorySize?: number }
): MemoryEventBridge {
  return new MemoryEventBridge(agentId, options);
}

/**
 * Base Memory Layer Abstract Class
 * All memory layers inherit from this
 */

import { MemoryEntry, MemoryLayer, QueryOptions, QueryResult } from '../types.js';

export abstract class BaseMemoryLayer {
  protected layer: MemoryLayer;
  protected initialized: boolean = false;

  constructor(layer: MemoryLayer) {
    this.layer = layer;
  }

  /**
   * Initialize the memory layer
   */
  abstract initialize(): Promise<void>;

  /**
   * Store a memory entry
   */
  abstract store(entry: Omit<MemoryEntry, 'id' | 'layer'>): Promise<MemoryEntry>;

  /**
   * Query memories
   */
  abstract query(queryText: string, options?: QueryOptions): Promise<QueryResult>;

  /**
   * Get a specific memory by ID
   */
  abstract get(id: string): Promise<MemoryEntry | null>;

  /**
   * Delete a memory by ID
   */
  abstract delete(id: string): Promise<boolean>;

  /**
   * Get memory count
   */
  abstract count(): Promise<number>;

  /**
   * Get the layer type
   */
  getLayer(): MemoryLayer {
    return this.layer;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  abstract close(): Promise<void>;
}

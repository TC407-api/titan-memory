/**
 * Working Memory Layer (L1)
 * Titan Memory v2.0 - Competitive Upgrade (MemGPT-inspired)
 *
 * Explicit working memory management for controlling what's "in focus".
 * Unlike other layers, this is volatile and session-scoped.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config.js';

/**
 * A single item in working memory
 */
export interface FocusItem {
  id: string;
  content: string;
  addedAt: Date;
  expiresAt?: Date;
  priority: 'high' | 'normal' | 'low';
  source?: string;           // Where this came from (e.g., 'user', 'agent', 'recall')
  metadata?: Record<string, unknown>;
}

/**
 * Working memory state
 */
export interface WorkingMemoryState {
  focus: FocusItem[];        // Currently active context (max items configurable)
  scratchpad: string;        // Agent's current thinking/notes
  lastUpdated: Date;
  sessionId?: string;
}

/**
 * Working memory configuration
 */
export interface WorkingMemoryConfig {
  maxFocusItems: number;     // Default 5
  autoEvictMs: number;       // Default 30000 (30 seconds), 0 = no auto-evict
  persistSession: boolean;   // Whether to persist across restarts
}

/**
 * Working Memory Manager
 * Manages the explicit "in focus" context for agents
 */
export class WorkingMemory {
  private state: WorkingMemoryState;
  private config: WorkingMemoryConfig;
  private dataPath: string;
  private initialized: boolean = false;
  private evictionTimer?: NodeJS.Timeout;

  constructor(config?: Partial<WorkingMemoryConfig>) {
    const titanConfig = loadConfig();
    const dataDir = titanConfig.dataDir || path.join(process.env.HOME || '', '.claude', 'titan-memory', 'data');
    this.dataPath = path.join(dataDir, 'working-memory.json');

    this.config = {
      maxFocusItems: config?.maxFocusItems ?? 5,
      autoEvictMs: config?.autoEvictMs ?? 0, // Disabled by default for explicit control
      persistSession: config?.persistSession ?? false,
    };

    this.state = {
      focus: [],
      scratchpad: '',
      lastUpdated: new Date(),
    };
  }

  /**
   * Initialize working memory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Only load persisted state if configured to
      if (this.config.persistSession && fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        this.loadFromData(data);
      }

      // Start auto-eviction if configured
      if (this.config.autoEvictMs > 0) {
        this.startAutoEviction();
      }

      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize WorkingMemory:', error);
      this.initialized = true;
    }
  }

  /**
   * Load state from persisted data
   */
  private loadFromData(data: WorkingMemoryState): void {
    this.state = {
      focus: (data.focus || []).map(item => ({
        ...item,
        addedAt: new Date(item.addedAt),
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
      })),
      scratchpad: data.scratchpad || '',
      lastUpdated: new Date(data.lastUpdated),
      sessionId: data.sessionId,
    };

    // Remove expired items
    this.evictExpired();
  }

  /**
   * Add an item to focus
   */
  async addFocus(params: {
    content: string;
    priority?: 'high' | 'normal' | 'low';
    ttlMs?: number;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<FocusItem> {
    if (!this.initialized) await this.initialize();

    const item: FocusItem = {
      id: this.generateId(),
      content: params.content,
      addedAt: new Date(),
      expiresAt: params.ttlMs ? new Date(Date.now() + params.ttlMs) : undefined,
      priority: params.priority || 'normal',
      source: params.source,
      metadata: params.metadata,
    };

    // Check for duplicates (same content)
    const existingIndex = this.state.focus.findIndex(f => f.content === params.content);
    if (existingIndex >= 0) {
      // Update existing item
      this.state.focus[existingIndex] = item;
    } else {
      // Add new item
      this.state.focus.push(item);

      // Enforce max items - evict lowest priority, oldest first
      while (this.state.focus.length > this.config.maxFocusItems) {
        this.evictLowestPriority();
      }
    }

    this.state.lastUpdated = new Date();
    await this.persist();
    return item;
  }

  /**
   * Remove a specific focus item
   */
  async removeFocus(id: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    const index = this.state.focus.findIndex(f => f.id === id);
    if (index < 0) return false;

    this.state.focus.splice(index, 1);
    this.state.lastUpdated = new Date();
    await this.persist();
    return true;
  }

  /**
   * Clear all focus items
   */
  async clearFocus(): Promise<number> {
    if (!this.initialized) await this.initialize();

    const count = this.state.focus.length;
    this.state.focus = [];
    this.state.lastUpdated = new Date();
    await this.persist();
    return count;
  }

  /**
   * Get current focus items
   */
  async getFocus(): Promise<FocusItem[]> {
    if (!this.initialized) await this.initialize();

    // Evict expired items first
    this.evictExpired();

    // Sort by priority (high first), then by addedAt (newest first)
    return [...this.state.focus].sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.addedAt.getTime() - a.addedAt.getTime();
    });
  }

  /**
   * Get focus as formatted context string
   */
  async getFocusContext(): Promise<string> {
    const items = await this.getFocus();
    if (items.length === 0) return '';

    const lines = items.map((item, i) => {
      const priorityTag = item.priority === 'high' ? '[HIGH] ' : item.priority === 'low' ? '[low] ' : '';
      return `${i + 1}. ${priorityTag}${item.content}`;
    });

    return `## Current Focus\n${lines.join('\n')}`;
  }

  /**
   * Update scratchpad
   */
  async setScratchpad(content: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    this.state.scratchpad = content;
    this.state.lastUpdated = new Date();
    await this.persist();
  }

  /**
   * Append to scratchpad
   */
  async appendScratchpad(content: string): Promise<void> {
    if (!this.initialized) await this.initialize();

    this.state.scratchpad = this.state.scratchpad
      ? `${this.state.scratchpad}\n${content}`
      : content;
    this.state.lastUpdated = new Date();
    await this.persist();
  }

  /**
   * Get scratchpad
   */
  async getScratchpad(): Promise<string> {
    if (!this.initialized) await this.initialize();
    return this.state.scratchpad;
  }

  /**
   * Clear scratchpad
   */
  async clearScratchpad(): Promise<void> {
    if (!this.initialized) await this.initialize();
    this.state.scratchpad = '';
    this.state.lastUpdated = new Date();
    await this.persist();
  }

  /**
   * Get full working memory state
   */
  async getState(): Promise<WorkingMemoryState> {
    if (!this.initialized) await this.initialize();
    this.evictExpired();
    return { ...this.state };
  }

  /**
   * Set session ID for tracking
   */
  async setSessionId(sessionId: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    this.state.sessionId = sessionId;
    await this.persist();
  }

  /**
   * Evict expired items
   */
  private evictExpired(): void {
    const now = Date.now();
    this.state.focus = this.state.focus.filter(item => {
      if (!item.expiresAt) return true;
      return item.expiresAt.getTime() > now;
    });
  }

  /**
   * Evict lowest priority item (for enforcing max items)
   */
  private evictLowestPriority(): void {
    if (this.state.focus.length === 0) return;

    // Find lowest priority, oldest item
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    let evictIndex = 0;
    let evictScore = -1;

    for (let i = 0; i < this.state.focus.length; i++) {
      const item = this.state.focus[i];
      // Higher score = more evictable (lower priority, older)
      const score = priorityOrder[item.priority] * 1000000 + (Date.now() - item.addedAt.getTime());
      if (score > evictScore) {
        evictScore = score;
        evictIndex = i;
      }
    }

    this.state.focus.splice(evictIndex, 1);
  }

  /**
   * Start auto-eviction timer
   */
  private startAutoEviction(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
    }

    this.evictionTimer = setInterval(() => {
      const beforeCount = this.state.focus.length;
      this.evictExpired();
      if (this.state.focus.length !== beforeCount) {
        this.persist().catch(console.error);
      }
    }, Math.min(this.config.autoEvictMs, 5000)); // Check at least every 5 seconds
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `wm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Persist state to disk
   */
  private async persist(): Promise<void> {
    if (!this.config.persistSession) return;

    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.dataPath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.warn('Failed to persist WorkingMemory:', error);
    }
  }

  /**
   * Close working memory
   */
  async close(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = undefined;
    }

    if (this.config.persistSession) {
      await this.persist();
    }

    this.initialized = false;
  }
}

// Singleton instance
let workingMemoryInstance: WorkingMemory | null = null;

export function getWorkingMemory(config?: Partial<WorkingMemoryConfig>): WorkingMemory {
  if (!workingMemoryInstance) {
    workingMemoryInstance = new WorkingMemory(config);
  }
  return workingMemoryInstance;
}

export function resetWorkingMemory(): void {
  workingMemoryInstance = null;
}

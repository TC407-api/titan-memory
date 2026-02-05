/**
 * NOOP Decision Logger
 * Tracks when the agent explicitly decides NOT to store memory
 * Part of Titan Memory v2.0 - Competitive Upgrade (Mem0 AUDN pattern)
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config.js';

/**
 * NOOP decision reasons
 */
export type NoopReason =
  | 'routine'      // Routine interaction, not worth storing
  | 'duplicate'    // Content already exists in memory
  | 'low_value'    // Content lacks informational value
  | 'temporary'    // Temporary/ephemeral content
  | 'off_topic'    // Not relevant to current project/context
  | 'noise';       // Filtered by surprise detection

/**
 * NOOP decision record
 */
export interface NoopDecision {
  id: string;
  reason: NoopReason;
  context?: string;
  contentPreview?: string;   // First 100 chars for debugging
  timestamp: Date;
  sessionId?: string;
  projectId?: string;
}

/**
 * NOOP statistics
 */
export interface NoopStats {
  totalNoops: number;
  byReason: Record<NoopReason, number>;
  last24Hours: number;
  last7Days: number;
  memoryWriteRatio: number;  // writes / (writes + noops)
}

/**
 * NOOP Decision Logger
 * Maintains a log of skip decisions for analytics
 */
export class NoopLogger {
  private logPath: string;
  private decisions: NoopDecision[] = [];
  private memoryWriteCount: number = 0;
  private initialized: boolean = false;
  private maxLogSize: number = 10000;

  constructor() {
    const config = loadConfig();
    const dataDir = config.dataDir || path.join(process.env.HOME || '', '.claude', 'titan-memory', 'data');
    this.logPath = path.join(dataDir, 'noop-log.json');
  }

  /**
   * Initialize the logger
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing log
      if (fs.existsSync(this.logPath)) {
        const data = JSON.parse(fs.readFileSync(this.logPath, 'utf-8'));
        this.decisions = data.decisions || [];
        this.memoryWriteCount = data.memoryWriteCount || 0;
      }

      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize NoopLogger:', error);
      this.decisions = [];
      this.initialized = true;
    }
  }

  /**
   * Log a NOOP decision
   */
  async logNoop(params: {
    reason: NoopReason;
    context?: string;
    contentPreview?: string;
    sessionId?: string;
    projectId?: string;
  }): Promise<NoopDecision> {
    if (!this.initialized) await this.initialize();

    const decision: NoopDecision = {
      id: this.generateId(),
      reason: params.reason,
      context: params.context,
      contentPreview: params.contentPreview?.substring(0, 100),
      timestamp: new Date(),
      sessionId: params.sessionId,
      projectId: params.projectId,
    };

    this.decisions.push(decision);

    // Trim if exceeds max size
    if (this.decisions.length > this.maxLogSize) {
      this.decisions = this.decisions.slice(-this.maxLogSize);
    }

    await this.persist();
    return decision;
  }

  /**
   * Record a memory write (for ratio calculation)
   */
  async recordMemoryWrite(): Promise<void> {
    if (!this.initialized) await this.initialize();
    this.memoryWriteCount++;
    await this.persist();
  }

  /**
   * Get NOOP statistics
   */
  async getStats(): Promise<NoopStats> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const byReason: Record<NoopReason, number> = {
      routine: 0,
      duplicate: 0,
      low_value: 0,
      temporary: 0,
      off_topic: 0,
      noise: 0,
    };

    let last24Hours = 0;
    let last7Days = 0;

    for (const decision of this.decisions) {
      const ts = new Date(decision.timestamp).getTime();
      byReason[decision.reason]++;
      if (ts >= oneDayAgo) last24Hours++;
      if (ts >= sevenDaysAgo) last7Days++;
    }

    const totalOperations = this.memoryWriteCount + this.decisions.length;
    const memoryWriteRatio = totalOperations > 0
      ? this.memoryWriteCount / totalOperations
      : 1;

    return {
      totalNoops: this.decisions.length,
      byReason,
      last24Hours,
      last7Days,
      memoryWriteRatio,
    };
  }

  /**
   * Get recent NOOP decisions
   */
  async getRecent(limit: number = 10): Promise<NoopDecision[]> {
    if (!this.initialized) await this.initialize();
    return this.decisions.slice(-limit).reverse();
  }

  /**
   * Clear old decisions (older than specified days)
   */
  async pruneOld(daysToKeep: number = 30): Promise<number> {
    if (!this.initialized) await this.initialize();

    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const originalLength = this.decisions.length;

    this.decisions = this.decisions.filter(
      d => new Date(d.timestamp).getTime() >= cutoff
    );

    await this.persist();
    return originalLength - this.decisions.length;
  }

  /**
   * Persist to disk
   */
  private async persist(): Promise<void> {
    try {
      const data = {
        decisions: this.decisions,
        memoryWriteCount: this.memoryWriteCount,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(this.logPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to persist NoopLogger:', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `noop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Close the logger
   */
  async close(): Promise<void> {
    await this.persist();
    this.initialized = false;
  }
}

// Singleton instance
let noopLoggerInstance: NoopLogger | null = null;

export function getNoopLogger(): NoopLogger {
  if (!noopLoggerInstance) {
    noopLoggerInstance = new NoopLogger();
  }
  return noopLoggerInstance;
}

export async function initNoopLogger(): Promise<NoopLogger> {
  const logger = getNoopLogger();
  await logger.initialize();
  return logger;
}

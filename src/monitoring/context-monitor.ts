/**
 * FR-5: Real-Time Context Monitoring
 *
 * Provides real-time context window monitoring with:
 * - Current usage tracking
 * - Historical data collection
 * - Threshold alerts
 * - Per-agent tracking (optional)
 */

export type ContextLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OVERFLOW';

export interface ContextThresholds {
  warning: number;   // Default: 0.4 (40%)
  critical: number;  // Default: 0.8 (80%)
}

export interface ContextSnapshot {
  timestamp: string;
  usageRatio: number;
  level: ContextLevel;
  totalTokens: number;
  maxTokens: number;
  event?: string;
  agentId?: string;
}

export interface ContextStatus {
  current: {
    usageRatio: number;
    usagePercent: string;
    level: ContextLevel;
    totalTokens: number;
    maxTokens: number;
    tokensRemaining: number;
  };
  thresholds: ContextThresholds;
  history: ContextSnapshot[];
  alerts: ContextAlert[];
  agentStats?: Record<string, {
    tokensUsed: number;
    lastUpdate: string;
  }>;
}

export interface ContextAlert {
  id: string;
  timestamp: string;
  level: ContextLevel;
  usageRatio: number;
  message: string;
  acknowledged: boolean;
}

export type ContextEventCallback = (status: ContextStatus) => void;
export type AlertCallback = (alert: ContextAlert) => void;

/**
 * Context Monitor Service
 *
 * Tracks context window usage and emits alerts when thresholds are crossed.
 */
export class ContextMonitor {
  private maxTokens: number;
  private currentTokens: number = 0;
  private thresholds: ContextThresholds;
  private history: ContextSnapshot[] = [];
  private alerts: ContextAlert[] = [];
  private agentStats: Map<string, { tokensUsed: number; lastUpdate: string }> = new Map();
  private eventCallbacks: ContextEventCallback[] = [];
  private alertCallbacks: AlertCallback[] = [];
  private maxHistorySize: number = 100;
  private lastLevel: ContextLevel = 'NORMAL';
  private alertCounter: number = 0;

  constructor(options?: {
    maxTokens?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    maxHistorySize?: number;
  }) {
    this.maxTokens = options?.maxTokens || 200000;
    this.thresholds = {
      warning: options?.warningThreshold || 0.4,
      critical: options?.criticalThreshold || 0.8,
    };
    this.maxHistorySize = options?.maxHistorySize || 100;
  }

  /**
   * Update current token usage
   */
  update(totalTokens: number, event?: string, agentId?: string): void {
    this.currentTokens = totalTokens;
    const newLevel = this.getLevel();

    // Record in history
    const snapshot: ContextSnapshot = {
      timestamp: new Date().toISOString(),
      usageRatio: this.getUsageRatio(),
      level: newLevel,
      totalTokens,
      maxTokens: this.maxTokens,
      event,
      agentId,
    };
    this.addToHistory(snapshot);

    // Update agent stats if provided
    if (agentId) {
      this.agentStats.set(agentId, {
        tokensUsed: totalTokens,
        lastUpdate: snapshot.timestamp,
      });
    }

    // Check for threshold crossings
    if (this.shouldAlert(newLevel)) {
      this.createAlert(newLevel, this.getUsageRatio());
    }

    this.lastLevel = newLevel;

    // Notify callbacks
    this.notifyEventCallbacks();
  }

  /**
   * Get current context status
   */
  getStatus(): ContextStatus {
    const usageRatio = this.getUsageRatio();
    const level = this.getLevel();

    return {
      current: {
        usageRatio,
        usagePercent: `${(usageRatio * 100).toFixed(1)}%`,
        level,
        totalTokens: this.currentTokens,
        maxTokens: this.maxTokens,
        tokensRemaining: Math.max(0, this.maxTokens - this.currentTokens),
      },
      thresholds: { ...this.thresholds },
      history: [...this.history],
      alerts: [...this.alerts],
      agentStats: this.getAgentStats(),
    };
  }

  /**
   * Get usage ratio (0-1+)
   */
  getUsageRatio(): number {
    return this.currentTokens / this.maxTokens;
  }

  /**
   * Get current context level
   */
  getLevel(): ContextLevel {
    const ratio = this.getUsageRatio();

    if (ratio >= 1.0) return 'OVERFLOW';
    if (ratio >= this.thresholds.critical) return 'CRITICAL';
    if (ratio >= this.thresholds.warning) return 'WARNING';
    return 'NORMAL';
  }

  /**
   * Set max tokens (useful for different model contexts)
   */
  setMaxTokens(maxTokens: number): void {
    this.maxTokens = maxTokens;
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<ContextThresholds>): void {
    if (thresholds.warning !== undefined) {
      this.thresholds.warning = thresholds.warning;
    }
    if (thresholds.critical !== undefined) {
      this.thresholds.critical = thresholds.critical;
    }
  }

  /**
   * Register callback for status updates
   */
  onUpdate(callback: ContextEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const idx = this.eventCallbacks.indexOf(callback);
      if (idx >= 0) this.eventCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register callback for alerts
   */
  onAlert(callback: AlertCallback): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      const idx = this.alertCallbacks.indexOf(callback);
      if (idx >= 0) this.alertCallbacks.splice(idx, 1);
    };
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Clear acknowledged alerts
   */
  clearAcknowledgedAlerts(): number {
    const beforeCount = this.alerts.length;
    this.alerts = this.alerts.filter(a => !a.acknowledged);
    return beforeCount - this.alerts.length;
  }

  /**
   * Get unacknowledged alerts
   */
  getActiveAlerts(): ContextAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Get history for time range
   */
  getHistoryRange(startTime: Date, endTime: Date): ContextSnapshot[] {
    return this.history.filter(s => {
      const timestamp = new Date(s.timestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  /**
   * Reset monitor state
   */
  reset(): void {
    this.currentTokens = 0;
    this.history = [];
    this.alerts = [];
    this.agentStats.clear();
    this.lastLevel = 'NORMAL';
  }

  /**
   * Export monitoring data for persistence
   */
  export(): {
    history: ContextSnapshot[];
    alerts: ContextAlert[];
    thresholds: ContextThresholds;
    maxTokens: number;
  } {
    return {
      history: [...this.history],
      alerts: [...this.alerts],
      thresholds: { ...this.thresholds },
      maxTokens: this.maxTokens,
    };
  }

  /**
   * Import monitoring data from persistence
   */
  import(data: ReturnType<ContextMonitor['export']>): void {
    this.history = data.history;
    this.alerts = data.alerts;
    this.thresholds = data.thresholds;
    this.maxTokens = data.maxTokens;
  }

  // Private helpers

  private addToHistory(snapshot: ContextSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  private shouldAlert(newLevel: ContextLevel): boolean {
    // Alert on threshold crossing (going up)
    const levelOrder: ContextLevel[] = ['NORMAL', 'WARNING', 'CRITICAL', 'OVERFLOW'];
    const oldIdx = levelOrder.indexOf(this.lastLevel);
    const newIdx = levelOrder.indexOf(newLevel);
    return newIdx > oldIdx;
  }

  private createAlert(level: ContextLevel, usageRatio: number): void {
    const alert: ContextAlert = {
      id: `alert-${++this.alertCounter}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,
      usageRatio,
      message: this.getAlertMessage(level, usageRatio),
      acknowledged: false,
    };

    this.alerts.push(alert);

    // Notify alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }
  }

  private getAlertMessage(level: ContextLevel, ratio: number): string {
    const percent = (ratio * 100).toFixed(1);
    switch (level) {
      case 'WARNING':
        return `Context usage at ${percent}% - approaching warning threshold`;
      case 'CRITICAL':
        return `Context usage at ${percent}% - critical threshold exceeded`;
      case 'OVERFLOW':
        return `Context usage at ${percent}% - context overflow imminent`;
      default:
        return `Context usage at ${percent}%`;
    }
  }

  private notifyEventCallbacks(): void {
    const status = this.getStatus();
    for (const callback of this.eventCallbacks) {
      try {
        callback(status);
      } catch (error) {
        console.error('Context event callback error:', error);
      }
    }
  }

  private getAgentStats(): Record<string, { tokensUsed: number; lastUpdate: string }> | undefined {
    if (this.agentStats.size === 0) return undefined;
    const result: Record<string, { tokensUsed: number; lastUpdate: string }> = {};
    for (const [agentId, stats] of this.agentStats) {
      result[agentId] = stats;
    }
    return result;
  }
}

// Singleton instance
let instance: ContextMonitor | null = null;

/**
 * Get singleton ContextMonitor instance
 */
export function getContextMonitor(): ContextMonitor {
  if (!instance) {
    instance = new ContextMonitor();
  }
  return instance;
}

/**
 * Create a new ContextMonitor (for testing or custom config)
 */
export function createContextMonitor(options?: {
  maxTokens?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  maxHistorySize?: number;
}): ContextMonitor {
  return new ContextMonitor(options);
}

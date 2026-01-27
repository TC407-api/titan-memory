/**
 * Auto Context Capture Manager
 * Momentum-triggered context capture for preserving surrounding context
 *
 * Inspired by Titans' momentum-based context awareness
 */

import { v4 as uuidv4 } from 'uuid';
import { ContextCaptureConfig, ContextCaptureResult } from '../types.js';

const DEFAULT_CONFIG: Required<ContextCaptureConfig> = {
  enabled: true,
  momentumThreshold: 0.7,
  bufferSize: 10,
  captureWindowMs: 60000,
  linkToMemories: true,
};

/**
 * Circular buffer for efficient context storage
 */
class CircularContextBuffer {
  private buffer: Array<{ content: string; timestamp: Date }>;
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(content: string): void {
    this.buffer[this.head] = { content, timestamp: new Date() };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getAll(): string[] {
    if (this.count === 0) return [];
    const result: string[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(start + i) % this.capacity];
      if (entry) {
        result.push(entry.content);
      }
    }
    return result;
  }

  getRecent(windowMs: number): string[] {
    const now = Date.now();
    const result: string[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(start + i) % this.capacity];
      if (entry && (now - entry.timestamp.getTime()) <= windowMs) {
        result.push(entry.content);
      }
    }
    return result;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Context Capture Manager
 * Monitors momentum and captures context when thresholds are exceeded
 */
export class ContextCaptureManager {
  private config: Required<ContextCaptureConfig>;
  private buffer: CircularContextBuffer;
  private momentumHistory: number[] = [];
  private capturedContexts: Map<string, ContextCaptureResult> = new Map();
  private lastCaptureTime: number = 0;

  constructor(config?: Partial<ContextCaptureConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buffer = new CircularContextBuffer(this.config.bufferSize);
  }

  /**
   * Add content to the context buffer
   */
  addToBuffer(content: string): void {
    this.buffer.push(content);
  }

  /**
   * Record momentum value
   */
  recordMomentum(momentum: number): void {
    this.momentumHistory.push(momentum);

    // Keep only recent momentum values
    if (this.momentumHistory.length > 100) {
      this.momentumHistory = this.momentumHistory.slice(-100);
    }
  }

  /**
   * Check if capture should be triggered
   */
  shouldTriggerCapture(currentMomentum: number): boolean {
    if (!this.config.enabled) return false;

    // Check if momentum exceeds threshold
    if (currentMomentum < this.config.momentumThreshold) return false;

    // Prevent rapid repeated captures (at least 10 seconds between)
    const now = Date.now();
    if (now - this.lastCaptureTime < 10000) return false;

    return true;
  }

  /**
   * Capture current context
   */
  captureContext(trigger: string, momentum: number): ContextCaptureResult {
    const capturedBefore = this.buffer.getRecent(this.config.captureWindowMs);

    const result: ContextCaptureResult = {
      capturedBefore,
      trigger,
      momentumPeak: momentum,
      timestamp: new Date(),
      linkedMemoryIds: [],
    };

    // Store capture
    const captureId = uuidv4();
    this.capturedContexts.set(captureId, result);
    this.lastCaptureTime = Date.now();

    // Cleanup old captures (keep last 100)
    if (this.capturedContexts.size > 100) {
      const keys = [...this.capturedContexts.keys()];
      for (let i = 0; i < keys.length - 100; i++) {
        this.capturedContexts.delete(keys[i]);
      }
    }

    return result;
  }

  /**
   * Link a memory to a capture
   */
  linkMemory(captureId: string, memoryId: string): void {
    const capture = this.capturedContexts.get(captureId);
    if (capture && this.config.linkToMemories) {
      capture.linkedMemoryIds.push(memoryId);
    }
  }

  /**
   * Get capture by ID
   */
  getCapture(captureId: string): ContextCaptureResult | undefined {
    return this.capturedContexts.get(captureId);
  }

  /**
   * Get all captures
   */
  getAllCaptures(): ContextCaptureResult[] {
    return [...this.capturedContexts.values()];
  }

  /**
   * Get recent captures within time window
   */
  getRecentCaptures(windowMs: number = 3600000): ContextCaptureResult[] {
    const now = Date.now();
    return [...this.capturedContexts.values()]
      .filter(c => (now - c.timestamp.getTime()) <= windowMs);
  }

  /**
   * Get current buffer contents
   */
  getCurrentBuffer(): string[] {
    return this.buffer.getAll();
  }

  /**
   * Get momentum statistics
   */
  getMomentumStats(): {
    current: number;
    average: number;
    max: number;
    threshold: number;
  } {
    const current = this.momentumHistory[this.momentumHistory.length - 1] ?? 0;
    const average = this.momentumHistory.length > 0
      ? this.momentumHistory.reduce((a, b) => a + b, 0) / this.momentumHistory.length
      : 0;
    const max = Math.max(0, ...this.momentumHistory);

    return {
      current,
      average,
      max,
      threshold: this.config.momentumThreshold,
    };
  }

  /**
   * Process content and potentially trigger capture
   */
  processContent(content: string, momentum: number): ContextCaptureResult | null {
    // Add to buffer
    this.addToBuffer(content);

    // Record momentum
    this.recordMomentum(momentum);

    // Check if capture should be triggered
    if (this.shouldTriggerCapture(momentum)) {
      return this.captureContext(content, momentum);
    }

    return null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextCaptureConfig>): void {
    this.config = { ...this.config, ...config };

    // Resize buffer if needed
    if (config.bufferSize && config.bufferSize !== this.buffer.size()) {
      const oldContent = this.buffer.getAll();
      this.buffer = new CircularContextBuffer(config.bufferSize);
      for (const content of oldContent.slice(-config.bufferSize)) {
        this.buffer.push(content);
      }
    }
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.buffer.clear();
    this.momentumHistory = [];
    this.capturedContexts.clear();
    this.lastCaptureTime = 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    bufferSize: number;
    bufferCapacity: number;
    captureCount: number;
    momentumHistorySize: number;
    enabled: boolean;
  } {
    return {
      bufferSize: this.buffer.size(),
      bufferCapacity: this.config.bufferSize,
      captureCount: this.capturedContexts.size,
      momentumHistorySize: this.momentumHistory.length,
      enabled: this.config.enabled,
    };
  }
}

/**
 * Create a context capture manager
 */
export function createContextCaptureManager(
  config?: Partial<ContextCaptureConfig>
): ContextCaptureManager {
  return new ContextCaptureManager(config);
}

/**
 * Check if content suggests high importance (heuristic)
 */
export function isHighImportanceContent(content: string): boolean {
  const lower = content.toLowerCase();

  const highImportancePatterns = [
    /decided|decision|chose/,
    /error|bug|issue|failed/,
    /fixed|solved|resolved/,
    /learned|discovered|realized/,
    /important|critical|urgent/,
    /remember|note|key point/,
  ];

  return highImportancePatterns.some(pattern => pattern.test(lower));
}

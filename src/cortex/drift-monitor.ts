/**
 * Cortex Drift Monitor
 * Tracks classification accuracy via utility feedback
 * Documents every "Right" vs "Wrong" (self-healing logic)
 */

import { MemoryCategory, DriftEntry, DriftStats } from './types.js';

const DEFAULT_ALERT_THRESHOLD = 0.7;
const RECENT_WINDOW = 50;

/**
 * Drift Monitor - tracks classification accuracy over time
 */
export class DriftMonitor {
  private entries: DriftEntry[] = [];
  private alertThreshold: number;
  private enabled: boolean;

  constructor(options?: { alertThreshold?: number; enabled?: boolean }) {
    this.alertThreshold = options?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD;
    this.enabled = options?.enabled ?? false;
  }

  /**
   * Record a classification outcome based on feedback
   */
  recordFeedback(
    memoryId: string,
    originalCategory: MemoryCategory,
    feedbackSignal: 'helpful' | 'harmful'
  ): void {
    if (!this.enabled) return;

    const entry: DriftEntry = {
      timestamp: new Date(),
      memoryId,
      originalCategory,
      feedbackSignal,
      // If the memory was helpful, classification was likely correct
      // If harmful, classification may have been wrong
      isCorrect: feedbackSignal === 'helpful',
    };

    this.entries.push(entry);
  }

  /**
   * Get drift statistics
   */
  getStats(): DriftStats {
    if (this.entries.length === 0) {
      return this.emptyStats();
    }

    const total = this.entries.length;
    const correct = this.entries.filter(e => e.isCorrect).length;
    const accuracy = correct / total;

    // Per-category accuracy
    const byCategoryAccuracy = this.calculateCategoryAccuracy();

    // Recent trend (last N vs previous N)
    const recentTrend = this.calculateTrend();

    return {
      totalClassifications: total,
      correctClassifications: correct,
      accuracy,
      byCategoryAccuracy,
      recentTrend,
      alertThreshold: this.alertThreshold,
      belowThreshold: accuracy < this.alertThreshold,
    };
  }

  /**
   * Check if accuracy is below alert threshold
   */
  isAlertTriggered(): boolean {
    if (this.entries.length < 10) return false;
    const stats = this.getStats();
    return stats.belowThreshold;
  }

  /**
   * Get entries for a specific category
   */
  getEntriesForCategory(category: MemoryCategory): DriftEntry[] {
    return this.entries.filter(e => e.originalCategory === category);
  }

  /**
   * Get recent entries
   */
  getRecentEntries(count?: number): DriftEntry[] {
    const n = count ?? RECENT_WINDOW;
    return this.entries.slice(-n);
  }

  /**
   * Clear all entries (for testing or reset)
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Check if monitor is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private calculateCategoryAccuracy(): Record<MemoryCategory, { correct: number; total: number; accuracy: number }> {
    const categories: MemoryCategory[] = ['knowledge', 'profile', 'event', 'behavior', 'skill'];
    const result: Record<MemoryCategory, { correct: number; total: number; accuracy: number }> = {} as Record<MemoryCategory, { correct: number; total: number; accuracy: number }>;

    for (const cat of categories) {
      const catEntries = this.entries.filter(e => e.originalCategory === cat);
      const catCorrect = catEntries.filter(e => e.isCorrect).length;
      const catTotal = catEntries.length;

      result[cat] = {
        correct: catCorrect,
        total: catTotal,
        accuracy: catTotal > 0 ? catCorrect / catTotal : 1,
      };
    }

    return result;
  }

  private calculateTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.entries.length < RECENT_WINDOW * 2) return 'stable';

    const recentEntries = this.entries.slice(-RECENT_WINDOW);
    const previousEntries = this.entries.slice(-RECENT_WINDOW * 2, -RECENT_WINDOW);

    const recentAccuracy = recentEntries.filter(e => e.isCorrect).length / recentEntries.length;
    const previousAccuracy = previousEntries.filter(e => e.isCorrect).length / previousEntries.length;

    const diff = recentAccuracy - previousAccuracy;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'degrading';
    return 'stable';
  }

  private emptyStats(): DriftStats {
    const emptyCategory = { correct: 0, total: 0, accuracy: 1 };
    return {
      totalClassifications: 0,
      correctClassifications: 0,
      accuracy: 1,
      byCategoryAccuracy: {
        knowledge: { ...emptyCategory },
        profile: { ...emptyCategory },
        event: { ...emptyCategory },
        behavior: { ...emptyCategory },
        skill: { ...emptyCategory },
      },
      recentTrend: 'stable',
      alertThreshold: this.alertThreshold,
      belowThreshold: false,
    };
  }
}

/**
 * Continual Learning System
 *
 * Implements Hope-inspired continual learning without catastrophic forgetting.
 * Key features:
 * - Pattern lifecycle management (immature → developing → mature → stable)
 * - Plasticity-stability tradeoff tracking
 * - Catastrophic forgetting detection
 * - Adaptive learning rates based on maturity
 * - Knowledge distillation for mature patterns
 * - Spaced repetition scheduling (SM-2 algorithm)
 * - Cross-pattern transfer learning
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';
import {
  MemoryEntry,
  PatternLifecycle,
  PatternStage,
  UpdateRecord,
  ForgettingRisk,
  RehearsalEntry,
  LearningStats,
  ContinualLearnerConfig,
} from '../types.js';

// Default configuration
const DEFAULT_CONFIG: ContinualLearnerConfig = {
  plasticityDecay: 0.05,            // 5% per day
  stabilityThreshold: 0.8,
  forgettingAlertThreshold: 0.4,
  rehearsalIntervals: [1, 3, 7, 14, 30, 90],
  distillationThreshold: 10,
  snapshotInterval: 7,
  maturityAgeDays: 30,
  stableAgeDays: 90,
  enableCrossTransfer: true,
};

export class ContinualLearner {
  private patterns: Map<string, PatternLifecycle> = new Map();
  private rehearsalQueue: Map<string, RehearsalEntry> = new Map();
  private domainLearningRates: Map<string, number> = new Map();
  private forgettingAlerts: ForgettingRisk[] = [];
  private crossTransferLog: Array<{ from: string; to: string; timestamp: Date }> = [];
  private distillationCount: number = 0;

  private dataPath: string;
  private config: ContinualLearnerConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<ContinualLearnerConfig>) {
    const titanConfig = getConfig();
    this.dataPath = path.join(titanConfig.dataDir, 'learning', 'state.json');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    if (fs.existsSync(this.dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));

        // Load patterns
        for (const pattern of data.patterns || []) {
          pattern.createdAt = new Date(pattern.createdAt);
          pattern.snapshotDate = new Date(pattern.snapshotDate);
          if (pattern.lastRehearsed) {
            pattern.lastRehearsed = new Date(pattern.lastRehearsed);
          }
          pattern.updateHistory = (pattern.updateHistory || []).map((u: UpdateRecord) => ({
            ...u,
            timestamp: new Date(u.timestamp),
          }));
          this.patterns.set(pattern.id, pattern);
        }

        // Load rehearsal queue
        for (const entry of data.rehearsalQueue || []) {
          entry.scheduledFor = new Date(entry.scheduledFor);
          if (entry.lastReview) {
            entry.lastReview = new Date(entry.lastReview);
          }
          this.rehearsalQueue.set(entry.patternId, entry);
        }

        // Load domain learning rates
        for (const [domain, rate] of Object.entries(data.domainLearningRates || {})) {
          this.domainLearningRates.set(domain, rate as number);
        }

        // Load forgetting alerts
        this.forgettingAlerts = (data.forgettingAlerts || []).map((a: ForgettingRisk) => ({
          ...a,
          timestamp: new Date(a.timestamp),
        }));

        // Load cross-transfer log
        this.crossTransferLog = (data.crossTransferLog || []).map((t: { from: string; to: string; timestamp: string }) => ({
          ...t,
          timestamp: new Date(t.timestamp),
        }));

        this.distillationCount = data.distillationCount || 0;
      } catch (error) {
        console.warn('Failed to load continual learning state:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      patterns: [...this.patterns.values()],
      rehearsalQueue: [...this.rehearsalQueue.values()],
      domainLearningRates: Object.fromEntries(this.domainLearningRates),
      forgettingAlerts: this.forgettingAlerts.slice(-100), // Keep last 100
      crossTransferLog: this.crossTransferLog.slice(-1000), // Keep last 1000
      distillationCount: this.distillationCount,
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  // ==================== Pattern Lifecycle Management ====================

  /**
   * Process a new memory entry and create/update pattern lifecycle
   */
  async processNewMemory(memory: MemoryEntry): Promise<PatternLifecycle> {
    const existingPattern = this.findPatternByMemoryId(memory.id);

    if (existingPattern) {
      return this.updatePattern(existingPattern, memory);
    }

    return this.createPattern(memory);
  }

  /**
   * Create a new pattern lifecycle for a memory
   */
  private async createPattern(memory: MemoryEntry): Promise<PatternLifecycle> {
    const now = new Date();
    const pattern: PatternLifecycle = {
      id: uuidv4(),
      memoryId: memory.id,
      stage: 'immature',
      createdAt: now,
      maturityScore: 0,
      plasticityIndex: 1.0,  // Start fully plastic
      stabilityIndex: 0,     // No stability initially
      updateHistory: [{
        timestamp: now,
        changeType: 'create',
        newContent: memory.content,
      }],
      rehearsalCount: 0,
      snapshotContent: memory.content,
      snapshotDate: now,
      domain: this.detectDomain(memory.content),
    };

    this.patterns.set(pattern.id, pattern);

    // Schedule initial rehearsal
    this.scheduleRehearsal(pattern.id, 1);

    await this.saveToDisk();
    return pattern;
  }

  /**
   * Update an existing pattern with new information
   */
  private async updatePattern(
    pattern: PatternLifecycle,
    memory: MemoryEntry
  ): Promise<PatternLifecycle> {
    const now = new Date();
    const previousContent = pattern.updateHistory[pattern.updateHistory.length - 1]?.newContent || '';

    // Calculate divergence from previous content
    const divergence = this.calculateDivergence(previousContent, memory.content);

    // Check if this would cause catastrophic forgetting
    if (pattern.stabilityIndex >= this.config.stabilityThreshold && divergence > this.config.forgettingAlertThreshold) {
      // Pattern is stable - protect from drastic changes
      await this.addForgettingAlert(pattern, divergence);
      return pattern; // Don't update stable pattern drastically
    }

    // Calculate adaptive learning rate (used for divergence weighting)
    const learningRate = this.getAdaptiveLearningRate(pattern);

    // Weight the divergence by learning rate (high plasticity = more tolerant of changes)
    const weightedDivergence = divergence * (1 - learningRate * 0.5);

    // Update pattern with weighted blend
    const updateRecord: UpdateRecord = {
      timestamp: now,
      changeType: 'update',
      previousContent,
      newContent: memory.content,
      divergenceScore: weightedDivergence,
    };

    pattern.updateHistory.push(updateRecord);

    // Trim history if too long
    if (pattern.updateHistory.length > 100) {
      pattern.updateHistory = pattern.updateHistory.slice(-100);
    }

    // Update maturity and indices
    this.updatePatternIndices(pattern);

    // Check for distillation trigger
    if (pattern.updateHistory.length >= this.config.distillationThreshold && !pattern.distilledContent) {
      pattern.distilledContent = this.distillPattern(pattern);
      this.distillationCount++;
    }

    // Update snapshot if interval passed
    const daysSinceSnapshot = (now.getTime() - pattern.snapshotDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSnapshot >= this.config.snapshotInterval) {
      pattern.snapshotContent = memory.content;
      pattern.snapshotDate = now;
    }

    // Update lifecycle stage
    pattern.stage = this.determineStage(pattern);

    this.patterns.set(pattern.id, pattern);
    await this.saveToDisk();

    // Attempt cross-pattern transfer if enabled
    if (this.config.enableCrossTransfer && divergence > 0.2) {
      await this.attemptCrossTransfer(pattern, memory.content);
    }

    return pattern;
  }

  /**
   * Update pattern indices (maturity, plasticity, stability)
   */
  private updatePatternIndices(pattern: PatternLifecycle): void {
    const now = new Date();
    const ageInDays = (now.getTime() - pattern.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Maturity: based on age, update count, and consistency
    const ageScore = Math.min(1, ageInDays / this.config.stableAgeDays);
    const updateScore = Math.min(1, pattern.updateHistory.length / 20);
    const consistencyScore = this.calculateConsistency(pattern);
    pattern.maturityScore = (ageScore * 0.4 + updateScore * 0.3 + consistencyScore * 0.3);

    // Plasticity: decreases with maturity (inverse relationship)
    // New patterns are very plastic, mature patterns less so
    pattern.plasticityIndex = Math.max(0.1, 1 - (pattern.maturityScore * (1 - this.config.plasticityDecay)));

    // Stability: increases with age, consistency, and rehearsal
    const rehearsalBoost = Math.min(0.2, pattern.rehearsalCount * 0.02);
    pattern.stabilityIndex = Math.min(1, (pattern.maturityScore * 0.7) + (consistencyScore * 0.2) + rehearsalBoost);
  }

  /**
   * Calculate consistency of pattern updates (low divergence = high consistency)
   */
  private calculateConsistency(pattern: PatternLifecycle): number {
    if (pattern.updateHistory.length < 2) return 1;

    const recentUpdates = pattern.updateHistory.slice(-10);
    const divergences = recentUpdates
      .filter(u => u.divergenceScore !== undefined)
      .map(u => u.divergenceScore!);

    if (divergences.length === 0) return 1;

    const avgDivergence = divergences.reduce((a, b) => a + b, 0) / divergences.length;
    return Math.max(0, 1 - avgDivergence);
  }

  /**
   * Determine lifecycle stage based on maturity and stability
   */
  private determineStage(pattern: PatternLifecycle): PatternStage {
    const ageInDays = (Date.now() - pattern.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (pattern.stabilityIndex >= 0.9 && ageInDays > this.config.stableAgeDays) {
      return 'stable';
    }
    if (pattern.maturityScore >= 0.7 && ageInDays > this.config.maturityAgeDays) {
      return 'mature';
    }
    if (pattern.maturityScore >= 0.3) {
      return 'developing';
    }
    return 'immature';
  }

  // ==================== Plasticity-Stability Tracking ====================

  /**
   * Get plasticity index for a pattern
   */
  getPlasticityIndex(patternId: string): number {
    const pattern = this.patterns.get(patternId);
    return pattern?.plasticityIndex ?? 1.0;
  }

  /**
   * Get stability index for a pattern
   */
  getStabilityIndex(patternId: string): number {
    const pattern = this.patterns.get(patternId);
    return pattern?.stabilityIndex ?? 0;
  }

  /**
   * Get adaptive learning rate for a pattern
   */
  private getAdaptiveLearningRate(pattern: PatternLifecycle): number {
    // Base rate from plasticity
    let rate = pattern.plasticityIndex;

    // Domain-specific adjustment
    if (pattern.domain && this.domainLearningRates.has(pattern.domain)) {
      const domainRate = this.domainLearningRates.get(pattern.domain)!;
      rate = (rate + domainRate) / 2;
    }

    return rate;
  }

  /**
   * Update domain learning rate based on success/failure
   */
  updateDomainLearningRate(domain: string, success: boolean): void {
    const currentRate = this.domainLearningRates.get(domain) || 0.5;
    const adjustment = success ? 0.05 : -0.05;
    const newRate = Math.max(0.1, Math.min(1.0, currentRate + adjustment));
    this.domainLearningRates.set(domain, newRate);
  }

  // ==================== Catastrophic Forgetting Detection ====================

  /**
   * Check for catastrophic forgetting risk
   */
  async checkForgettingRisk(): Promise<ForgettingRisk> {
    const affectedPatterns: ForgettingRisk['affectedPatterns'] = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.stage === 'stable' || pattern.stage === 'mature') {
        const currentContent = pattern.updateHistory[pattern.updateHistory.length - 1]?.newContent || '';
        const divergence = this.calculateDivergence(pattern.snapshotContent, currentContent);

        if (divergence > this.config.forgettingAlertThreshold) {
          affectedPatterns.push({
            patternId: pattern.id,
            divergence,
            description: `Pattern ${pattern.id} has diverged ${(divergence * 100).toFixed(1)}% from snapshot`,
          });
        }
      }
    }

    const risk: ForgettingRisk = {
      alert: affectedPatterns.length > 0,
      riskLevel: this.calculateRiskLevel(affectedPatterns),
      affectedPatterns,
      timestamp: new Date(),
    };

    if (risk.alert) {
      this.forgettingAlerts.push(risk);
      await this.saveToDisk();
    }

    return risk;
  }

  private calculateRiskLevel(affectedPatterns: ForgettingRisk['affectedPatterns']): ForgettingRisk['riskLevel'] {
    if (affectedPatterns.length === 0) return 'none';

    const maxDivergence = Math.max(...affectedPatterns.map(p => p.divergence));
    const patternCount = affectedPatterns.length;

    if (maxDivergence > 0.8 || patternCount > 10) return 'critical';
    if (maxDivergence > 0.6 || patternCount > 5) return 'high';
    if (maxDivergence > 0.4 || patternCount > 2) return 'medium';
    return 'low';
  }

  private async addForgettingAlert(pattern: PatternLifecycle, divergence: number): Promise<void> {
    const alert: ForgettingRisk = {
      alert: true,
      riskLevel: divergence > 0.6 ? 'high' : 'medium',
      affectedPatterns: [{
        patternId: pattern.id,
        divergence,
        description: `Blocked update to stable pattern (divergence: ${(divergence * 100).toFixed(1)}%)`,
      }],
      timestamp: new Date(),
    };

    this.forgettingAlerts.push(alert);
    await this.saveToDisk();
  }

  /**
   * Calculate divergence between two content strings
   */
  private calculateDivergence(content1: string, content2: string): number {
    if (!content1 || !content2) return 1;
    if (content1 === content2) return 0;

    const tokens1 = new Set(content1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
    const union = new Set([...tokens1, ...tokens2]).size;

    const similarity = union > 0 ? intersection / union : 0;
    return 1 - similarity;
  }

  // ==================== Knowledge Distillation ====================

  /**
   * Distill core insights from a pattern
   */
  distillPattern(pattern: PatternLifecycle): string {
    const updates = pattern.updateHistory;
    if (updates.length === 0) return '';

    // Extract key sentences that appear across multiple updates
    const sentenceFrequency = new Map<string, number>();

    for (const update of updates) {
      const sentences = update.newContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
      for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase();
        sentenceFrequency.set(normalized, (sentenceFrequency.get(normalized) || 0) + 1);
      }
    }

    // Get sentences that appear in at least 30% of updates
    const threshold = Math.max(2, Math.floor(updates.length * 0.3));
    const coreInsights = [...sentenceFrequency.entries()]
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sentence]) => sentence);

    if (coreInsights.length === 0) {
      // Fallback: take key phrases from most recent content
      const latestContent = updates[updates.length - 1].newContent;
      return latestContent.substring(0, 200);
    }

    return coreInsights.join('. ') + '.';
  }

  /**
   * Get distilled content for a pattern
   */
  getDistilledContent(patternId: string): string | undefined {
    return this.patterns.get(patternId)?.distilledContent;
  }

  // ==================== Spaced Repetition ====================

  /**
   * Schedule a rehearsal for a pattern (SM-2 inspired)
   */
  private scheduleRehearsal(patternId: string, intervalIndex: number = 0): void {
    const intervals = this.config.rehearsalIntervals;
    const interval = intervals[Math.min(intervalIndex, intervals.length - 1)];
    const scheduledFor = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

    const entry: RehearsalEntry = {
      patternId,
      scheduledFor,
      interval,
      easeFactor: 2.5,  // SM-2 default
      reviewCount: 0,
    };

    this.rehearsalQueue.set(patternId, entry);
  }

  /**
   * Execute pending rehearsals
   */
  async executeRehearsals(): Promise<Array<{ patternId: string; newInterval: number }>> {
    const now = new Date();
    const results: Array<{ patternId: string; newInterval: number }> = [];

    for (const [patternId, entry] of this.rehearsalQueue.entries()) {
      if (entry.scheduledFor <= now) {
        const pattern = this.patterns.get(patternId);
        if (pattern) {
          // Perform rehearsal (reinforce the pattern)
          pattern.lastRehearsed = now;
          pattern.rehearsalCount++;
          this.updatePatternIndices(pattern);

          // Calculate next interval using SM-2-like algorithm
          const quality = Math.min(5, Math.floor(pattern.stabilityIndex * 5) + 1);
          entry.easeFactor = Math.max(1.3, entry.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
          const newInterval = Math.round(entry.interval * entry.easeFactor);

          entry.interval = newInterval;
          entry.scheduledFor = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);
          entry.lastReview = now;
          entry.reviewCount++;

          results.push({ patternId, newInterval });
        }
      }
    }

    await this.saveToDisk();
    return results;
  }

  /**
   * Get pending rehearsals
   */
  getPendingRehearsals(): RehearsalEntry[] {
    const now = new Date();
    return [...this.rehearsalQueue.values()]
      .filter(e => e.scheduledFor <= now);
  }

  // ==================== Cross-Pattern Transfer ====================

  /**
   * Attempt to transfer learning from updated pattern to related patterns
   */
  private async attemptCrossTransfer(sourcePattern: PatternLifecycle, newContent: string): Promise<void> {
    if (!this.config.enableCrossTransfer) return;

    // Find related patterns (same domain or similar content)
    const relatedPatterns = this.findRelatedPatterns(sourcePattern, newContent);

    for (const targetPattern of relatedPatterns.slice(0, 3)) {
      // Only transfer to less mature patterns
      if (targetPattern.maturityScore < sourcePattern.maturityScore) {
        // Boost stability of related patterns (knowledge reinforcement)
        targetPattern.stabilityIndex = Math.min(1, targetPattern.stabilityIndex + 0.05);

        this.crossTransferLog.push({
          from: sourcePattern.id,
          to: targetPattern.id,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Find patterns related to a given pattern
   */
  private findRelatedPatterns(pattern: PatternLifecycle, content: string): PatternLifecycle[] {
    const related: Array<{ pattern: PatternLifecycle; score: number }> = [];

    for (const other of this.patterns.values()) {
      if (other.id === pattern.id) continue;

      let score = 0;

      // Same domain bonus
      if (other.domain && other.domain === pattern.domain) {
        score += 0.5;
      }

      // Content similarity
      const otherContent = other.updateHistory[other.updateHistory.length - 1]?.newContent || '';
      const similarity = 1 - this.calculateDivergence(content, otherContent);
      score += similarity * 0.5;

      if (score > 0.3) {
        related.push({ pattern: other, score });
      }
    }

    return related
      .sort((a, b) => b.score - a.score)
      .map(r => r.pattern);
  }

  // ==================== Pattern Queries ====================

  /**
   * Get pattern lifecycle by ID
   */
  getPatternLifecycle(patternId: string): PatternLifecycle | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Find pattern by memory ID
   */
  findPatternByMemoryId(memoryId: string): PatternLifecycle | undefined {
    for (const pattern of this.patterns.values()) {
      if (pattern.memoryId === memoryId) {
        return pattern;
      }
    }
    return undefined;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): PatternLifecycle[] {
    return [...this.patterns.values()];
  }

  /**
   * Get patterns by stage
   */
  getPatternsByStage(stage: PatternStage): PatternLifecycle[] {
    return [...this.patterns.values()].filter(p => p.stage === stage);
  }

  // ==================== Utilities ====================

  /**
   * Detect domain from content
   */
  private detectDomain(content: string): string {
    const lower = content.toLowerCase();

    const domains = [
      { name: 'react', patterns: [/\breact\b/, /\bcomponent\b/, /\bhooks?\b/, /\bjsx\b/] },
      { name: 'typescript', patterns: [/\btypescript\b/, /\binterface\b/, /\btype\s+\w+\b/, /\bgeneric\b/] },
      { name: 'database', patterns: [/\bsql\b/, /\bdatabase\b/, /\bquery\b/, /\bschema\b/] },
      { name: 'api', patterns: [/\bapi\b/, /\bendpoint\b/, /\brest\b/, /\bgraphql\b/] },
      { name: 'testing', patterns: [/\btest\b/, /\bjest\b/, /\bspec\b/, /\bmock\b/] },
      { name: 'architecture', patterns: [/\barchitecture\b/, /\bpattern\b/, /\bdesign\b/, /\bstructure\b/] },
    ];

    for (const domain of domains) {
      const matchCount = domain.patterns.filter(p => p.test(lower)).length;
      if (matchCount >= 2) {
        return domain.name;
      }
    }

    return 'general';
  }

  // ==================== Statistics ====================

  /**
   * Get learning statistics
   */
  async getStats(): Promise<LearningStats> {
    const patterns = [...this.patterns.values()];

    const byStage: Record<PatternStage, number> = {
      immature: 0,
      developing: 0,
      mature: 0,
      stable: 0,
      archived: 0,
    };

    let totalPlasticity = 0;
    let totalStability = 0;

    for (const pattern of patterns) {
      byStage[pattern.stage]++;
      totalPlasticity += pattern.plasticityIndex;
      totalStability += pattern.stabilityIndex;
    }

    const count = patterns.length || 1;

    return {
      totalPatterns: patterns.length,
      byStage,
      avgPlasticity: totalPlasticity / count,
      avgStability: totalStability / count,
      forgettingAlerts: this.forgettingAlerts.length,
      rehearsalsPending: this.getPendingRehearsals().length,
      distillationsPerformed: this.distillationCount,
      crossTransfers: this.crossTransferLog.length,
    };
  }

  /**
   * Get forgetting alerts history
   */
  getForgettingAlerts(): ForgettingRisk[] {
    return [...this.forgettingAlerts];
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.patterns.clear();
    this.rehearsalQueue.clear();
    this.domainLearningRates.clear();
    this.forgettingAlerts = [];
    this.crossTransferLog = [];
    this.initialized = false;
  }
}

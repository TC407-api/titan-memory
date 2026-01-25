/**
 * Behavioral Validation System
 *
 * Self-checking system for memory consistency, anomaly detection,
 * and quality assurance. Inspired by Cognee's validation patterns.
 *
 * Key features:
 * - Consistency checking across memory layers
 * - Relationship validation (orphans, contradictions)
 * - Anomaly detection for unusual patterns
 * - Quality scoring for memory entries
 * - Self-healing suggestions
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';
import { contentSimilarity } from '../utils/similarity.js';
import { MemoryEntry, MemoryLayer } from '../types.js';

// Validation issue severity
export type IssueSeverity = 'critical' | 'warning' | 'info';

// Issue types
export type IssueType =
  | 'orphan_memory'         // Memory not linked to any context
  | 'contradiction'          // Conflicting information
  | 'stale_reference'        // Reference to deleted entity
  | 'duplicate_content'      // Near-duplicate memories
  | 'low_quality'            // Below quality threshold
  | 'anomalous_pattern'      // Unusual access or storage pattern
  | 'missing_metadata'       // Required metadata missing
  | 'invalid_layer'          // Memory in wrong layer
  | 'broken_link'            // Dead link to entity/decision
  | 'high_decay';            // Memory about to be pruned

// Validation issue
export interface ValidationIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  memoryId?: string;
  description: string;
  details: Record<string, unknown>;
  suggestedFix?: string;
  autoFixable: boolean;
  detectedAt: Date;
  resolvedAt?: Date;
}

// Quality score breakdown
export interface QualityScore {
  overall: number;          // 0-1 composite score
  completeness: number;     // Has all expected fields
  relevance: number;        // Matches context/patterns
  freshness: number;        // Recency and access patterns
  connectivity: number;     // Links to other memories/entities
  clarity: number;          // Content quality
}

// Validation report
export interface ValidationReport {
  id: string;
  timestamp: Date;
  duration: number;         // ms
  memoriesChecked: number;
  issues: ValidationIssue[];
  bySeverity: Record<IssueSeverity, number>;
  byType: Record<IssueType, number>;
  healthScore: number;      // 0-1 overall health
  recommendations: string[];
}

// Anomaly detection result
export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;            // 0-1, higher = more anomalous
  reasons: string[];
  comparedTo: {
    avgSurprise: number;
    avgLength: number;
    avgAccessRate: number;
  };
}

// Consistency check result
export interface ConsistencyResult {
  isConsistent: boolean;
  conflicts: Array<{
    memoryId1: string;
    memoryId2: string;
    conflictType: string;
    description: string;
  }>;
}

// Quality thresholds
const QUALITY_THRESHOLDS = {
  minLength: 10,
  maxLength: 10000,
  minScore: 0.3,
  requiredMetadata: ['source', 'timestamp'],
  stalenessDays: 90,
};

export class BehavioralValidator {
  private issues: Map<string, ValidationIssue> = new Map();
  private reports: ValidationReport[] = [];
  private dataPath: string;
  private initialized: boolean = false;

  // Statistics for anomaly detection
  private stats: {
    avgContentLength: number;
    avgSurpriseScore: number;
    avgAccessRate: number;
    contentLengthStdDev: number;
    totalMemories: number;
  };

  constructor() {
    const config = getConfig();
    this.dataPath = path.join(config.dataDir, 'validation', 'issues.json');
    this.stats = {
      avgContentLength: 100,
      avgSurpriseScore: 0.5,
      avgAccessRate: 1,
      contentLengthStdDev: 50,
      totalMemories: 0,
    };
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

        for (const issue of data.issues || []) {
          issue.detectedAt = new Date(issue.detectedAt);
          if (issue.resolvedAt) {
            issue.resolvedAt = new Date(issue.resolvedAt);
          }
          this.issues.set(issue.id, issue);
        }

        if (data.stats) {
          this.stats = data.stats;
        }

        for (const report of data.reports || []) {
          report.timestamp = new Date(report.timestamp);
          this.reports.push(report);
        }
      } catch (error) {
        console.warn('Failed to load validation data:', error);
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
      issues: [...this.issues.values()],
      stats: this.stats,
      reports: this.reports.slice(-10), // Keep last 10 reports
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  // ==================== Quality Scoring ====================

  /**
   * Calculate quality score for a memory entry
   */
  calculateQualityScore(memory: MemoryEntry): QualityScore {
    const completeness = this.scoreCompleteness(memory);
    const freshness = this.scoreFreshness(memory);
    const clarity = this.scoreClarity(memory);
    const connectivity = this.scoreConnectivity(memory);
    const relevance = this.scoreRelevance(memory);

    const overall = (
      completeness * 0.2 +
      freshness * 0.15 +
      clarity * 0.25 +
      connectivity * 0.2 +
      relevance * 0.2
    );

    return {
      overall,
      completeness,
      relevance,
      freshness,
      connectivity,
      clarity,
    };
  }

  private scoreCompleteness(memory: MemoryEntry): number {
    let score = 0;
    const maxPoints = 5;

    // Has content
    if (memory.content && memory.content.length > 0) score += 1;

    // Has meaningful content
    if (memory.content && memory.content.length >= QUALITY_THRESHOLDS.minLength) score += 1;

    // Has timestamp
    if (memory.timestamp) score += 1;

    // Has metadata
    if (memory.metadata && Object.keys(memory.metadata).length > 0) score += 1;

    // Has tags or source
    if (memory.metadata?.tags || memory.metadata?.source) score += 1;

    return score / maxPoints;
  }

  private scoreFreshness(memory: MemoryEntry): number {
    const now = Date.now();
    const created = new Date(memory.timestamp).getTime();
    const ageInDays = (now - created) / (1000 * 60 * 60 * 24);

    // Fresher is better, up to a point
    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 7) return 0.9;
    if (ageInDays <= 30) return 0.7;
    if (ageInDays <= 90) return 0.5;
    if (ageInDays <= 180) return 0.3;
    return 0.1;
  }

  private scoreClarity(memory: MemoryEntry): number {
    const content = memory.content;
    if (!content) return 0;

    let score = 0.5; // Base score

    // Length check
    const length = content.length;
    if (length >= QUALITY_THRESHOLDS.minLength && length <= QUALITY_THRESHOLDS.maxLength) {
      score += 0.2;
    }

    // Sentence structure (has periods)
    if (content.includes('.')) {
      score += 0.1;
    }

    // Not all caps
    const upperRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (upperRatio < 0.5) {
      score += 0.1;
    }

    // Contains meaningful words (not just symbols)
    const wordRatio = (content.match(/\b\w{3,}\b/g) || []).length / (content.split(/\s+/).length || 1);
    if (wordRatio > 0.5) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private scoreConnectivity(memory: MemoryEntry): number {
    let score = 0.3; // Base score for existing

    // Has project context
    if (memory.metadata?.projectId) score += 0.2;

    // Has tags
    if (memory.metadata?.tags && (memory.metadata.tags as string[]).length > 0) {
      score += 0.1 * Math.min(3, (memory.metadata.tags as string[]).length);
    }

    // Has session context
    if (memory.metadata?.sessionId) score += 0.1;

    return Math.min(1.0, score);
  }

  private scoreRelevance(memory: MemoryEntry): number {
    // Base relevance from layer appropriateness
    let score = 0.5;

    // Higher surprise = more relevant (for long-term layer)
    if (memory.layer === MemoryLayer.LONG_TERM && memory.metadata?.surpriseScore) {
      score += (memory.metadata.surpriseScore as number) * 0.3;
    }

    // Has routing reason = properly categorized
    if (memory.metadata?.routingReason) score += 0.2;

    return Math.min(1.0, score);
  }

  // ==================== Validation Checks ====================

  /**
   * Validate a single memory before storage
   */
  async validateBeforeStore(memory: MemoryEntry): Promise<{
    valid: boolean;
    issues: ValidationIssue[];
    suggestions: string[];
  }> {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    // Check content length
    if (!memory.content || memory.content.length < QUALITY_THRESHOLDS.minLength) {
      issues.push(this.createIssue({
        type: 'low_quality',
        severity: 'warning',
        memoryId: memory.id,
        description: 'Content too short',
        details: { length: memory.content?.length || 0 },
        suggestedFix: 'Add more context or details',
        autoFixable: false,
      }));
    }

    if (memory.content && memory.content.length > QUALITY_THRESHOLDS.maxLength) {
      issues.push(this.createIssue({
        type: 'low_quality',
        severity: 'warning',
        memoryId: memory.id,
        description: 'Content too long',
        details: { length: memory.content.length },
        suggestedFix: 'Consider splitting into multiple memories',
        autoFixable: false,
      }));
      suggestions.push('Split into smaller, focused memories');
    }

    // Check for duplicate content
    // (Would need access to existing memories - placeholder)

    // Check metadata completeness
    if (!memory.metadata?.source) {
      issues.push(this.createIssue({
        type: 'missing_metadata',
        severity: 'info',
        memoryId: memory.id,
        description: 'Missing source metadata',
        details: {},
        suggestedFix: 'Add source field to metadata',
        autoFixable: true,
      }));
    }

    // Quality score check
    const quality = this.calculateQualityScore(memory);
    if (quality.overall < QUALITY_THRESHOLDS.minScore) {
      issues.push(this.createIssue({
        type: 'low_quality',
        severity: 'warning',
        memoryId: memory.id,
        description: `Quality score below threshold: ${quality.overall.toFixed(2)}`,
        details: quality as unknown as Record<string, unknown>,
        suggestedFix: 'Improve content clarity and add metadata',
        autoFixable: false,
      }));
    }

    return {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * Run full validation on all memories
   */
  async runFullValidation(memories: MemoryEntry[]): Promise<ValidationReport> {
    const startTime = performance.now();
    const issues: ValidationIssue[] = [];

    // Update statistics for anomaly detection
    this.updateStats(memories);

    for (const memory of memories) {
      // Quality check
      const quality = this.calculateQualityScore(memory);
      if (quality.overall < QUALITY_THRESHOLDS.minScore) {
        issues.push(this.createIssue({
          type: 'low_quality',
          severity: 'warning',
          memoryId: memory.id,
          description: `Low quality score: ${quality.overall.toFixed(2)}`,
          details: quality as unknown as Record<string, unknown>,
          suggestedFix: 'Review and enhance memory content',
          autoFixable: false,
        }));
      }

      // Anomaly detection
      const anomaly = this.detectAnomaly(memory);
      if (anomaly.isAnomaly && anomaly.score > 0.7) {
        issues.push(this.createIssue({
          type: 'anomalous_pattern',
          severity: anomaly.score > 0.9 ? 'critical' : 'warning',
          memoryId: memory.id,
          description: `Anomalous memory detected: ${anomaly.reasons.join(', ')}`,
          details: anomaly as unknown as Record<string, unknown>,
          suggestedFix: 'Review memory for accuracy',
          autoFixable: false,
        }));
      }

      // Staleness check
      const ageInDays = (Date.now() - new Date(memory.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > QUALITY_THRESHOLDS.stalenessDays) {
        const decayFactor = memory.metadata?.currentDecay as number || 1.0;
        if (decayFactor < 0.1) {
          issues.push(this.createIssue({
            type: 'high_decay',
            severity: 'info',
            memoryId: memory.id,
            description: 'Memory heavily decayed, may be pruned soon',
            details: { decay: decayFactor, ageDays: ageInDays },
            suggestedFix: 'Access memory to refresh or archive manually',
            autoFixable: false,
          }));
        }
      }
    }

    // Check for duplicates
    const duplicates = this.findDuplicates(memories);
    for (const dup of duplicates) {
      issues.push(this.createIssue({
        type: 'duplicate_content',
        severity: 'warning',
        memoryId: dup.memoryId1,
        description: `Near-duplicate of memory ${dup.memoryId2}`,
        details: { similarity: dup.similarity },
        suggestedFix: 'Consider merging or removing duplicate',
        autoFixable: true,
      }));
    }

    // Consistency check
    const consistency = this.checkConsistency(memories);
    for (const conflict of consistency.conflicts) {
      issues.push(this.createIssue({
        type: 'contradiction',
        severity: 'warning',
        memoryId: conflict.memoryId1,
        description: conflict.description,
        details: conflict,
        suggestedFix: 'Resolve conflicting information',
        autoFixable: false,
      }));
    }

    // Store issues
    for (const issue of issues) {
      this.issues.set(issue.id, issue);
    }

    const duration = performance.now() - startTime;

    // Build report
    const bySeverity: Record<IssueSeverity, number> = {
      critical: 0,
      warning: 0,
      info: 0,
    };
    const byType: Record<string, number> = {};

    for (const issue of issues) {
      bySeverity[issue.severity]++;
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    }

    // Calculate health score
    const criticalWeight = 0.5;
    const warningWeight = 0.3;
    const infoWeight = 0.1;

    const maxIssues = memories.length;
    const weightedIssues = (
      bySeverity.critical * criticalWeight +
      bySeverity.warning * warningWeight +
      bySeverity.info * infoWeight
    );
    const healthScore = Math.max(0, 1 - (weightedIssues / maxIssues));

    const report: ValidationReport = {
      id: uuidv4(),
      timestamp: new Date(),
      duration,
      memoriesChecked: memories.length,
      issues,
      bySeverity,
      byType: byType as Record<IssueType, number>,
      healthScore,
      recommendations: this.generateRecommendations(issues, memories.length),
    };

    this.reports.push(report);
    await this.saveToDisk();

    return report;
  }

  // ==================== Anomaly Detection ====================

  /**
   * Detect if a memory is anomalous
   */
  detectAnomaly(memory: MemoryEntry): AnomalyResult {
    const reasons: string[] = [];
    let anomalyScore = 0;

    // Content length check
    const contentLength = memory.content?.length || 0;
    const lengthDeviation = Math.abs(contentLength - this.stats.avgContentLength) / (this.stats.contentLengthStdDev || 1);
    if (lengthDeviation > 3) {
      reasons.push(`Unusual content length: ${contentLength}`);
      anomalyScore += 0.3;
    }

    // Surprise score check
    const surpriseScore = (memory.metadata?.surpriseScore as number) || 0.5;
    if (surpriseScore > 0.95) {
      reasons.push('Extremely high surprise score');
      anomalyScore += 0.2;
    }

    // Pattern detection: unusual characters
    if (memory.content) {
      const unusualCharRatio = (memory.content.match(/[^\w\s.,!?;:'"()-]/g) || []).length / memory.content.length;
      if (unusualCharRatio > 0.3) {
        reasons.push('High ratio of unusual characters');
        anomalyScore += 0.3;
      }
    }

    // Metadata anomalies
    if (memory.metadata) {
      const metadataKeys = Object.keys(memory.metadata);
      if (metadataKeys.length > 20) {
        reasons.push('Unusually high metadata count');
        anomalyScore += 0.2;
      }
    }

    return {
      isAnomaly: anomalyScore > 0.4,
      score: Math.min(1.0, anomalyScore),
      reasons,
      comparedTo: {
        avgSurprise: this.stats.avgSurpriseScore,
        avgLength: this.stats.avgContentLength,
        avgAccessRate: this.stats.avgAccessRate,
      },
    };
  }

  private updateStats(memories: MemoryEntry[]): void {
    if (memories.length === 0) return;

    const lengths = memories.map(m => m.content?.length || 0);
    const surprises = memories.map(m => (m.metadata?.surpriseScore as number) || 0.5);

    this.stats.avgContentLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    this.stats.avgSurpriseScore = surprises.reduce((a, b) => a + b, 0) / surprises.length;
    this.stats.totalMemories = memories.length;

    // Calculate standard deviation
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - this.stats.avgContentLength, 2), 0) / lengths.length;
    this.stats.contentLengthStdDev = Math.sqrt(variance);
  }

  // ==================== Consistency & Duplicate Detection ====================

  /**
   * Check for consistency issues
   */
  checkConsistency(memories: MemoryEntry[]): ConsistencyResult {
    const conflicts: ConsistencyResult['conflicts'] = [];

    // Group by potential conflict patterns
    const definitionPattern = /\bis defined as\b|\bmeans\b|\brefers to\b/i;
    const definitions = new Map<string, MemoryEntry[]>();

    for (const memory of memories) {
      if (definitionPattern.test(memory.content)) {
        // Extract the term being defined
        const match = memory.content.match(/(\w+)\s+(?:is defined as|means|refers to)\s+/i);
        if (match) {
          const term = match[1].toLowerCase();
          if (!definitions.has(term)) {
            definitions.set(term, []);
          }
          definitions.get(term)!.push(memory);
        }
      }
    }

    // Check for conflicting definitions
    for (const [term, defs] of definitions) {
      if (defs.length > 1) {
        // Simple check: if definitions are very different
        for (let i = 0; i < defs.length - 1; i++) {
          for (let j = i + 1; j < defs.length; j++) {
            const similarity = this.calculateSimilarity(defs[i].content, defs[j].content);
            if (similarity < 0.3) {
              conflicts.push({
                memoryId1: defs[i].id,
                memoryId2: defs[j].id,
                conflictType: 'definition',
                description: `Potentially conflicting definitions of "${term}"`,
              });
            }
          }
        }
      }
    }

    return {
      isConsistent: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Find duplicate/near-duplicate memories
   */
  private findDuplicates(memories: MemoryEntry[]): Array<{
    memoryId1: string;
    memoryId2: string;
    similarity: number;
  }> {
    const duplicates: Array<{ memoryId1: string; memoryId2: string; similarity: number }> = [];
    const threshold = 0.9;

    // Use a simple n^2 comparison for now (could optimize with LSH)
    for (let i = 0; i < memories.length - 1 && i < 100; i++) { // Limit for performance
      for (let j = i + 1; j < memories.length && j < 100; j++) {
        const similarity = this.calculateSimilarity(memories[i].content, memories[j].content);
        if (similarity > threshold) {
          duplicates.push({
            memoryId1: memories[i].id,
            memoryId2: memories[j].id,
            similarity,
          });
        }
      }
    }

    return duplicates;
  }

  // Using centralized contentSimilarity from utils/similarity.ts
  private calculateSimilarity(content1: string, content2: string): number {
    return contentSimilarity(content1, content2);
  }

  // ==================== Self-Healing ====================

  /**
   * Auto-fix an issue if possible
   */
  async autoFix(issueId: string, memory: MemoryEntry): Promise<{
    fixed: boolean;
    updatedMemory?: MemoryEntry;
    description: string;
  }> {
    const issue = this.issues.get(issueId);
    if (!issue || !issue.autoFixable) {
      return { fixed: false, description: 'Issue not auto-fixable' };
    }

    switch (issue.type) {
      case 'missing_metadata':
        return this.fixMissingMetadata(memory);

      case 'duplicate_content':
        return { fixed: false, description: 'Duplicate removal requires manual review' };

      default:
        return { fixed: false, description: 'No auto-fix available' };
    }
  }

  private fixMissingMetadata(memory: MemoryEntry): {
    fixed: boolean;
    updatedMemory?: MemoryEntry;
    description: string;
  } {
    const updated = { ...memory };
    updated.metadata = { ...memory.metadata };

    if (!updated.metadata.source) {
      updated.metadata.source = 'auto-fixed';
    }

    return {
      fixed: true,
      updatedMemory: updated,
      description: 'Added missing metadata fields',
    };
  }

  /**
   * Mark an issue as resolved
   */
  async resolveIssue(issueId: string): Promise<boolean> {
    const issue = this.issues.get(issueId);
    if (!issue) return false;

    issue.resolvedAt = new Date();
    await this.saveToDisk();
    return true;
  }

  // ==================== Helpers ====================

  private createIssue(params: Omit<ValidationIssue, 'id' | 'detectedAt'>): ValidationIssue {
    return {
      id: uuidv4(),
      detectedAt: new Date(),
      ...params,
    };
  }

  private generateRecommendations(issues: ValidationIssue[], totalMemories: number): string[] {
    const recommendations: string[] = [];
    const issueTypeCounts = new Map<IssueType, number>();

    for (const issue of issues) {
      issueTypeCounts.set(issue.type, (issueTypeCounts.get(issue.type) || 0) + 1);
    }

    // Generate recommendations based on issue patterns
    if ((issueTypeCounts.get('low_quality') || 0) > totalMemories * 0.1) {
      recommendations.push('Consider adding more context and metadata to memories');
    }

    if ((issueTypeCounts.get('duplicate_content') || 0) > 5) {
      recommendations.push('Run memory consolidation to merge duplicate entries');
    }

    if ((issueTypeCounts.get('high_decay') || 0) > totalMemories * 0.2) {
      recommendations.push('Archive or access decaying memories to preserve important ones');
    }

    if ((issueTypeCounts.get('anomalous_pattern') || 0) > 0) {
      recommendations.push('Review anomalous memories for potential data quality issues');
    }

    if ((issueTypeCounts.get('orphan_memory') || 0) > 0) {
      recommendations.push('Link orphan memories to relevant projects or contexts');
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory health is good! No immediate actions needed.');
    }

    return recommendations;
  }

  /**
   * Get open issues
   */
  async getOpenIssues(severity?: IssueSeverity): Promise<ValidationIssue[]> {
    let issues = [...this.issues.values()].filter(i => !i.resolvedAt);

    if (severity) {
      issues = issues.filter(i => i.severity === severity);
    }

    return issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get validation history
   */
  async getReports(limit: number = 10): Promise<ValidationReport[]> {
    return this.reports.slice(-limit);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalIssues: number;
    openIssues: number;
    bySeverity: Record<IssueSeverity, number>;
    byType: Record<IssueType, number>;
    avgHealthScore: number;
    lastValidation?: Date;
  }> {
    const open = [...this.issues.values()].filter(i => !i.resolvedAt);
    const bySeverity: Record<IssueSeverity, number> = { critical: 0, warning: 0, info: 0 };
    const byType: Record<string, number> = {};

    for (const issue of open) {
      bySeverity[issue.severity]++;
      byType[issue.type] = (byType[issue.type] || 0) + 1;
    }

    const avgHealthScore = this.reports.length > 0
      ? this.reports.slice(-5).reduce((sum, r) => sum + r.healthScore, 0) / Math.min(5, this.reports.length)
      : 1.0;

    return {
      totalIssues: this.issues.size,
      openIssues: open.length,
      bySeverity,
      byType: byType as Record<IssueType, number>,
      avgHealthScore,
      lastValidation: this.reports.length > 0 ? this.reports[this.reports.length - 1].timestamp : undefined,
    };
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.issues.clear();
    this.reports = [];
    this.initialized = false;
  }
}

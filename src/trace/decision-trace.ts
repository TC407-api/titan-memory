/**
 * Decision Trace Module
 *
 * Structured capture of agent decisions with rationale, alternatives, and outcomes.
 * Inspired by Cognee's decision traces for explainable AI memory.
 *
 * Key innovations:
 * - Capture WHY decisions were made (not just WHAT)
 * - Track alternatives that were considered
 * - Link decisions to outcomes for learning
 * - Enable decision replay and analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';

// Decision types
export type DecisionType =
  | 'architecture'      // System design decisions
  | 'implementation'    // How to implement a feature
  | 'technology'        // Tech stack choices
  | 'debugging'         // How to fix a bug
  | 'optimization'      // Performance improvements
  | 'workflow'          // Process/methodology decisions
  | 'configuration'     // Settings/config choices
  | 'user_preference'   // User-specific choices
  | 'tradeoff'          // Balancing competing concerns
  | 'rollback'          // Deciding to undo something
  | 'other';

// Outcome status
export type OutcomeStatus =
  | 'pending'           // Decision made, outcome not yet known
  | 'success'           // Decision led to positive outcome
  | 'partial'           // Mixed results
  | 'failure'           // Decision didn't work out
  | 'superseded'        // Replaced by a different decision
  | 'unknown';          // Outcome couldn't be determined

// Alternative that was considered
export interface Alternative {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  rejectionReason?: string;
}

// The main decision trace
export interface DecisionTrace {
  id: string;
  type: DecisionType;
  context: {
    projectId?: string;
    sessionId?: string;
    taskDescription?: string;
    constraints?: string[];
  };
  decision: {
    summary: string;          // One-line summary
    description: string;      // Full description
    rationale: string;        // WHY this was chosen
    confidence: number;       // 0-1 how confident in this decision
  };
  alternatives: Alternative[];
  outcome: {
    status: OutcomeStatus;
    description?: string;
    metrics?: Record<string, number | string>;
    feedback?: string;        // User or system feedback
    learnedAt?: Date;
  };
  links: {
    memoryIds: string[];      // Related memories
    entityIds: string[];      // Related entities from knowledge graph
    parentDecisionId?: string; // Decision this builds on
    childDecisionIds: string[]; // Decisions that build on this
  };
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

// Query result
export interface DecisionQueryResult {
  decisions: DecisionTrace[];
  totalFound: number;
  queryTimeMs: number;
}

// Decision pattern (learned from multiple decisions)
export interface DecisionPattern {
  id: string;
  type: DecisionType;
  pattern: string;            // What pattern was identified
  successRate: number;        // Based on outcome tracking
  usageCount: number;
  avgConfidence: number;
  commonRationale: string[];
  commonPros: string[];
  commonCons: string[];
  exampleDecisionIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Patterns for extracting decision information
const DECISION_PATTERNS = {
  decision: /(?:I )?(?:decided|chose|going with|picked|selected|opted for|will use)\s+([^.]+)/gi,
  rationale: /(?:because|since|due to|given that|considering)\s+([^.]+)/gi,
  alternative: /(?:instead of|rather than|as opposed to|over)\s+([^.]+)/gi,
  constraint: /(?:must|should|need to|have to|required to)\s+([^.]+)/gi,
  confidence: /(?:confident|sure|certain|unsure|uncertain|maybe|possibly)/gi,
  tradeoff: /(?:tradeoff|trade-off|balance|versus|vs\.|weighing)/gi,
};

export class DecisionTraceManager {
  private decisions: Map<string, DecisionTrace> = new Map();
  private patterns: Map<string, DecisionPattern> = new Map();
  private typeIndex: Map<DecisionType, Set<string>> = new Map();
  private outcomeIndex: Map<OutcomeStatus, Set<string>> = new Map();
  private dataPath: string;
  private patternsPath: string;
  private initialized: boolean = false;

  constructor() {
    const config = getConfig();
    this.dataPath = path.join(config.dataDir, 'traces', 'decisions.json');
    this.patternsPath = path.join(config.dataDir, 'traces', 'patterns.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    // Load decisions
    if (fs.existsSync(this.dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        for (const decision of data.decisions || []) {
          decision.createdAt = new Date(decision.createdAt);
          decision.updatedAt = new Date(decision.updatedAt);
          if (decision.outcome.learnedAt) {
            decision.outcome.learnedAt = new Date(decision.outcome.learnedAt);
          }
          this.decisions.set(decision.id, decision);
          this.indexDecision(decision);
        }
      } catch (error) {
        console.warn('Failed to load decisions:', error);
      }
    }

    // Load patterns
    if (fs.existsSync(this.patternsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.patternsPath, 'utf-8'));
        for (const pattern of data.patterns || []) {
          pattern.createdAt = new Date(pattern.createdAt);
          pattern.updatedAt = new Date(pattern.updatedAt);
          this.patterns.set(pattern.id, pattern);
        }
      } catch (error) {
        console.warn('Failed to load decision patterns:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save decisions
    const decisionsData = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      decisions: [...this.decisions.values()],
    };
    fs.writeFileSync(this.dataPath, JSON.stringify(decisionsData, null, 2));

    // Save patterns
    const patternsData = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      patterns: [...this.patterns.values()],
    };
    fs.writeFileSync(this.patternsPath, JSON.stringify(patternsData, null, 2));
  }

  private indexDecision(decision: DecisionTrace): void {
    // Index by type
    if (!this.typeIndex.has(decision.type)) {
      this.typeIndex.set(decision.type, new Set());
    }
    this.typeIndex.get(decision.type)!.add(decision.id);

    // Index by outcome
    if (!this.outcomeIndex.has(decision.outcome.status)) {
      this.outcomeIndex.set(decision.outcome.status, new Set());
    }
    this.outcomeIndex.get(decision.outcome.status)!.add(decision.id);
  }

  /**
   * Extract decision traces from content
   */
  async extractFromContent(
    content: string,
    context?: Partial<DecisionTrace['context']>
  ): Promise<DecisionTrace[]> {
    const extracted: DecisionTrace[] = [];

    // Find decision statements
    const decisionMatches = [...content.matchAll(DECISION_PATTERNS.decision)];
    const rationaleMatches = [...content.matchAll(DECISION_PATTERNS.rationale)];
    const alternativeMatches = [...content.matchAll(DECISION_PATTERNS.alternative)];
    const constraintMatches = [...content.matchAll(DECISION_PATTERNS.constraint)];

    for (const match of decisionMatches) {
      const decision: DecisionTrace = {
        id: uuidv4(),
        type: this.inferDecisionType(match[1]),
        context: {
          ...context,
          constraints: constraintMatches.map(m => m[1]),
        },
        decision: {
          summary: match[1].trim(),
          description: this.extractContext(content, match.index || 0),
          rationale: rationaleMatches[0]?.[1] || 'Not explicitly stated',
          confidence: this.inferConfidence(content),
        },
        alternatives: alternativeMatches.map((m) => ({
          id: uuidv4(),
          description: m[1].trim(),
          pros: [],
          cons: [],
          rejectionReason: 'Not chosen',
        })),
        outcome: {
          status: 'pending',
        },
        links: {
          memoryIds: [],
          entityIds: [],
          childDecisionIds: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: this.extractTags(content),
      };

      extracted.push(decision);
      this.decisions.set(decision.id, decision);
      this.indexDecision(decision);
    }

    if (extracted.length > 0) {
      await this.saveToDisk();
    }

    return extracted;
  }

  /**
   * Create a decision trace manually
   */
  async createDecision(params: {
    type: DecisionType;
    summary: string;
    description: string;
    rationale: string;
    alternatives?: Array<{
      description: string;
      pros?: string[];
      cons?: string[];
      rejectionReason?: string;
    }>;
    confidence?: number;
    context?: Partial<DecisionTrace['context']>;
    tags?: string[];
    linkMemoryIds?: string[];
    linkEntityIds?: string[];
    parentDecisionId?: string;
  }): Promise<DecisionTrace> {
    const decision: DecisionTrace = {
      id: uuidv4(),
      type: params.type,
      context: params.context || {},
      decision: {
        summary: params.summary,
        description: params.description,
        rationale: params.rationale,
        confidence: params.confidence ?? 0.7,
      },
      alternatives: (params.alternatives || []).map(a => ({
        id: uuidv4(),
        description: a.description,
        pros: a.pros || [],
        cons: a.cons || [],
        rejectionReason: a.rejectionReason,
      })),
      outcome: {
        status: 'pending',
      },
      links: {
        memoryIds: params.linkMemoryIds || [],
        entityIds: params.linkEntityIds || [],
        parentDecisionId: params.parentDecisionId,
        childDecisionIds: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: params.tags || [],
    };

    // Link to parent if specified
    if (params.parentDecisionId) {
      const parent = this.decisions.get(params.parentDecisionId);
      if (parent) {
        parent.links.childDecisionIds.push(decision.id);
      }
    }

    this.decisions.set(decision.id, decision);
    this.indexDecision(decision);
    await this.saveToDisk();

    return decision;
  }

  /**
   * Record outcome of a decision
   */
  async recordOutcome(
    decisionId: string,
    outcome: {
      status: OutcomeStatus;
      description?: string;
      metrics?: Record<string, number | string>;
      feedback?: string;
    }
  ): Promise<DecisionTrace | null> {
    const decision = this.decisions.get(decisionId);
    if (!decision) return null;

    // Update outcome index
    this.outcomeIndex.get(decision.outcome.status)?.delete(decisionId);

    decision.outcome = {
      ...outcome,
      learnedAt: new Date(),
    };
    decision.updatedAt = new Date();

    // Re-index
    if (!this.outcomeIndex.has(outcome.status)) {
      this.outcomeIndex.set(outcome.status, new Set());
    }
    this.outcomeIndex.get(outcome.status)!.add(decisionId);

    // Update patterns based on this outcome
    await this.updatePatterns(decision);

    await this.saveToDisk();
    return decision;
  }

  /**
   * Query decisions
   */
  async query(options?: {
    type?: DecisionType;
    outcomeStatus?: OutcomeStatus;
    minConfidence?: number;
    tags?: string[];
    projectId?: string;
    limit?: number;
  }): Promise<DecisionQueryResult> {
    const startTime = performance.now();
    let candidates = [...this.decisions.values()];

    // Filter by type
    if (options?.type) {
      const typeIds = this.typeIndex.get(options.type);
      if (typeIds) {
        candidates = candidates.filter(d => typeIds.has(d.id));
      } else {
        candidates = [];
      }
    }

    // Filter by outcome
    if (options?.outcomeStatus) {
      const outcomeIds = this.outcomeIndex.get(options.outcomeStatus);
      if (outcomeIds) {
        candidates = candidates.filter(d => outcomeIds.has(d.id));
      } else {
        candidates = [];
      }
    }

    // Filter by confidence
    if (options?.minConfidence !== undefined) {
      candidates = candidates.filter(d => d.decision.confidence >= options.minConfidence!);
    }

    // Filter by tags
    if (options?.tags && options.tags.length > 0) {
      candidates = candidates.filter(d =>
        options.tags!.some(tag => d.tags.includes(tag))
      );
    }

    // Filter by project
    if (options?.projectId) {
      candidates = candidates.filter(d => d.context.projectId === options.projectId);
    }

    // Sort by recency
    candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply limit
    const limit = options?.limit || 50;
    const decisions = candidates.slice(0, limit);

    const queryTimeMs = performance.now() - startTime;

    return {
      decisions,
      totalFound: candidates.length,
      queryTimeMs,
    };
  }

  /**
   * Get decision by ID
   */
  async get(id: string): Promise<DecisionTrace | null> {
    return this.decisions.get(id) || null;
  }

  /**
   * Find similar past decisions
   */
  async findSimilar(
    summary: string,
    options?: { type?: DecisionType; limit?: number }
  ): Promise<DecisionTrace[]> {
    const tokens = new Set(summary.toLowerCase().split(/\s+/));
    const limit = options?.limit || 5;

    const scored: Array<{ decision: DecisionTrace; score: number }> = [];

    for (const decision of this.decisions.values()) {
      if (options?.type && decision.type !== options.type) continue;

      const decisionTokens = new Set(
        decision.decision.summary.toLowerCase().split(/\s+/)
      );

      // Calculate Jaccard similarity
      const intersection = [...tokens].filter(t => decisionTokens.has(t)).length;
      const union = new Set([...tokens, ...decisionTokens]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity > 0.2) {
        scored.push({ decision, score: similarity });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.decision);
  }

  /**
   * Get decision chain (parent -> children)
   */
  async getDecisionChain(decisionId: string): Promise<DecisionTrace[]> {
    const chain: DecisionTrace[] = [];
    const visited = new Set<string>();

    // Go up to root
    let current = this.decisions.get(decisionId);
    const ancestors: DecisionTrace[] = [];
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      ancestors.unshift(current);
      if (current.links.parentDecisionId) {
        current = this.decisions.get(current.links.parentDecisionId);
      } else {
        break;
      }
    }

    // Start with ancestors
    chain.push(...ancestors);

    // Add descendants (BFS)
    const queue = [...(this.decisions.get(decisionId)?.links.childDecisionIds || [])];
    while (queue.length > 0) {
      const childId = queue.shift()!;
      if (visited.has(childId)) continue;
      visited.add(childId);

      const child = this.decisions.get(childId);
      if (child) {
        chain.push(child);
        queue.push(...child.links.childDecisionIds);
      }
    }

    return chain;
  }

  /**
   * Update patterns based on decision outcomes
   */
  private async updatePatterns(decision: DecisionTrace): Promise<void> {
    const patternKey = `${decision.type}_pattern`;
    let pattern = this.patterns.get(patternKey);

    if (!pattern) {
      pattern = {
        id: uuidv4(),
        type: decision.type,
        pattern: '',
        successRate: 0,
        usageCount: 0,
        avgConfidence: 0,
        commonRationale: [],
        commonPros: [],
        commonCons: [],
        exampleDecisionIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.patterns.set(patternKey, pattern);
    }

    // Update statistics
    pattern.usageCount++;
    pattern.avgConfidence = (
      (pattern.avgConfidence * (pattern.usageCount - 1) + decision.decision.confidence)
      / pattern.usageCount
    );

    // Update success rate
    if (decision.outcome.status === 'success') {
      const successCount = pattern.successRate * (pattern.usageCount - 1);
      pattern.successRate = (successCount + 1) / pattern.usageCount;
    } else if (decision.outcome.status === 'failure') {
      const successCount = pattern.successRate * (pattern.usageCount - 1);
      pattern.successRate = successCount / pattern.usageCount;
    }

    // Add example (keep top 5)
    if (!pattern.exampleDecisionIds.includes(decision.id)) {
      pattern.exampleDecisionIds.push(decision.id);
      if (pattern.exampleDecisionIds.length > 5) {
        pattern.exampleDecisionIds.shift();
      }
    }

    // Extract common rationale
    if (decision.decision.rationale && decision.decision.rationale !== 'Not explicitly stated') {
      pattern.commonRationale.push(decision.decision.rationale);
      if (pattern.commonRationale.length > 10) {
        pattern.commonRationale.shift();
      }
    }

    pattern.updatedAt = new Date();
  }

  /**
   * Get patterns
   */
  async getPatterns(type?: DecisionType): Promise<DecisionPattern[]> {
    let patterns = [...this.patterns.values()];

    if (type) {
      patterns = patterns.filter(p => p.type === type);
    }

    return patterns.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalDecisions: number;
    byType: Record<DecisionType, number>;
    byOutcome: Record<OutcomeStatus, number>;
    avgConfidence: number;
    successRate: number;
    recentDecisions: DecisionTrace[];
  }> {
    const byType: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    let totalConfidence = 0;
    let successCount = 0;
    let resolvedCount = 0;

    for (const decision of this.decisions.values()) {
      byType[decision.type] = (byType[decision.type] || 0) + 1;
      byOutcome[decision.outcome.status] = (byOutcome[decision.outcome.status] || 0) + 1;
      totalConfidence += decision.decision.confidence;

      if (decision.outcome.status !== 'pending' && decision.outcome.status !== 'unknown') {
        resolvedCount++;
        if (decision.outcome.status === 'success') {
          successCount++;
        }
      }
    }

    const recentDecisions = [...this.decisions.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    return {
      totalDecisions: this.decisions.size,
      byType: byType as Record<DecisionType, number>,
      byOutcome: byOutcome as Record<OutcomeStatus, number>,
      avgConfidence: this.decisions.size > 0 ? totalConfidence / this.decisions.size : 0,
      successRate: resolvedCount > 0 ? successCount / resolvedCount : 0,
      recentDecisions,
    };
  }

  // Helper methods

  private inferDecisionType(summary: string): DecisionType {
    const lower = summary.toLowerCase();

    if (/\b(?:architecture|design|pattern|structure)\b/.test(lower)) return 'architecture';
    if (/\b(?:implement|code|build|create)\b/.test(lower)) return 'implementation';
    if (/\b(?:use|library|framework|tool|stack)\b/.test(lower)) return 'technology';
    if (/\b(?:fix|debug|bug|error|issue)\b/.test(lower)) return 'debugging';
    if (/\b(?:optimize|performance|speed|memory)\b/.test(lower)) return 'optimization';
    if (/\b(?:process|workflow|methodology)\b/.test(lower)) return 'workflow';
    if (/\b(?:config|setting|option)\b/.test(lower)) return 'configuration';
    if (/\b(?:prefer|like|want)\b/.test(lower)) return 'user_preference';
    if (/\b(?:tradeoff|balance|versus)\b/.test(lower)) return 'tradeoff';
    if (/\b(?:revert|rollback|undo)\b/.test(lower)) return 'rollback';

    return 'other';
  }

  private extractContext(content: string, position: number): string {
    const start = Math.max(0, position - 100);
    const end = Math.min(content.length, position + 200);
    return content.substring(start, end).trim();
  }

  private inferConfidence(content: string): number {
    const lower = content.toLowerCase();

    if (/\b(?:definitely|certainly|absolutely|confident)\b/.test(lower)) return 0.9;
    if (/\b(?:probably|likely|should work)\b/.test(lower)) return 0.7;
    if (/\b(?:maybe|possibly|might|unsure)\b/.test(lower)) return 0.5;
    if (/\b(?:uncertain|not sure|don't know)\b/.test(lower)) return 0.3;

    return 0.6; // Default moderate confidence
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // Extract technology mentions as tags
    const techPattern = /\b(?:React|Vue|Angular|Node|TypeScript|Python|Go|Rust|Docker|Kubernetes|AWS|GCP|Azure)\b/gi;
    const matches = content.matchAll(techPattern);
    for (const match of matches) {
      const tag = match[0].toLowerCase();
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }

    return tags.slice(0, 5); // Limit to 5 tags
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.decisions.clear();
    this.patterns.clear();
    this.typeIndex.clear();
    this.outcomeIndex.clear();
    this.initialized = false;
  }
}

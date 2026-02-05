/**
 * Intent-Aware Retrieval
 * Titan Memory v2.0 - Competitive Upgrade
 *
 * Detects query intent to optimize retrieval strategy.
 * Different intents require different layer priorities and search approaches.
 */

import { MemoryLayer } from '../types.js';

/**
 * Query intent types
 */
export type QueryIntentType =
  | 'factual_lookup'    // Looking up a specific fact/definition
  | 'pattern_match'     // Finding similar patterns/approaches
  | 'timeline_query'    // Temporal queries (when did X happen)
  | 'exploration'       // Open-ended exploration
  | 'preference_check'  // Checking user preferences/style
  | 'error_lookup'      // Looking up past errors/solutions
  | 'decision_review';  // Reviewing past decisions

/**
 * Query intent with confidence and layer recommendations
 */
export interface QueryIntent {
  type: QueryIntentType;
  confidence: number;           // 0-1, how confident we are in this classification
  suggestedLayers: MemoryLayer[];
  priorityLayer: MemoryLayer;
  searchStrategy: 'exact' | 'semantic' | 'temporal' | 'hybrid';
  explanation: string;
}

/**
 * Intent detection patterns
 */
interface IntentPattern {
  type: QueryIntentType;
  patterns: RegExp[];
  suggestedLayers: MemoryLayer[];
  priorityLayer: MemoryLayer;
  searchStrategy: 'exact' | 'semantic' | 'temporal' | 'hybrid';
  baseConfidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Factual lookup - exact matches, definitions
  {
    type: 'factual_lookup',
    patterns: [
      /\b(?:what is|what's|define|definition of|meaning of|what does .+ mean)\b/i,
      /\b(?:what are the|what's the value of|what is the .+ for)\b/i,
      /\b(?:api key|config|configuration|setting|constant)\b/i,
    ],
    suggestedLayers: [MemoryLayer.FACTUAL, MemoryLayer.LONG_TERM],
    priorityLayer: MemoryLayer.FACTUAL,
    searchStrategy: 'exact',
    baseConfidence: 0.85,
  },
  // Pattern matching - finding similar approaches
  {
    type: 'pattern_match',
    patterns: [
      /\b(?:how to|how do i|how can i|how should i)\b/i,
      /\b(?:pattern|approach|strategy|technique|method|way to)\b/i,
      /\b(?:similar to|like when|as we did|same as)\b/i,
      /\b(?:best practice|recommended|typical|common)\b/i,
    ],
    suggestedLayers: [MemoryLayer.SEMANTIC, MemoryLayer.LONG_TERM],
    priorityLayer: MemoryLayer.SEMANTIC,
    searchStrategy: 'semantic',
    baseConfidence: 0.8,
  },
  // Timeline queries - temporal ordering
  {
    type: 'timeline_query',
    patterns: [
      /\b(?:when did|when was|last time|yesterday|today|last week|this week)\b/i,
      /\b(?:history of|timeline|chronological|sequence of)\b/i,
      /\b(?:before|after|since|until|during)\s+(?:we|i|the)\b/i,
      /\b(?:most recent|latest|earliest|first time)\b/i,
    ],
    suggestedLayers: [MemoryLayer.EPISODIC, MemoryLayer.LONG_TERM],
    priorityLayer: MemoryLayer.EPISODIC,
    searchStrategy: 'temporal',
    baseConfidence: 0.9,
  },
  // Preference check
  {
    type: 'preference_check',
    patterns: [
      /\b(?:i prefer|i like|i want|i need|i don't like)\b/i,
      /\b(?:my preference|user preference|my style|coding style)\b/i,
      /\b(?:preferred|favorite|usual|typical for me)\b/i,
      /\b(?:do i usually|what's my|how do i typically)\b/i,
    ],
    suggestedLayers: [MemoryLayer.EPISODIC, MemoryLayer.SEMANTIC],
    priorityLayer: MemoryLayer.EPISODIC,
    searchStrategy: 'semantic',
    baseConfidence: 0.85,
  },
  // Error lookup
  {
    type: 'error_lookup',
    patterns: [
      /\b(?:error|exception|bug|issue|problem|failure)\b/i,
      /\b(?:fix for|solution to|resolve|debug)\b/i,
      /\b(?:have i seen|encountered before|similar error)\b/i,
      /\b(?:workaround|hotfix|patch)\b/i,
    ],
    suggestedLayers: [MemoryLayer.SEMANTIC, MemoryLayer.EPISODIC, MemoryLayer.LONG_TERM],
    priorityLayer: MemoryLayer.SEMANTIC,
    searchStrategy: 'semantic',
    baseConfidence: 0.8,
  },
  // Decision review
  {
    type: 'decision_review',
    patterns: [
      /\b(?:why did we|why was|decision to|decided to)\b/i,
      /\b(?:rationale|reasoning|justification|trade-?off)\b/i,
      /\b(?:chose|choice|picked|selected|went with)\b/i,
      /\b(?:architecture|design decision|implementation choice)\b/i,
    ],
    suggestedLayers: [MemoryLayer.SEMANTIC, MemoryLayer.EPISODIC],
    priorityLayer: MemoryLayer.SEMANTIC,
    searchStrategy: 'semantic',
    baseConfidence: 0.85,
  },
];

/**
 * Default exploration intent for queries that don't match specific patterns
 */
const EXPLORATION_INTENT: QueryIntent = {
  type: 'exploration',
  confidence: 0.6,
  suggestedLayers: [
    MemoryLayer.LONG_TERM,
    MemoryLayer.SEMANTIC,
    MemoryLayer.FACTUAL,
    MemoryLayer.EPISODIC,
  ],
  priorityLayer: MemoryLayer.LONG_TERM,
  searchStrategy: 'hybrid',
  explanation: 'General exploration query - searching across all layers',
};

/**
 * Detect query intent from the query text
 */
export function detectIntent(query: string): QueryIntent {
  const normalizedQuery = query.toLowerCase().trim();

  // Track best matching intent
  let bestMatch: QueryIntent | null = null;
  let highestConfidence = 0;

  for (const pattern of INTENT_PATTERNS) {
    let matchCount = 0;
    let totalPatterns = pattern.patterns.length;

    for (const regex of pattern.patterns) {
      if (regex.test(normalizedQuery)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Confidence based on how many patterns matched
      // Formula: base * (0.8 + 0.2 * matchRatio) ensures 1+ match gets decent confidence
      const matchRatio = matchCount / totalPatterns;
      const confidence = pattern.baseConfidence * (0.8 + 0.2 * matchRatio);

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = {
          type: pattern.type,
          confidence,
          suggestedLayers: pattern.suggestedLayers,
          priorityLayer: pattern.priorityLayer,
          searchStrategy: pattern.searchStrategy,
          explanation: getExplanation(pattern.type, matchCount),
        };
      }
    }
  }

  // Return best match or default to exploration
  return bestMatch || {
    ...EXPLORATION_INTENT,
    explanation: `No specific intent detected for: "${query.substring(0, 50)}..."`,
  };
}

/**
 * Generate explanation for the detected intent
 */
function getExplanation(type: QueryIntentType, matchCount: number): string {
  const explanations: Record<QueryIntentType, string> = {
    factual_lookup: `Factual lookup detected (${matchCount} pattern matches) - using hash-based L2 lookup`,
    pattern_match: `Pattern/approach query detected (${matchCount} matches) - prioritizing semantic L4 search`,
    timeline_query: `Temporal query detected (${matchCount} matches) - prioritizing episodic L5 with time ordering`,
    exploration: 'General exploration - searching across all layers',
    preference_check: `Preference query detected (${matchCount} matches) - checking episodic and semantic layers`,
    error_lookup: `Error/solution lookup detected (${matchCount} matches) - semantic search across error patterns`,
    decision_review: `Decision review detected (${matchCount} matches) - searching decision traces and rationale`,
  };

  return explanations[type];
}

/**
 * Get optimal search configuration for an intent
 */
export function getSearchConfig(intent: QueryIntent): {
  layers: MemoryLayer[];
  priorityMultiplier: number;
  useTemporalOrdering: boolean;
  useExactMatch: boolean;
  limitPerLayer: number;
} {
  const config = {
    layers: intent.suggestedLayers,
    priorityMultiplier: 1.5,
    useTemporalOrdering: false,
    useExactMatch: false,
    limitPerLayer: 10,
  };

  switch (intent.searchStrategy) {
    case 'exact':
      config.useExactMatch = true;
      config.limitPerLayer = 5;
      config.priorityMultiplier = 2.0;
      break;
    case 'temporal':
      config.useTemporalOrdering = true;
      config.limitPerLayer = 15;
      break;
    case 'semantic':
      config.limitPerLayer = 10;
      break;
    case 'hybrid':
      config.limitPerLayer = 8;
      break;
  }

  return config;
}

/**
 * Determine if a query should trigger a specific intent
 */
export function matchesIntent(query: string, targetType: QueryIntentType): boolean {
  const intent = detectIntent(query);
  return intent.type === targetType && intent.confidence >= 0.7;
}

/**
 * Get all intents that could apply to a query (with confidence thresholds)
 */
export function getAllMatchingIntents(query: string, minConfidence: number = 0.5): QueryIntent[] {
  const normalizedQuery = query.toLowerCase().trim();
  const matches: QueryIntent[] = [];

  for (const pattern of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const regex of pattern.patterns) {
      if (regex.test(normalizedQuery)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      const matchRatio = matchCount / pattern.patterns.length;
      const confidence = pattern.baseConfidence * (0.7 + 0.3 * matchRatio);

      if (confidence >= minConfidence) {
        matches.push({
          type: pattern.type,
          confidence,
          suggestedLayers: pattern.suggestedLayers,
          priorityLayer: pattern.priorityLayer,
          searchStrategy: pattern.searchStrategy,
          explanation: getExplanation(pattern.type, matchCount),
        });
      }
    }
  }

  // Sort by confidence descending
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Intent detector class for stateful usage
 */
export class IntentDetector {
  private queryHistory: Array<{ query: string; intent: QueryIntent; timestamp: Date }> = [];
  private maxHistory: number = 100;

  /**
   * Detect intent and track in history
   */
  detect(query: string): QueryIntent {
    const intent = detectIntent(query);

    this.queryHistory.push({
      query,
      intent,
      timestamp: new Date(),
    });

    // Trim history
    if (this.queryHistory.length > this.maxHistory) {
      this.queryHistory = this.queryHistory.slice(-this.maxHistory);
    }

    return intent;
  }

  /**
   * Get most common intent types from history
   */
  getIntentDistribution(): Record<QueryIntentType, number> {
    const distribution: Record<QueryIntentType, number> = {
      factual_lookup: 0,
      pattern_match: 0,
      timeline_query: 0,
      exploration: 0,
      preference_check: 0,
      error_lookup: 0,
      decision_review: 0,
    };

    for (const entry of this.queryHistory) {
      distribution[entry.intent.type]++;
    }

    return distribution;
  }

  /**
   * Get recent queries for a specific intent type
   */
  getQueriesByIntent(type: QueryIntentType, limit: number = 10): string[] {
    return this.queryHistory
      .filter(entry => entry.intent.type === type)
      .slice(-limit)
      .map(entry => entry.query);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.queryHistory = [];
  }

  /**
   * Get stats
   */
  getStats(): {
    totalQueries: number;
    distribution: Record<QueryIntentType, number>;
    avgConfidence: number;
  } {
    const distribution = this.getIntentDistribution();
    const avgConfidence = this.queryHistory.length > 0
      ? this.queryHistory.reduce((sum, e) => sum + e.intent.confidence, 0) / this.queryHistory.length
      : 0;

    return {
      totalQueries: this.queryHistory.length,
      distribution,
      avgConfidence,
    };
  }
}

// Singleton instance
let detectorInstance: IntentDetector | null = null;

export function getIntentDetector(): IntentDetector {
  if (!detectorInstance) {
    detectorInstance = new IntentDetector();
  }
  return detectorInstance;
}

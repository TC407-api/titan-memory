/**
 * CatBrain Category Classifier
 * Hybrid regex + semantic classification for memory content
 */

import { MemoryCategory, CategoryClassification } from './types.js';

/**
 * Regex patterns for fast classification (zero API cost)
 */
const CATEGORY_PATTERNS: Record<MemoryCategory, RegExp[]> = {
  knowledge: [
    /\b(?:is defined as|means|refers to|definition of|specification|spec|API|endpoint|version\s+\d)\b/i,
    /\b(?:documentation|docs|RFC|standard|protocol|format|schema)\b/i,
    /\b(?:syntax|parameter|argument|return type|interface|class|type)\b/i,
    /\b(?:constant|enum|value is|equals|maximum|minimum|limit|rate limit)\b/i,
  ],
  profile: [
    /\b(?:I prefer|my preference|I like|I dislike|I want|I need|I use)\b/i,
    /\b(?:user prefers|user wants|user likes|user setting|user config)\b/i,
    /\b(?:style preference|coding style|naming convention|tab|spaces)\b/i,
    /\b(?:favorite|preferred|default editor|default language|timezone)\b/i,
  ],
  event: [
    /\b(?:happened|occurred|deployed|released|migrated|upgraded)\b/i,
    /\b(?:yesterday|today|last week|on \d{4}-\d{2}|at \d{1,2}:\d{2})\b/i,
    /\b(?:error occurred|bug found|incident|outage|downtime|crash)\b/i,
    /\b(?:started|finished|completed|launched|shipped|merged|committed)\b/i,
  ],
  behavior: [
    /\b(?:decided|chose|picked|went with|opted for|selected)\b/i,
    /\b(?:pattern|approach|strategy|methodology|workflow|process)\b/i,
    /\b(?:because|rationale|reason|trade-off|tradeoff|alternative)\b/i,
    /\b(?:always|never|usually|typically|convention|rule of thumb)\b/i,
  ],
  skill: [
    /\b(?:how to|step \d|first,?\s|then,?\s|finally,?\s|procedure)\b/i,
    /\b(?:tutorial|guide|walkthrough|instructions|recipe|setup)\b/i,
    /\b(?:run the command|execute|install|configure|create a|build)\b/i,
    /\b(?:prerequisite|requirement|before you|make sure|ensure)\b/i,
  ],
};

/**
 * Confidence boosts for strong signal words
 */
const STRONG_SIGNALS: Record<MemoryCategory, RegExp> = {
  knowledge: /\b(?:is defined as|specification|API endpoint|version \d+\.\d+)\b/i,
  profile: /\b(?:I prefer|my preference|I always use)\b/i,
  event: /\b(?:deployed on|error occurred at|incident on|outage)\b/i,
  behavior: /\b(?:decided to|chose .+ because|the approach is|we always)\b/i,
  skill: /\b(?:how to .+:|step \d:|procedure for|to set up)\b/i,
};

/**
 * Classify content into a memory category using hybrid approach
 */
export function classifyContent(content: string): CategoryClassification {
  // Phase 1: Fast regex scoring
  const scores = regexClassify(content);

  // Find top two categories
  const sorted = Object.entries(scores)
    .sort(([, a], [, b]) => b - a) as [MemoryCategory, number][];

  const [topCategory, topScore] = sorted[0];
  const [secondCategory, secondScore] = sorted[1] || [undefined, 0];

  // High confidence regex match
  if (topScore >= 0.5) {
    return {
      category: topCategory,
      confidence: Math.min(topScore, 1.0),
      method: 'regex',
      secondaryCategory: secondCategory,
      secondaryConfidence: secondScore,
    };
  }

  // Medium confidence (at least one pattern matched)
  if (topScore >= 0.2) {
    return {
      category: topCategory,
      confidence: topScore,
      method: 'regex',
      secondaryCategory: secondCategory,
      secondaryConfidence: secondScore,
    };
  }

  // Low/no match: fallback to 'knowledge' with low confidence
  return {
    category: 'knowledge',
    confidence: 0.1,
    method: 'fallback',
    secondaryCategory: topCategory !== 'knowledge' ? topCategory : secondCategory,
    secondaryConfidence: topScore,
  };
}

/**
 * Score content against all category regex patterns
 */
function regexClassify(content: string): Record<MemoryCategory, number> {
  const scores: Record<MemoryCategory, number> = {
    knowledge: 0,
    profile: 0,
    event: 0,
    behavior: 0,
    skill: 0,
  };

  const categories: MemoryCategory[] = ['knowledge', 'profile', 'event', 'behavior', 'skill'];

  for (const category of categories) {
    const patterns = CATEGORY_PATTERNS[category];
    let matchCount = 0;

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matchCount++;
      }
    }

    // Base score: proportion of patterns matched
    scores[category] = matchCount / patterns.length;

    // Strong signal boost
    if (STRONG_SIGNALS[category].test(content)) {
      scores[category] = Math.min(scores[category] + 0.3, 1.0);
    }
  }

  return scores;
}

/**
 * Get the primary Titan layer for a category
 */
export function getCategoryLayer(category: MemoryCategory): number {
  const layerMap: Record<MemoryCategory, number> = {
    knowledge: 2,  // FACTUAL
    profile: 4,    // SEMANTIC
    event: 5,      // EPISODIC
    behavior: 4,   // SEMANTIC
    skill: 4,      // SEMANTIC
  };
  return layerMap[category];
}

/**
 * Check if content matches a specific category
 */
export function matchesCategory(content: string, category: MemoryCategory): boolean {
  const patterns = CATEGORY_PATTERNS[category];
  return patterns.some(p => p.test(content));
}

/**
 * Get all matching categories for content (for multi-label scenarios)
 */
export function getMatchingCategories(content: string): MemoryCategory[] {
  const categories: MemoryCategory[] = ['knowledge', 'profile', 'event', 'behavior', 'skill'];
  return categories.filter(cat => matchesCategory(content, cat));
}

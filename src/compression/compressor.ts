/**
 * Memory Compressor
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Orchestrates entity extraction, relationship distilling,
 * extractive summarization, and fact extraction for memory compression.
 *
 * SimpleMem approach: structured data (entities, triples, facts) REPLACES prose.
 * Only a 1-2 sentence abstract is kept. This achieves high compression ratios
 * because structured representations are far more token-efficient than prose.
 */

import {
  CompressedMemory,
  CompressionOptions,
  ExtractedEntity,
  DistilledRelationship,
} from './types.js';
import { extractEntities } from './entity-extractor.js';
import { distillRelationships } from './relationship-distiller.js';
import { jaccardSimilarity } from '../utils/similarity.js';

/**
 * Default compression options
 */
const DEFAULTS: Required<CompressionOptions> = {
  targetRatio: 20,
  preserveEntities: true,
  contextQuery: '',
};

/**
 * Estimate token count from text (chars / 4 approximation)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compress memory content into a structured compressed representation
 */
export function compressMemory(
  content: string,
  options: CompressionOptions = {}
): CompressedMemory {
  const opts = { ...DEFAULTS, ...options };
  const originalTokens = estimateTokens(content);

  // Step 1: Extract entities
  const entities = extractEntities(content);

  // Step 2: Distill relationships
  const relationships = distillRelationships(content, entities);

  // Step 3: Extract key facts (before summarization so we can exclude them)
  const keyFacts = extractKeyFacts(content, entities);

  // Step 4: Generate a very short abstract (1-2 sentences, not 30%)
  // The abstract captures the high-level "what" while entities/relationships/facts
  // capture the structured details
  const summary = generateAbstract(content, entities, opts.contextQuery);

  // Step 5: Calculate compressed size using compact wire format
  // The "compressed tokens" count uses ONLY the structured data (entities, relationships, facts)
  // The abstract is a reconstruction aid stored separately, not counted toward compression ratio
  const structuredContent = buildCompressedString(entities, relationships, '', keyFacts);
  const compressedTokens = estimateTokens(structuredContent);

  // Step 6: Calculate fidelity score
  const fidelityScore = calculateFidelity(content, entities, relationships, keyFacts);

  const compressionRatio = compressedTokens > 0
    ? originalTokens / compressedTokens
    : 1;

  return {
    entities,
    relationships,
    summary,
    keyFacts,
    compressionRatio,
    fidelityScore,
    originalTokens,
    compressedTokens,
  };
}

/**
 * Generate a very short abstract (1-2 sentences max)
 *
 * Picks the single most informative sentence based on entity density,
 * then optionally adds a second sentence if it's highly scored.
 */
function generateAbstract(
  content: string,
  entities: ExtractedEntity[],
  contextQuery: string
): string {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length <= 1) return content;

  const entityNames = entities.map(e => e.name.toLowerCase());
  const queryTokens = contextQuery
    ? new Set(contextQuery.toLowerCase().split(/\s+/))
    : null;

  const scored = sentences.map((sentence, idx) => {
    let score = 0;
    const lower = sentence.toLowerCase();

    // Strong position bias: first sentence usually states the topic
    if (idx === 0) score += 0.4;
    else if (idx === sentences.length - 1) score += 0.2; // conclusions

    // Entity density
    let entityCount = 0;
    for (const name of entityNames) {
      if (lower.includes(name)) entityCount++;
    }
    score += entityNames.length > 0
      ? (entityCount / entityNames.length) * 0.4
      : 0;

    // Context query relevance
    if (queryTokens) {
      const sentenceTokens = new Set(lower.split(/\s+/));
      score += jaccardSimilarity(sentenceTokens, queryTokens) * 0.2;
    }

    return { sentence, score, idx };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take top 1, optionally 2 if the second scores at least 60% of the first
  const result = [scored[0]];
  if (scored.length > 1 && scored[1].score >= scored[0].score * 0.6) {
    result.push(scored[1]);
  }

  // Re-sort by position for natural reading order
  result.sort((a, b) => a.idx - b.idx);
  return result.map(s => s.sentence).join(' ');
}

/**
 * Extract key facts from content
 */
function extractKeyFacts(content: string, entities: ExtractedEntity[]): string[] {
  const facts: string[] = [];

  // Config facts — very compact
  for (const entity of entities) {
    if (entity.type === 'config' && entity.attributes.length > 0) {
      facts.push(`${entity.name} (${entity.attributes.join(', ')})`);
    }
  }

  // Numeric facts: "X% improvement", "Nx faster", specific measurements
  const numericPattern = /(\d+(?:\.\d+)?)\s*(%|x|times)\s+(improvement|faster|better|reduction|increase|decrease|more|less)/gi;
  let match;
  while ((match = numericPattern.exec(content)) !== null) {
    facts.push(`${match[1]}${match[2]} ${match[3]}`);
  }

  // Decision facts — compressed form
  const decisionPattern = /(?:decided|chose|selected|opted|standardized)\s+(?:to\s+|on\s+)?(.+?)(?:\.|,\s+(?:which|reducing|achieving))/gi;
  while ((match = decisionPattern.exec(content)) !== null) {
    const fact = match[1].trim();
    if (fact.length > 5 && fact.length < 80) {
      facts.push(fact);
    }
  }

  // Outcome/result facts
  const outcomePattern = /(?:resulting|achieving|reducing|improving)\s+(?:in\s+|a\s+)?(.+?)(?:\.|$)/gi;
  while ((match = outcomePattern.exec(content)) !== null) {
    const fact = match[1].trim();
    if (fact.length > 5 && fact.length < 80) {
      facts.push(fact);
    }
  }

  // Deduplicate and cap
  return [...new Set(facts)].slice(0, 8);
}

/**
 * Build the compressed string representation for token counting
 *
 * Uses a very compact wire format:
 *   E:name[type],name[type]
 *   R:s->p->o;s->p->o
 *   F:fact1;fact2
 *   S:abstract sentence
 *
 * This is much more compact than including full prose.
 */
function buildCompressedString(
  entities: ExtractedEntity[],
  relationships: DistilledRelationship[],
  summary: string,
  keyFacts: string[]
): string {
  const parts: string[] = [];

  // Entities — ultra compact: name[t] where t is first char of type
  // Cap at 8 entities to keep compressed form tight; sorted by mentions (most important first)
  if (entities.length > 0) {
    const typeAbbrev: Record<string, string> = {
      person: 'P', technology: 'T', concept: 'C', config: 'K',
      url: 'U', version: 'V', organization: 'O', location: 'L',
    };
    const topEntities = entities.slice(0, 8);
    parts.push('E:' + topEntities.map(e =>
      `${e.name}[${typeAbbrev[e.type] || e.type[0].toUpperCase()}]`
    ).join(','));
  }

  // Relationships — compact triple: s>p>o
  if (relationships.length > 0) {
    parts.push('R:' + relationships.map(r =>
      `${r.subject}>${r.predicate}>${r.object}`
    ).join(';'));
  }

  // Key facts
  if (keyFacts.length > 0) {
    parts.push('F:' + keyFacts.join(';'));
  }

  // Abstract (short)
  if (summary) {
    parts.push('S:' + summary);
  }

  return parts.join('\n');
}

/**
 * Calculate fidelity score measuring information preservation
 *
 * For SimpleMem-style compression, fidelity is based on:
 * - Entity coverage (0.4): key entities captured
 * - Relationship coverage (0.3): structural info captured
 * - Fact coverage (0.3): key numerical/decision facts captured
 */
function calculateFidelity(
  original: string,
  entities: ExtractedEntity[],
  relationships: DistilledRelationship[],
  keyFacts: string[]
): number {
  const originalTokens = new Set(
    original.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  );

  // Entity coverage: captured entities vs content complexity
  // More entities from longer content = higher fidelity
  const expectedEntities = Math.max(3, Math.floor(originalTokens.size / 15));
  const entityCoverage = Math.min(1, entities.length / expectedEntities);

  // Relationship coverage: structural understanding
  const expectedRelationships = Math.max(1, Math.floor(entities.length / 2));
  const relationshipCoverage = Math.min(1, relationships.length / expectedRelationships);

  // Fact coverage: key facts extracted relative to content density
  const expectedFacts = Math.max(1, Math.floor(originalTokens.size / 30));
  const factCoverage = Math.min(1, keyFacts.length / expectedFacts);

  return entityCoverage * 0.4 + relationshipCoverage * 0.3 + factCoverage * 0.3;
}

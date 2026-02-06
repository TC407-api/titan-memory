/**
 * Relationship Distiller
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Extracts subject-predicate-object triples from text content.
 * Uses pattern matching to find relationships between known entities.
 */

import { DistilledRelationship, ExtractedEntity } from './types.js';

/**
 * Verb patterns with confidence scores
 */
const VERB_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  // Action verbs (high confidence)
  { pattern: /\b(uses?|used|using)\b/i, confidence: 0.9 },
  { pattern: /\b(implements?|implemented|implementing)\b/i, confidence: 0.9 },
  { pattern: /\b(creates?|created|creating)\b/i, confidence: 0.85 },
  { pattern: /\b(runs?|running|ran)\b/i, confidence: 0.85 },
  { pattern: /\b(connects?\s+to|connected\s+to)\b/i, confidence: 0.9 },
  { pattern: /\b(migrated?\s+(?:to|from))\b/i, confidence: 0.9 },
  { pattern: /\b(replaced?\s+(?:by|with)?)\b/i, confidence: 0.85 },
  { pattern: /\b(configured?\s+(?:with|for|to)?)\b/i, confidence: 0.85 },
  { pattern: /\b(deployed?\s+(?:to|on|via)?)\b/i, confidence: 0.85 },
  { pattern: /\b(integrated?\s+(?:with)?)\b/i, confidence: 0.85 },

  // State verbs (medium confidence)
  { pattern: /\b(is|are|was|were)\b/i, confidence: 0.7 },
  { pattern: /\b(has|have|had)\b/i, confidence: 0.7 },
  { pattern: /\b(requires?|required|requiring)\b/i, confidence: 0.8 },
  { pattern: /\b(depends?\s+on)\b/i, confidence: 0.8 },
  { pattern: /\b(supports?|supported|supporting)\b/i, confidence: 0.8 },
  { pattern: /\b(enables?|enabled|enabling)\b/i, confidence: 0.8 },

  // Decision verbs (medium-high confidence)
  { pattern: /\b(decided?\s+to)\b/i, confidence: 0.85 },
  { pattern: /\b(chose|chosen|selected?)\b/i, confidence: 0.85 },
  { pattern: /\b(switched?\s+(?:to|from))\b/i, confidence: 0.85 },
  { pattern: /\b(added?|removed?|updated?|changed?|fixed?)\b/i, confidence: 0.8 },
];

/**
 * Distill relationships from content given known entities
 */
export function distillRelationships(
  content: string,
  entities: ExtractedEntity[]
): DistilledRelationship[] {
  const relationships: DistilledRelationship[] = [];
  const sentences = splitSentences(content);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // Find all entities in this sentence
    const foundEntities: Array<{ entity: ExtractedEntity; position: number }> = [];
    for (const entity of entities) {
      const idx = lower.indexOf(entity.name.toLowerCase());
      if (idx !== -1) {
        foundEntities.push({ entity, position: idx });
      }
    }

    // Need at least 2 entities for a relationship
    if (foundEntities.length < 2) continue;

    // Sort by position
    foundEntities.sort((a, b) => a.position - b.position);

    // Try to find verb between entity pairs
    for (let i = 0; i < foundEntities.length - 1; i++) {
      for (let j = i + 1; j < foundEntities.length; j++) {
        const subjectEnd = foundEntities[i].position + foundEntities[i].entity.name.length;
        const objectStart = foundEntities[j].position;
        const between = sentence.slice(subjectEnd, objectStart).trim();

        const rel = findVerb(between);
        if (rel) {
          relationships.push({
            subject: foundEntities[i].entity.name,
            predicate: rel.verb,
            object: foundEntities[j].entity.name,
            confidence: rel.confidence,
          });
        }
      }
    }
  }

  return deduplicateRelationships(relationships);
}

/**
 * Find the best matching verb in text
 */
function findVerb(text: string): { verb: string; confidence: number } | null {
  if (!text || text.length > 100) return null;

  let bestMatch: { verb: string; confidence: number } | null = null;

  for (const { pattern, confidence } of VERB_PATTERNS) {
    const match = text.match(pattern);
    if (match && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { verb: match[0].trim(), confidence };
    }
  }

  return bestMatch;
}

/**
 * Split text into sentences
 */
function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

/**
 * Remove duplicate relationships, keeping highest confidence
 */
function deduplicateRelationships(relationships: DistilledRelationship[]): DistilledRelationship[] {
  const seen = new Map<string, DistilledRelationship>();

  for (const rel of relationships) {
    const key = `${rel.subject.toLowerCase()}|${rel.object.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || rel.confidence > existing.confidence) {
      seen.set(key, rel);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence);
}

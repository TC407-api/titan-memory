/**
 * Memory Expander
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Reconstructs readable text from a CompressedMemory representation.
 * Supports prose, structured, and bullet output formats.
 */

import { CompressedMemory, ExpandedMemory, ExpansionOptions, ExtractedEntity } from './types.js';
import { contentSimilarity } from '../utils/similarity.js';

/**
 * Default expansion options
 */
const DEFAULTS: Required<ExpansionOptions> = {
  verbosity: 'normal',
  format: 'prose',
};

/**
 * Expand compressed memory back into readable text
 */
export function expandMemory(
  compressed: CompressedMemory,
  options: ExpansionOptions = {}
): ExpandedMemory {
  const opts = { ...DEFAULTS, ...options };

  let reconstructedContent: string;

  switch (opts.format) {
    case 'prose':
      reconstructedContent = expandAsProse(compressed, opts.verbosity);
      break;
    case 'structured':
      reconstructedContent = expandAsStructured(compressed, opts.verbosity);
      break;
    case 'bullet':
      reconstructedContent = expandAsBullet(compressed, opts.verbosity);
      break;
  }

  // Calculate reconstruction quality as content similarity of
  // the compressed summary vs reconstructed output
  const reconstructionQuality = compressed.summary
    ? contentSimilarity(compressed.summary, reconstructedContent)
    : 0.5;

  return {
    reconstructedContent,
    reconstructionQuality,
  };
}

/**
 * Expand as flowing prose
 */
function expandAsProse(compressed: CompressedMemory, verbosity: string): string {
  const parts: string[] = [];

  // Summary forms the core
  if (compressed.summary) {
    parts.push(compressed.summary);
  }

  // Add entity context
  if (compressed.entities.length > 0 && verbosity !== 'minimal') {
    const techEntities = compressed.entities.filter(e => e.type === 'technology');
    const personEntities = compressed.entities.filter(e => e.type === 'person');
    const configEntities = compressed.entities.filter(e => e.type === 'config');

    if (techEntities.length > 0) {
      parts.push(`Technologies involved: ${techEntities.map(e => e.name).join(', ')}.`);
    }
    if (personEntities.length > 0) {
      parts.push(`People involved: ${personEntities.map(e => e.name).join(', ')}.`);
    }
    if (configEntities.length > 0 && verbosity === 'detailed') {
      parts.push(`Configuration: ${configEntities.map(e => e.name).join(', ')}.`);
    }
  }

  // Add relationships as context
  if (compressed.relationships.length > 0 && verbosity !== 'minimal') {
    const relSentences = compressed.relationships
      .filter(r => r.confidence >= 0.7)
      .slice(0, verbosity === 'detailed' ? 10 : 3)
      .map(r => `${r.subject} ${r.predicate} ${r.object}`);

    if (relSentences.length > 0) {
      parts.push(relSentences.join('. ') + '.');
    }
  }

  // Add key facts
  if (compressed.keyFacts.length > 0 && verbosity === 'detailed') {
    parts.push(`Key facts: ${compressed.keyFacts.join('; ')}.`);
  }

  return parts.join(' ');
}

/**
 * Expand as structured YAML-like sections
 */
function expandAsStructured(compressed: CompressedMemory, verbosity: string): string {
  const lines: string[] = [];

  lines.push('Summary:');
  lines.push(`  ${compressed.summary || 'No summary available'}`);
  lines.push('');

  if (compressed.entities.length > 0) {
    lines.push('Entities:');
    const limit = verbosity === 'minimal' ? 5 : verbosity === 'detailed' ? 20 : 10;
    for (const entity of compressed.entities.slice(0, limit)) {
      const attrs = entity.attributes.length > 0
        ? ` (${entity.attributes.join(', ')})`
        : '';
      lines.push(`  - ${entity.name} [${entity.type}]${attrs}`);
    }
    lines.push('');
  }

  if (compressed.relationships.length > 0 && verbosity !== 'minimal') {
    lines.push('Relationships:');
    const limit = verbosity === 'detailed' ? 10 : 5;
    for (const rel of compressed.relationships.slice(0, limit)) {
      lines.push(`  - ${rel.subject} -> ${rel.predicate} -> ${rel.object} (${(rel.confidence * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  if (compressed.keyFacts.length > 0) {
    lines.push('Key Facts:');
    for (const fact of compressed.keyFacts) {
      lines.push(`  - ${fact}`);
    }
    lines.push('');
  }

  if (verbosity === 'detailed') {
    lines.push('Metrics:');
    lines.push(`  Compression Ratio: ${compressed.compressionRatio.toFixed(1)}x`);
    lines.push(`  Fidelity Score: ${(compressed.fidelityScore * 100).toFixed(1)}%`);
    lines.push(`  Original Tokens: ${compressed.originalTokens}`);
    lines.push(`  Compressed Tokens: ${compressed.compressedTokens}`);
  }

  return lines.join('\n');
}

/**
 * Expand as bullet points
 */
function expandAsBullet(compressed: CompressedMemory, verbosity: string): string {
  const lines: string[] = [];

  // Summary bullets
  if (compressed.summary) {
    const summSentences = compressed.summary.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    for (const s of summSentences) {
      lines.push(`- ${s}`);
    }
  }

  // Entity bullets
  if (compressed.entities.length > 0 && verbosity !== 'minimal') {
    lines.push('');
    const grouped = groupEntitiesByType(compressed.entities);
    for (const [type, entities] of Object.entries(grouped)) {
      lines.push(`- ${type}: ${entities.map(e => e.name).join(', ')}`);
    }
  }

  // Relationship bullets
  if (compressed.relationships.length > 0 && verbosity === 'detailed') {
    lines.push('');
    for (const rel of compressed.relationships.slice(0, 5)) {
      lines.push(`- ${rel.subject} ${rel.predicate} ${rel.object}`);
    }
  }

  // Key fact bullets
  if (compressed.keyFacts.length > 0) {
    lines.push('');
    for (const fact of compressed.keyFacts) {
      lines.push(`- ${fact}`);
    }
  }

  return lines.join('\n');
}

/**
 * Group entities by type
 */
function groupEntitiesByType(entities: ExtractedEntity[]): Record<string, ExtractedEntity[]> {
  const grouped: Record<string, ExtractedEntity[]> = {};
  for (const entity of entities) {
    if (!grouped[entity.type]) {
      grouped[entity.type] = [];
    }
    grouped[entity.type].push(entity);
  }
  return grouped;
}

/**
 * Compression Types
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Type definitions for the compression/expansion system.
 */

/**
 * An entity extracted from memory content
 */
export interface ExtractedEntity {
  name: string;
  type: 'person' | 'technology' | 'concept' | 'config' | 'url' | 'version' | 'organization' | 'location';
  mentions: number;
  attributes: string[];
}

/**
 * A subject-predicate-object triple distilled from content
 */
export interface DistilledRelationship {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

/**
 * Compressed representation of a memory
 */
export interface CompressedMemory {
  entities: ExtractedEntity[];
  relationships: DistilledRelationship[];
  summary: string;
  keyFacts: string[];
  compressionRatio: number;
  fidelityScore: number;
  originalTokens: number;
  compressedTokens: number;
}

/**
 * Expanded (reconstructed) memory from compressed form
 */
export interface ExpandedMemory {
  reconstructedContent: string;
  reconstructionQuality: number;
}

/**
 * Options for compression
 */
export interface CompressionOptions {
  targetRatio?: number;         // Target compression ratio (default: 20)
  preserveEntities?: boolean;   // Always include all entities (default: true)
  contextQuery?: string;        // Optional query to bias compression toward relevant content
}

/**
 * Options for expansion
 */
export interface ExpansionOptions {
  verbosity?: 'minimal' | 'normal' | 'detailed';  // Output verbosity (default: 'normal')
  format?: 'prose' | 'structured' | 'bullet';       // Output format (default: 'prose')
}

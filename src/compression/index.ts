/**
 * Compression Module
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Re-exports all compression types and functions.
 */

export * from './types.js';
export { extractEntities } from './entity-extractor.js';
export { distillRelationships } from './relationship-distiller.js';
export { compressMemory, estimateTokens } from './compressor.js';
export { expandMemory } from './expander.js';

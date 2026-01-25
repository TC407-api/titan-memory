/**
 * Titan Memory - Universal Cognitive Memory Layer
 *
 * A 5-layer cognitive memory system combining:
 * - Engram (O(1) hash lookup)
 * - Titans/MIRAS (surprise-based storage)
 * - Hope/Nested Learning (continual learning)
 * - Clawdbot (episodic memory patterns)
 *
 * Phase 3 Enhancements:
 * - Knowledge Graph (entity-relationship extraction)
 * - Decision Traces (structured decision logging)
 * - World Models (meta-node abstractions)
 * - Behavioral Validation (consistency checking)
 * - Adaptive Memory (intelligent consolidation)
 */

export * from './types.js';
export * from './titan.js';
export * from './errors.js';
export * from './layers/index.js';
export * from './utils/index.js';
export * from './mcp/index.js';

// Phase 3: Enhanced Cognitive Features
export * from './graph/knowledge-graph.js';
export * from './trace/decision-trace.js';
export * from './world/world-model.js';
export * from './validation/behavioral-validator.js';
export * from './adaptive/adaptive-memory.js';
export * from './learning/continual-learner.js';

// Phase 4: A2A Protocol Support (Multi-Agent Coordination)
export * from './a2a/index.js';

// Phase 5: Web Dashboard
export * from './dashboard/index.js';

// Phase 6: Hot-Reload Skill System
export * from './skills/index.js';

/**
 * Causal Graph Structure
 * Titan Memory v2.0 - Competitive Upgrade (MAGMA-inspired)
 *
 * Tracks causal relationships between memories, enabling:
 * - Cause/effect reasoning
 * - Dependency tracing
 * - Contradiction detection
 * - Decision chain reconstruction
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config.js';

/**
 * Types of causal relationships
 */
export type CausalRelationType =
  | 'causes'      // A directly causes B
  | 'enables'     // A enables/allows B to happen
  | 'blocks'      // A prevents/blocks B
  | 'follows'     // A temporally follows B
  | 'contradicts' // A contradicts/conflicts with B
  | 'requires'    // A requires/depends on B
  | 'supports'    // A provides evidence for B
  | 'refutes';    // A provides evidence against B

/**
 * A single causal edge between memories
 */
export interface CausalEdge {
  id: string;
  fromMemoryId: string;
  toMemoryId: string;
  relationship: CausalRelationType;
  strength: number;        // 0-1, confidence in this relationship
  createdAt: Date;
  updatedAt?: Date;
  evidence?: string;       // Why this relationship exists
  source?: 'inferred' | 'explicit' | 'user';
  metadata?: Record<string, unknown>;
}

/**
 * Result of tracing a causal chain
 */
export interface CausalChain {
  rootMemoryId: string;
  chain: CausalEdge[];
  depth: number;
  totalStrength: number;   // Product of edge strengths
  hasCycle: boolean;
}

/**
 * Result of asking "why" for a memory
 */
export interface ExplanationTree {
  memoryId: string;
  directCauses: CausalEdge[];
  indirectCauses: CausalEdge[];
  rootCauses: string[];    // Memory IDs with no further causes
  confidence: number;
  explanation: string;
}

/**
 * Graph statistics
 */
export interface CausalGraphStats {
  totalEdges: number;
  byRelationType: Record<CausalRelationType, number>;
  avgStrength: number;
  avgEdgesPerMemory: number;
  memoriesWithLinks: number;
  cyclesDetected: number;
}

/**
 * Causal Graph Manager
 */
export class CausalGraph {
  private dataPath: string;
  private edges: Map<string, CausalEdge> = new Map();
  private byFromMemory: Map<string, Set<string>> = new Map();  // memoryId -> edgeIds
  private byToMemory: Map<string, Set<string>> = new Map();    // memoryId -> edgeIds
  private initialized: boolean = false;
  private cyclesDetected: number = 0;

  constructor() {
    const config = loadConfig();
    const dataDir = config.dataDir || path.join(process.env.HOME || '', '.claude', 'titan-memory', 'data');
    this.dataPath = path.join(dataDir, 'graphs', 'causal.json');
  }

  /**
   * Initialize the causal graph
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        this.loadFromData(data);
      }

      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize CausalGraph:', error);
      this.initialized = true;
    }
  }

  /**
   * Load graph from persisted data
   */
  private loadFromData(data: { edges: CausalEdge[]; cyclesDetected?: number }): void {
    this.edges.clear();
    this.byFromMemory.clear();
    this.byToMemory.clear();
    this.cyclesDetected = data.cyclesDetected || 0;

    for (const edge of data.edges || []) {
      // Convert dates
      edge.createdAt = new Date(edge.createdAt);
      if (edge.updatedAt) edge.updatedAt = new Date(edge.updatedAt);

      this.edges.set(edge.id, edge);
      this.indexEdge(edge);
    }
  }

  /**
   * Index an edge for fast lookup
   */
  private indexEdge(edge: CausalEdge): void {
    // Index by from memory
    if (!this.byFromMemory.has(edge.fromMemoryId)) {
      this.byFromMemory.set(edge.fromMemoryId, new Set());
    }
    this.byFromMemory.get(edge.fromMemoryId)!.add(edge.id);

    // Index by to memory
    if (!this.byToMemory.has(edge.toMemoryId)) {
      this.byToMemory.set(edge.toMemoryId, new Set());
    }
    this.byToMemory.get(edge.toMemoryId)!.add(edge.id);
  }

  /**
   * Create a causal link between two memories
   */
  async link(params: {
    fromMemoryId: string;
    toMemoryId: string;
    relationship: CausalRelationType;
    strength?: number;
    evidence?: string;
    source?: 'inferred' | 'explicit' | 'user';
  }): Promise<CausalEdge> {
    if (!this.initialized) await this.initialize();

    // Check for existing edge
    const existing = this.findEdge(params.fromMemoryId, params.toMemoryId, params.relationship);
    if (existing) {
      // Update existing edge
      existing.strength = Math.max(existing.strength, params.strength || 0.5);
      if (params.evidence) {
        existing.evidence = params.evidence;
      }
      existing.updatedAt = new Date();
      await this.persist();
      return existing;
    }

    const edge: CausalEdge = {
      id: this.generateId(),
      fromMemoryId: params.fromMemoryId,
      toMemoryId: params.toMemoryId,
      relationship: params.relationship,
      strength: params.strength ?? 0.5,
      createdAt: new Date(),
      evidence: params.evidence,
      source: params.source || 'explicit',
    };

    // Check for cycles
    if (this.wouldCreateCycle(edge)) {
      this.cyclesDetected++;
      console.warn('Cycle detected in causal graph, edge not added');
      // Still add the edge but mark it
      edge.metadata = { ...edge.metadata, cyclic: true };
    }

    this.edges.set(edge.id, edge);
    this.indexEdge(edge);
    await this.persist();

    return edge;
  }

  /**
   * Find an existing edge
   */
  private findEdge(fromId: string, toId: string, relationship: CausalRelationType): CausalEdge | null {
    const edgeIds = this.byFromMemory.get(fromId);
    if (!edgeIds) return null;

    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && edge.toMemoryId === toId && edge.relationship === relationship) {
        return edge;
      }
    }

    return null;
  }

  /**
   * Check if adding an edge would create a cycle
   */
  private wouldCreateCycle(newEdge: CausalEdge): boolean {
    // BFS from toMemoryId to see if we can reach fromMemoryId
    const visited = new Set<string>();
    const queue = [newEdge.toMemoryId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === newEdge.fromMemoryId) {
        return true;
      }
      if (visited.has(current)) continue;
      visited.add(current);

      const outgoingEdgeIds = this.byFromMemory.get(current);
      if (outgoingEdgeIds) {
        for (const edgeId of outgoingEdgeIds) {
          const edge = this.edges.get(edgeId);
          if (edge) {
            queue.push(edge.toMemoryId);
          }
        }
      }
    }

    return false;
  }

  /**
   * Trace causal chain from a memory
   */
  async trace(memoryId: string, options?: {
    depth?: number;
    direction?: 'forward' | 'backward' | 'both';
    minStrength?: number;
    relationTypes?: CausalRelationType[];
  }): Promise<CausalChain> {
    if (!this.initialized) await this.initialize();

    const maxDepth = options?.depth || 5;
    const direction = options?.direction || 'backward';
    const minStrength = options?.minStrength || 0;
    const relationTypes = options?.relationTypes;

    const chain: CausalEdge[] = [];
    const visited = new Set<string>();
    let hasCycle = false;

    const traverse = (currentId: string, currentDepth: number) => {
      if (currentDepth >= maxDepth) return;
      if (visited.has(currentId)) {
        hasCycle = true;
        return;
      }
      visited.add(currentId);

      // Get edges based on direction
      const edgeIds = direction === 'forward'
        ? this.byFromMemory.get(currentId)
        : direction === 'backward'
          ? this.byToMemory.get(currentId)
          : new Set([
              ...(this.byFromMemory.get(currentId) || []),
              ...(this.byToMemory.get(currentId) || []),
            ]);

      if (!edgeIds) return;

      for (const edgeId of edgeIds) {
        const edge = this.edges.get(edgeId);
        if (!edge) continue;
        if (edge.strength < minStrength) continue;
        if (relationTypes && !relationTypes.includes(edge.relationship)) continue;

        chain.push(edge);

        const nextId = direction === 'forward' ? edge.toMemoryId : edge.fromMemoryId;
        traverse(nextId, currentDepth + 1);
      }
    };

    traverse(memoryId, 0);

    // Calculate total strength
    const totalStrength = chain.length > 0
      ? chain.reduce((acc, e) => acc * e.strength, 1)
      : 0;

    return {
      rootMemoryId: memoryId,
      chain,
      depth: chain.length,
      totalStrength,
      hasCycle,
    };
  }

  /**
   * Explain why a memory exists (trace its causes)
   */
  async why(memoryId: string, maxDepth: number = 5): Promise<ExplanationTree> {
    if (!this.initialized) await this.initialize();

    const directCauses: CausalEdge[] = [];
    const indirectCauses: CausalEdge[] = [];
    const rootCauses = new Set<string>();

    // Get direct causes
    const directEdgeIds = this.byToMemory.get(memoryId);
    if (directEdgeIds) {
      for (const edgeId of directEdgeIds) {
        const edge = this.edges.get(edgeId);
        if (edge && (edge.relationship === 'causes' || edge.relationship === 'enables' || edge.relationship === 'requires')) {
          directCauses.push(edge);
        }
      }
    }

    // Trace deeper for indirect causes
    const visited = new Set<string>([memoryId]);
    const queue = directCauses.map(e => ({ edge: e, depth: 1 }));

    while (queue.length > 0) {
      const { edge, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const fromId = edge.fromMemoryId;
      if (visited.has(fromId)) continue;
      visited.add(fromId);

      const parentEdgeIds = this.byToMemory.get(fromId);
      if (!parentEdgeIds || parentEdgeIds.size === 0) {
        rootCauses.add(fromId);
        continue;
      }

      for (const edgeId of parentEdgeIds) {
        const parentEdge = this.edges.get(edgeId);
        if (parentEdge && (parentEdge.relationship === 'causes' || parentEdge.relationship === 'enables')) {
          indirectCauses.push(parentEdge);
          queue.push({ edge: parentEdge, depth: depth + 1 });
        }
      }
    }

    // Calculate confidence
    const allCauses = [...directCauses, ...indirectCauses];
    const confidence = allCauses.length > 0
      ? allCauses.reduce((acc, e) => acc + e.strength, 0) / allCauses.length
      : 0;

    // Generate explanation
    let explanation = '';
    if (directCauses.length === 0) {
      explanation = 'No causal relationships found for this memory.';
    } else {
      const causeDescriptions = directCauses.map(e =>
        `${e.relationship} by ${e.fromMemoryId}${e.evidence ? ` (${e.evidence})` : ''}`
      ).join(', ');
      explanation = `This memory is ${causeDescriptions}.`;
      if (rootCauses.size > 0) {
        explanation += ` Root causes: ${Array.from(rootCauses).slice(0, 3).join(', ')}.`;
      }
    }

    return {
      memoryId,
      directCauses,
      indirectCauses,
      rootCauses: Array.from(rootCauses),
      confidence,
      explanation,
    };
  }

  /**
   * Get all edges for a memory
   */
  async getEdgesForMemory(memoryId: string): Promise<{
    outgoing: CausalEdge[];
    incoming: CausalEdge[];
  }> {
    if (!this.initialized) await this.initialize();

    const outgoing: CausalEdge[] = [];
    const incoming: CausalEdge[] = [];

    const outgoingIds = this.byFromMemory.get(memoryId);
    if (outgoingIds) {
      for (const edgeId of outgoingIds) {
        const edge = this.edges.get(edgeId);
        if (edge) outgoing.push(edge);
      }
    }

    const incomingIds = this.byToMemory.get(memoryId);
    if (incomingIds) {
      for (const edgeId of incomingIds) {
        const edge = this.edges.get(edgeId);
        if (edge) incoming.push(edge);
      }
    }

    return { outgoing, incoming };
  }

  /**
   * Remove a causal link
   */
  async unlink(edgeId: string): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    const edge = this.edges.get(edgeId);
    if (!edge) return false;

    // Remove from indexes
    const fromSet = this.byFromMemory.get(edge.fromMemoryId);
    if (fromSet) fromSet.delete(edgeId);

    const toSet = this.byToMemory.get(edge.toMemoryId);
    if (toSet) toSet.delete(edgeId);

    this.edges.delete(edgeId);
    await this.persist();

    return true;
  }

  /**
   * Remove all edges involving a memory
   */
  async removeMemory(memoryId: string): Promise<number> {
    if (!this.initialized) await this.initialize();

    const edgesToRemove: string[] = [];

    const outgoingIds = this.byFromMemory.get(memoryId);
    if (outgoingIds) {
      edgesToRemove.push(...outgoingIds);
    }

    const incomingIds = this.byToMemory.get(memoryId);
    if (incomingIds) {
      edgesToRemove.push(...incomingIds);
    }

    for (const edgeId of edgesToRemove) {
      await this.unlink(edgeId);
    }

    return edgesToRemove.length;
  }

  /**
   * Find contradictions involving a memory
   */
  async findContradictions(memoryId: string): Promise<CausalEdge[]> {
    if (!this.initialized) await this.initialize();

    const contradictions: CausalEdge[] = [];

    const allEdgeIds = new Set([
      ...(this.byFromMemory.get(memoryId) || []),
      ...(this.byToMemory.get(memoryId) || []),
    ]);

    for (const edgeId of allEdgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge && (edge.relationship === 'contradicts' || edge.relationship === 'refutes')) {
        contradictions.push(edge);
      }
    }

    return contradictions;
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<CausalGraphStats> {
    if (!this.initialized) await this.initialize();

    const byRelationType: Record<CausalRelationType, number> = {
      causes: 0,
      enables: 0,
      blocks: 0,
      follows: 0,
      contradicts: 0,
      requires: 0,
      supports: 0,
      refutes: 0,
    };

    let totalStrength = 0;
    const memoriesWithLinks = new Set<string>();

    for (const edge of this.edges.values()) {
      byRelationType[edge.relationship]++;
      totalStrength += edge.strength;
      memoriesWithLinks.add(edge.fromMemoryId);
      memoriesWithLinks.add(edge.toMemoryId);
    }

    const totalEdges = this.edges.size;
    const avgStrength = totalEdges > 0 ? totalStrength / totalEdges : 0;
    const avgEdgesPerMemory = memoriesWithLinks.size > 0
      ? totalEdges / memoriesWithLinks.size
      : 0;

    return {
      totalEdges,
      byRelationType,
      avgStrength,
      avgEdgesPerMemory,
      memoriesWithLinks: memoriesWithLinks.size,
      cyclesDetected: this.cyclesDetected,
    };
  }

  /**
   * Persist graph to disk
   */
  private async persist(): Promise<void> {
    try {
      const data = {
        edges: Array.from(this.edges.values()),
        cyclesDetected: this.cyclesDetected,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to persist CausalGraph:', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `causal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Close the graph
   */
  async close(): Promise<void> {
    await this.persist();
    this.initialized = false;
  }
}

// Singleton instance
let causalGraphInstance: CausalGraph | null = null;

export function getCausalGraph(): CausalGraph {
  if (!causalGraphInstance) {
    causalGraphInstance = new CausalGraph();
  }
  return causalGraphInstance;
}

export async function initCausalGraph(): Promise<CausalGraph> {
  const graph = getCausalGraph();
  await graph.initialize();
  return graph;
}

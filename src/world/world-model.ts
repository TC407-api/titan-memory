/**
 * World Model / Meta Nodes System
 *
 * Higher-level abstractions for organizing memories into contexts.
 * Inspired by Cognee's world models and context graphs.
 *
 * Key concepts:
 * - MetaNode: Abstract container (project, user, session, concept)
 * - WorldState: Current state of all meta nodes
 * - Context inheritance: Memories inherit parent context
 * - Aggregation: Roll up insights from child memories
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';
import { MemoryEntry, MemoryLayer } from '../types.js';

// Meta node types (abstract containers)
export type MetaNodeType =
  | 'project'     // A codebase or application
  | 'user'        // User profile and preferences
  | 'session'     // A work session
  | 'context'     // A topic or domain
  | 'goal'        // An objective or milestone
  | 'workflow'    // A recurring process
  | 'skill'       // A learned capability
  | 'domain';     // A knowledge domain

// Meta node representing a higher-level abstraction
export interface MetaNode {
  id: string;
  type: MetaNodeType;
  name: string;
  description?: string;

  // Hierarchy
  parentId?: string;
  childIds: string[];

  // Aggregated state
  state: {
    memoryCount: number;
    lastActivity: Date;
    totalAccess: number;
    importance: number;  // 0-1, computed from children
    status: 'active' | 'dormant' | 'archived';
  };

  // Aggregated insights
  insights: {
    topPatterns: string[];      // Most common patterns
    commonTags: string[];       // Frequently used tags
    keyEntities: string[];      // Most referenced entities
    successRate: number;        // Decision success rate
    avgSurprise: number;        // Average surprise score
  };

  // Configuration
  config: {
    autoConsolidate: boolean;   // Auto-merge similar memories
    retentionDays?: number;     // Override decay half-life
    priorityBoost: number;      // Boost for recall (-1 to 1)
  };

  // Metadata
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Link between meta node and memories
export interface MetaNodeLink {
  metaNodeId: string;
  memoryId: string;
  layer: MemoryLayer;
  relationship: 'contains' | 'references' | 'derived_from';
  strength: number;  // 0-1
  createdAt: Date;
}

// World state snapshot
export interface WorldState {
  timestamp: Date;
  activeContext: string[];      // Current active meta node IDs
  recentMemories: string[];     // Recent memory IDs
  focusScore: number;           // How focused the current work is (0-1)
  topPatterns: string[];        // Current emerging patterns
  anomalies: string[];          // Detected anomalies
}

// Context inheritance for new memories
export interface ContextInheritance {
  metaNodeId: string;
  inheritedTags: string[];
  inheritedPriority: number;
  constraints: string[];
}

// Aggregation result
export interface AggregationResult {
  metaNodeId: string;
  memoryCount: number;
  topPatterns: Array<{ pattern: string; count: number }>;
  commonTags: Array<{ tag: string; count: number }>;
  keyInsights: string[];
  timespan: { start: Date; end: Date };
}

export class WorldModel {
  private nodes: Map<string, MetaNode> = new Map();
  private links: Map<string, MetaNodeLink> = new Map();
  private memoryToNodes: Map<string, Set<string>> = new Map();  // memory ID -> meta node IDs
  private nodeChildren: Map<string, Set<string>> = new Map();   // node ID -> child IDs
  private currentState: WorldState;
  private dataPath: string;
  private initialized: boolean = false;

  constructor() {
    const config = getConfig();
    this.dataPath = path.join(config.dataDir, 'world', 'world-model.json');
    this.currentState = this.createInitialState();
  }

  private createInitialState(): WorldState {
    return {
      timestamp: new Date(),
      activeContext: [],
      recentMemories: [],
      focusScore: 0.5,
      topPatterns: [],
      anomalies: [],
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadFromDisk();
    this.initialized = true;
  }

  private async loadFromDisk(): Promise<void> {
    if (fs.existsSync(this.dataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));

        for (const node of data.nodes || []) {
          node.createdAt = new Date(node.createdAt);
          node.updatedAt = new Date(node.updatedAt);
          node.state.lastActivity = new Date(node.state.lastActivity);
          this.nodes.set(node.id, node);

          // Build parent-child index
          if (node.parentId) {
            if (!this.nodeChildren.has(node.parentId)) {
              this.nodeChildren.set(node.parentId, new Set());
            }
            this.nodeChildren.get(node.parentId)!.add(node.id);
          }
        }

        for (const link of data.links || []) {
          link.createdAt = new Date(link.createdAt);
          this.links.set(`${link.metaNodeId}:${link.memoryId}`, link);

          // Build memory -> node index
          if (!this.memoryToNodes.has(link.memoryId)) {
            this.memoryToNodes.set(link.memoryId, new Set());
          }
          this.memoryToNodes.get(link.memoryId)!.add(link.metaNodeId);
        }

        if (data.state) {
          this.currentState = {
            ...data.state,
            timestamp: new Date(data.state.timestamp),
          };
        }
      } catch (error) {
        console.warn('Failed to load world model:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      nodes: [...this.nodes.values()],
      links: [...this.links.values()],
      state: this.currentState,
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  // ==================== Meta Node Operations ====================

  /**
   * Create a new meta node
   */
  async createNode(params: {
    type: MetaNodeType;
    name: string;
    description?: string;
    parentId?: string;
    config?: Partial<MetaNode['config']>;
    metadata?: Record<string, unknown>;
  }): Promise<MetaNode> {
    const node: MetaNode = {
      id: uuidv4(),
      type: params.type,
      name: params.name,
      description: params.description,
      parentId: params.parentId,
      childIds: [],
      state: {
        memoryCount: 0,
        lastActivity: new Date(),
        totalAccess: 0,
        importance: 0.5,
        status: 'active',
      },
      insights: {
        topPatterns: [],
        commonTags: [],
        keyEntities: [],
        successRate: 0,
        avgSurprise: 0,
      },
      config: {
        autoConsolidate: true,
        priorityBoost: 0,
        ...params.config,
      },
      metadata: params.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Link to parent
    if (params.parentId) {
      const parent = this.nodes.get(params.parentId);
      if (parent) {
        parent.childIds.push(node.id);
        parent.updatedAt = new Date();
      }

      if (!this.nodeChildren.has(params.parentId)) {
        this.nodeChildren.set(params.parentId, new Set());
      }
      this.nodeChildren.get(params.parentId)!.add(node.id);
    }

    this.nodes.set(node.id, node);
    await this.saveToDisk();

    return node;
  }

  /**
   * Get or create a meta node by name and type
   */
  async getOrCreate(
    type: MetaNodeType,
    name: string,
    parentId?: string
  ): Promise<MetaNode> {
    // Search for existing
    for (const node of this.nodes.values()) {
      if (node.type === type && node.name.toLowerCase() === name.toLowerCase()) {
        if (!parentId || node.parentId === parentId) {
          return node;
        }
      }
    }

    // Create new
    return this.createNode({ type, name, parentId });
  }

  /**
   * Get a meta node by ID
   */
  async getNode(id: string): Promise<MetaNode | null> {
    return this.nodes.get(id) || null;
  }

  /**
   * Get nodes by type
   */
  async getNodesByType(type: MetaNodeType): Promise<MetaNode[]> {
    return [...this.nodes.values()].filter(n => n.type === type);
  }

  /**
   * Get child nodes
   */
  async getChildren(nodeId: string): Promise<MetaNode[]> {
    const childIds = this.nodeChildren.get(nodeId);
    if (!childIds) return [];

    return [...childIds]
      .map(id => this.nodes.get(id))
      .filter((n): n is MetaNode => n !== undefined);
  }

  /**
   * Update node state
   */
  async updateNodeState(nodeId: string, updates: Partial<MetaNode['state']>): Promise<MetaNode | null> {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    node.state = { ...node.state, ...updates };
    node.updatedAt = new Date();

    await this.saveToDisk();
    return node;
  }

  /**
   * Archive a node (mark as dormant after inactivity)
   */
  async archiveNode(nodeId: string): Promise<boolean> {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    node.state.status = 'archived';
    node.updatedAt = new Date();

    await this.saveToDisk();
    return true;
  }

  // ==================== Memory Linking ====================

  /**
   * Link a memory to a meta node
   */
  async linkMemory(
    metaNodeId: string,
    memoryId: string,
    layer: MemoryLayer,
    relationship: MetaNodeLink['relationship'] = 'contains'
  ): Promise<MetaNodeLink | null> {
    const node = this.nodes.get(metaNodeId);
    if (!node) return null;

    const linkKey = `${metaNodeId}:${memoryId}`;

    // Check for existing link
    const existing = this.links.get(linkKey);
    if (existing) {
      existing.strength = Math.min(1.0, existing.strength + 0.1);
      return existing;
    }

    const link: MetaNodeLink = {
      metaNodeId,
      memoryId,
      layer,
      relationship,
      strength: 0.5,
      createdAt: new Date(),
    };

    this.links.set(linkKey, link);

    // Update indices
    if (!this.memoryToNodes.has(memoryId)) {
      this.memoryToNodes.set(memoryId, new Set());
    }
    this.memoryToNodes.get(memoryId)!.add(metaNodeId);

    // Update node state
    node.state.memoryCount++;
    node.state.lastActivity = new Date();
    node.state.totalAccess++;
    node.updatedAt = new Date();

    // Propagate to ancestors
    await this.propagateActivity(metaNodeId);

    await this.saveToDisk();
    return link;
  }

  /**
   * Get all meta nodes for a memory
   */
  async getNodesForMemory(memoryId: string): Promise<MetaNode[]> {
    const nodeIds = this.memoryToNodes.get(memoryId);
    if (!nodeIds) return [];

    return [...nodeIds]
      .map(id => this.nodes.get(id))
      .filter((n): n is MetaNode => n !== undefined);
  }

  /**
   * Get all memories linked to a meta node
   */
  async getMemoriesForNode(nodeId: string): Promise<string[]> {
    const memoryIds: string[] = [];

    for (const [, link] of this.links) {
      if (link.metaNodeId === nodeId) {
        memoryIds.push(link.memoryId);
      }
    }

    return memoryIds;
  }

  // ==================== Context Inheritance ====================

  /**
   * Get context inheritance for a new memory
   */
  async getContextInheritance(activeContextIds: string[]): Promise<ContextInheritance | null> {
    if (activeContextIds.length === 0) return null;

    const inheritedTags: Set<string> = new Set();
    const constraints: string[] = [];
    let totalPriority = 0;

    for (const nodeId of activeContextIds) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      // Inherit tags
      for (const tag of node.insights.commonTags) {
        inheritedTags.add(tag);
      }

      // Inherit priority boost
      totalPriority += node.config.priorityBoost;

      // Collect constraints from metadata
      if (node.metadata.constraints) {
        constraints.push(...(node.metadata.constraints as string[]));
      }
    }

    return {
      metaNodeId: activeContextIds[0],
      inheritedTags: [...inheritedTags],
      inheritedPriority: totalPriority / activeContextIds.length,
      constraints: [...new Set(constraints)],
    };
  }

  /**
   * Auto-detect context from memory content
   */
  async detectContext(content: string): Promise<MetaNode[]> {
    const detected: MetaNode[] = [];
    const lower = content.toLowerCase();

    for (const node of this.nodes.values()) {
      // Match by name
      if (lower.includes(node.name.toLowerCase())) {
        detected.push(node);
        continue;
      }

      // Match by common tags
      for (const tag of node.insights.commonTags) {
        if (lower.includes(tag.toLowerCase())) {
          detected.push(node);
          break;
        }
      }

      // Match by key entities
      for (const entity of node.insights.keyEntities) {
        if (lower.includes(entity.toLowerCase())) {
          detected.push(node);
          break;
        }
      }
    }

    return detected;
  }

  // ==================== Aggregation ====================

  /**
   * Aggregate insights from all memories in a meta node
   */
  async aggregate(
    nodeId: string,
    memories: MemoryEntry[]
  ): Promise<AggregationResult> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Meta node not found: ${nodeId}`);
    }

    // Count patterns
    const patternCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    let minDate = new Date();
    let maxDate = new Date(0);

    for (const memory of memories) {
      // Track time range
      if (memory.timestamp < minDate) minDate = memory.timestamp;
      if (memory.timestamp > maxDate) maxDate = memory.timestamp;

      // Count tags
      const tags = memory.metadata.tags || [];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }

      // Count patterns from content
      const patterns = this.extractPatterns(memory.content);
      for (const pattern of patterns) {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      }
    }

    // Sort by count
    const topPatterns = [...patternCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));

    const commonTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Update node insights
    node.insights.topPatterns = topPatterns.slice(0, 5).map(p => p.pattern);
    node.insights.commonTags = commonTags.slice(0, 5).map(t => t.tag);
    node.state.memoryCount = memories.length;
    node.updatedAt = new Date();

    await this.saveToDisk();

    return {
      metaNodeId: nodeId,
      memoryCount: memories.length,
      topPatterns,
      commonTags,
      keyInsights: topPatterns.slice(0, 3).map(p => p.pattern),
      timespan: { start: minDate, end: maxDate },
    };
  }

  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];

    // Extract technology mentions
    const techPattern = /\b(?:React|Vue|Angular|Node|TypeScript|Python|Go|Rust|Docker|Kubernetes|AWS|GCP|Azure|Vercel|Next\.js|Express)\b/gi;
    const techMatches = content.matchAll(techPattern);
    for (const match of techMatches) {
      patterns.push(`tech:${match[0].toLowerCase()}`);
    }

    // Extract action patterns
    const actionPattern = /\b(?:implement|fix|refactor|add|remove|update|optimize|debug)\b\s+\w+/gi;
    const actionMatches = content.matchAll(actionPattern);
    for (const match of actionMatches) {
      patterns.push(`action:${match[0].toLowerCase()}`);
    }

    return patterns;
  }

  // ==================== World State ====================

  /**
   * Get current world state
   */
  getWorldState(): WorldState {
    return { ...this.currentState };
  }

  /**
   * Update active context
   */
  async setActiveContext(nodeIds: string[]): Promise<void> {
    this.currentState.activeContext = nodeIds;
    this.currentState.timestamp = new Date();

    // Update focus score based on context coherence
    if (nodeIds.length === 0) {
      this.currentState.focusScore = 0.3;
    } else if (nodeIds.length === 1) {
      this.currentState.focusScore = 1.0;
    } else {
      // Check if nodes are related
      const related = await this.areNodesRelated(nodeIds);
      this.currentState.focusScore = related ? 0.8 : 0.5;
    }

    await this.saveToDisk();
  }

  /**
   * Record recent memory activity
   */
  async recordMemoryActivity(memoryId: string): Promise<void> {
    const recentLimit = 50;

    this.currentState.recentMemories = [
      memoryId,
      ...this.currentState.recentMemories.filter(id => id !== memoryId),
    ].slice(0, recentLimit);

    this.currentState.timestamp = new Date();
    // Don't save on every activity - batch save
  }

  /**
   * Detect and record anomalies
   */
  async recordAnomaly(description: string): Promise<void> {
    const anomalyLimit = 20;

    this.currentState.anomalies = [
      description,
      ...this.currentState.anomalies,
    ].slice(0, anomalyLimit);

    await this.saveToDisk();
  }

  // ==================== Helpers ====================

  private async propagateActivity(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parentId) return;

    const parent = this.nodes.get(node.parentId);
    if (parent) {
      parent.state.lastActivity = new Date();
      parent.state.totalAccess++;
      await this.propagateActivity(parent.id);
    }
  }

  private async areNodesRelated(nodeIds: string[]): Promise<boolean> {
    if (nodeIds.length < 2) return true;

    // Check if they share a common ancestor
    const ancestors = new Set<string>();

    for (const nodeId of nodeIds) {
      let current = this.nodes.get(nodeId);
      while (current) {
        if (current.parentId) {
          ancestors.add(current.parentId);
          current = this.nodes.get(current.parentId);
        } else {
          break;
        }
      }
    }

    // Check if any node is an ancestor of another
    for (const nodeId of nodeIds) {
      if (ancestors.has(nodeId)) return true;
    }

    // Check for sibling relationship
    const parents = new Set<string>();
    for (const nodeId of nodeIds) {
      const node = this.nodes.get(nodeId);
      if (node?.parentId) {
        if (parents.has(node.parentId)) return true;
        parents.add(node.parentId);
      }
    }

    return false;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalNodes: number;
    byType: Record<MetaNodeType, number>;
    byStatus: Record<string, number>;
    totalLinks: number;
    avgMemoriesPerNode: number;
    mostActive: MetaNode[];
  }> {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalMemories = 0;

    for (const node of this.nodes.values()) {
      byType[node.type] = (byType[node.type] || 0) + 1;
      byStatus[node.state.status] = (byStatus[node.state.status] || 0) + 1;
      totalMemories += node.state.memoryCount;
    }

    const mostActive = [...this.nodes.values()]
      .sort((a, b) => b.state.totalAccess - a.state.totalAccess)
      .slice(0, 5);

    return {
      totalNodes: this.nodes.size,
      byType: byType as Record<MetaNodeType, number>,
      byStatus,
      totalLinks: this.links.size,
      avgMemoriesPerNode: this.nodes.size > 0 ? totalMemories / this.nodes.size : 0,
      mostActive,
    };
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.nodes.clear();
    this.links.clear();
    this.memoryToNodes.clear();
    this.nodeChildren.clear();
    this.initialized = false;
  }
}

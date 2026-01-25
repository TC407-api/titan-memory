/**
 * Knowledge Graph Layer
 *
 * Entity-relationship graph for semantic connections.
 * Inspired by Cognee's context graphs and Graphiti's temporal knowledge graphs.
 *
 * Key innovations:
 * - Automatic entity extraction from content
 * - Relationship inference between entities
 * - Temporal awareness (when relationships were formed/changed)
 * - Bi-directional traversal for context expansion
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../utils/config.js';

// Entity types recognized by the system
export type EntityType =
  | 'person'
  | 'organization'
  | 'project'
  | 'technology'
  | 'file'
  | 'function'
  | 'class'
  | 'error'
  | 'solution'
  | 'concept'
  | 'decision'
  | 'preference'
  | 'custom';

// Relationship types between entities
export type RelationType =
  | 'uses'
  | 'implements'
  | 'extends'
  | 'depends_on'
  | 'related_to'
  | 'causes'
  | 'solves'
  | 'prefers'
  | 'created_by'
  | 'contains'
  | 'references'
  | 'conflicts_with'
  | 'succeeds'
  | 'precedes';

// Entity node in the knowledge graph
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  description?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  importance: number; // 0-1, calculated from centrality and access patterns
}

// Relationship edge in the knowledge graph
export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  strength: number; // 0-1, increases with reinforcement
  context: string; // The context in which this relationship was discovered
  evidence: string[]; // Memory IDs that support this relationship
  createdAt: Date;
  updatedAt: Date;
}

// Entity extraction result
export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  sourceContent: string;
  confidence: number;
}

// Graph query result
export interface GraphQueryResult {
  entities: Entity[];
  relationships: Relationship[];
  paths: EntityPath[];
  queryTimeMs: number;
}

// Path between entities
export interface EntityPath {
  entities: Entity[];
  relationships: Relationship[];
  totalStrength: number;
}

// Patterns for entity extraction
const ENTITY_PATTERNS = {
  // Technology/tool mentions
  technology: /\b(?:React|Vue|Angular|Node\.js|TypeScript|JavaScript|Python|Go|Rust|PostgreSQL|MongoDB|Redis|Docker|Kubernetes|AWS|GCP|Azure|Vercel|Firebase|Supabase|Next\.js|Express|FastAPI|Django|Flask)\b/gi,

  // File paths
  file: /(?:\/[\w.-]+)+\.\w+|[\w-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|json|yaml|yml|md|txt)/g,

  // Function/method patterns
  function: /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(|def\s+(\w+)|func\s+(\w+))/g,

  // Class patterns
  class: /(?:class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)\s*=|struct\s+(\w+))/g,

  // Error patterns
  error: /(?:Error:|Exception:|error:|failed:|failure:|TypeError|ReferenceError|SyntaxError|RuntimeError)\s*([^.\n]+)/gi,

  // Decision markers
  decision: /(?:decided to|decision:|chose|going with|picked|selected|opted for)\s+([^.\n]+)/gi,

  // Preference markers
  preference: /(?:prefer|I like|should use|better to|recommend)\s+([^.\n]+)/gi,
};

// Relationship inference patterns
const RELATIONSHIP_PATTERNS: Array<{
  pattern: RegExp;
  type: RelationType;
  extractEntities: (match: RegExpMatchArray) => [string, string];
}> = [
  {
    pattern: /(\w+)\s+uses\s+(\w+)/gi,
    type: 'uses',
    extractEntities: (m) => [m[1], m[2]],
  },
  {
    pattern: /(\w+)\s+(?:implements|extends|inherits from)\s+(\w+)/gi,
    type: 'implements',
    extractEntities: (m) => [m[1], m[2]],
  },
  {
    pattern: /(\w+)\s+(?:depends on|requires|needs)\s+(\w+)/gi,
    type: 'depends_on',
    extractEntities: (m) => [m[1], m[2]],
  },
  {
    pattern: /(\w+)\s+(?:causes|leads to|results in)\s+(\w+)/gi,
    type: 'causes',
    extractEntities: (m) => [m[1], m[2]],
  },
  {
    pattern: /(\w+)\s+(?:fixes|solves|resolves)\s+(\w+)/gi,
    type: 'solves',
    extractEntities: (m) => [m[1], m[2]],
  },
  {
    pattern: /(\w+)\s+(?:conflicts with|incompatible with)\s+(\w+)/gi,
    type: 'conflicts_with',
    extractEntities: (m) => [m[1], m[2]],
  },
];

export class KnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name/alias -> entity ID
  private adjacencyList: Map<string, Set<string>> = new Map(); // entity ID -> relationship IDs
  private dataPath: string;
  private initialized: boolean = false;

  constructor() {
    const config = getConfig();
    this.dataPath = path.join(config.dataDir, 'graph', 'knowledge-graph.json');
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

        for (const entity of data.entities || []) {
          entity.createdAt = new Date(entity.createdAt);
          entity.updatedAt = new Date(entity.updatedAt);
          this.entities.set(entity.id, entity);
          this.indexEntity(entity);
        }

        for (const rel of data.relationships || []) {
          rel.createdAt = new Date(rel.createdAt);
          rel.updatedAt = new Date(rel.updatedAt);
          this.relationships.set(rel.id, rel);
          this.indexRelationship(rel);
        }
      } catch (error) {
        console.warn('Failed to load knowledge graph:', error);
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
      entities: [...this.entities.values()],
      relationships: [...this.relationships.values()],
    };

    fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
  }

  private indexEntity(entity: Entity): void {
    this.nameIndex.set(entity.name.toLowerCase(), entity.id);
    for (const alias of entity.aliases) {
      this.nameIndex.set(alias.toLowerCase(), entity.id);
    }
  }

  private indexRelationship(rel: Relationship): void {
    // Index by source
    if (!this.adjacencyList.has(rel.sourceId)) {
      this.adjacencyList.set(rel.sourceId, new Set());
    }
    this.adjacencyList.get(rel.sourceId)!.add(rel.id);

    // Index by target (for bi-directional traversal)
    if (!this.adjacencyList.has(rel.targetId)) {
      this.adjacencyList.set(rel.targetId, new Set());
    }
    this.adjacencyList.get(rel.targetId)!.add(rel.id);
  }

  /**
   * Extract entities and relationships from content
   */
  async extract(content: string, memoryId?: string): Promise<ExtractionResult> {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    const extractedNames = new Set<string>();

    // Extract entities by pattern
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const name = match[1] || match[0];
        if (name && name.length > 1 && !extractedNames.has(name.toLowerCase())) {
          extractedNames.add(name.toLowerCase());
          const entity = await this.findOrCreateEntity(
            name,
            type as EntityType,
            content
          );
          entities.push(entity);
        }
      }
    }

    // Infer relationships
    for (const relPattern of RELATIONSHIP_PATTERNS) {
      const matches = content.matchAll(relPattern.pattern);
      for (const match of matches) {
        const [sourceName, targetName] = relPattern.extractEntities(match);
        const sourceId = this.nameIndex.get(sourceName.toLowerCase());
        const targetId = this.nameIndex.get(targetName.toLowerCase());

        if (sourceId && targetId && sourceId !== targetId) {
          const rel = await this.findOrCreateRelationship(
            sourceId,
            targetId,
            relPattern.type,
            content,
            memoryId
          );
          relationships.push(rel);
        }
      }
    }

    await this.saveToDisk();

    return {
      entities,
      relationships,
      sourceContent: content,
      confidence: this.calculateExtractionConfidence(entities, relationships),
    };
  }

  private async findOrCreateEntity(
    name: string,
    type: EntityType,
    context: string
  ): Promise<Entity> {
    const existingId = this.nameIndex.get(name.toLowerCase());

    if (existingId) {
      const entity = this.entities.get(existingId)!;
      entity.accessCount++;
      entity.updatedAt = new Date();
      entity.importance = this.calculateImportance(entity);
      return entity;
    }

    const entity: Entity = {
      id: uuidv4(),
      name,
      type,
      aliases: [],
      description: this.extractDescription(name, context),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 1,
      importance: 0.5,
    };

    this.entities.set(entity.id, entity);
    this.indexEntity(entity);

    return entity;
  }

  private async findOrCreateRelationship(
    sourceId: string,
    targetId: string,
    type: RelationType,
    context: string,
    memoryId?: string
  ): Promise<Relationship> {
    // Check for existing relationship
    const relIds = this.adjacencyList.get(sourceId);
    if (relIds) {
      for (const relId of relIds) {
        const rel = this.relationships.get(relId);
        if (rel && rel.targetId === targetId && rel.type === type) {
          // Reinforce existing relationship
          rel.strength = Math.min(1.0, rel.strength + 0.1);
          if (memoryId && !rel.evidence.includes(memoryId)) {
            rel.evidence.push(memoryId);
          }
          rel.updatedAt = new Date();
          return rel;
        }
      }
    }

    // Create new relationship
    const relationship: Relationship = {
      id: uuidv4(),
      sourceId,
      targetId,
      type,
      strength: 0.5,
      context: context.substring(0, 200), // Truncate context
      evidence: memoryId ? [memoryId] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.relationships.set(relationship.id, relationship);
    this.indexRelationship(relationship);

    return relationship;
  }

  private extractDescription(name: string, context: string): string {
    // Try to find a sentence containing the name for description
    const sentences = context.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(name.toLowerCase())) {
        return sentence.trim().substring(0, 200);
      }
    }
    return '';
  }

  private calculateImportance(entity: Entity): number {
    // Combine access frequency with graph centrality
    const accessScore = Math.min(1.0, Math.log10(entity.accessCount + 1) / 2);
    const connectionCount = this.adjacencyList.get(entity.id)?.size || 0;
    const centralityScore = Math.min(1.0, Math.log10(connectionCount + 1) / 2);

    return (accessScore + centralityScore) / 2;
  }

  private calculateExtractionConfidence(
    entities: Entity[],
    relationships: Relationship[]
  ): number {
    if (entities.length === 0) return 0;

    const entityScore = Math.min(1.0, entities.length / 10);
    const relationshipScore = Math.min(1.0, relationships.length / 5);

    return (entityScore + relationshipScore) / 2;
  }

  /**
   * Query the knowledge graph for related entities
   */
  async query(
    entityNames: string[],
    options?: {
      maxDepth?: number;
      relationTypes?: RelationType[];
      minStrength?: number;
    }
  ): Promise<GraphQueryResult> {
    const startTime = performance.now();
    const maxDepth = options?.maxDepth || 2;
    const minStrength = options?.minStrength || 0.3;

    const resultEntities = new Set<string>();
    const resultRelationships = new Set<string>();
    const paths: EntityPath[] = [];

    // Find starting entities
    const startIds: string[] = [];
    for (const name of entityNames) {
      const id = this.nameIndex.get(name.toLowerCase());
      if (id) {
        startIds.push(id);
        resultEntities.add(id);
      }
    }

    // BFS traversal
    const queue: Array<{ id: string; depth: number; path: string[] }> =
      startIds.map(id => ({ id, depth: 0, path: [id] }));
    const visited = new Set<string>(startIds);

    while (queue.length > 0) {
      const { id, depth, path } = queue.shift()!;

      if (depth >= maxDepth) continue;

      const relIds = this.adjacencyList.get(id);
      if (!relIds) continue;

      for (const relId of relIds) {
        const rel = this.relationships.get(relId);
        if (!rel || rel.strength < minStrength) continue;

        if (options?.relationTypes && !options.relationTypes.includes(rel.type)) {
          continue;
        }

        resultRelationships.add(relId);

        // Get the other end of the relationship
        const otherId = rel.sourceId === id ? rel.targetId : rel.sourceId;
        resultEntities.add(otherId);

        if (!visited.has(otherId)) {
          visited.add(otherId);
          const newPath = [...path, otherId];
          queue.push({ id: otherId, depth: depth + 1, path: newPath });

          // Record path if it connects starting entities
          if (startIds.length > 1 && startIds.includes(otherId)) {
            paths.push(this.buildPath(newPath));
          }
        }
      }
    }

    const queryTimeMs = performance.now() - startTime;

    return {
      entities: [...resultEntities].map(id => this.entities.get(id)!).filter(e => e),
      relationships: [...resultRelationships].map(id => this.relationships.get(id)!).filter(r => r),
      paths,
      queryTimeMs,
    };
  }

  private buildPath(entityIds: string[]): EntityPath {
    const entities: Entity[] = [];
    const relationships: Relationship[] = [];
    let totalStrength = 0;

    for (let i = 0; i < entityIds.length; i++) {
      const entity = this.entities.get(entityIds[i]);
      if (entity) entities.push(entity);

      if (i < entityIds.length - 1) {
        const relIds = this.adjacencyList.get(entityIds[i]);
        if (relIds) {
          for (const relId of relIds) {
            const rel = this.relationships.get(relId);
            if (rel && (rel.targetId === entityIds[i + 1] || rel.sourceId === entityIds[i + 1])) {
              relationships.push(rel);
              totalStrength += rel.strength;
              break;
            }
          }
        }
      }
    }

    return { entities, relationships, totalStrength };
  }

  /**
   * Get entity by name or ID
   */
  async getEntity(nameOrId: string): Promise<Entity | null> {
    // Try as ID first
    if (this.entities.has(nameOrId)) {
      return this.entities.get(nameOrId)!;
    }

    // Try as name
    const id = this.nameIndex.get(nameOrId.toLowerCase());
    if (id) {
      return this.entities.get(id)!;
    }

    return null;
  }

  /**
   * Get all relationships for an entity
   */
  async getRelationships(entityId: string): Promise<Relationship[]> {
    const relIds = this.adjacencyList.get(entityId);
    if (!relIds) return [];

    return [...relIds]
      .map(id => this.relationships.get(id))
      .filter((r): r is Relationship => r !== undefined);
  }

  /**
   * Add alias to entity
   */
  async addAlias(entityId: string, alias: string): Promise<void> {
    const entity = this.entities.get(entityId);
    if (entity && !entity.aliases.includes(alias)) {
      entity.aliases.push(alias);
      this.nameIndex.set(alias.toLowerCase(), entityId);
      await this.saveToDisk();
    }
  }

  /**
   * Merge two entities (deduplicate)
   */
  async mergeEntities(keepId: string, removeId: string): Promise<Entity | null> {
    const keep = this.entities.get(keepId);
    const remove = this.entities.get(removeId);
    if (!keep || !remove) return null;

    // Merge aliases
    keep.aliases = [...new Set([...keep.aliases, remove.name, ...remove.aliases])];
    keep.accessCount += remove.accessCount;
    keep.importance = Math.max(keep.importance, remove.importance);
    keep.updatedAt = new Date();

    // Update relationships to point to kept entity
    const relIds = this.adjacencyList.get(removeId);
    if (relIds) {
      for (const relId of relIds) {
        const rel = this.relationships.get(relId);
        if (rel) {
          if (rel.sourceId === removeId) rel.sourceId = keepId;
          if (rel.targetId === removeId) rel.targetId = keepId;
        }
      }
    }

    // Remove old entity
    this.entities.delete(removeId);
    this.adjacencyList.delete(removeId);

    // Re-index kept entity
    this.indexEntity(keep);

    await this.saveToDisk();
    return keep;
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<{
    entityCount: number;
    relationshipCount: number;
    avgConnections: number;
    entityTypeDistribution: Record<EntityType, number>;
    relationTypeDistribution: Record<RelationType, number>;
    mostConnected: Entity[];
  }> {
    const entityTypeDistribution: Record<string, number> = {};
    const relationTypeDistribution: Record<string, number> = {};

    for (const entity of this.entities.values()) {
      entityTypeDistribution[entity.type] = (entityTypeDistribution[entity.type] || 0) + 1;
    }

    for (const rel of this.relationships.values()) {
      relationTypeDistribution[rel.type] = (relationTypeDistribution[rel.type] || 0) + 1;
    }

    const connectionCounts: Array<{ entity: Entity; count: number }> = [];
    for (const entity of this.entities.values()) {
      const count = this.adjacencyList.get(entity.id)?.size || 0;
      connectionCounts.push({ entity, count });
    }
    connectionCounts.sort((a, b) => b.count - a.count);

    const totalConnections = connectionCounts.reduce((sum, c) => sum + c.count, 0);
    const avgConnections = this.entities.size > 0
      ? totalConnections / this.entities.size
      : 0;

    return {
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
      avgConnections,
      entityTypeDistribution: entityTypeDistribution as Record<EntityType, number>,
      relationTypeDistribution: relationTypeDistribution as Record<RelationType, number>,
      mostConnected: connectionCounts.slice(0, 10).map(c => c.entity),
    };
  }

  async close(): Promise<void> {
    await this.saveToDisk();
    this.entities.clear();
    this.relationships.clear();
    this.nameIndex.clear();
    this.adjacencyList.clear();
    this.initialized = false;
  }
}

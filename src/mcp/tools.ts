/**
 * Titan Memory MCP Tools
 * Tool definitions and handlers for the MCP server
 */

import { z } from 'zod';
import { TitanMemory, initTitan } from '../titan.js';
import { MemoryLayer, CompactionContext, RecallMode } from '../types.js';
import { UtilitySignal } from '../utils/utility.js';

// Tool input schemas using Zod for validation
export const ToolSchemas = {
  titan_add: z.object({
    content: z.string().describe('Memory content to store'),
    layer: z.number().min(2).max(5).optional().describe('Force specific layer (2=factual, 3=longterm, 4=semantic, 5=episodic)'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    projectId: z.string().optional().describe('Project identifier'),
  }),

  titan_recall: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().default(10).optional().describe('Maximum results to return'),
    layers: z.array(z.number()).optional().describe('Specific layers to query (2-5)'),
    projectId: z.string().optional().describe('Filter by project'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    mode: z.enum(['full', 'summary', 'metadata']).default('full').optional()
      .describe('FR-2: Response mode - full (default), summary (100 chars + metadata), or metadata only'),
  }),

  titan_get: z.object({
    id: z.string().describe('Memory ID to retrieve'),
  }),

  titan_delete: z.object({
    id: z.string().describe('Memory ID to delete'),
  }),

  titan_stats: z.object({}),

  titan_flush: z.object({
    sessionId: z.string().optional().describe('Current session ID'),
    insights: z.array(z.string()).optional().describe('Important insights to preserve'),
    decisions: z.array(z.string()).optional().describe('Key decisions made'),
    errors: z.array(z.string()).optional().describe('Errors encountered'),
    solutions: z.array(z.string()).optional().describe('Solutions found'),
  }),

  titan_curate: z.object({
    content: z.string().describe('Content to add to curated MEMORY.md'),
    section: z.string().optional().describe('Section in MEMORY.md (e.g., "Patterns", "Preferences")'),
  }),

  titan_today: z.object({}),

  titan_prune: z.object({
    decayThreshold: z.number().default(0.05).optional().describe('Decay score threshold (0-1)'),
    dryRun: z.boolean().default(false).optional().describe('Preview without deleting'),
    utilityThreshold: z.number().default(0.4).optional()
      .describe('FR-1: Utility score threshold (0-1). Memories with utility below this are candidates for pruning'),
  }),

  // FR-1: Utility Tracking - Feedback tool
  titan_feedback: z.object({
    id: z.string().describe('Memory ID to provide feedback for'),
    signal: z.enum(['helpful', 'harmful']).describe('Feedback signal - helpful if memory aided task, harmful if caused confusion'),
    context: z.string().optional().describe('Optional context about why the memory was helpful/harmful'),
    sessionId: z.string().optional().describe('Session ID for idempotency within session'),
  }),

  // MIRAS Enhancement: Proactive Suggestions
  titan_suggest: z.object({
    context: z.string().describe('Current context or task description to get suggestions for'),
    limit: z.number().default(5).optional().describe('Maximum suggestions to return (default: 5)'),
    minRelevance: z.number().default(0.5).optional().describe('Minimum relevance threshold (0-1)'),
    includeHighlighting: z.boolean().default(true).optional().describe('Include highlighted relevant portions'),
  }),

  // MIRAS Enhancement: Find Cross-Project Patterns
  titan_patterns: z.object({
    query: z.string().describe('Query to find relevant patterns'),
    limit: z.number().default(5).optional().describe('Maximum patterns to return'),
    minRelevance: z.number().default(0.6).optional().describe('Minimum relevance threshold'),
    domain: z.string().optional().describe('Filter by domain (e.g., "backend", "frontend", "general")'),
  }),

  // MIRAS Enhancement: Get MIRAS Stats
  titan_miras_stats: z.object({}),

  // CatBrain: Classify content
  titan_classify: z.object({
    content: z.string().describe('Content to classify into a memory category'),
  }),

  // CatBrain: Get category summary
  titan_category_summary: z.object({
    category: z.enum(['knowledge', 'profile', 'event', 'behavior', 'skill'])
      .describe('Memory category to get summary for'),
  }),

  // CatBrain: Check category sufficiency
  titan_sufficiency: z.object({
    query: z.string().describe('Query to check category coverage for'),
    memoryIds: z.array(z.string()).optional().describe('Specific memory IDs to check (uses recent recall if not provided)'),
  }),
};

// JSON Schema versions for MCP tool registration
export const ToolDefinitions = [
  {
    name: 'titan_add',
    description: 'Store a memory with automatic layer routing based on content type. Uses surprise detection to filter noise.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Memory content to store' },
        layer: { type: 'number', description: 'Force specific layer (2=factual, 3=longterm, 4=semantic, 5=episodic)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
        projectId: { type: 'string', description: 'Project identifier' },
      },
      required: ['content'],
    },
  },
  {
    name: 'titan_recall',
    description: 'Query memories across all layers with intelligent fusion. Returns fused results ranked by relevance and utility score.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results (default: 10)' },
        layers: { type: 'array', items: { type: 'number' }, description: 'Specific layers to query (2-5)' },
        projectId: { type: 'string', description: 'Filter by project' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
        mode: {
          type: 'string',
          enum: ['full', 'summary', 'metadata'],
          description: 'FR-2: Response mode - full (default), summary (100 chars + metadata), or metadata only for context efficiency',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'titan_get',
    description: 'Retrieve a specific memory by its unique ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Memory ID to retrieve' },
      },
      required: ['id'],
    },
  },
  {
    name: 'titan_delete',
    description: 'Delete a memory by its unique ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Memory ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'titan_stats',
    description: 'Get memory statistics including counts per layer, storage usage, and performance metrics.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'titan_flush',
    description: 'Pre-compaction memory flush. Saves important context before context window compaction to prevent loss.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sessionId: { type: 'string', description: 'Current session ID' },
        insights: { type: 'array', items: { type: 'string' }, description: 'Important insights to preserve' },
        decisions: { type: 'array', items: { type: 'string' }, description: 'Key decisions made' },
        errors: { type: 'array', items: { type: 'string' }, description: 'Errors encountered' },
        solutions: { type: 'array', items: { type: 'string' }, description: 'Solutions found' },
      },
      required: [],
    },
  },
  {
    name: 'titan_curate',
    description: 'Add content to human-curated MEMORY.md file for permanent high-value knowledge storage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Content to add to curated MEMORY.md' },
        section: { type: 'string', description: 'Section in MEMORY.md (e.g., "Patterns", "Preferences")' },
      },
      required: ['content'],
    },
  },
  {
    name: 'titan_today',
    description: "Get today's episodic memory entries - useful for session continuity.",
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'titan_prune',
    description: 'Prune old/decayed memories to maintain performance. Uses adaptive forgetting with configurable threshold and utility-based pruning.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        decayThreshold: { type: 'number', description: 'Decay score threshold 0-1 (default: 0.05)' },
        dryRun: { type: 'boolean', description: 'Preview without deleting' },
        utilityThreshold: { type: 'number', description: 'FR-1: Utility score threshold 0-1 (default: 0.4). Memories below this are pruning candidates.' },
      },
      required: [],
    },
  },
  {
    name: 'titan_feedback',
    description: 'FR-1: Provide feedback on memory utility. Helpful feedback boosts recall ranking, harmful feedback makes memory a pruning candidate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Memory ID to provide feedback for' },
        signal: { type: 'string', enum: ['helpful', 'harmful'], description: 'Feedback signal' },
        context: { type: 'string', description: 'Optional context about why helpful/harmful' },
        sessionId: { type: 'string', description: 'Session ID for idempotency' },
      },
      required: ['id', 'signal'],
    },
  },
  {
    name: 'titan_suggest',
    description: 'MIRAS: Get proactive memory suggestions based on current context. Returns relevant memories ranked by utility, recency, and semantic relevance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        context: { type: 'string', description: 'Current context or task description to get suggestions for' },
        limit: { type: 'number', description: 'Maximum suggestions to return (default: 5)' },
        minRelevance: { type: 'number', description: 'Minimum relevance threshold 0-1 (default: 0.5)' },
        includeHighlighting: { type: 'boolean', description: 'Include highlighted relevant portions (default: true)' },
      },
      required: ['context'],
    },
  },
  {
    name: 'titan_patterns',
    description: 'MIRAS: Find transferable patterns from cross-project learning. Returns patterns that may be applicable to the current context.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Query to find relevant patterns' },
        limit: { type: 'number', description: 'Maximum patterns to return (default: 5)' },
        minRelevance: { type: 'number', description: 'Minimum relevance threshold 0-1 (default: 0.6)' },
        domain: { type: 'string', description: 'Filter by domain (e.g., "backend", "frontend", "general")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'titan_miras_stats',
    description: 'MIRAS: Get statistics about MIRAS enhancement features including embedding, highlighting, surprise, decay, and cross-project learning.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'titan_classify',
    description: 'CatBrain: Classify content into a memory category (knowledge/profile/event/behavior/skill). Returns category, confidence, and method.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'Content to classify' },
      },
      required: ['content'],
    },
  },
  {
    name: 'titan_category_summary',
    description: 'CatBrain: Get rolling summary for a specific memory category.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['knowledge', 'profile', 'event', 'behavior', 'skill'],
          description: 'Memory category',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'titan_sufficiency',
    description: 'CatBrain: Check category coverage of recall results. Reports missing categories and coverage ratio.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Query to check coverage for' },
        memoryIds: { type: 'array', items: { type: 'string' }, description: 'Specific memory IDs to check' },
      },
      required: ['query'],
    },
  },
];

/**
 * Tool handler class - maps MCP tool calls to TitanMemory methods
 */
export class ToolHandler {
  private titan: TitanMemory | null = null;

  async ensureInitialized(): Promise<TitanMemory> {
    if (!this.titan) {
      this.titan = await initTitan();
    }
    return this.titan;
  }

  async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const titan = await this.ensureInitialized();
      let result: unknown;

      switch (name) {
        case 'titan_add': {
          const parsed = ToolSchemas.titan_add.parse(args);
          if (parsed.layer) {
            result = await titan.addToLayer(
              parsed.layer as MemoryLayer,
              parsed.content,
              { tags: parsed.tags, projectId: parsed.projectId }
            );
          } else {
            result = await titan.add(parsed.content, {
              tags: parsed.tags,
              projectId: parsed.projectId,
            });
          }
          break;
        }

        case 'titan_recall': {
          const parsed = ToolSchemas.titan_recall.parse(args);
          result = await titan.recall(parsed.query, {
            limit: parsed.limit,
            layers: parsed.layers as MemoryLayer[] | undefined,
            projectId: parsed.projectId,
            tags: parsed.tags,
            mode: parsed.mode as RecallMode | undefined,
          });
          break;
        }

        case 'titan_get': {
          const parsed = ToolSchemas.titan_get.parse(args);
          result = await titan.get(parsed.id);
          if (!result) {
            return {
              content: [{ type: 'text', text: `Memory not found: ${parsed.id}` }],
            };
          }
          break;
        }

        case 'titan_delete': {
          const parsed = ToolSchemas.titan_delete.parse(args);
          const deleted = await titan.delete(parsed.id);
          result = { deleted, id: parsed.id };
          break;
        }

        case 'titan_stats': {
          result = await titan.getStats();
          break;
        }

        case 'titan_flush': {
          const parsed = ToolSchemas.titan_flush.parse(args);
          const context: CompactionContext = {
            sessionId: parsed.sessionId || `session-${Date.now()}`,
            timestamp: new Date(),
            tokenCount: 0,
            importantInsights: parsed.insights || [],
            decisions: parsed.decisions || [],
            errors: parsed.errors || [],
            solutions: parsed.solutions || [],
          };
          result = await titan.flushPreCompaction(context);
          break;
        }

        case 'titan_curate': {
          const parsed = ToolSchemas.titan_curate.parse(args);
          await titan.curate(parsed.content, parsed.section);
          result = { success: true, content: parsed.content, section: parsed.section };
          break;
        }

        case 'titan_today': {
          result = await titan.getToday();
          break;
        }

        case 'titan_prune': {
          const parsed = ToolSchemas.titan_prune.parse(args);
          if (parsed.dryRun) {
            const stats = await titan.getStats();
            result = {
              dryRun: true,
              estimatedPrunable: Math.floor(stats.totalMemories * 0.1),
              decayThreshold: parsed.decayThreshold,
              utilityThreshold: parsed.utilityThreshold,
            };
          } else {
            result = await titan.prune({
              decayThreshold: parsed.decayThreshold,
              utilityThreshold: parsed.utilityThreshold,
            });
          }
          break;
        }

        case 'titan_feedback': {
          const parsed = ToolSchemas.titan_feedback.parse(args);
          result = await titan.recordFeedback(
            parsed.id,
            parsed.signal as UtilitySignal,
            parsed.sessionId,
            parsed.context
          );
          break;
        }

        case 'titan_suggest': {
          const parsed = ToolSchemas.titan_suggest.parse(args);
          const suggestions = await titan.suggest(parsed.context, {
            limit: parsed.limit,
            minRelevance: parsed.minRelevance,
            includeHighlighting: parsed.includeHighlighting,
          });
          result = {
            suggestions,
            count: suggestions.length,
            context: parsed.context.substring(0, 100) + (parsed.context.length > 100 ? '...' : ''),
          };
          break;
        }

        case 'titan_patterns': {
          const parsed = ToolSchemas.titan_patterns.parse(args);
          const patterns = await titan.findRelevantPatterns(parsed.query, {
            limit: parsed.limit,
            minRelevance: parsed.minRelevance,
            domain: parsed.domain,
          });
          result = {
            patterns: patterns.map(p => ({
              patternId: p.pattern.patternId,
              sourceProject: p.pattern.sourceProject,
              domain: p.pattern.domain,
              relevance: p.relevance,
              matchedTerms: p.matchedTerms,
              content: p.pattern.distilledContent || p.pattern.content.substring(0, 200),
              applicability: p.pattern.applicability,
            })),
            count: patterns.length,
          };
          break;
        }

        case 'titan_miras_stats': {
          result = await titan.getMirasStats();
          break;
        }

        case 'titan_classify': {
          const parsed = ToolSchemas.titan_classify.parse(args);
          result = titan.classifyContent(parsed.content);
          break;
        }

        case 'titan_category_summary': {
          const parsed = ToolSchemas.titan_category_summary.parse(args);
          const summary = titan.getCategorySummary(parsed.category as import('../catbrain/types.js').MemoryCategory);
          if (!summary) {
            result = { error: 'CatBrain not enabled or no summary available for this category' };
          } else {
            result = summary;
          }
          break;
        }

        case 'titan_sufficiency': {
          const parsed = ToolSchemas.titan_sufficiency.parse(args);
          // Get memories to check
          let memories: import('../types.js').MemoryEntry[] = [];
          if (parsed.memoryIds && parsed.memoryIds.length > 0) {
            for (const id of parsed.memoryIds) {
              const mem = await titan.get(id);
              if (mem) memories.push(mem);
            }
          } else {
            const recallResult = await titan.recall(parsed.query, { limit: 20 });
            if ('fusedMemories' in recallResult) {
              memories = recallResult.fusedMemories;
            }
          }
          result = titan.checkCategorySufficiency(memories, parsed.query);
          break;
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      };
    }
  }

  async close(): Promise<void> {
    if (this.titan) {
      await this.titan.close();
      this.titan = null;
    }
  }
}

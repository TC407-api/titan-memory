/**
 * Built-in Entity Extractor Skill
 * Extracts entities from memory content using pattern matching
 */

import { TitanSkill, SkillContext, SkillResult } from '../types.js';

interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
}

/**
 * Entity extraction patterns
 */
const PATTERNS: Record<string, RegExp[]> = {
  // Technical entities
  url: [/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi],
  email: [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi],
  filepath: [/(?:\/|[A-Z]:\\)[^\s<>"{}|\\^`[\]:*?]+\.[a-zA-Z0-9]+/gi],
  version: [/v?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?/gi],
  ip_address: [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g],

  // Code entities
  function_name: [/(?:function|def|fn|func)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi],
  class_name: [/(?:class|interface|struct|enum)\s+([A-Z][a-zA-Z0-9_]*)/gi],
  variable: [/(?:const|let|var|val)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi],

  // Project entities
  package_name: [/"([a-z0-9@/-]+)":\s*"[\^~]?\d/gi, /npm\s+install\s+([a-z0-9@/-]+)/gi],
  command: [/`([a-z][a-z0-9-]*(?:\s+[^\s`]+)*)`/gi],

  // Date/time
  date: [
    /\d{4}-\d{2}-\d{2}/g,
    /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
  ],

  // Numbers with context
  metric: [/\d+(?:\.\d+)?(?:\s*)?(?:ms|MB|GB|KB|%|requests?|calls?|times?)/gi],
};

/**
 * Extract entities from text
 */
function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);

      for (const match of matches) {
        // Get the captured group or full match
        const value = match[1] || match[0];
        const key = `${type}:${value.toLowerCase()}`;

        if (!seen.has(key)) {
          seen.add(key);
          entities.push({
            type,
            value: value.trim(),
            confidence: 0.8, // Pattern-based extraction has decent confidence
          });
        }
      }
    }
  }

  return entities;
}

/**
 * Group entities by type
 */
function groupByType(entities: ExtractedEntity[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const entity of entities) {
    if (!grouped[entity.type]) {
      grouped[entity.type] = [];
    }
    grouped[entity.type].push(entity.value);
  }

  return grouped;
}

export const extractorSkill: TitanSkill = {
  metadata: {
    name: 'extractor',
    version: '1.0.0',
    description: 'Extracts entities (URLs, paths, versions, etc.) from content',
    triggers: ['extract', 'entities', 'ner', 'find-entities'],
    author: 'Titan Memory',
    tags: ['built-in', 'extraction'],
    config: {
      includeConfidence: false,
      groupByType: true,
    },
  },

  async execute(context: SkillContext): Promise<SkillResult> {
    const includeConfidence = context.config?.includeConfidence as boolean;
    const shouldGroup = context.config?.groupByType !== false;

    // Get content to process
    let content = '';

    if (context.memory) {
      content = context.memory.content;
    } else if (context.memories && context.memories.length > 0) {
      content = context.memories.map((m) => m.content).join('\n\n');
    } else if (context.query) {
      content = context.query;
    }

    if (!content) {
      return {
        success: false,
        error: 'No content provided for entity extraction',
        metadata: { executionTimeMs: 0 },
      };
    }

    // Extract entities
    const entities = extractEntities(content);

    if (entities.length === 0) {
      return {
        success: true,
        output: { entities: [], grouped: {} },
        metadata: {
          executionTimeMs: 0,
          tokensProcessed: content.length,
        },
      };
    }

    // Format output
    const output: Record<string, unknown> = {
      entities: includeConfidence
        ? entities
        : entities.map((e) => ({ type: e.type, value: e.value })),
      totalCount: entities.length,
    };

    if (shouldGroup) {
      output.grouped = groupByType(entities);
    }

    return {
      success: true,
      output,
      metadata: {
        executionTimeMs: 0,
        tokensProcessed: content.length,
        memoriesAffected: entities.length,
      },
    };
  },

  mcpToolDefinition: {
    name: 'titan_extract',
    description: 'Extract entities (URLs, paths, versions, etc.) from content',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Content to extract entities from',
        },
        includeConfidence: {
          type: 'boolean',
          description: 'Include confidence scores',
          default: false,
        },
        groupByType: {
          type: 'boolean',
          description: 'Group entities by type',
          default: true,
        },
      },
      required: ['content'],
    },
  },
};

export default extractorSkill;

/**
 * Built-in Transformer Skill
 * Transforms memory content between different formats
 */

import { TitanSkill, SkillContext, SkillResult } from '../types.js';
import { MemoryEntry } from '../../types.js';

type OutputFormat = 'json' | 'markdown' | 'plain' | 'csv' | 'yaml';

/**
 * Convert memory entries to JSON format
 */
function toJson(memories: MemoryEntry[], pretty: boolean): string {
  const data = memories.map((m) => ({
    id: m.id,
    content: m.content,
    layer: m.layer,
    timestamp: m.timestamp,
    metadata: m.metadata,
  }));

  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Convert memory entries to Markdown format
 */
function toMarkdown(memories: MemoryEntry[]): string {
  const lines: string[] = ['# Memories\n'];

  for (const memory of memories) {
    lines.push(`## Memory: ${memory.id.slice(0, 8)}`);
    lines.push(`**Layer:** ${memory.layer}`);
    lines.push(`**Timestamp:** ${new Date(memory.timestamp).toISOString()}`);

    if (memory.metadata?.tags) {
      lines.push(`**Tags:** ${(memory.metadata.tags as string[]).join(', ')}`);
    }

    lines.push('');
    lines.push(memory.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert memory entries to plain text format
 */
function toPlainText(memories: MemoryEntry[]): string {
  return memories
    .map((m, i) => `[${i + 1}] ${m.content}`)
    .join('\n\n');
}

/**
 * Convert memory entries to CSV format
 */
function toCsv(memories: MemoryEntry[]): string {
  const headers = ['id', 'layer', 'timestamp', 'content', 'tags'];
  const rows = [headers.join(',')];

  for (const memory of memories) {
    const row = [
      memory.id,
      String(memory.layer),
      new Date(memory.timestamp).toISOString(),
      `"${memory.content.replace(/"/g, '""')}"`,
      `"${(memory.metadata?.tags as string[] || []).join(';')}"`,
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Convert memory entries to YAML-like format
 */
function toYaml(memories: MemoryEntry[]): string {
  const lines: string[] = [];

  for (const memory of memories) {
    lines.push(`- id: ${memory.id}`);
    lines.push(`  layer: ${memory.layer}`);
    lines.push(`  timestamp: ${new Date(memory.timestamp).toISOString()}`);
    lines.push(`  content: |`);

    // Indent content
    const contentLines = memory.content.split('\n');
    for (const line of contentLines) {
      lines.push(`    ${line}`);
    }

    if (memory.metadata?.tags) {
      lines.push(`  tags:`);
      for (const tag of memory.metadata.tags as string[]) {
        lines.push(`    - ${tag}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Transform content to specified format
 */
function transform(
  memories: MemoryEntry[],
  format: OutputFormat,
  options: Record<string, unknown>
): string {
  switch (format) {
    case 'json':
      return toJson(memories, options.pretty !== false);
    case 'markdown':
      return toMarkdown(memories);
    case 'plain':
      return toPlainText(memories);
    case 'csv':
      return toCsv(memories);
    case 'yaml':
      return toYaml(memories);
    default:
      return toPlainText(memories);
  }
}

/**
 * Create a minimal memory entry from content string
 */
function contentToMemory(content: string): MemoryEntry {
  return {
    id: 'temp',
    content,
    layer: 1,
    timestamp: new Date(),
    metadata: {},
  };
}

export const transformerSkill: TitanSkill = {
  metadata: {
    name: 'transformer',
    version: '1.0.0',
    description: 'Transforms memory content between formats (JSON, Markdown, CSV, etc.)',
    triggers: ['transform', 'convert', 'format', 'export'],
    author: 'Titan Memory',
    tags: ['built-in', 'formatting'],
    config: {
      format: 'markdown',
      pretty: true,
    },
  },

  async execute(context: SkillContext): Promise<SkillResult> {
    const format = (context.config?.format as OutputFormat) || 'markdown';
    const options = context.config || {};

    // Get memories to transform
    let memories: MemoryEntry[] = [];

    if (context.memories && context.memories.length > 0) {
      memories = context.memories;
    } else if (context.memory) {
      memories = [context.memory];
    } else if (context.query) {
      // Treat query as raw content
      memories = [contentToMemory(context.query)];
    }

    if (memories.length === 0) {
      return {
        success: false,
        error: 'No content provided for transformation',
        metadata: { executionTimeMs: 0 },
      };
    }

    // Transform to requested format
    const output = transform(memories, format, options);

    return {
      success: true,
      output,
      metadata: {
        executionTimeMs: 0,
        memoriesAffected: memories.length,
      },
    };
  },

  mcpToolDefinition: {
    name: 'titan_transform',
    description: 'Transform memory content between formats',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description: 'Output format',
          enum: ['json', 'markdown', 'plain', 'csv', 'yaml'],
          default: 'markdown',
        },
        pretty: {
          type: 'boolean',
          description: 'Pretty-print output (for JSON)',
          default: true,
        },
      },
    },
  },
};

export default transformerSkill;

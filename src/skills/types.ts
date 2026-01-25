/**
 * Titan Memory Skill System Types
 * Type definitions for hot-reloadable skills
 */

import { MemoryEntry } from '../types.js';

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  name: string;
  version: string;
  description: string;
  triggers: string[];
  author?: string;
  tags?: string[];
  dependencies?: string[];
  config?: Record<string, unknown>;
}

/**
 * Context passed to skill execution
 */
export interface SkillContext {
  /** Single memory being processed */
  memory?: MemoryEntry;
  /** Multiple memories for batch operations */
  memories?: MemoryEntry[];
  /** Query string if triggered by search */
  query?: string;
  /** Additional options passed to the skill */
  options?: Record<string, unknown>;
  /** Access to Titan Memory instance */
  titan: TitanMemoryInterface;
  /** Skill configuration */
  config?: Record<string, unknown>;
}

/**
 * Result returned from skill execution
 */
export interface SkillResult {
  success: boolean;
  /** Text or structured output */
  output?: string | Record<string, unknown>;
  /** New or modified memories to store */
  memories?: Partial<MemoryEntry>[];
  /** Error message if failed */
  error?: string;
  /** Metadata about execution */
  metadata?: {
    executionTimeMs?: number;
    tokensProcessed?: number;
    memoriesAffected?: number;
  };
}

/**
 * Skill interface that all skills must implement
 */
export interface TitanSkill {
  /** Metadata from frontmatter */
  metadata: SkillMetadata;

  /**
   * Called when skill is loaded
   */
  onLoad?(): Promise<void>;

  /**
   * Called when skill is unloaded (before hot-reload or shutdown)
   */
  onUnload?(): Promise<void>;

  /**
   * Main execution function
   */
  execute(context: SkillContext): Promise<SkillResult>;

  /**
   * Validate skill configuration
   */
  validateConfig?(config: Record<string, unknown>): boolean;

  /**
   * Optional: Define as MCP tool
   */
  mcpToolDefinition?: MCPToolDefinition;
}

/**
 * MCP Tool definition for skills that expose as MCP tools
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

/**
 * Skill file representation
 */
export interface SkillFile {
  path: string;
  metadata: SkillMetadata;
  skill: TitanSkill;
  loadedAt: Date;
  lastModified: Date;
  enabled: boolean;
}

/**
 * Skill registry entry
 */
export interface SkillRegistryEntry {
  name: string;
  file: SkillFile;
  triggers: Map<string, boolean>;
}

/**
 * Skill loader options
 */
export interface SkillLoaderOptions {
  /** Directory to load skills from */
  skillsDir: string;
  /** Watch for file changes */
  watch?: boolean;
  /** Delay before reload after file change (ms) */
  reloadDelay?: number;
  /** File patterns to watch */
  patterns?: string[];
  /** Directories to ignore */
  ignored?: string[];
}

/**
 * Skill execution options
 */
export interface SkillExecutionOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to catch and return errors */
  catchErrors?: boolean;
  /** Custom configuration override */
  config?: Record<string, unknown>;
}

/**
 * Events emitted by the skill system
 */
export type SkillEvent =
  | { type: 'skill:loaded'; name: string; path: string }
  | { type: 'skill:unloaded'; name: string }
  | { type: 'skill:reloaded'; name: string; path: string }
  | { type: 'skill:error'; name: string; error: string }
  | { type: 'skill:executed'; name: string; success: boolean; durationMs: number };

/**
 * Skill event listener
 */
export type SkillEventListener = (event: SkillEvent) => void;

/**
 * Minimal interface for TitanMemory access from skills
 * (prevents circular dependency)
 */
export interface TitanMemoryInterface {
  add(content: string, metadata?: Partial<MemoryEntry['metadata']>): Promise<MemoryEntry>;
  recall(query: string, options?: { limit?: number }): Promise<{ fusedMemories: MemoryEntry[] }>;
  get(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  getStats(): Promise<{ totalMemories: number }>;
}

/**
 * Built-in skill types
 */
export type BuiltInSkillType = 'summarizer' | 'extractor' | 'transformer';

/**
 * Skill system statistics
 */
export interface SkillSystemStats {
  totalSkills: number;
  enabledSkills: number;
  disabledSkills: number;
  builtInSkills: number;
  customSkills: number;
  totalExecutions: number;
  averageExecutionTimeMs: number;
  lastReloadAt?: Date;
}

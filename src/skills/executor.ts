/**
 * Titan Memory Skill Executor
 * Executes skills with timeout protection, error catching, and metrics tracking
 */

import {
  TitanSkill,
  SkillContext,
  SkillResult,
  SkillExecutionOptions,
} from './types.js';
import { getSkillRegistry } from './registry.js';

// Default timeout (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Execute a skill with timeout protection
 */
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  skillName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Skill '${skillName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Skill Executor
 * Provides safe execution of skills with timeout, error handling, and metrics
 */
export class SkillExecutor {
  private registry = getSkillRegistry();

  /**
   * Execute a skill directly
   */
  async execute(
    skill: TitanSkill,
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult> {
    const {
      timeout = DEFAULT_TIMEOUT_MS,
      catchErrors = true,
      config,
    } = options;

    const startTime = Date.now();
    const skillName = skill.metadata.name;

    // Merge config
    const execContext: SkillContext = {
      ...context,
      config: { ...skill.metadata.config, ...context.config, ...config },
    };

    try {
      // Execute with timeout
      const result = await executeWithTimeout(
        skill.execute(execContext),
        timeout,
        skillName
      );

      const durationMs = Date.now() - startTime;

      // Record execution stats
      this.registry.recordExecution(skillName, durationMs, result.success);

      // Add execution time to metadata
      return {
        ...result,
        metadata: {
          ...result.metadata,
          executionTimeMs: durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.registry.recordExecution(skillName, durationMs, false);

      if (catchErrors) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          metadata: {
            executionTimeMs: durationMs,
          },
        };
      }

      throw error;
    }
  }

  /**
   * Execute a skill by name
   */
  async executeByName(
    name: string,
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult> {
    const skill = this.registry.get(name);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${name}`,
        metadata: { executionTimeMs: 0 },
      };
    }

    if (!this.registry.isEnabled(name)) {
      return {
        success: false,
        error: `Skill is disabled: ${name}`,
        metadata: { executionTimeMs: 0 },
      };
    }

    return this.execute(skill, context, options);
  }

  /**
   * Execute the first skill matching a trigger
   */
  async executeByTrigger(
    trigger: string,
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult> {
    const skills = this.registry.findByTrigger(trigger);

    if (skills.length === 0) {
      return {
        success: false,
        error: `No skill found for trigger: ${trigger}`,
        metadata: { executionTimeMs: 0 },
      };
    }

    // Execute first matching skill
    return this.execute(skills[0], context, options);
  }

  /**
   * Execute skills matching text (auto-detect trigger)
   */
  async executeByText(
    text: string,
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult | null> {
    const skill = this.registry.findByText(text);

    if (!skill) {
      return null;
    }

    return this.execute(skill, { ...context, query: text }, options);
  }

  /**
   * Execute multiple skills in sequence
   */
  async executeSequence(
    skillNames: string[],
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult[]> {
    const results: SkillResult[] = [];
    let currentContext = { ...context };

    for (const name of skillNames) {
      const result = await this.executeByName(name, currentContext, options);
      results.push(result);

      // Chain outputs: if previous skill produced memories, pass them along
      if (result.success && result.memories) {
        currentContext = {
          ...currentContext,
          memories: result.memories as SkillContext['memories'],
        };
      }

      // Stop on failure if not catching errors
      if (!result.success && !options.catchErrors) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute multiple skills in parallel
   */
  async executeParallel(
    skillNames: string[],
    context: SkillContext,
    options: SkillExecutionOptions = {}
  ): Promise<SkillResult[]> {
    const promises = skillNames.map((name) =>
      this.executeByName(name, context, options)
    );

    return Promise.all(promises);
  }
}

// Singleton instance
let executorInstance: SkillExecutor | null = null;

export function getSkillExecutor(): SkillExecutor {
  if (!executorInstance) {
    executorInstance = new SkillExecutor();
  }
  return executorInstance;
}

export function resetSkillExecutor(): void {
  executorInstance = null;
}

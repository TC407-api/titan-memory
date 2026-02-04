/**
 * Cortex Bedrock Rules
 * Loads and enforces TITAN_RULES.json - the "Rights vs Wrongs" layer
 */

import * as fs from 'fs';
import { BedrockRule, GuardrailAction, MemoryCategory } from './types.js';

/**
 * Default bedrock rules (built-in safety)
 */
const DEFAULT_RULES: BedrockRule[] = [
  {
    id: 'protect-events',
    description: 'Events are immutable historical records',
    condition: 'delete_event',
    action: 'deny',
    category: 'event',
    toolName: 'titan_delete',
    intentPatterns: ['delete.*event', 'remove.*event', 'erase.*history'],
  },
  {
    id: 'protect-profile-overwrite',
    description: 'Profile overwrites require explicit confirmation',
    condition: 'overwrite_profile',
    action: 'warn',
    category: 'profile',
    toolName: 'titan_add',
    intentPatterns: ['replace.*preference', 'overwrite.*profile', 'change.*setting'],
  },
  {
    id: 'prevent-bulk-delete',
    description: 'Bulk deletion operations are dangerous',
    condition: 'bulk_delete',
    action: 'deny',
    toolName: 'titan_prune',
    intentPatterns: ['delete.*all', 'wipe.*memory', 'clear.*everything', 'remove.*all'],
  },
  {
    id: 'prevent-skip-safety',
    description: 'Cannot bypass safety via dangerous flags',
    condition: 'bypass_safety',
    action: 'deny',
    intentPatterns: ['skip.*permission', 'bypass.*safety', 'force.*delete', 'dangerously'],
  },
  {
    id: 'protect-bedrock',
    description: 'Bedrock rules cannot be modified at runtime',
    condition: 'modify_bedrock',
    action: 'deny',
    intentPatterns: ['change.*rules', 'modify.*bedrock', 'disable.*guardrail', 'turn off.*safety'],
  },
];

/**
 * Bedrock Rules Manager
 */
export class BedrockRulesManager {
  private rules: BedrockRule[] = [];
  private rulesPath?: string;

  constructor(rulesPath?: string) {
    this.rulesPath = rulesPath;
    this.rules = [...DEFAULT_RULES];
  }

  /**
   * Load rules from TITAN_RULES.json file
   */
  loadFromFile(filePath?: string): void {
    const path = filePath || this.rulesPath;
    if (!path) return;

    try {
      if (fs.existsSync(path)) {
        const content = fs.readFileSync(path, 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.rules)) {
          // Merge with defaults (defaults always included)
          const customRules = parsed.rules as BedrockRule[];
          this.rules = [...DEFAULT_RULES, ...customRules];
        }
      }
    } catch (error) {
      console.warn('Failed to load bedrock rules:', error);
    }
  }

  /**
   * Check if an intent matches any deny rules
   */
  checkIntent(toolName: string, intent: string): { action: GuardrailAction; rule?: BedrockRule; reason: string } {
    for (const rule of this.rules) {
      // Check tool name match (if specified)
      if (rule.toolName && rule.toolName !== toolName) continue;

      // Check intent patterns
      for (const pattern of rule.intentPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(intent)) {
          return {
            action: rule.action,
            rule,
            reason: rule.description,
          };
        }
      }
    }

    return { action: 'allow', reason: 'No matching rules' };
  }

  /**
   * Get rules for a specific category
   */
  getRulesForCategory(category: MemoryCategory): BedrockRule[] {
    return this.rules.filter(r => r.category === category);
  }

  /**
   * Get rules for a specific tool
   */
  getRulesForTool(toolName: string): BedrockRule[] {
    return this.rules.filter(r => r.toolName === toolName);
  }

  /**
   * Get all rules
   */
  getAllRules(): BedrockRule[] {
    return [...this.rules];
  }

  /**
   * Get rule count
   */
  getRuleCount(): number {
    return this.rules.length;
  }
}

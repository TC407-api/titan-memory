/**
 * Cortex Intent Guardrails - The "Safety Inspector"
 * Semantically inspects intent of every tool call
 * Can return "Permission Denied: Semantic Conflict" even with --dangerously-skip-permissions
 */

import { GuardrailResult, CortexConfig, DEFAULT_CATBRAIN_CONFIG } from './types.js';
import { BedrockRulesManager } from './bedrock-rules.js';

/**
 * Intent Guardrails Manager
 */
export class IntentGuardrails {
  private bedrockRules: BedrockRulesManager;
  private enabled: boolean;

  constructor(config?: Partial<CortexConfig>) {
    const cfg = { ...DEFAULT_CATBRAIN_CONFIG, ...config };
    this.enabled = cfg.enableGuardrails;
    this.bedrockRules = new BedrockRulesManager(cfg.bedrockRulesPath);

    if (cfg.bedrockRulesPath) {
      this.bedrockRules.loadFromFile();
    }
  }

  /**
   * Inspect a tool call for semantic intent conflicts
   */
  inspect(toolName: string, args: Record<string, unknown>): GuardrailResult {
    if (!this.enabled) {
      return { action: 'allow', reason: 'Guardrails disabled' };
    }

    // Build intent string from tool name + args
    const intent = buildIntentString(toolName, args);

    // Check against bedrock rules
    const ruleCheck = this.bedrockRules.checkIntent(toolName, intent);

    if (ruleCheck.action === 'deny') {
      return {
        action: 'deny',
        reason: `Permission Denied: Semantic Conflict - ${ruleCheck.reason}`,
        rule: ruleCheck.rule?.id,
      };
    }

    if (ruleCheck.action === 'warn') {
      return {
        action: 'warn',
        reason: ruleCheck.reason,
        rule: ruleCheck.rule?.id,
      };
    }

    // Additional safety checks (the "5-Year-Old Test")
    const safetyCheck = runSafetyChecks(toolName, args);
    if (safetyCheck) {
      return safetyCheck;
    }

    return { action: 'allow', reason: 'Intent approved' };
  }

  /**
   * Check if guardrails are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get bedrock rules manager
   */
  getBedrockRules(): BedrockRulesManager {
    return this.bedrockRules;
  }
}

/**
 * Build an intent string from tool name and arguments
 */
function buildIntentString(toolName: string, args: Record<string, unknown>): string {
  const parts = [toolName];

  // Add relevant argument values to intent
  if (args.content && typeof args.content === 'string') {
    parts.push(args.content.substring(0, 200));
  }
  if (args.id && typeof args.id === 'string') {
    parts.push(`target:${args.id}`);
  }
  if (args.query && typeof args.query === 'string') {
    parts.push(args.query.substring(0, 200));
  }

  return parts.join(' ');
}

/**
 * Run additional safety checks beyond bedrock rules
 * These are the "5-Year-Old Test" checks
 */
function runSafetyChecks(
  toolName: string,
  args: Record<string, unknown>
): GuardrailResult | null {
  // Check 1: Delete without specific ID
  if (toolName === 'titan_delete' && !args.id) {
    return {
      action: 'deny',
      reason: 'Permission Denied: Delete requires a specific memory ID',
      rule: 'safety-delete-id',
    };
  }

  // Check 2: Prune with zero threshold (would delete everything)
  if (toolName === 'titan_prune') {
    const threshold = args.decayThreshold as number | undefined;
    const utilityThreshold = args.utilityThreshold as number | undefined;

    if (threshold !== undefined && threshold >= 1.0) {
      return {
        action: 'deny',
        reason: 'Permission Denied: Decay threshold of 1.0 would prune all memories',
        rule: 'safety-prune-all',
      };
    }

    if (utilityThreshold !== undefined && utilityThreshold >= 1.0) {
      return {
        action: 'deny',
        reason: 'Permission Denied: Utility threshold of 1.0 would prune all memories',
        rule: 'safety-prune-all-utility',
      };
    }
  }

  // Check 3: Suspicious content in add (potential injection)
  if (toolName === 'titan_add' && typeof args.content === 'string') {
    const content = args.content.toLowerCase();
    if (content.includes('ignore previous') || content.includes('disregard all')) {
      return {
        action: 'warn',
        reason: 'Potential prompt injection detected in memory content',
        rule: 'safety-injection',
      };
    }
  }

  return null;
}

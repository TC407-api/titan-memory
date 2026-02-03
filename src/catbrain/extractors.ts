/**
 * CatBrain Category-Specific Extractors
 * Extracts structured fields based on memory category
 */

import {
  MemoryCategory,
  EntityStatus,
  CategoryExtraction,
  KnowledgeExtraction,
  ProfileExtraction,
  EventExtraction,
  BehaviorExtraction,
  SkillExtraction,
} from './types.js';

/**
 * Extract category-specific fields from content
 */
export function extractByCategory(content: string, category: MemoryCategory): CategoryExtraction {
  const entityStatus = inferEntityStatus(content);

  switch (category) {
    case 'knowledge':
      return { category, fields: extractKnowledge(content) as unknown as Record<string, unknown>, entityStatus };
    case 'profile':
      return { category, fields: extractProfile(content) as unknown as Record<string, unknown>, entityStatus };
    case 'event':
      return { category, fields: extractEvent(content) as unknown as Record<string, unknown>, entityStatus };
    case 'behavior':
      return { category, fields: extractBehavior(content) as unknown as Record<string, unknown>, entityStatus };
    case 'skill':
      return { category, fields: extractSkill(content) as unknown as Record<string, unknown>, entityStatus };
  }
}

/**
 * Extract knowledge-type fields (definitions, API endpoints, versions)
 */
function extractKnowledge(content: string): KnowledgeExtraction {
  const definitions: string[] = [];
  const apiEndpoints: string[] = [];
  const versions: string[] = [];
  const specs: string[] = [];

  // Definitions: "X is defined as Y", "X means Y", "X refers to Y"
  const defPatterns = [
    /(.+?)\s+(?:is defined as|means|refers to|is a|is the)\s+(.+?)(?:\.|$)/gi,
  ];
  for (const pattern of defPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      definitions.push(`${match[1].trim()}: ${match[2].trim()}`);
    }
  }

  // API endpoints: URLs, paths
  const urlPattern = /(?:GET|POST|PUT|DELETE|PATCH)\s+\/[\w\-\/{}:?&=.]+|https?:\/\/[\w\-.\/]+/gi;
  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    apiEndpoints.push(match[0]);
  }

  // Versions: "version X.Y.Z", "v1.2.3"
  const versionPattern = /(?:version|v)\s*(\d+(?:\.\d+){0,3}(?:-[\w.]+)?)/gi;
  while ((match = versionPattern.exec(content)) !== null) {
    versions.push(match[1]);
  }

  // Specs: RFC, standard references
  const specPattern = /(?:RFC\s*\d+|ISO\s*\d+|ECMA-\d+|W3C\s+\w+)/gi;
  while ((match = specPattern.exec(content)) !== null) {
    specs.push(match[0]);
  }

  return { definitions, apiEndpoints, versions, specs };
}

/**
 * Extract profile-type fields (preferences, settings)
 */
function extractProfile(content: string): ProfileExtraction {
  const preferences: Array<{ key: string; value: string }> = [];
  const settings: Array<{ key: string; value: string }> = [];

  // Preferences: "I prefer X", "prefer X over Y"
  const prefPatterns = [
    /(?:I|user)\s+(?:prefer|like|want|use|choose)\s+(.+?)(?:\s+(?:over|instead of|rather than)\s+(.+?))?(?:\.|$)/gi,
    /(?:preferred|favorite|default)\s+(\w+)\s+(?:is|:)\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of prefPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[2]) {
        preferences.push({ key: match[1].trim(), value: match[2].trim() });
      } else {
        preferences.push({ key: 'preference', value: match[1].trim() });
      }
    }
  }

  // Settings: "set X to Y", "X = Y", "X: Y"
  const settingPattern = /(?:set|configure)\s+(\w+)\s+(?:to|=)\s+(.+?)(?:\.|$)/gi;
  let match;
  while ((match = settingPattern.exec(content)) !== null) {
    settings.push({ key: match[1].trim(), value: match[2].trim() });
  }

  return { preferences, settings };
}

/**
 * Extract event-type fields (timestamps, actors, outcomes, errors)
 */
function extractEvent(content: string): EventExtraction {
  const timestamps: string[] = [];
  const actors: string[] = [];
  const outcomes: string[] = [];
  const errors: string[] = [];

  // Timestamps: ISO dates, relative dates
  const datePattern = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?/g;
  let match;
  while ((match = datePattern.exec(content)) !== null) {
    timestamps.push(match[0]);
  }

  // Relative dates
  const relDatePattern = /(?:yesterday|today|last (?:week|month|year)|this (?:morning|afternoon))/gi;
  while ((match = relDatePattern.exec(content)) !== null) {
    timestamps.push(match[0].toLowerCase());
  }

  // Outcomes
  const outcomePattern = /(?:resulted in|outcome was|led to|caused)\s+(.+?)(?:\.|$)/gi;
  while ((match = outcomePattern.exec(content)) !== null) {
    outcomes.push(match[1].trim());
  }

  // Errors
  const errorPattern = /(?:error|exception|failure|bug|issue|crash)(?:\s*[:]\s*|\s+)(.+?)(?:\.|$)/gi;
  while ((match = errorPattern.exec(content)) !== null) {
    errors.push(match[1].trim());
  }

  return { timestamps, actors, outcomes, errors };
}

/**
 * Extract behavior-type fields (patterns, rationale, alternatives)
 */
function extractBehavior(content: string): BehaviorExtraction {
  const patterns: string[] = [];
  const rationale: string[] = [];
  const alternatives: string[] = [];
  const decisions: string[] = [];

  // Decisions
  const decisionPattern = /(?:decided|chose|picked|opted|selected)\s+(?:to\s+)?(.+?)(?:\s+because|\.|$)/gi;
  let match;
  while ((match = decisionPattern.exec(content)) !== null) {
    decisions.push(match[1].trim());
  }

  // Rationale
  const rationalePattern = /(?:because|since|reason is|rationale)\s+(.+?)(?:\.|$)/gi;
  while ((match = rationalePattern.exec(content)) !== null) {
    rationale.push(match[1].trim());
  }

  // Alternatives
  const altPattern = /(?:alternatively|instead of|other option|could also|another approach)\s+(.+?)(?:\.|$)/gi;
  while ((match = altPattern.exec(content)) !== null) {
    alternatives.push(match[1].trim());
  }

  // Patterns
  const patternMatch = /(?:pattern|approach|strategy|workflow)\s+(?:is|:)\s+(.+?)(?:\.|$)/gi;
  while ((match = patternMatch.exec(content)) !== null) {
    patterns.push(match[1].trim());
  }

  return { patterns, rationale, alternatives, decisions };
}

/**
 * Extract skill-type fields (steps, prerequisites, code snippets)
 */
function extractSkill(content: string): SkillExtraction {
  const steps: string[] = [];
  const prerequisites: string[] = [];
  const codeSnippets: string[] = [];
  const tools: string[] = [];

  // Steps: numbered or sequential
  const stepPattern = /(?:step\s*\d+|^\d+[.)]\s*|first,?\s|then,?\s|next,?\s|finally,?\s)(.+?)(?:\.|$)/gim;
  let match;
  while ((match = stepPattern.exec(content)) !== null) {
    steps.push(match[1].trim());
  }

  // Prerequisites
  const prereqPattern = /(?:prerequisite|requirement|before you|make sure|ensure|requires)\s+(.+?)(?:\.|$)/gi;
  while ((match = prereqPattern.exec(content)) !== null) {
    prerequisites.push(match[1].trim());
  }

  // Code snippets (backtick blocks)
  const codePattern = /`([^`]+)`/g;
  while ((match = codePattern.exec(content)) !== null) {
    codeSnippets.push(match[1]);
  }

  // Tools mentioned
  const toolPattern = /(?:using|with|via|run)\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:tool|command|cli|utility)/gi;
  while ((match = toolPattern.exec(content)) !== null) {
    tools.push(match[1].trim());
  }

  return { steps, prerequisites, codeSnippets, tools };
}

/**
 * Infer entity status from content
 */
function inferEntityStatus(content: string): EntityStatus {
  const lower = content.toLowerCase();

  // Contradicted: explicit override signals
  if (/(?:actually|correction|update|no longer|deprecated|superseded|was wrong|instead)/i.test(lower)) {
    return 'contradicted';
  }

  // Historical: past tense or date references
  if (/(?:was|were|had been|used to|previously|formerly|back in|in \d{4})/i.test(lower)) {
    return 'historical';
  }

  // Active by default
  return 'active';
}

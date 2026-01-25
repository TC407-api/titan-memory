/**
 * Built-in Summarizer Skill
 * Summarizes memory content using simple heuristics
 */

import { TitanSkill, SkillContext, SkillResult } from '../types.js';

/**
 * Extract key sentences from text (heuristic-based)
 */
function extractKeySentences(text: string, maxSentences: number): string[] {
  // Split into sentences
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (sentences.length <= maxSentences) {
    return sentences;
  }

  // Score sentences by importance indicators
  const scored = sentences.map((sentence) => {
    let score = 0;

    // Keywords that indicate importance
    const importanceKeywords = [
      'important', 'key', 'critical', 'essential', 'must', 'should',
      'decision', 'decided', 'error', 'fix', 'solution', 'learned',
      'discovered', 'note', 'remember', 'always', 'never'
    ];

    const lowerSentence = sentence.toLowerCase();
    for (const keyword of importanceKeywords) {
      if (lowerSentence.includes(keyword)) {
        score += 2;
      }
    }

    // Longer sentences often contain more info
    score += Math.min(sentence.length / 50, 2);

    // First and last sentences are often important
    const index = sentences.indexOf(sentence);
    if (index === 0 || index === sentences.length - 1) {
      score += 1;
    }

    return { sentence, score };
  });

  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxSentences).map((s) => s.sentence);
}

/**
 * Generate summary from key sentences
 */
function generateSummary(keySentences: string[]): string {
  if (keySentences.length === 0) {
    return 'No content to summarize.';
  }

  return keySentences.map((s) => `- ${s}`).join('\n');
}

export const summarizerSkill: TitanSkill = {
  metadata: {
    name: 'summarizer',
    version: '1.0.0',
    description: 'Summarizes memory content into key points',
    triggers: ['summarize', 'tldr', 'brief', 'summary'],
    author: 'Titan Memory',
    tags: ['built-in', 'text-processing'],
    config: {
      maxSentences: 5,
      minLength: 20,
    },
  },

  async execute(context: SkillContext): Promise<SkillResult> {
    const maxSentences = (context.config?.maxSentences as number) || 5;

    // Get content to summarize
    let contentToSummarize = '';

    if (context.memory) {
      contentToSummarize = context.memory.content;
    } else if (context.memories && context.memories.length > 0) {
      contentToSummarize = context.memories.map((m) => m.content).join('\n\n');
    } else if (context.query) {
      contentToSummarize = context.query;
    }

    if (!contentToSummarize || contentToSummarize.length < 20) {
      return {
        success: false,
        error: 'Not enough content to summarize',
        metadata: { executionTimeMs: 0 },
      };
    }

    // Generate summary
    const keySentences = extractKeySentences(contentToSummarize, maxSentences);
    const summary = generateSummary(keySentences);

    return {
      success: true,
      output: summary,
      metadata: {
        executionTimeMs: 0,
        tokensProcessed: contentToSummarize.length,
      },
    };
  },

  mcpToolDefinition: {
    name: 'titan_summarize',
    description: 'Summarize memory content into key points',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Content to summarize',
        },
        maxSentences: {
          type: 'number',
          description: 'Maximum number of key sentences',
          default: 5,
        },
      },
      required: ['content'],
    },
  },
};

export default summarizerSkill;

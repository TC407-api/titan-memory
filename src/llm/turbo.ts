/**
 * LLM Turbo Layer - Four Enhancement Functions
 * Titan Memory v2.1
 *
 * Each function returns result or null on failure (caller falls back to algorithmic path).
 * Highest impact: llmRerank (fixes knowledge-updates + temporal-reasoning benchmarks).
 */

import { LLMClient } from './client.js';
import type { CategoryClassification, GoldSentence, MemoryCategory } from '../cortex/types.js';

/**
 * LLM-powered content classification
 * ~20 output tokens per call
 */
export async function llmClassify(
  client: LLMClient,
  content: string
): Promise<CategoryClassification | null> {
  const result = await client.completeJSON<{
    category: MemoryCategory;
    confidence: number;
  }>([
    {
      role: 'system',
      content: 'You are a memory classification system. Classify content into exactly one category. Respond with JSON only, no explanation.',
    },
    {
      role: 'user',
      content: `Classify this content into one of: knowledge, profile, event, behavior, skill.

Categories:
- knowledge: facts, definitions, API docs, technical specs, version info
- profile: user preferences, settings, personal traits, work habits
- event: things that happened, timestamps, errors, deployments, meetings
- behavior: patterns, decisions, rationale, recurring choices
- skill: how-to, steps, procedures, code techniques, tool usage

Content: "${content.slice(0, 500)}"

Respond with JSON: {"category": "<category>", "confidence": <0.0-1.0>}`,
    },
  ]);

  if (!result || !isValidCategory(result.category)) return null;

  return {
    category: result.category,
    confidence: Math.min(1, Math.max(0, result.confidence)),
    method: 'llm' as const,
  };
}

/**
 * LLM-powered extraction to enrich fields beyond regex
 * ~100 output tokens per call
 */
export async function llmExtract(
  client: LLMClient,
  content: string,
  category: MemoryCategory
): Promise<Record<string, unknown> | null> {
  const prompts: Record<MemoryCategory, string> = {
    knowledge: 'Extract: definitions, apiEndpoints, versions, specs, keyEntities, relationships',
    profile: 'Extract: preferences (key-value pairs), settings, keyEntities',
    event: 'Extract: timestamps, actors, outcomes, errors, keyEntities, relationships',
    behavior: 'Extract: patterns, rationale, alternatives, decisions, keyEntities',
    skill: 'Extract: steps, prerequisites, codeSnippets, tools, keyEntities',
  };

  return client.completeJSON<Record<string, unknown>>([
    {
      role: 'system',
      content: 'You are a structured data extractor. Extract fields from memory content. Respond with JSON only.',
    },
    {
      role: 'user',
      content: `Category: ${category}
${prompts[category]}

Content: "${content.slice(0, 800)}"

Respond with a JSON object containing the requested fields. Use arrays for list fields. Omit fields with no data.`,
    },
  ]);
}

/**
 * LLM-powered sentence reranking — HIGHEST IMPACT on benchmarks
 * Fixes knowledge-updates (understands "replaced/superseded") and
 * temporal-reasoning (understands "before/after").
 * ~50 output tokens per call, batches max 20 sentences
 */
export async function llmRerank(
  client: LLMClient,
  query: string,
  sentences: GoldSentence[]
): Promise<GoldSentence[] | null> {
  if (sentences.length === 0) return sentences;

  // Batch to max 20 sentences per call
  const batchSize = 20;
  const batches: GoldSentence[][] = [];
  for (let i = 0; i < sentences.length; i += batchSize) {
    batches.push(sentences.slice(i, i + batchSize));
  }

  const reranked: GoldSentence[] = [];

  for (const batch of batches) {
    const numbered = batch.map((s, i) => `[${i}] ${s.text}`).join('\n');

    const result = await client.completeJSON<Array<{ index: number; score: number }>>([
      {
        role: 'system',
        content: 'You are a relevance ranking system. Rank sentences by relevance to the query. Consider semantic meaning, temporal relationships (before/after, replaced/superseded), and factual accuracy. Respond with JSON only.',
      },
      {
        role: 'user',
        content: `Query: "${query}"

Sentences:
${numbered}

Rank by relevance. If a sentence indicates something was replaced/updated/superseded, rank the NEWER information higher. For temporal queries, rank chronologically relevant sentences higher.

Respond with JSON array: [{"index": <number>, "score": <0.0-1.0>}]`,
      },
    ]);

    if (!result || !Array.isArray(result)) {
      // Fallback: keep original scores for this batch
      reranked.push(...batch);
      continue;
    }

    // Apply LLM scores
    for (const item of result) {
      if (item.index >= 0 && item.index < batch.length) {
        reranked.push({
          ...batch[item.index],
          score: Math.min(1, Math.max(0, item.score)),
        });
      }
    }

    // Add any sentences the LLM missed
    const rankedIndices = new Set(result.map(r => r.index));
    for (let i = 0; i < batch.length; i++) {
      if (!rankedIndices.has(i)) {
        reranked.push(batch[i]);
      }
    }
  }

  // Sort by score descending
  reranked.sort((a, b) => b.score - a.score);
  return reranked;
}

/**
 * LLM-powered summarization
 * ~100 output tokens per call
 */
export async function llmSummarize(
  client: LLMClient,
  content: string,
  contextQuery?: string
): Promise<string | null> {
  const contextPart = contextQuery
    ? `\nContext query: "${contextQuery}"\nFocus the summary on aspects relevant to this query.`
    : '';

  try {
    const result = await client.complete([
      {
        role: 'system',
        content: 'You are a memory compression system. Summarize content in 1-2 sentences preserving key facts, entities, numbers, and relationships. Be precise and concise.',
      },
      {
        role: 'user',
        content: `Summarize this memory content in 1-2 sentences:${contextPart}

"${content.slice(0, 1000)}"`,
      },
    ]);

    return result.content.trim() || null;
  } catch {
    return null;
  }
}

// ==================== Helpers ====================

const VALID_CATEGORIES: Set<string> = new Set([
  'knowledge', 'profile', 'event', 'behavior', 'skill',
]);

function isValidCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value);
}

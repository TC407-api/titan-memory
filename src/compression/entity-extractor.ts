/**
 * Entity Extractor
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Regex-based entity extraction reusing patterns from cortex/extractors.ts.
 * Extracts people, technologies, concepts, configurations, URLs, and versions.
 */

import { ExtractedEntity } from './types.js';

/**
 * Known technology names for pattern matching
 */
const KNOWN_TECHNOLOGIES = new Set([
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'node.js', 'deno', 'bun',
  'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'kotlin', 'swift',
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'sqlite',
  'docker', 'kubernetes', 'terraform', 'ansible', 'nginx', 'apache',
  'aws', 'gcp', 'azure', 'vercel', 'netlify', 'heroku', 'cloudflare',
  'express', 'fastify', 'flask', 'django', 'spring', 'rails',
  'graphql', 'rest', 'grpc', 'websocket', 'kafka', 'rabbitmq',
  'jest', 'mocha', 'pytest', 'vitest', 'playwright', 'cypress',
  'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
  'tailwind', 'bootstrap', 'sass', 'webpack', 'vite', 'esbuild', 'rollup',
  'stripe', 'supabase', 'firebase', 'prisma', 'drizzle', 'knex',
  'prometheus', 'grafana', 'datadog', 'sentry', 'logstash', 'kibana',
  'jwt', 'oauth', 'saml', 'openid', 'bcrypt', 'argon2',
  'pnpm', 'npm', 'yarn', 'cargo', 'pip', 'maven', 'gradle',
  'linux', 'ubuntu', 'macos', 'windows', 'centos', 'debian',
  // Common tech terms that may appear capitalized
  'zustand', 'redux', 'mobx', 'recoil', 'jotai', 'turborepo',
  'argo', 'snyk', 'semgrep', 'okta', 'pagerduty', 'slack',
  'thanos', 'tempo', 'loki', 'fluent', 'fluentd',
  'opentelemetry', 'supertest', 'axe-core',
  'jquery', 'next', 'nuxt', 'svelte', 'solid',
]);

/**
 * Words that are commonly capitalized mid-sentence but are NOT person names.
 * Prevents false-positive person detection.
 */
const CAPITALIZED_NON_NAMES = new Set([
  // Common English words that appear capitalized
  'the', 'this', 'that', 'these', 'those', 'here', 'there', 'where',
  'what', 'which', 'when', 'who', 'how', 'why',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'just', 'also', 'very', 'much',
  // Common tech/business terms that get capitalized
  'largest', 'contentful', 'paint', 'score', 'bundle', 'state',
  'server', 'client', 'backend', 'frontend', 'design', 'system',
  'custom', 'tokens', 'pattern', 'type', 'format', 'standard',
  'role', 'based', 'access', 'control', 'identity', 'provider',
  'code', 'review', 'deploy', 'build', 'test', 'release',
  'stage', 'production', 'staging', 'canary', 'blue', 'green',
  'maximum', 'minimum', 'average', 'total', 'overall',
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

/**
 * Extract entities from content
 */
export function extractEntities(content: string): ExtractedEntity[] {
  const entityMap = new Map<string, ExtractedEntity>();

  extractProperNames(content, entityMap);
  extractTechnologies(content, entityMap);
  extractUrls(content, entityMap);
  extractVersions(content, entityMap);
  extractConfigValues(content, entityMap);
  extractConcepts(content, entityMap);

  return Array.from(entityMap.values())
    .sort((a, b) => b.mentions - a.mentions);
}

function addOrUpdate(
  map: Map<string, ExtractedEntity>,
  name: string,
  type: ExtractedEntity['type'],
  attribute?: string
): void {
  const key = name.toLowerCase();
  const existing = map.get(key);
  if (existing) {
    existing.mentions++;
    if (attribute && !existing.attributes.includes(attribute)) {
      existing.attributes.push(attribute);
    }
  } else {
    map.set(key, {
      name,
      type,
      mentions: 1,
      attributes: attribute ? [attribute] : [],
    });
  }
}

/**
 * Detect proper names (capitalized words not at sentence start)
 *
 * Only detects two-word names (e.g., "Marcus Chen", "Sarah Park") to avoid
 * false positives from single capitalized words like "Next", "Redux", etc.
 * Single capitalized words are too ambiguous in technical content.
 */
function extractProperNames(content: string, map: Map<string, ExtractedEntity>): void {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim());
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const words = trimmed.split(/\s+/);
    // Skip first word (might be capitalized from sentence start)
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[,;:()[\]{}'"]/g, '');
      if (!/^[A-Z][a-z]{2,}$/.test(word)) continue;
      if (KNOWN_TECHNOLOGIES.has(word.toLowerCase())) continue;
      if (CAPITALIZED_NON_NAMES.has(word.toLowerCase())) continue;

      // Require two consecutive capitalized words for person detection
      // This eliminates false positives from single tech terms
      if (i + 1 < words.length) {
        const nextWord = words[i + 1].replace(/[,;:()[\]{}'"]/g, '');
        if (/^[A-Z][a-z]{2,}$/.test(nextWord)
            && !KNOWN_TECHNOLOGIES.has(nextWord.toLowerCase())
            && !CAPITALIZED_NON_NAMES.has(nextWord.toLowerCase())) {
          addOrUpdate(map, `${word} ${nextWord}`, 'person');
          i++; // skip next word
        }
      }
      // Single capitalized words are NOT added as persons — too many false positives
    }
  }
}

/**
 * Extract technology references
 */
function extractTechnologies(content: string, map: Map<string, ExtractedEntity>): void {
  const lower = content.toLowerCase();
  for (const tech of KNOWN_TECHNOLOGIES) {
    // Word boundary match (with support for dots like "node.js")
    const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      for (let i = 0; i < matches.length; i++) {
        addOrUpdate(map, tech, 'technology');
      }
    }
  }
}

/**
 * Extract URLs
 */
function extractUrls(content: string, map: Map<string, ExtractedEntity>): void {
  const urlPattern = /https?:\/\/[\w\-.\/]+(?:\?[\w&=]+)?/gi;
  let match;
  while ((match = urlPattern.exec(content)) !== null) {
    addOrUpdate(map, match[0], 'url');
  }

  // API endpoints
  const apiPattern = /(?:GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\-\/{}:?&=.]+)/gi;
  while ((match = apiPattern.exec(content)) !== null) {
    addOrUpdate(map, match[1], 'url', match[0].split(/\s+/)[0]);
  }
}

/**
 * Extract version numbers
 */
function extractVersions(content: string, map: Map<string, ExtractedEntity>): void {
  const versionPattern = /(?:v|version\s*)(\d+(?:\.\d+){1,3}(?:-[\w.]+)?)/gi;
  let match;
  while ((match = versionPattern.exec(content)) !== null) {
    addOrUpdate(map, `v${match[1]}`, 'version');
  }
}

/**
 * Extract configuration values (ports, sizes, durations)
 */
function extractConfigValues(content: string, map: Map<string, ExtractedEntity>): void {
  // Port numbers
  const portPattern = /port\s+(\d{2,5})/gi;
  let match;
  while ((match = portPattern.exec(content)) !== null) {
    addOrUpdate(map, `port:${match[1]}`, 'config', 'port');
  }

  // Size values
  const sizePattern = /(\d+(?:\.\d+)?)\s*(MB|GB|TB|KB|bytes)/gi;
  while ((match = sizePattern.exec(content)) !== null) {
    addOrUpdate(map, `${match[1]}${match[2]}`, 'config', 'size');
  }

  // Duration values
  const durationPattern = /(\d+)\s*(seconds?|minutes?|hours?|days?|ms|milliseconds?)/gi;
  while ((match = durationPattern.exec(content)) !== null) {
    addOrUpdate(map, `${match[1]} ${match[2]}`, 'config', 'duration');
  }

  // Numeric settings with labels
  const settingPattern = /(\w+)\s*(?:=|is|:)\s*(\d+(?:\.\d+)?)\b/gi;
  while ((match = settingPattern.exec(content)) !== null) {
    const key = match[1].toLowerCase();
    if (['limit', 'max', 'min', 'size', 'count', 'timeout', 'threshold', 'pool'].some(k => key.includes(k))) {
      addOrUpdate(map, `${match[1]}=${match[2]}`, 'config', 'setting');
    }
  }
}

/**
 * Extract conceptual terms (patterns, strategies, methodologies)
 */
function extractConcepts(content: string, map: Map<string, ExtractedEntity>): void {
  const conceptPatterns = [
    /(?:pattern|strategy|approach|methodology|architecture|paradigm):\s*(.+?)(?:\.|,|$)/gi,
    /(?:using|implements?|follows?)\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:pattern|strategy|approach|architecture)/gi,
  ];

  for (const pattern of conceptPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const concept = match[1].trim();
      if (concept.length > 2 && concept.length < 50) {
        addOrUpdate(map, concept, 'concept');
      }
    }
  }
}

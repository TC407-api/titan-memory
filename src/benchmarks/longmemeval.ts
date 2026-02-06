/**
 * LongMemEval-Aligned Benchmarks
 * Titan Memory v2.0 - Phase 3
 *
 * Tests information extraction, single/multi-session QA,
 * and knowledge update handling following LongMemEval methodology.
 */

import { BenchmarkDefinition } from './runner.js';
import { TitanMemory } from '../titan.js';
import { MemoryEntry, UnifiedQueryResult } from '../types.js';

function extractMemoryIds(result: UnifiedQueryResult | { summaries: unknown[]; totalQueryTimeMs: number }): string[] {
  if ('fusedMemories' in result) {
    return result.fusedMemories.map((m: MemoryEntry) => m.id);
  }
  return [];
}

function calculateRecallAtK(retrieved: string[], expected: string[], k: number): number {
  const topK = retrieved.slice(0, k);
  const relevant = expected.filter(id => topK.includes(id));
  return expected.length > 0 ? relevant.length / expected.length : 0;
}

/**
 * Create LongMemEval-aligned benchmarks
 */
export function createLongMemEvalBenchmarks(titan: TitanMemory): BenchmarkDefinition[] {
  return [
    {
      name: 'longmemeval-information-extraction',
      category: 'accuracy',
      run: async () => {
        // 10 factual memories with specific extractable information
        const facts = [
          { content: 'The production server runs on port 8443 with TLS enabled.', id: '' },
          { content: 'Database backup schedule: daily at 3:00 AM UTC, weekly full backup on Sunday.', id: '' },
          { content: 'The API rate limit is 1000 requests per minute per API key.', id: '' },
          { content: 'Redis cache expires entries after 3600 seconds (1 hour) by default.', id: '' },
          { content: 'The monorepo uses pnpm workspaces with Node.js v20.11.0 as the runtime.', id: '' },
          { content: 'S3 bucket name for assets is prod-assets-us-east-1 in the AWS us-east-1 region.', id: '' },
          { content: 'The JWT secret rotation happens every 90 days using AWS Secrets Manager.', id: '' },
          { content: 'Maximum file upload size is 50MB, configured in the nginx reverse proxy.', id: '' },
          { content: 'PostgreSQL connection pool size is 20 connections with a 30-second idle timeout.', id: '' },
          { content: 'The staging environment URL is staging.example.com with basic auth enabled.', id: '' },
        ];

        for (const fact of facts) {
          const result = await titan.add(fact.content, { tags: ['longmemeval-bench'] });
          fact.id = result.id;
        }

        // Direct fact extraction queries
        const factQueries = [
          { query: 'What port does the production server use?', expectedId: facts[0].id },
          { query: 'When do database backups run?', expectedId: facts[1].id },
          { query: 'What is the API rate limit?', expectedId: facts[2].id },
          { query: 'How long does the Redis cache last?', expectedId: facts[3].id },
          { query: 'What Node.js version does the project use?', expectedId: facts[4].id },
          { query: 'What S3 bucket is used for assets?', expectedId: facts[5].id },
          { query: 'How often is the JWT secret rotated?', expectedId: facts[6].id },
          { query: 'What is the max file upload size?', expectedId: facts[7].id },
          { query: 'What is the database connection pool size?', expectedId: facts[8].id },
          { query: 'What is the staging environment URL?', expectedId: facts[9].id },
        ];

        let strictHits = 0; // top-1 match
        let lenientHits = 0; // top-3 match

        for (const fq of factQueries) {
          const result = await titan.recall(fq.query, { limit: 3 });
          const retrievedIds = extractMemoryIds(result);

          if (retrievedIds[0] === fq.expectedId) strictHits++;
          if (retrievedIds.slice(0, 3).includes(fq.expectedId)) lenientHits++;
        }

        const strictAccuracy = strictHits / factQueries.length;
        const lenientAccuracy = lenientHits / factQueries.length;
        const score = (strictAccuracy * 0.5 + lenientAccuracy * 0.5) * 100;

        return {
          passed: lenientAccuracy >= 0.8,
          score,
          metrics: {
            testCases: factQueries.length,
            strictAccuracyTop1: strictAccuracy,
            lenientAccuracyTop3: lenientAccuracy,
            strictHits,
            lenientHits,
          },
          details: `LongMemEval info extraction: strict@1=${(strictAccuracy * 100).toFixed(1)}%, lenient@3=${(lenientAccuracy * 100).toFixed(1)}%`,
        };
      },
    },

    {
      name: 'longmemeval-single-session-qa',
      category: 'accuracy',
      run: async () => {
        // 8 memories forming a debugging narrative
        const narrative = [
          { content: 'Noticed the API response time increased from 50ms to 2000ms after yesterday\'s deployment.', id: '' },
          { content: 'Checked application logs and found excessive database queries in the user listing endpoint.', id: '' },
          { content: 'Identified an N+1 query problem where each user record triggers a separate permissions lookup.', id: '' },
          { content: 'The permissions query was added in commit abc123 by the new developer during the auth refactor.', id: '' },
          { content: 'Implemented eager loading of permissions using a JOIN query, reducing queries from 500 to 1.', id: '' },
          { content: 'After the fix, API response time dropped back to 45ms, even better than before.', id: '' },
          { content: 'Added a database query count test to prevent N+1 regressions in the future.', id: '' },
          { content: 'Created a runbook documenting the N+1 detection and fix pattern for the team.', id: '' },
        ];

        for (const mem of narrative) {
          const result = await titan.add(mem.content, { tags: ['longmemeval-bench'] });
          mem.id = result.id;
        }

        // QA queries about the debugging narrative
        const qaTests = [
          {
            query: 'What caused the API slowdown?',
            expectedIds: [narrative[2].id, narrative[3].id],
            description: 'Root cause identification',
          },
          {
            query: 'How was the performance issue fixed?',
            expectedIds: [narrative[4].id, narrative[5].id],
            description: 'Fix identification',
          },
          {
            query: 'What preventive measures were taken?',
            expectedIds: [narrative[6].id, narrative[7].id],
            description: 'Prevention measures',
          },
          {
            query: 'What was the performance impact of the deployment?',
            expectedIds: [narrative[0].id, narrative[5].id],
            description: 'Performance impact',
          },
        ];

        let totalRecall = 0;
        for (const test of qaTests) {
          const result = await titan.recall(test.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);
          const recall = calculateRecallAtK(retrievedIds, test.expectedIds, 5);
          totalRecall += recall;
        }

        const avgRecall = totalRecall / qaTests.length;
        const score = avgRecall * 100;

        return {
          passed: avgRecall >= 0.7,
          score,
          metrics: {
            testCases: qaTests.length,
            avgQaRecall: avgRecall,
            narrativeLength: narrative.length,
          },
          details: `LongMemEval single-session QA: ${(avgRecall * 100).toFixed(1)}% recall on narrative queries`,
        };
      },
    },

    {
      name: 'longmemeval-multi-session-qa',
      category: 'accuracy',
      run: async () => {
        // 3 sessions with overlapping topics (auth, caching, monitoring)
        const authSession = [
          { content: 'Auth session: Migrated from session cookies to JWT bearer tokens for the API.', id: '' },
          { content: 'Auth session: Token expiry set to 15 minutes with 7-day refresh tokens.', id: '' },
          { content: 'Auth session: Added role-based access control with admin, editor, and viewer roles.', id: '' },
        ];

        const cachingSession = [
          { content: 'Caching session: Implemented Redis-based caching for user profiles and permissions.', id: '' },
          { content: 'Caching session: Cache invalidation uses pub/sub to sync across API instances.', id: '' },
          { content: 'Caching session: JWT token validation results are cached for 60 seconds to reduce crypto overhead.', id: '' },
        ];

        const monitoringSession = [
          { content: 'Monitoring session: Set up Prometheus metrics for API latency, error rates, and cache hit ratios.', id: '' },
          { content: 'Monitoring session: Added alerts for auth failure spikes exceeding 10 per minute.', id: '' },
          { content: 'Monitoring session: Dashboard tracks cache memory usage and eviction rates in real-time.', id: '' },
        ];

        for (const mem of authSession) {
          const result = await titan.add(mem.content, { tags: ['longmemeval-bench', 'auth-session'] });
          mem.id = result.id;
        }
        for (const mem of cachingSession) {
          const result = await titan.add(mem.content, { tags: ['longmemeval-bench', 'caching-session'] });
          mem.id = result.id;
        }
        for (const mem of monitoringSession) {
          const result = await titan.add(mem.content, { tags: ['longmemeval-bench', 'monitoring-session'] });
          mem.id = result.id;
        }

        // Cross-session queries (topics overlap)
        const crossTests = [
          {
            query: 'How is authentication handled end-to-end including caching and monitoring?',
            expectedIds: [authSession[0].id, authSession[1].id, cachingSession[2].id, monitoringSession[1].id],
            description: 'Auth across all sessions',
          },
          {
            query: 'What caching strategies are used and how are they monitored?',
            expectedIds: [cachingSession[0].id, cachingSession[1].id, monitoringSession[2].id],
            description: 'Caching + monitoring',
          },
          {
            query: 'What are the token expiry and caching settings?',
            expectedIds: [authSession[1].id, cachingSession[2].id],
            description: 'Token settings across sessions',
          },
        ];

        let totalRecall = 0;
        for (const test of crossTests) {
          const result = await titan.recall(test.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);
          const recall = calculateRecallAtK(retrievedIds, test.expectedIds, 5);
          totalRecall += recall;
        }

        const avgRecall = totalRecall / crossTests.length;
        const score = avgRecall * 100;

        return {
          passed: avgRecall >= 0.6,
          score,
          metrics: {
            testCases: crossTests.length,
            avgMultiSessionRecall: avgRecall,
            sessionsUsed: 3,
            totalMemories: authSession.length + cachingSession.length + monitoringSession.length,
          },
          details: `LongMemEval multi-session QA: ${(avgRecall * 100).toFixed(1)}% cross-session recall`,
        };
      },
    },

    {
      name: 'longmemeval-knowledge-updates',
      category: 'accuracy',
      run: async () => {
        // Memory pairs where second contradicts/updates first
        const updatePairs = [
          {
            original: { content: 'The default database is MySQL 5.7 running on port 3306.', id: '' },
            update: { content: 'Actually, we migrated the default database to PostgreSQL 16 on port 5432, replacing MySQL.', id: '' },
            query: 'What database are we using?',
          },
          {
            original: { content: 'Deployments are done manually by SSH-ing into the production server.', id: '' },
            update: { content: 'Update: Deployments are now fully automated using GitHub Actions CI/CD pipeline, no more manual SSH.', id: '' },
            query: 'How are deployments handled?',
          },
          {
            original: { content: 'The application uses REST API with XML response format.', id: '' },
            update: { content: 'Correction: The API was converted from XML to JSON response format in the latest release.', id: '' },
            query: 'What format does the API use?',
          },
          {
            original: { content: 'Error logging goes to a local text file at /var/log/app.log.', id: '' },
            update: { content: 'Error logging was moved from local files to centralized ELK stack (Elasticsearch, Logstash, Kibana).', id: '' },
            query: 'Where do error logs go?',
          },
          {
            original: { content: 'The frontend uses jQuery 3.6 for DOM manipulation and AJAX calls.', id: '' },
            update: { content: 'The frontend was rewritten from jQuery to React 18 with TypeScript for better maintainability.', id: '' },
            query: 'What frontend framework is used?',
          },
        ];

        // Store originals first, then updates (recency should matter)
        for (const pair of updatePairs) {
          const origResult = await titan.add(pair.original.content, { tags: ['longmemeval-bench'] });
          pair.original.id = origResult.id;
        }

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));

        for (const pair of updatePairs) {
          const updateResult = await titan.add(pair.update.content, { tags: ['longmemeval-bench'] });
          pair.update.id = updateResult.id;
        }

        // Query and check that updated version ranks higher
        let recencyCorrect = 0;
        let updateFound = 0;

        for (const pair of updatePairs) {
          const result = await titan.recall(pair.query, { limit: 3 });
          const retrievedIds = extractMemoryIds(result);

          const updateIdx = retrievedIds.indexOf(pair.update.id);
          const origIdx = retrievedIds.indexOf(pair.original.id);

          // Update found in top 3
          if (updateIdx !== -1) updateFound++;
          // Update ranks higher than original (or original not found)
          if (updateIdx !== -1 && (origIdx === -1 || updateIdx < origIdx)) {
            recencyCorrect++;
          }
        }

        const recencyAccuracy = recencyCorrect / updatePairs.length;
        const updateRetrieval = updateFound / updatePairs.length;
        const score = (recencyAccuracy * 0.6 + updateRetrieval * 0.4) * 100;

        return {
          passed: recencyAccuracy >= 0.6,
          score,
          metrics: {
            testCases: updatePairs.length,
            recencyAccuracy,
            updateRetrievalRate: updateRetrieval,
            recencyCorrect,
            updateFound,
          },
          details: `LongMemEval knowledge updates: ${(recencyAccuracy * 100).toFixed(1)}% recency ranking, ${(updateRetrieval * 100).toFixed(1)}% update retrieval`,
        };
      },
    },
  ];
}

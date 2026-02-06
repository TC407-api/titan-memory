/**
 * LoCoMo-Compatible Benchmarks
 * Titan Memory v2.0 - Phase 3
 *
 * Tests temporal reasoning, multi-session memory, and entity tracking
 * following the LoCoMo benchmark methodology.
 */

import { BenchmarkDefinition } from './runner.js';
import { TitanMemory } from '../titan.js';
import { UnifiedQueryResult, MemoryEntry } from '../types.js';

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
 * Create LoCoMo-compatible benchmarks
 */
export function createLoComoBenchmarks(titan: TitanMemory): BenchmarkDefinition[] {
  return [
    {
      name: 'locomo-temporal-reasoning',
      category: 'accuracy',
      run: async () => {
        // Store time-ordered memories with explicit temporal markers
        const temporalMemories = [
          { content: 'On January 5th 2025, the team started the database migration project.', id: '' },
          { content: 'On January 12th 2025, we completed the schema design for the new database.', id: '' },
          { content: 'On January 19th 2025, the data migration scripts were written and tested.', id: '' },
          { content: 'On January 26th 2025, we began migrating production data in batches.', id: '' },
          { content: 'On February 2nd 2025, the migration encountered a data integrity issue with user records.', id: '' },
          { content: 'On February 9th 2025, the integrity issue was resolved by adding validation checks.', id: '' },
          { content: 'On February 16th 2025, all production data was successfully migrated.', id: '' },
          { content: 'On February 23rd 2025, the old database was decommissioned after verification.', id: '' },
          { content: 'On March 2nd 2025, post-migration performance monitoring showed 40% improvement.', id: '' },
          { content: 'On March 9th 2025, the migration project was officially closed with a retrospective.', id: '' },
        ];

        for (const mem of temporalMemories) {
          const result = await titan.add(mem.content, { tags: ['locomo-bench'] });
          mem.id = result.id;
        }

        // Temporal queries
        const temporalTests = [
          {
            query: 'What happened before the data integrity issue?',
            expectedIds: [temporalMemories[0].id, temporalMemories[1].id, temporalMemories[2].id, temporalMemories[3].id],
            description: 'Events before the integrity issue',
          },
          {
            query: 'What happened after the migration was completed?',
            expectedIds: [temporalMemories[7].id, temporalMemories[8].id, temporalMemories[9].id],
            description: 'Events after migration completion',
          },
          {
            query: 'What events occurred during February 2025?',
            expectedIds: [temporalMemories[4].id, temporalMemories[5].id, temporalMemories[6].id, temporalMemories[7].id],
            description: 'February events',
          },
        ];

        let totalScore = 0;
        for (const test of temporalTests) {
          const result = await titan.recall(test.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);
          const recall = calculateRecallAtK(retrievedIds, test.expectedIds, 5);
          totalScore += recall;
        }

        const avgScore = totalScore / temporalTests.length;
        const score = avgScore * 100;

        return {
          passed: avgScore >= 0.7,
          score,
          metrics: {
            testCases: temporalTests.length,
            avgTemporalRecall: avgScore,
            memoriesStored: temporalMemories.length,
          },
          details: `LoCoMo temporal reasoning: ${(avgScore * 100).toFixed(1)}% recall on temporal queries`,
        };
      },
    },

    {
      name: 'locomo-multi-session-memory',
      category: 'accuracy',
      run: async () => {
        // Store 3 batches with different session metadata
        const session1 = [
          { content: 'Session 1: Set up the React frontend with TypeScript and Vite bundler.', id: '' },
          { content: 'Session 1: Configured ESLint and Prettier for code formatting standards.', id: '' },
          { content: 'Session 1: Created the base component library with Button, Input, and Card.', id: '' },
        ];

        const session2 = [
          { content: 'Session 2: Implemented the REST API with Express and PostgreSQL connection.', id: '' },
          { content: 'Session 2: Added JWT authentication middleware for protected routes.', id: '' },
          { content: 'Session 2: Set up database migrations using Knex query builder.', id: '' },
        ];

        const session3 = [
          { content: 'Session 3: Connected frontend to backend API with Axios HTTP client.', id: '' },
          { content: 'Session 3: Implemented user login flow with token refresh mechanism.', id: '' },
          { content: 'Session 3: Deployed application to production using Docker containers.', id: '' },
        ];

        for (const mem of session1) {
          const result = await titan.add(mem.content, { tags: ['locomo-bench', 'session-1'] });
          mem.id = result.id;
        }
        for (const mem of session2) {
          const result = await titan.add(mem.content, { tags: ['locomo-bench', 'session-2'] });
          mem.id = result.id;
        }
        for (const mem of session3) {
          const result = await titan.add(mem.content, { tags: ['locomo-bench', 'session-3'] });
          mem.id = result.id;
        }

        // Cross-session queries
        const crossSessionTests = [
          {
            query: 'What frontend technologies were used?',
            expectedIds: [session1[0].id, session1[2].id, session3[0].id],
            description: 'Frontend tech across sessions',
          },
          {
            query: 'How was authentication implemented?',
            expectedIds: [session2[1].id, session3[1].id],
            description: 'Auth across sessions',
          },
          {
            query: 'What was the deployment strategy?',
            expectedIds: [session3[2].id],
            description: 'Deployment info',
          },
          {
            query: 'What database setup was done?',
            expectedIds: [session2[0].id, session2[2].id],
            description: 'Database setup',
          },
        ];

        let totalRecall = 0;
        for (const test of crossSessionTests) {
          const result = await titan.recall(test.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);
          const recall = calculateRecallAtK(retrievedIds, test.expectedIds, 5);
          totalRecall += recall;
        }

        const avgRecall = totalRecall / crossSessionTests.length;
        const score = avgRecall * 100;

        return {
          passed: avgRecall >= 0.6,
          score,
          metrics: {
            testCases: crossSessionTests.length,
            avgCrossSessionRecall: avgRecall,
            sessionsUsed: 3,
            totalMemories: session1.length + session2.length + session3.length,
          },
          details: `LoCoMo multi-session: ${(avgRecall * 100).toFixed(1)}% cross-session recall`,
        };
      },
    },

    {
      name: 'locomo-entity-tracking',
      category: 'accuracy',
      run: async () => {
        // Memories with overlapping entities (people, technologies)
        const entityMemories = [
          { content: 'Alice designed the microservices architecture using Kubernetes and Docker.', id: '' },
          { content: 'Bob implemented the payment service with Stripe integration in Node.js.', id: '' },
          { content: 'Alice reviewed Bob\'s payment code and suggested adding retry logic.', id: '' },
          { content: 'Charlie set up the CI/CD pipeline using GitHub Actions and Docker.', id: '' },
          { content: 'Bob and Charlie pair-programmed the notification service in Node.js.', id: '' },
          { content: 'Alice created the Kubernetes deployment manifests for all services.', id: '' },
          { content: 'Charlie optimized the Docker images to reduce build times by 60%.', id: '' },
          { content: 'Bob migrated the authentication from Firebase to custom JWT tokens.', id: '' },
        ];

        for (const mem of entityMemories) {
          const result = await titan.add(mem.content, { tags: ['locomo-bench'] });
          mem.id = result.id;
        }

        // Entity-based queries
        const entityTests = [
          {
            query: 'What did Alice work on?',
            expectedIds: [entityMemories[0].id, entityMemories[2].id, entityMemories[5].id],
            description: 'Alice entity tracking',
          },
          {
            query: 'What work involved Docker?',
            expectedIds: [entityMemories[0].id, entityMemories[3].id, entityMemories[6].id],
            description: 'Docker entity tracking',
          },
          {
            query: 'What did Bob build or implement?',
            expectedIds: [entityMemories[1].id, entityMemories[4].id, entityMemories[7].id],
            description: 'Bob entity tracking',
          },
          {
            query: 'What Node.js services were created?',
            expectedIds: [entityMemories[1].id, entityMemories[4].id],
            description: 'Node.js entity tracking',
          },
        ];

        let totalRecall = 0;
        for (const test of entityTests) {
          const result = await titan.recall(test.query, { limit: 5 });
          const retrievedIds = extractMemoryIds(result);
          const recall = calculateRecallAtK(retrievedIds, test.expectedIds, 5);
          totalRecall += recall;
        }

        const avgRecall = totalRecall / entityTests.length;
        const score = avgRecall * 100;

        return {
          passed: avgRecall >= 0.6,
          score,
          metrics: {
            testCases: entityTests.length,
            avgEntityRecall: avgRecall,
            entitiesTracked: 6, // Alice, Bob, Charlie, Docker, Kubernetes, Node.js
            memoriesStored: entityMemories.length,
          },
          details: `LoCoMo entity tracking: ${(avgRecall * 100).toFixed(1)}% entity-based recall`,
        };
      },
    },
  ];
}

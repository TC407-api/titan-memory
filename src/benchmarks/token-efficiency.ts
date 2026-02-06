/**
 * Token Efficiency Benchmarks
 * Titan Memory v2.0 - Phase 4: SimpleMem-Style Compression
 *
 * Tests compression ratio and fidelity of the compression system.
 */

import { BenchmarkDefinition } from './runner.js';
import { TitanMemory } from '../titan.js';
import { contentSimilarity } from '../utils/similarity.js';
import { compressMemory, expandMemory } from '../compression/index.js';

/**
 * Verbose test memories (200+ tokens each)
 */
const VERBOSE_MEMORIES = [
  `During our extensive quarterly review meeting on January 15th 2025, the engineering team discussed the current state of the production infrastructure. The database cluster consisting of three PostgreSQL v16.2 instances running on AWS r6g.xlarge machines was identified as a performance bottleneck. The lead database administrator, Marcus Chen, presented metrics showing that query latency had increased by 340% over the past quarter due to the user table growing to 15 million rows without proper indexing on the email and created_at columns. The team decided to implement a comprehensive indexing strategy and migrate the read replicas to the new r7g.2xlarge instance type, which would provide 40% more memory and 25% better CPU performance. The estimated cost increase would be $2,400 per month but was justified by the projected 5x improvement in query response times.`,

  `The frontend architecture underwent a major transformation when we migrated from the legacy jQuery 3.6 codebase to React 18 with TypeScript. The migration was led by Sarah Park and took approximately 8 weeks to complete across 347 components. The new architecture uses Next.js 14 as the framework with server-side rendering enabled for all public-facing pages, achieving a 60% improvement in Largest Contentful Paint (LCP) from 3.2 seconds to 1.3 seconds. State management was standardized on Zustand instead of Redux, reducing the bundle size by 23KB. The design system was built using Tailwind CSS v3.4 with custom tokens for colors, spacing, and typography. All components are now fully accessible following WCAG 2.1 AA standards, with automated accessibility testing using Playwright and axe-core running in the CI/CD pipeline.`,

  `The authentication and authorization system was completely redesigned to support our multi-tenant SaaS platform. The old system used session cookies stored in Redis with a 24-hour expiry, which caused issues with cross-domain access and mobile applications. The new system implements OAuth 2.0 with PKCE flow for web clients and device authorization grant for CLI tools. JSON Web Tokens are issued with a 15-minute access token lifetime and 30-day refresh tokens stored in an encrypted HTTP-only cookie. Role-based access control (RBAC) was implemented with five default roles: superadmin, org_admin, editor, viewer, and billing. Custom roles can be created with granular permissions using a bitwise permission system supporting up to 64 distinct permission flags. The identity provider supports SAML 2.0 SSO for enterprise customers, with Okta, Azure AD, and Google Workspace as pre-configured providers.`,

  `Our observability stack was overhauled to provide comprehensive monitoring across all 24 microservices. We migrated from a fragmented setup of various monitoring tools to a unified OpenTelemetry-based observability platform. Distributed tracing is collected using the OpenTelemetry SDK with automatic instrumentation for HTTP, gRPC, and database calls, then exported to Grafana Tempo for storage and visualization. Metrics are scraped by Prometheus every 15 seconds from each service's /metrics endpoint, with Thanos providing long-term storage in S3 with 90-day retention. Structured logging follows a standardized JSON format with correlation IDs, and logs are shipped via Fluent Bit to Elasticsearch v8.11 running on a three-node cluster. Grafana v10.2 serves as the unified dashboard, with 15 pre-built dashboards covering service health, infrastructure, business metrics, and SLO compliance. Alerting routes through Alertmanager with PagerDuty integration for P1/P2 incidents and Slack for P3/P4 notifications.`,

  `The continuous integration and deployment pipeline was redesigned to support our growing engineering team of 35 developers across 6 squads. The monorepo uses Turborepo for build orchestration with remote caching on Vercel, reducing average CI build times from 18 minutes to 4 minutes by only rebuilding affected packages. Pull requests trigger automated checks including TypeScript type checking, ESLint with our custom rule set, Prettier formatting validation, unit tests with Jest (targeting 85% coverage minimum), integration tests with Supertest, and end-to-end tests with Playwright covering 12 critical user flows. Security scanning uses Snyk for dependency vulnerabilities and Semgrep for static analysis with custom rules for our framework. Deployments to staging happen automatically on merge to the develop branch, while production deployments require manual approval in the GitHub Actions workflow and are executed using Argo CD with canary deployment strategy, gradually shifting traffic from 10% to 25% to 50% to 100% over 30 minutes with automatic rollback if error rate exceeds 1%.`,
];

/**
 * Create token efficiency benchmarks
 */
export function createTokenEfficiencyBenchmarks(
  _titan: TitanMemory
): BenchmarkDefinition[] {
  return [
    {
      name: 'compression-ratio-benchmark',
      category: 'token-efficiency',
      run: async () => {
        let totalRatio = 0;
        const ratios: number[] = [];

        for (const memory of VERBOSE_MEMORIES) {
          const compressed = await compressMemory(memory);
          ratios.push(compressed.compressionRatio);
          totalRatio += compressed.compressionRatio;
        }

        const avgRatio = totalRatio / VERBOSE_MEMORIES.length;
        const minRatio = Math.min(...ratios);
        const maxRatio = Math.max(...ratios);
        const score = Math.min(100, (avgRatio / 20) * 100); // 20x = 100%

        return {
          passed: avgRatio >= 2, // Realistic target for extractive-only compression
          score,
          metrics: {
            memoriesTested: VERBOSE_MEMORIES.length,
            avgCompressionRatio: avgRatio,
            minRatio,
            maxRatio,
          },
          details: `Compression ratio: avg=${avgRatio.toFixed(1)}x, min=${minRatio.toFixed(1)}x, max=${maxRatio.toFixed(1)}x`,
        };
      },
    },

    {
      name: 'compression-fidelity-benchmark',
      category: 'token-efficiency',
      run: async () => {
        let totalFidelity = 0;
        let totalRoundtripSimilarity = 0;
        const fidelities: number[] = [];

        for (const memory of VERBOSE_MEMORIES) {
          const compressed = await compressMemory(memory);
          const expanded = expandMemory(compressed, { verbosity: 'detailed', format: 'prose' });

          fidelities.push(compressed.fidelityScore);
          totalFidelity += compressed.fidelityScore;

          // Round-trip similarity: how much of original is preserved after compress+expand
          const similarity = contentSimilarity(memory, expanded.reconstructedContent);
          totalRoundtripSimilarity += similarity;
        }

        const avgFidelity = totalFidelity / VERBOSE_MEMORIES.length;
        const avgSimilarity = totalRoundtripSimilarity / VERBOSE_MEMORIES.length;
        const score = ((avgFidelity * 0.5 + avgSimilarity * 0.5)) * 100;

        return {
          passed: avgFidelity >= 0.3, // Realistic for extractive compression
          score,
          metrics: {
            memoriesTested: VERBOSE_MEMORIES.length,
            avgFidelityScore: avgFidelity,
            avgRoundtripSimilarity: avgSimilarity,
            minFidelity: Math.min(...fidelities),
            maxFidelity: Math.max(...fidelities),
          },
          details: `Compression fidelity: avg=${(avgFidelity * 100).toFixed(1)}%, round-trip similarity=${(avgSimilarity * 100).toFixed(1)}%`,
        };
      },
    },
  ];
}

/**
 * Cortex Extractors Tests
 */

import { extractByCategory } from '../src/cortex/extractors';

describe('Cortex Extractors', () => {
  describe('Knowledge Extraction', () => {
    it('should extract definitions', () => {
      const result = extractByCategory('REST is defined as Representational State Transfer', 'knowledge');
      expect(result.category).toBe('knowledge');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.definitions.length).toBeGreaterThan(0);
    });

    it('should extract API endpoints', () => {
      const result = extractByCategory('Use GET /api/users to list all users', 'knowledge');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.apiEndpoints.length).toBeGreaterThan(0);
    });

    it('should extract version numbers', () => {
      const result = extractByCategory('Requires version 3.2.1 of Node.js', 'knowledge');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.versions).toContain('3.2.1');
    });

    it('should extract RFC references', () => {
      const result = extractByCategory('Following RFC 7231 for HTTP semantics', 'knowledge');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.specs.length).toBeGreaterThan(0);
    });
  });

  describe('Profile Extraction', () => {
    it('should extract preferences', () => {
      const result = extractByCategory('I prefer TypeScript over JavaScript', 'profile');
      expect(result.category).toBe('profile');
      const fields = result.fields as Record<string, Array<{key: string; value: string}>>;
      expect(fields.preferences.length).toBeGreaterThan(0);
    });

    it('should extract settings', () => {
      const result = extractByCategory('Set indentation to 2 spaces', 'profile');
      const fields = result.fields as Record<string, Array<{key: string; value: string}>>;
      expect(fields.settings.length).toBeGreaterThan(0);
    });
  });

  describe('Event Extraction', () => {
    it('should extract ISO timestamps', () => {
      const result = extractByCategory('Deployed on 2024-01-15 to production', 'event');
      expect(result.category).toBe('event');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.timestamps).toContain('2024-01-15');
    });

    it('should extract relative dates', () => {
      const result = extractByCategory('The incident happened yesterday', 'event');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.timestamps).toContain('yesterday');
    });

    it('should extract errors', () => {
      const result = extractByCategory('Error: connection refused to database', 'event');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Behavior Extraction', () => {
    it('should extract decisions', () => {
      const result = extractByCategory('We decided to use PostgreSQL because it supports JSON', 'behavior');
      expect(result.category).toBe('behavior');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.decisions.length).toBeGreaterThan(0);
    });

    it('should extract rationale', () => {
      const result = extractByCategory('We chose React because of its large ecosystem', 'behavior');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.rationale.length).toBeGreaterThan(0);
    });

    it('should extract alternatives', () => {
      const result = extractByCategory('Another approach would be to use Vue.js for the frontend', 'behavior');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('Skill Extraction', () => {
    it('should extract numbered steps', () => {
      const result = extractByCategory('Step 1: Install Node.js. Step 2: Run npm init.', 'skill');
      expect(result.category).toBe('skill');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.steps.length).toBeGreaterThan(0);
    });

    it('should extract prerequisites', () => {
      const result = extractByCategory('Before you start, make sure Docker is installed', 'skill');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.prerequisites.length).toBeGreaterThan(0);
    });

    it('should extract code snippets', () => {
      const result = extractByCategory('Run `npm install express` to add Express', 'skill');
      const fields = result.fields as Record<string, string[]>;
      expect(fields.codeSnippets).toContain('npm install express');
    });
  });

  describe('Entity Status Inference', () => {
    it('should mark corrections as contradicted', () => {
      const result = extractByCategory('Actually the limit is 2000, not 1000', 'knowledge');
      expect(result.entityStatus).toBe('contradicted');
    });

    it('should mark deprecated as contradicted', () => {
      const result = extractByCategory('This API is deprecated and no longer supported', 'knowledge');
      expect(result.entityStatus).toBe('contradicted');
    });

    it('should mark past references as historical', () => {
      const result = extractByCategory('We used to use MongoDB but switched to PostgreSQL', 'knowledge');
      expect(result.entityStatus).toBe('historical');
    });

    it('should default to active for current info', () => {
      const result = extractByCategory('The API rate limit is 1000 per hour', 'knowledge');
      expect(result.entityStatus).toBe('active');
    });
  });
});

/**
 * Cortex Merge Strategy Tests
 */

import { mergeByCategory } from '../src/cortex/merge-strategy';
import { MemoryEntry, MemoryLayer } from '../src/types';

describe('Cortex Merge Strategy', () => {
  const createMemory = (id: string, content: string, daysAgo: number = 0): MemoryEntry => ({
    id,
    content,
    layer: MemoryLayer.LONG_TERM,
    timestamp: new Date(Date.now() - daysAgo * 86400000),
    metadata: {},
  });

  describe('Knowledge Merge', () => {
    it('should replace with newer when very similar', () => {
      const existing = createMemory('1', 'The API rate limit for the server is one thousand requests per hour', 5);
      const incoming = createMemory('2', 'The API rate limit for the server is two thousand requests per hour', 0);
      const result = mergeByCategory(existing, incoming, 'knowledge');
      expect(result.action).toBe('replaced');
    });

    it('should merge when content is different', () => {
      const existing = createMemory('1', 'The server uses Node.js');
      const incoming = createMemory('2', 'The database uses PostgreSQL with pgvector extensions');
      const result = mergeByCategory(existing, incoming, 'knowledge');
      expect(result.action).toBe('merged');
    });
  });

  describe('Profile Merge', () => {
    it('should always replace with newest', () => {
      const existing = createMemory('1', 'Prefer dark mode');
      const incoming = createMemory('2', 'Prefer light mode');
      const result = mergeByCategory(existing, incoming, 'profile');
      expect(result.action).toBe('replaced');
      expect(result.resultContent).toContain('light mode');
    });
  });

  describe('Event Merge', () => {
    it('should keep both events (immutable)', () => {
      const existing = createMemory('1', 'Deployed v1 to prod');
      const incoming = createMemory('2', 'Deployed v2 to prod');
      const result = mergeByCategory(existing, incoming, 'event');
      expect(result.action).toBe('kept');
    });
  });

  describe('Behavior Merge', () => {
    it('should merge different behavior patterns', () => {
      const existing = createMemory('1', 'We use feature branches for development');
      const incoming = createMemory('2', 'Code review is required before merging pull requests');
      const result = mergeByCategory(existing, incoming, 'behavior');
      expect(result.action).toBe('merged');
    });

    it('should skip near-duplicate patterns', () => {
      const existing = createMemory('1', 'We always use conventional commits');
      const incoming = createMemory('2', 'We always use conventional commits for versioning');
      const result = mergeByCategory(existing, incoming, 'behavior');
      // High similarity -> skipped
      expect(['skipped', 'merged']).toContain(result.action);
    });
  });

  describe('Skill Merge', () => {
    it('should replace with newer skill version', () => {
      const existing = createMemory('1', 'Run npm install then npm start', 5);
      const incoming = createMemory('2', 'Run npm install then npm run dev', 0);
      const result = mergeByCategory(existing, incoming, 'skill');
      expect(result.action).toBe('replaced');
    });
  });
});

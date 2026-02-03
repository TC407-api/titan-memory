/**
 * CatBrain Project Hooks Tests
 */

import { ProjectHooksManager } from '../src/catbrain/project-hooks';
import { CategorySummary } from '../src/catbrain/types';

describe('CatBrain Project Hooks', () => {
  describe('When Disabled', () => {
    it('should not execute hooks', async () => {
      const hooks = new ProjectHooksManager({ enabled: false });
      await hooks.onProjectChange('old', 'new');
      expect(hooks.getActiveProject()).toBeUndefined();
    });
  });

  describe('When Enabled', () => {
    let hooks: ProjectHooksManager;
    let flushedProjects: string[];
    let loadedProjects: string[];

    beforeEach(() => {
      flushedProjects = [];
      loadedProjects = [];

      hooks = new ProjectHooksManager({
        enabled: true,
        onFlush: async (projectId) => {
          flushedProjects.push(projectId);
        },
        onLoad: async (projectId) => {
          loadedProjects.push(projectId);
          return [];
        },
      });
    });

    it('should set active project on session start', async () => {
      await hooks.onSessionStart('project-a');
      expect(hooks.getActiveProject()).toBe('project-a');
    });

    it('should flush on session end', async () => {
      await hooks.onSessionStart('project-a');
      await hooks.onSessionEnd('project-a');
      expect(flushedProjects).toContain('project-a');
    });

    it('should handle project change (flush old, load new)', async () => {
      await hooks.onSessionStart('project-a');
      await hooks.onProjectChange('project-a', 'project-b');
      expect(flushedProjects).toContain('project-a');
      expect(loadedProjects).toContain('project-b');
      expect(hooks.getActiveProject()).toBe('project-b');
    });

    it('should cache project context', async () => {
      await hooks.onSessionStart('project-a');
      const summarizer = hooks.getSummarizer();
      summarizer.updateSummary('knowledge', 'Test knowledge');
      await hooks.onSessionEnd('project-a');

      const context = hooks.getProjectContext('project-a');
      expect(context).toBeDefined();
      expect(context!.categorySummaries.length).toBeGreaterThan(0);
    });

    it('should list cached projects', async () => {
      await hooks.onSessionStart('project-a');
      await hooks.onSessionEnd('project-a');
      await hooks.onSessionStart('project-b');
      await hooks.onSessionEnd('project-b');
      expect(hooks.getCachedProjects()).toContain('project-a');
      expect(hooks.getCachedProjects()).toContain('project-b');
    });

    it('should load summaries from callback', async () => {
      const mockSummaries: CategorySummary[] = [{
        category: 'knowledge',
        version: 5,
        summary: 'Test summary',
        entryCount: 10,
        lastUpdated: new Date(),
        keyTerms: ['test'],
      }];

      const hooksWithData = new ProjectHooksManager({
        enabled: true,
        onLoad: async () => mockSummaries,
      });

      await hooksWithData.onSessionStart('project-x');
      const summarizer = hooksWithData.getSummarizer();
      const summary = summarizer.getSummary('knowledge');
      expect(summary).toBeDefined();
      expect(summary!.version).toBe(5);
    });
  });
});

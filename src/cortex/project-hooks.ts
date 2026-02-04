/**
 * Cortex Project Hooks
 * Auto-recall/flush on directory change (Astral uv integration)
 */

import { CategorySummary } from './types.js';
import { CategorySummarizer } from './summarizer.js';

/**
 * Project context for hooks
 */
export interface ProjectContext {
  projectId: string;
  categorySummaries: CategorySummary[];
  lastAccessed: Date;
}

/**
 * Project Hooks Manager
 */
export class ProjectHooksManager {
  private enabled: boolean;
  private contexts: Map<string, ProjectContext> = new Map();
  private activeProjectId?: string;
  private summarizer: CategorySummarizer;
  private onFlushCallback?: (projectId: string, summaries: CategorySummary[]) => Promise<void>;
  private onLoadCallback?: (projectId: string) => Promise<CategorySummary[]>;

  constructor(options?: {
    enabled?: boolean;
    onFlush?: (projectId: string, summaries: CategorySummary[]) => Promise<void>;
    onLoad?: (projectId: string) => Promise<CategorySummary[]>;
  }) {
    this.enabled = options?.enabled ?? false;
    this.summarizer = new CategorySummarizer();
    this.onFlushCallback = options?.onFlush;
    this.onLoadCallback = options?.onLoad;
  }

  /**
   * Handle project change
   */
  async onProjectChange(oldProjectId: string | undefined, newProjectId: string): Promise<void> {
    if (!this.enabled) return;

    // Flush old project context
    if (oldProjectId) {
      await this.onSessionEnd(oldProjectId);
    }

    // Load new project context
    await this.onSessionStart(newProjectId);
  }

  /**
   * Handle session start for a project
   */
  async onSessionStart(projectId: string): Promise<void> {
    if (!this.enabled) return;

    this.activeProjectId = projectId;

    // Load project-specific category summaries
    let summaries: CategorySummary[] = [];

    if (this.onLoadCallback) {
      summaries = await this.onLoadCallback(projectId);
    }

    // Check if we have cached context
    const cached = this.contexts.get(projectId);
    if (cached) {
      summaries = cached.categorySummaries;
    }

    // Load summaries into the summarizer
    if (summaries.length > 0) {
      this.summarizer.loadSummaries(summaries);
    }

    // Update context
    this.contexts.set(projectId, {
      projectId,
      categorySummaries: summaries,
      lastAccessed: new Date(),
    });
  }

  /**
   * Handle session end
   */
  async onSessionEnd(projectId?: string): Promise<void> {
    if (!this.enabled) return;

    const targetProject = projectId || this.activeProjectId;
    if (!targetProject) return;

    // Export current summaries
    const summaries = this.summarizer.exportSummaries();

    // Save to context cache
    this.contexts.set(targetProject, {
      projectId: targetProject,
      categorySummaries: summaries,
      lastAccessed: new Date(),
    });

    // Flush via callback
    if (this.onFlushCallback) {
      await this.onFlushCallback(targetProject, summaries);
    }
  }

  /**
   * Get the current active project
   */
  getActiveProject(): string | undefined {
    return this.activeProjectId;
  }

  /**
   * Get context for a specific project
   */
  getProjectContext(projectId: string): ProjectContext | undefined {
    return this.contexts.get(projectId);
  }

  /**
   * Get the category summarizer
   */
  getSummarizer(): CategorySummarizer {
    return this.summarizer;
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get all cached project IDs
   */
  getCachedProjects(): string[] {
    return [...this.contexts.keys()];
  }
}

/**
 * Titan Memory Skill Watcher
 * File watcher for hot-reload of skills using chokidar
 */

import { watch, FSWatcher } from 'chokidar';
import path from 'path';
import { reloadSkill, unloadSkill, getDefaultSkillsDir } from './loader.js';
import { getSkillRegistry } from './registry.js';
// SkillEvent and SkillEventListener imported for type reference only

export interface SkillWatcherOptions {
  /** Directory to watch for skills */
  skillsDir?: string;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
  /** File patterns to watch */
  patterns?: string[];
  /** Directories to ignore */
  ignored?: string[];
  /** Auto-start watching */
  autoStart?: boolean;
}

type WatcherEvent = 'loaded' | 'unloaded' | 'reloaded' | 'error';
type WatcherCallback = (name: string, path?: string, error?: Error) => void;

/**
 * Skill Watcher
 * Watches skill directories and hot-reloads on changes
 */
export class SkillWatcher {
  private watcher: FSWatcher | null = null;
  private skillsDir: string;
  private debounceMs: number;
  private patterns: string[];
  private ignored: string[];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<WatcherEvent, WatcherCallback[]> = new Map();
  private isRunning = false;

  constructor(options: SkillWatcherOptions = {}) {
    this.skillsDir = options.skillsDir || getDefaultSkillsDir();
    this.debounceMs = options.debounceMs ?? 500;
    this.patterns = options.patterns || ['**/*.ts', '**/*.js', '**/*.skill.md'];
    this.ignored = options.ignored || [
      '**/node_modules/**',
      '**/.disabled/**',
      '**/dist/**',
      '**/*.d.ts',
    ];

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    const watchPatterns = this.patterns.map((p) =>
      path.join(this.skillsDir, p).replace(/\\/g, '/')
    );

    this.watcher = watch(watchPatterns, {
      ignored: this.ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleFileChange('add', filePath))
      .on('change', (filePath) => this.handleFileChange('change', filePath))
      .on('unlink', (filePath) => this.handleFileUnlink(filePath))
      .on('error', (error) => this.emit('error', 'watcher', undefined, error as Error));

    this.isRunning = true;
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.watcher) {
      return;
    }

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    await this.watcher.close();
    this.watcher = null;
    this.isRunning = false;
  }

  /**
   * Check if watcher is running
   */
  isWatching(): boolean {
    return this.isRunning;
  }

  /**
   * Register event callback
   */
  on(event: WatcherEvent, callback: WatcherCallback): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  /**
   * Remove event callback
   */
  off(event: WatcherEvent, callback: WatcherCallback): void {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Handle file add/change events with debouncing
   */
  private handleFileChange(eventType: 'add' | 'change', filePath: string): void {
    // Clear existing timer for this file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new debounced timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);

      try {
        const skillFile = await reloadSkill(filePath);

        if (skillFile) {
          const eventName = eventType === 'add' ? 'loaded' : 'reloaded';
          this.emit(eventName, skillFile.metadata.name, filePath);
        }
      } catch (error) {
        this.emit('error', filePath, filePath, error as Error);
      }
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle file deletion
   */
  private async handleFileUnlink(filePath: string): Promise<void> {
    // Clear any pending debounce timer
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(filePath);
    }

    // Find skill by path and unload
    const registry = getSkillRegistry();
    for (const metadata of registry.list()) {
      const file = registry.getFile(metadata.name);
      if (file && file.path === filePath) {
        try {
          await unloadSkill(metadata.name);
          this.emit('unloaded', metadata.name, filePath);
        } catch (error) {
          this.emit('error', metadata.name, filePath, error as Error);
        }
        break;
      }
    }
  }

  /**
   * Emit event to callbacks
   */
  private emit(
    event: WatcherEvent,
    name: string,
    filePath?: string,
    error?: Error
  ): void {
    const callbacks = this.callbacks.get(event) || [];
    for (const callback of callbacks) {
      try {
        callback(name, filePath, error);
      } catch (err) {
        console.warn('Skill watcher callback error:', err);
      }
    }
  }

  /**
   * Get watched directory
   */
  getWatchedDirectory(): string {
    return this.skillsDir;
  }
}

// Singleton instance
let watcherInstance: SkillWatcher | null = null;

export function getSkillWatcher(options?: SkillWatcherOptions): SkillWatcher {
  if (!watcherInstance) {
    watcherInstance = new SkillWatcher(options);
  }
  return watcherInstance;
}

export function resetSkillWatcher(): void {
  if (watcherInstance) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}

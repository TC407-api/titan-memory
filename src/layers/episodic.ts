/**
 * Layer 5: Episodic Memory (Clawdbot-inspired)
 * Daily session logs with timestamps, pre-compaction auto-capture,
 * and human-curated MEMORY.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseMemoryLayer } from './base.js';
import { MemoryEntry, MemoryLayer, QueryOptions, QueryResult, CompactionContext } from '../types.js';
import { getConfig } from '../utils/config.js';
import { extractInsights, scoreImportance } from '../utils/surprise.js';
import { lshHash } from '../utils/hash.js';

interface EpisodeEntry {
  id: string;
  timestamp: Date;
  content: string;
  sessionId: string;
  projectId?: string;
  tags: string[];
  importance: number;
  source: 'auto' | 'manual' | 'compaction';
}

interface DailyLog {
  date: string;
  entries: EpisodeEntry[];
  summary?: string;
}

export class EpisodicMemoryLayer extends BaseMemoryLayer {
  private logs: Map<string, DailyLog> = new Map(); // date string -> log
  private curatedMemory: string[] = []; // Lines from MEMORY.md
  private indexedContent: Map<string, string[]> = new Map(); // id -> LSH sigs

  constructor() {
    super(MemoryLayer.EPISODIC);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = getConfig();

    // Ensure directories exist
    if (!fs.existsSync(config.episodicDir)) {
      fs.mkdirSync(config.episodicDir, { recursive: true });
    }

    // Load existing daily logs
    await this.loadLogs();

    // Load curated MEMORY.md
    await this.loadCuratedMemory();

    this.initialized = true;
  }

  private async loadLogs(): Promise<void> {
    const config = getConfig();

    const files = fs.readdirSync(config.episodicDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(config.episodicDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const date = file.replace('.json', '');

          const log: DailyLog = {
            date,
            entries: (data.entries || []).map((e: Record<string, unknown>) => ({
              ...e,
              timestamp: new Date(e.timestamp as string),
            })),
            summary: data.summary,
          };

          this.logs.set(date, log);

          // Index entries
          for (const entry of log.entries) {
            this.indexedContent.set(entry.id, lshHash(entry.content));
          }
        } catch (error) {
          console.warn(`Failed to load log ${file}:`, error);
        }
      }
    }
  }

  private async loadCuratedMemory(): Promise<void> {
    const config = getConfig();

    if (fs.existsSync(config.memoryMdPath)) {
      const content = fs.readFileSync(config.memoryMdPath, 'utf-8');
      this.curatedMemory = content
        .split('\n')
        .filter(line => line.trim().length > 0 && !line.startsWith('#'));
    } else {
      // Create default MEMORY.md
      await this.initializeMemoryMd();
    }
  }

  private async initializeMemoryMd(): Promise<void> {
    const config = getConfig();
    const template = `# MEMORY.md - Curated Knowledge

This file contains human-vetted, critical knowledge that should always be available.
Edit this file to add or remove curated memories.

## User Preferences


## Project Patterns


## Important Decisions


## Common Solutions


## Notes

`;
    fs.writeFileSync(config.memoryMdPath, template);
    this.curatedMemory = [];
  }

  private async saveLog(date: string): Promise<void> {
    const config = getConfig();
    const log = this.logs.get(date);
    if (!log) return;

    const filePath = path.join(config.episodicDir, `${date}.json`);
    fs.writeFileSync(filePath, JSON.stringify(log, null, 2));
  }

  private getDateString(date: Date = new Date()): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'layer'>): Promise<MemoryEntry> {
    const id = uuidv4();
    const date = this.getDateString(entry.timestamp);

    // Get or create today's log
    if (!this.logs.has(date)) {
      this.logs.set(date, { date, entries: [] });
    }
    const log = this.logs.get(date)!;

    const episode: EpisodeEntry = {
      id,
      timestamp: entry.timestamp,
      content: entry.content,
      sessionId: (entry.metadata?.sessionId as string) || 'unknown',
      projectId: entry.metadata?.projectId as string,
      tags: (entry.metadata?.tags as string[]) || [],
      importance: scoreImportance(entry.content),
      source: (entry.metadata?.source as 'auto' | 'manual' | 'compaction') || 'auto',
    };

    log.entries.push(episode);

    // Index for search
    this.indexedContent.set(id, lshHash(entry.content));

    // Save to disk
    await this.saveLog(date);

    return {
      id,
      content: entry.content,
      layer: MemoryLayer.EPISODIC,
      timestamp: entry.timestamp,
      metadata: {
        ...entry.metadata,
        episodeDate: date,
        curated: false,
      },
    };
  }

  /**
   * Pre-compaction flush - save important context before compaction
   */
  async flushPreCompaction(context: CompactionContext): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];
    const now = new Date();

    // Store important insights
    const insights = extractInsights(context.importantInsights.join('\n'));

    for (const decision of [...context.decisions, ...insights.decisions]) {
      entries.push(await this.store({
        content: `[Decision] ${decision}`,
        timestamp: now,
        metadata: {
          sessionId: context.sessionId,
          source: 'compaction',
          tags: ['decision', 'pre-compaction'],
        },
      }));
    }

    for (const error of [...context.errors, ...insights.errors]) {
      entries.push(await this.store({
        content: `[Error] ${error}`,
        timestamp: now,
        metadata: {
          sessionId: context.sessionId,
          source: 'compaction',
          tags: ['error', 'pre-compaction'],
        },
      }));
    }

    for (const solution of [...context.solutions, ...insights.solutions]) {
      entries.push(await this.store({
        content: `[Solution] ${solution}`,
        timestamp: now,
        metadata: {
          sessionId: context.sessionId,
          source: 'compaction',
          tags: ['solution', 'pre-compaction'],
        },
      }));
    }

    for (const learning of insights.learnings) {
      entries.push(await this.store({
        content: `[Learning] ${learning}`,
        timestamp: now,
        metadata: {
          sessionId: context.sessionId,
          source: 'compaction',
          tags: ['learning', 'pre-compaction'],
        },
      }));
    }

    return entries;
  }

  async query(queryText: string, options?: QueryOptions): Promise<QueryResult> {
    const startTime = performance.now();
    const limit = options?.limit || 10;
    const querySigs = new Set(lshHash(queryText));

    const results: Array<{ entry: EpisodeEntry; date: string; score: number }> = [];

    // Search through logs
    for (const [date, log] of this.logs) {
      // Apply date range filter if specified
      if (options?.dateRange) {
        const logDate = new Date(date);
        if (logDate < options.dateRange.start || logDate > options.dateRange.end) {
          continue;
        }
      }

      for (const entry of log.entries) {
        // Apply project filter
        if (options?.projectId && entry.projectId !== options.projectId) {
          continue;
        }

        // Apply tag filter
        if (options?.tags?.length && !options.tags.some(t => entry.tags.includes(t))) {
          continue;
        }

        // Calculate similarity
        const entrySigs = this.indexedContent.get(entry.id) || lshHash(entry.content);
        const entrySigSet = new Set(entrySigs);
        const intersection = new Set([...querySigs].filter(x => entrySigSet.has(x)));
        const union = new Set([...querySigs, ...entrySigSet]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        if (similarity > 0.1) {
          results.push({
            entry,
            date,
            score: similarity * entry.importance,
          });
        }
      }
    }

    // Also search curated memory
    const curatedResults = this.searchCurated(queryText, querySigs);
    const curatedEntries = curatedResults.map((r, idx) => ({
      entry: {
        id: `curated_${idx}`,
        timestamp: new Date(),
        content: r.content,
        sessionId: 'curated',
        tags: ['curated'],
        importance: 1.0, // Curated = high importance
        source: 'manual' as const,
      },
      date: 'curated',
      score: r.score * 1.5, // Boost curated content
    }));

    // Combine and sort
    const allResults = [...results, ...curatedEntries]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const queryTimeMs = performance.now() - startTime;

    return {
      memories: allResults.map(r => ({
        id: r.entry.id,
        content: r.entry.content,
        layer: MemoryLayer.EPISODIC,
        timestamp: r.entry.timestamp,
        metadata: {
          episodeDate: r.date,
          sessionId: r.entry.sessionId,
          tags: r.entry.tags,
          importance: r.entry.importance,
          curated: r.date === 'curated',
        },
      })),
      layer: MemoryLayer.EPISODIC,
      queryTimeMs,
      totalFound: allResults.length,
    };
  }

  private searchCurated(_query: string, querySigs: Set<string>): Array<{ content: string; score: number }> {
    return this.curatedMemory
      .map(line => {
        const lineSigs = new Set(lshHash(line));
        const intersection = new Set([...querySigs].filter(x => lineSigs.has(x)));
        const union = new Set([...querySigs, ...lineSigs]);
        const score = union.size > 0 ? intersection.size / union.size : 0;
        return { content: line, score };
      })
      .filter(r => r.score > 0.1)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get entries for a specific date
   */
  async getByDate(date: string | Date): Promise<MemoryEntry[]> {
    const dateStr = typeof date === 'string' ? date : this.getDateString(date);
    const log = this.logs.get(dateStr);

    if (!log) return [];

    return log.entries.map(entry => ({
      id: entry.id,
      content: entry.content,
      layer: MemoryLayer.EPISODIC,
      timestamp: entry.timestamp,
      metadata: {
        episodeDate: dateStr,
        sessionId: entry.sessionId,
        projectId: entry.projectId,
        tags: entry.tags,
        importance: entry.importance,
        curated: false,
      },
    }));
  }

  /**
   * Get today's entries
   */
  async getToday(): Promise<MemoryEntry[]> {
    return this.getByDate(new Date());
  }

  /**
   * Add to curated MEMORY.md
   */
  async addToCurated(content: string, section?: string): Promise<void> {
    const config = getConfig();
    let memoryMd = fs.readFileSync(config.memoryMdPath, 'utf-8');

    if (section) {
      // Find section and append
      const sectionRegex = new RegExp(`(## ${section}[^#]*)`, 's');
      const match = memoryMd.match(sectionRegex);
      if (match) {
        memoryMd = memoryMd.replace(
          sectionRegex,
          `$1\n- ${content}`
        );
      } else {
        // Add new section
        memoryMd += `\n## ${section}\n\n- ${content}\n`;
      }
    } else {
      // Append to Notes section
      const notesRegex = /(## Notes[^#]*)/s;
      const match = memoryMd.match(notesRegex);
      if (match) {
        memoryMd = memoryMd.replace(
          notesRegex,
          `$1\n- ${content}`
        );
      } else {
        memoryMd += `\n- ${content}\n`;
      }
    }

    fs.writeFileSync(config.memoryMdPath, memoryMd);
    this.curatedMemory.push(content);
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary(date: string): Promise<string> {
    const log = this.logs.get(date);
    if (!log) return '';

    const decisions = log.entries.filter(e => e.tags.includes('decision'));
    const errors = log.entries.filter(e => e.tags.includes('error'));
    const solutions = log.entries.filter(e => e.tags.includes('solution'));
    const learnings = log.entries.filter(e => e.tags.includes('learning'));

    const summary = [
      `# Session Summary for ${date}`,
      '',
      `Total entries: ${log.entries.length}`,
      '',
      decisions.length > 0 ? `## Decisions (${decisions.length})` : '',
      ...decisions.map(d => `- ${d.content.replace('[Decision] ', '')}`),
      '',
      errors.length > 0 ? `## Errors (${errors.length})` : '',
      ...errors.map(e => `- ${e.content.replace('[Error] ', '')}`),
      '',
      solutions.length > 0 ? `## Solutions (${solutions.length})` : '',
      ...solutions.map(s => `- ${s.content.replace('[Solution] ', '')}`),
      '',
      learnings.length > 0 ? `## Learnings (${learnings.length})` : '',
      ...learnings.map(l => `- ${l.content.replace('[Learning] ', '')}`),
    ].filter(line => line !== '').join('\n');

    // Save summary to log
    log.summary = summary;
    await this.saveLog(date);

    return summary;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    // Check if it's a curated entry
    if (id.startsWith('curated_')) {
      const idx = parseInt(id.replace('curated_', ''));
      if (this.curatedMemory[idx]) {
        return {
          id,
          content: this.curatedMemory[idx],
          layer: MemoryLayer.EPISODIC,
          timestamp: new Date(),
          metadata: { curated: true },
        };
      }
      return null;
    }

    // Search through all logs
    for (const log of this.logs.values()) {
      const entry = log.entries.find(e => e.id === id);
      if (entry) {
        return {
          id: entry.id,
          content: entry.content,
          layer: MemoryLayer.EPISODIC,
          timestamp: entry.timestamp,
          metadata: {
            episodeDate: log.date,
            sessionId: entry.sessionId,
            projectId: entry.projectId,
            tags: entry.tags,
            importance: entry.importance,
            curated: false,
          },
        };
      }
    }

    return null;
  }

  async delete(id: string): Promise<boolean> {
    for (const [date, log] of this.logs) {
      const idx = log.entries.findIndex(e => e.id === id);
      if (idx !== -1) {
        log.entries.splice(idx, 1);
        this.indexedContent.delete(id);
        await this.saveLog(date);
        return true;
      }
    }
    return false;
  }

  async count(): Promise<number> {
    let count = 0;
    for (const log of this.logs.values()) {
      count += log.entries.length;
    }
    return count + this.curatedMemory.length;
  }

  /**
   * Get available dates
   */
  async getAvailableDates(): Promise<string[]> {
    return [...this.logs.keys()].sort().reverse();
  }

  async close(): Promise<void> {
    // Save all logs
    for (const date of this.logs.keys()) {
      await this.saveLog(date);
    }
    this.logs.clear();
    this.curatedMemory = [];
    this.indexedContent.clear();
    this.initialized = false;
  }
}

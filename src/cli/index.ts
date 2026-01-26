#!/usr/bin/env node
/**
 * Titan Memory CLI
 * Command-line interface for the cognitive memory system
 */

import { Command } from 'commander';
import { initTitan } from '../titan.js';
import { MemoryLayer, CompactionContext } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

const program = new Command();

program
  .name('titan')
  .description('Titan Memory - Universal Cognitive Memory Layer')
  .version('1.0.0');

// Add command
program
  .command('add <content>')
  .description('Add a memory')
  .option('-l, --layer <layer>', 'Target layer (factual, longterm, semantic, episodic)')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-p, --project <project>', 'Project ID')
  .option('--curate', 'Add to curated MEMORY.md')
  .option('-s, --section <section>', 'MEMORY.md section (with --curate)')
  .action(async (content: string, options) => {
    try {
      const titan = await initTitan();

      if (options.curate) {
        await titan.curate(content, options.section);
        console.log('Added to MEMORY.md');
        await titan.close();
        return;
      }

      const metadata: Record<string, unknown> = {};
      if (options.tags) {
        metadata.tags = options.tags.split(',').map((t: string) => t.trim());
      }
      if (options.project) {
        metadata.projectId = options.project;
      }

      let result;
      if (options.layer) {
        const layerMap: Record<string, MemoryLayer> = {
          factual: MemoryLayer.FACTUAL,
          longterm: MemoryLayer.LONG_TERM,
          semantic: MemoryLayer.SEMANTIC,
          episodic: MemoryLayer.EPISODIC,
        };
        const layer = layerMap[options.layer.toLowerCase()];
        if (!layer) {
          console.error(`Invalid layer: ${options.layer}`);
          process.exit(1);
        }
        result = await titan.addToLayer(layer, content, metadata);
      } else {
        result = await titan.add(content, metadata);
      }

      console.log(`Memory added: ${result.id}`);
      console.log(`Layer: ${MemoryLayer[result.layer]}`);
      if (result.metadata?.stored === false) {
        console.log(`Note: Not stored (below surprise threshold)`);
        console.log(`Surprise score: ${result.metadata.surpriseScore}`);
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Recall command
program
  .command('recall <query>')
  .description('Query memories')
  .option('-l, --limit <limit>', 'Max results', '10')
  .option('-L, --layers <layers>', 'Comma-separated layers to search')
  .option('-p, --project <project>', 'Filter by project ID')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (query: string, options) => {
    try {
      const titan = await initTitan();

      const queryOptions: Record<string, unknown> = {
        limit: parseInt(options.limit),
      };

      if (options.layers) {
        const layerMap: Record<string, MemoryLayer> = {
          factual: MemoryLayer.FACTUAL,
          longterm: MemoryLayer.LONG_TERM,
          semantic: MemoryLayer.SEMANTIC,
          episodic: MemoryLayer.EPISODIC,
        };
        queryOptions.layers = options.layers
          .split(',')
          .map((l: string) => layerMap[l.trim().toLowerCase()])
          .filter((l: MemoryLayer | undefined) => l !== undefined);
      }

      if (options.project) {
        queryOptions.projectId = options.project;
      }

      if (options.tags) {
        queryOptions.tags = options.tags.split(',').map((t: string) => t.trim());
      }

      if (options.from || options.to) {
        queryOptions.dateRange = {
          start: options.from ? new Date(options.from) : new Date('1970-01-01'),
          end: options.to ? new Date(options.to) : new Date(),
        };
      }

      const result = await titan.recall(query, queryOptions);

      // Handle progressive disclosure modes
      if ('summaries' in result) {
        console.log(`Found ${result.summaries.length} memories (${result.totalQueryTimeMs.toFixed(2)}ms)\n`);
        for (const summary of result.summaries) {
          console.log(`[${MemoryLayer[summary.layer]}] ${summary.id}`);
          console.log(`  ${summary.summary}`);
          console.log(`  Tokens: ~${summary.tokenEstimate}`);
          console.log();
        }
        await titan.close();
        return;
      }

      console.log(`Found ${result.fusedMemories.length} memories (${result.totalQueryTimeMs.toFixed(2)}ms)\n`);

      for (const memory of result.fusedMemories) {
        console.log(`[${MemoryLayer[memory.layer]}] ${memory.id}`);
        console.log(`  ${memory.content.substring(0, 200)}${memory.content.length > 200 ? '...' : ''}`);
        if (options.verbose) {
          console.log(`  Timestamp: ${memory.timestamp.toISOString()}`);
          console.log(`  Metadata: ${JSON.stringify(memory.metadata)}`);
        }
        console.log();
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show memory statistics')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const titan = await initTitan();
      const stats = await titan.getStats();
      const hashStats = await titan.getHashStats();
      const patternStats = await titan.getPatternStats();

      if (options.json) {
        console.log(JSON.stringify({ stats, hashStats, patternStats }, null, 2));
      } else {
        console.log('=== Titan Memory Statistics ===\n');
        console.log(`Total Memories: ${stats.totalMemories}`);
        console.log('\nBy Layer:');
        console.log(`  Factual:   ${stats.byLayer[MemoryLayer.FACTUAL]}`);
        console.log(`  Long-term: ${stats.byLayer[MemoryLayer.LONG_TERM]}`);
        console.log(`  Semantic:  ${stats.byLayer[MemoryLayer.SEMANTIC]}`);
        console.log(`  Episodic:  ${stats.byLayer[MemoryLayer.EPISODIC]}`);

        console.log('\nHash Table (Factual Layer):');
        console.log(`  Total Hashes: ${hashStats.totalHashes}`);
        console.log(`  Avg Entries/Hash: ${hashStats.avgEntriesPerHash.toFixed(2)}`);
        console.log(`  Collision Rate: ${(hashStats.collisionRate * 100).toFixed(1)}%`);

        console.log('\nSemantic Patterns:');
        console.log('  By Type:', patternStats.byType);
        console.log('  By Frequency:', patternStats.byFrequency);

        console.log(`\nCurrent Momentum: ${titan.getCurrentMomentum().toFixed(3)}`);
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Flush command (pre-compaction)
program
  .command('flush')
  .description('Pre-compaction memory flush - save important context')
  .option('-i, --insights <insights>', 'Important insights (comma-separated)')
  .option('-d, --decisions <decisions>', 'Decisions (comma-separated)')
  .option('-e, --errors <errors>', 'Errors (comma-separated)')
  .option('-s, --solutions <solutions>', 'Solutions (comma-separated)')
  .action(async (options) => {
    try {
      const titan = await initTitan();

      const context: CompactionContext = {
        sessionId: uuidv4(),
        timestamp: new Date(),
        tokenCount: 0,
        importantInsights: options.insights ? options.insights.split(',').map((s: string) => s.trim()) : [],
        decisions: options.decisions ? options.decisions.split(',').map((s: string) => s.trim()) : [],
        errors: options.errors ? options.errors.split(',').map((s: string) => s.trim()) : [],
        solutions: options.solutions ? options.solutions.split(',').map((s: string) => s.trim()) : [],
      };

      const entries = await titan.flushPreCompaction(context);
      console.log(`Flushed ${entries.length} memories before compaction`);

      for (const entry of entries) {
        console.log(`  - ${entry.content.substring(0, 100)}`);
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Prune command
program
  .command('prune')
  .description('Prune old/decayed memories')
  .option('-t, --threshold <threshold>', 'Decay threshold (0-1)', '0.05')
  .option('--dry-run', 'Show what would be pruned without deleting')
  .action(async (options) => {
    try {
      const titan = await initTitan();

      if (options.dryRun) {
        console.log('Dry run - no memories will be deleted');
      }

      const result = await titan.prune({
        decayThreshold: parseFloat(options.threshold),
      });

      console.log(`Pruned ${result.pruned} memories`);

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Today command
program
  .command('today')
  .description('Show today\'s episodic entries')
  .action(async () => {
    try {
      const titan = await initTitan();
      const entries = await titan.getToday();

      console.log(`Today's Memories (${entries.length}):\n`);

      for (const entry of entries) {
        const time = entry.timestamp.toLocaleTimeString();
        console.log(`[${time}] ${entry.content.substring(0, 150)}`);
        if (entry.metadata?.tags) {
          console.log(`  Tags: ${(entry.metadata.tags as string[]).join(', ')}`);
        }
        console.log();
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Summary command
program
  .command('summary [date]')
  .description('Generate daily summary')
  .action(async (date?: string) => {
    try {
      const titan = await initTitan();
      const summary = await titan.summarizeDay(date);

      if (summary) {
        console.log(summary);
      } else {
        console.log('No entries found for this date');
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Dates command
program
  .command('dates')
  .description('List available episodic dates')
  .action(async () => {
    try {
      const titan = await initTitan();
      const dates = await titan.getAvailableDates();

      console.log('Available Dates:\n');
      for (const date of dates) {
        console.log(`  ${date}`);
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Export command
program
  .command('export')
  .description('Export all memories')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format (json, md)', 'json')
  .action(async (options) => {
    try {
      const titan = await initTitan();
      const exported = await titan.export();

      if (options.format === 'md') {
        // Markdown format
        const md = [
          '# Titan Memory Export',
          '',
          `Exported: ${exported.exportedAt.toISOString()}`,
          `Total Memories: ${exported.stats.totalMemories}`,
          '',
          ...Object.entries(exported.layers).map(([layer, memories]) => [
            `## ${layer}`,
            '',
            ...memories.map(m => `- ${m.content.substring(0, 200)}`),
            '',
          ]).flat(),
        ].join('\n');

        if (options.output) {
          const fs = await import('fs');
          fs.writeFileSync(options.output, md);
          console.log(`Exported to ${options.output}`);
        } else {
          console.log(md);
        }
      } else {
        // JSON format
        const json = JSON.stringify(exported, null, 2);
        if (options.output) {
          const fs = await import('fs');
          fs.writeFileSync(options.output, json);
          console.log(`Exported to ${options.output}`);
        } else {
          console.log(json);
        }
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Get command
program
  .command('get <id>')
  .description('Get a specific memory by ID')
  .action(async (id: string) => {
    try {
      const titan = await initTitan();
      const memory = await titan.get(id);

      if (memory) {
        console.log(`ID: ${memory.id}`);
        console.log(`Layer: ${MemoryLayer[memory.layer]}`);
        console.log(`Timestamp: ${memory.timestamp.toISOString()}`);
        console.log(`\nContent:\n${memory.content}`);
        console.log(`\nMetadata: ${JSON.stringify(memory.metadata, null, 2)}`);
      } else {
        console.log('Memory not found');
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Delete command
program
  .command('delete <id>')
  .description('Delete a memory by ID')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (id: string, options) => {
    try {
      if (!options.yes) {
        console.log(`Warning: This will permanently delete memory ${id}`);
        console.log('Use --yes to confirm');
        return;
      }

      const titan = await initTitan();
      const deleted = await titan.delete(id);

      if (deleted) {
        console.log('Memory deleted');
      } else {
        console.log('Memory not found');
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Feedback command - FR-1: Utility tracking
program
  .command('feedback <id>')
  .description('Provide feedback on memory utility (helpful/harmful)')
  .requiredOption('-s, --signal <signal>', 'Feedback signal: helpful or harmful')
  .option('-c, --context <context>', 'Context explaining why helpful/harmful')
  .option('--session <session>', 'Session ID for idempotency')
  .option('--json', 'Output as JSON')
  .action(async (id: string, options) => {
    try {
      const signal = options.signal.toLowerCase();
      if (signal !== 'helpful' && signal !== 'harmful') {
        console.error('Signal must be "helpful" or "harmful"');
        process.exit(1);
      }

      const titan = await initTitan();
      const result = await titan.recordFeedback(
        id,
        signal as 'helpful' | 'harmful',
        options.session,
        options.context
      );

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.success) {
          console.log(`Feedback recorded: ${result.signal} for memory ${result.memoryId}`);
          if (result.newUtilityScore !== undefined) {
            console.log(`New utility score: ${result.newUtilityScore.toFixed(2)}`);
          }
        } else {
          console.log(`Feedback not recorded: ${result.message}`);
        }
      }

      await titan.close();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();

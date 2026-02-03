/**
 * CatBrain Summarizer Tests
 */

import { CategorySummarizer } from '../src/catbrain/summarizer';

describe('CategorySummarizer', () => {
  let summarizer: CategorySummarizer;

  beforeEach(() => {
    summarizer = new CategorySummarizer();
  });

  it('should create initial summary', () => {
    const result = summarizer.updateSummary('knowledge', 'API rate limit is 1000 per hour');
    expect(result.category).toBe('knowledge');
    expect(result.version).toBe(1);
    expect(result.entryCount).toBe(1);
    expect(result.summary).toContain('API rate limit');
  });

  it('should increment version on update', () => {
    summarizer.updateSummary('knowledge', 'First entry');
    const result = summarizer.updateSummary('knowledge', 'Second entry');
    expect(result.version).toBe(2);
    expect(result.entryCount).toBe(2);
  });

  it('should append to summary (never delete)', () => {
    summarizer.updateSummary('knowledge', 'First fact');
    const result = summarizer.updateSummary('knowledge', 'Second fact');
    expect(result.summary).toContain('First fact');
  });

  it('should extract key terms', () => {
    const result = summarizer.updateSummary('knowledge', 'TypeScript configuration management system');
    expect(result.keyTerms.length).toBeGreaterThan(0);
  });

  it('should merge key terms without duplicates', () => {
    summarizer.updateSummary('knowledge', 'TypeScript is great');
    const result = summarizer.updateSummary('knowledge', 'TypeScript is wonderful');
    const typeScriptCount = result.keyTerms.filter(t => t === 'typescript').length;
    expect(typeScriptCount).toBeLessThanOrEqual(1);
  });

  it('should get summary for specific category', () => {
    summarizer.updateSummary('knowledge', 'Some knowledge');
    summarizer.updateSummary('profile', 'Some preferences');
    expect(summarizer.getSummary('knowledge')).toBeDefined();
    expect(summarizer.getSummary('profile')).toBeDefined();
    expect(summarizer.getSummary('event')).toBeUndefined();
  });

  it('should get all summaries', () => {
    summarizer.updateSummary('knowledge', 'K');
    summarizer.updateSummary('profile', 'P');
    const all = summarizer.getAllSummaries();
    expect(all).toHaveLength(2);
  });

  it('should get stats', () => {
    summarizer.updateSummary('knowledge', 'Entry 1');
    summarizer.updateSummary('knowledge', 'Entry 2');
    summarizer.updateSummary('profile', 'Entry 3');
    const stats = summarizer.getStats();
    expect(stats.totalCategories).toBe(2);
    expect(stats.totalEntries).toBe(3);
  });

  it('should export and load summaries', () => {
    summarizer.updateSummary('knowledge', 'Test content');
    const exported = summarizer.exportSummaries();
    expect(exported.length).toBe(1);

    const newSummarizer = new CategorySummarizer();
    newSummarizer.loadSummaries(exported);
    expect(newSummarizer.getSummary('knowledge')).toBeDefined();
  });

  it('should cap summary length at 500 chars', () => {
    // Add many entries to build up summary length
    for (let i = 0; i < 20; i++) {
      summarizer.updateSummary('knowledge', `This is a moderately long entry number ${i} about some topic`);
    }
    const summary = summarizer.getSummary('knowledge');
    expect(summary!.summary.length).toBeLessThanOrEqual(504); // 500 + "..."
  });
});

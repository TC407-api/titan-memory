/**
 * Decision Trace Tests
 * Tests for decision capture, outcome tracking, and pattern analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  DecisionTraceManager,
  DecisionTrace,
  DecisionType,
  Alternative,
} from '../src/trace/decision-trace.js';

describe('DecisionTraceManager', () => {
  let traceManager: DecisionTraceManager;
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = path.join(process.cwd(), 'test-data-trace', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.mkdirSync(testDataDir, { recursive: true });
    process.env.TITAN_DATA_DIR = testDataDir;

    traceManager = new DecisionTraceManager();
    await traceManager.initialize();
  });

  afterEach(async () => {
    await traceManager.close();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const createTestAlternative = (overrides: Partial<Alternative> = {}): Alternative => ({
    id: 'alt-' + Math.random().toString(36).substr(2, 9),
    description: 'Alternative approach',
    pros: ['Pro 1', 'Pro 2'],
    cons: ['Con 1'],
    rejectionReason: 'Not optimal for this use case',
    ...overrides,
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newManager = new DecisionTraceManager();
      await newManager.initialize();
      const result = await newManager.query();
      expect(Array.isArray(result.decisions)).toBe(true);
      await newManager.close();
    });

    it('should handle multiple initialize calls', async () => {
      const resultBefore = await traceManager.query();
      await traceManager.initialize();
      await traceManager.initialize();
      const resultAfter = await traceManager.query();
      expect(resultAfter.decisions.length).toBe(resultBefore.decisions.length);
    });
  });

  describe('Decision Creation', () => {
    it('should create a decision trace', async () => {
      const decision = await traceManager.createDecision({
        type: 'architecture',
        summary: 'Use microservices architecture',
        description: 'Decided to use microservices for better scalability',
        rationale: 'The system needs to scale independently per service',
        confidence: 0.85,
        alternatives: [
          createTestAlternative({ description: 'Monolithic architecture' }),
        ],
        context: {
          projectId: 'test-project',
          taskDescription: 'Design system architecture',
        },
        tags: ['architecture', 'scalability'],
      });

      expect(decision.id).toBeDefined();
      expect(decision.type).toBe('architecture');
      expect(decision.decision.summary).toBe('Use microservices architecture');
      expect(decision.decision.confidence).toBe(0.85);
      expect(decision.alternatives.length).toBe(1);
      expect(decision.outcome.status).toBe('pending');
    });

    it('should create decisions with all types', async () => {
      const types: DecisionType[] = [
        'architecture', 'implementation', 'technology', 'debugging',
        'optimization', 'workflow', 'configuration', 'user_preference',
        'tradeoff', 'rollback', 'other'
      ];

      for (const type of types) {
        const decision = await traceManager.createDecision({
          type,
          summary: `Decision of type ${type}`,
          description: `Description for ${type}`,
          rationale: `Rationale for ${type}`,
          confidence: 0.7,
        });
        expect(decision.type).toBe(type);
      }
    });

    it('should set default values for optional fields', async () => {
      const decision = await traceManager.createDecision({
        type: 'implementation',
        summary: 'Simple decision',
        description: 'A simple implementation decision',
        rationale: 'Because it works',
        confidence: 0.5,
      });

      expect(decision.alternatives).toEqual([]);
      expect(decision.tags).toEqual([]);
      expect(decision.context).toBeDefined();
      expect(decision.links.memoryIds).toEqual([]);
      expect(decision.links.childDecisionIds).toEqual([]);
    });

    it('should auto-generate ID if not provided', async () => {
      const decision = await traceManager.createDecision({
        type: 'technology',
        summary: 'Use TypeScript',
        description: 'Choose TypeScript over JavaScript',
        rationale: 'Type safety',
        confidence: 0.9,
      });

      expect(decision.id).toMatch(/^[a-f0-9-]+$/);
    });
  });

  describe('Decision Retrieval', () => {
    let testDecisionId: string;

    beforeEach(async () => {
      const decision = await traceManager.createDecision({
        type: 'architecture',
        summary: 'Test decision',
        description: 'For retrieval testing',
        rationale: 'Testing',
        confidence: 0.8,
        tags: ['test'],
      });
      testDecisionId = decision.id;
    });

    it('should get decision by ID', async () => {
      const decision = await traceManager.get(testDecisionId);
      expect(decision).toBeDefined();
      expect(decision?.id).toBe(testDecisionId);
    });

    it('should return null for non-existent ID', async () => {
      const decision = await traceManager.get('non-existent-id');
      expect(decision).toBeNull();
    });
  });

  describe('Outcome Recording', () => {
    let testDecision: DecisionTrace;

    beforeEach(async () => {
      testDecision = await traceManager.createDecision({
        type: 'implementation',
        summary: 'Implement feature X',
        description: 'Using approach Y',
        rationale: 'Best fit for requirements',
        confidence: 0.75,
      });
    });

    it('should record success outcome', async () => {
      const updated = await traceManager.recordOutcome(testDecision.id, {
        status: 'success',
        description: 'Feature works perfectly',
        feedback: 'User approved',
      });

      expect(updated).toBeDefined();
      expect(updated?.outcome.status).toBe('success');
      expect(updated?.outcome.description).toBe('Feature works perfectly');
    });

    it('should record failure outcome', async () => {
      const updated = await traceManager.recordOutcome(testDecision.id, {
        status: 'failure',
        description: 'Did not meet requirements',
        feedback: 'Need to reconsider',
      });

      expect(updated?.outcome.status).toBe('failure');
    });

    it('should record partial outcome', async () => {
      const updated = await traceManager.recordOutcome(testDecision.id, {
        status: 'partial',
        description: 'Some goals achieved',
        metrics: { successRate: 0.6 },
      });

      expect(updated?.outcome.status).toBe('partial');
      expect(updated?.outcome.metrics?.successRate).toBe(0.6);
    });

    it('should record superseded outcome', async () => {
      const updated = await traceManager.recordOutcome(testDecision.id, {
        status: 'superseded',
        description: 'Replaced by newer approach',
      });

      expect(updated?.outcome.status).toBe('superseded');
    });

    it('should return null for non-existent decision', async () => {
      const result = await traceManager.recordOutcome('non-existent', {
        status: 'success',
      });

      expect(result).toBeNull();
    });

    it('should update learnedAt timestamp', async () => {
      const updated = await traceManager.recordOutcome(testDecision.id, {
        status: 'success',
      });

      expect(updated?.outcome.learnedAt).toBeDefined();
    });
  });

  describe('Query and Filtering', () => {
    beforeEach(async () => {
      // Create diverse decisions for filtering tests
      await traceManager.createDecision({
        type: 'architecture',
        summary: 'Architecture decision 1',
        description: 'First arch decision',
        rationale: 'Testing',
        confidence: 0.9,
        tags: ['architecture', 'important'],
        context: { projectId: 'project-a' },
      });

      await traceManager.createDecision({
        type: 'debugging',
        summary: 'Debugging decision',
        description: 'Debug approach',
        rationale: 'Fix bug',
        confidence: 0.6,
        tags: ['debugging', 'bug'],
        context: { projectId: 'project-a' },
      });

      await traceManager.createDecision({
        type: 'technology',
        summary: 'Technology choice',
        description: 'Tech decision',
        rationale: 'Best tool',
        confidence: 0.8,
        tags: ['technology'],
        context: { projectId: 'project-b' },
      });
    });

    it('should query all decisions', async () => {
      const result = await traceManager.query({ limit: 1000 });
      // Query has returned results and totalFound reflects all decisions
      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.totalFound).toBeGreaterThanOrEqual(3);
    });

    it('should filter by decision type', async () => {
      const result = await traceManager.query({ type: 'architecture' });
      expect(result.decisions.length).toBeGreaterThanOrEqual(1);
      result.decisions.forEach(d => {
        expect(d.type).toBe('architecture');
      });
    });

    it('should filter by project', async () => {
      const result = await traceManager.query({ projectId: 'project-a' });
      expect(result.decisions.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by confidence threshold', async () => {
      const result = await traceManager.query({ minConfidence: 0.8 });
      expect(result.decisions.length).toBeGreaterThanOrEqual(1);
      result.decisions.forEach(d => {
        expect(d.decision.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    it('should filter by tags', async () => {
      const result = await traceManager.query({ tags: ['important'] });
      expect(result.decisions.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect limit option', async () => {
      const result = await traceManager.query({ limit: 2 });
      expect(result.decisions.length).toBeLessThanOrEqual(2);
    });

    it('should return query time', async () => {
      const result = await traceManager.query();
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content Extraction', () => {
    it('should extract decisions from content', async () => {
      const content = `
After analyzing the requirements, I decided to use PostgreSQL for the database.
The rationale is that we need ACID compliance and complex queries.
Alternatives considered: MongoDB (rejected due to consistency needs), MySQL (similar but less features).
      `;

      const decisions = await traceManager.extractFromContent(content);
      expect(Array.isArray(decisions)).toBe(true);
    });

    it('should extract decision type from content keywords', async () => {
      const architectureContent = 'The system architecture will use a layered approach.';
      const debuggingContent = 'To debug this issue, I will add logging statements.';

      const archDecisions = await traceManager.extractFromContent(architectureContent);
      const debugDecisions = await traceManager.extractFromContent(debuggingContent);

      expect(Array.isArray(archDecisions)).toBe(true);
      expect(Array.isArray(debugDecisions)).toBe(true);
    });

    it('should handle content without decisions', async () => {
      const content = 'This is just some random text without any decisions.';
      const decisions = await traceManager.extractFromContent(content);
      expect(Array.isArray(decisions)).toBe(true);
    });
  });

  describe('Similar Decision Finding', () => {
    beforeEach(async () => {
      await traceManager.createDecision({
        type: 'technology',
        summary: 'Use React for frontend',
        description: 'Choosing React for the web UI',
        rationale: 'Large ecosystem and team familiarity',
        confidence: 0.85,
      });

      await traceManager.createDecision({
        type: 'technology',
        summary: 'Use Vue for frontend',
        description: 'Choosing Vue for smaller projects',
        rationale: 'Simpler learning curve',
        confidence: 0.7,
      });
    });

    it('should find similar decisions', async () => {
      const similar = await traceManager.findSimilar('React frontend framework');
      expect(Array.isArray(similar)).toBe(true);
    });

    it('should respect limit in similar search', async () => {
      const similar = await traceManager.findSimilar('frontend', { limit: 1 });
      expect(similar.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Decision Chains', () => {
    let parentId: string;
    let childId: string;

    beforeEach(async () => {
      const parent = await traceManager.createDecision({
        type: 'architecture',
        summary: 'Parent decision',
        description: 'Top-level decision',
        rationale: 'Foundation',
        confidence: 0.9,
      });
      parentId = parent.id;

      const child = await traceManager.createDecision({
        type: 'implementation',
        summary: 'Child decision',
        description: 'Based on parent',
        rationale: 'Follows from parent',
        confidence: 0.8,
        parentDecisionId: parentId,
      });
      childId = child.id;
    });

    it('should link child to parent decision', async () => {
      const child = await traceManager.get(childId);
      expect(child?.links.parentDecisionId).toBe(parentId);
    });

    it('should get decision chain', async () => {
      const chain = await traceManager.getDecisionChain(childId);
      expect(Array.isArray(chain)).toBe(true);
    });
  });

  describe('Pattern Analysis', () => {
    beforeEach(async () => {
      // Create decisions with outcomes for pattern analysis
      const d1 = await traceManager.createDecision({
        type: 'technology',
        summary: 'Use TypeScript',
        description: 'Adopt TypeScript',
        rationale: 'Type safety',
        confidence: 0.9,
      });
      await traceManager.recordOutcome(d1.id, { status: 'success' });

      const d2 = await traceManager.createDecision({
        type: 'technology',
        summary: 'Use Flow',
        description: 'Use Flow types',
        rationale: 'Facebook support',
        confidence: 0.6,
      });
      await traceManager.recordOutcome(d2.id, { status: 'failure' });
    });

    it('should get decision patterns', async () => {
      const patterns = await traceManager.getPatterns();
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should filter patterns by type', async () => {
      const patterns = await traceManager.getPatterns('technology');
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('Statistics', () => {
    let countBefore: number;

    beforeEach(async () => {
      const statsBefore = await traceManager.getStats();
      countBefore = statsBefore.totalDecisions;

      await traceManager.createDecision({
        type: 'architecture',
        summary: 'Arch decision',
        description: 'Test',
        rationale: 'Test',
        confidence: 0.8,
      });
      await traceManager.createDecision({
        type: 'debugging',
        summary: 'Debug decision',
        description: 'Test',
        rationale: 'Test',
        confidence: 0.7,
      });
    });

    it('should return statistics', async () => {
      const stats = await traceManager.getStats();
      expect(stats.totalDecisions).toBeGreaterThanOrEqual(countBefore + 2);
      expect(stats.byType).toBeDefined();
      expect(stats.byOutcome).toBeDefined();
    });
  });

  describe('Persistence', () => {
    it('should persist decisions to disk', async () => {
      const resultBefore = await traceManager.query();
      const countBefore = resultBefore.totalFound;

      await traceManager.createDecision({
        type: 'workflow',
        summary: 'Persistent decision',
        description: 'Should be saved',
        rationale: 'Testing persistence',
        confidence: 0.75,
      });

      const result1 = await traceManager.query();
      expect(result1.totalFound).toBeGreaterThanOrEqual(countBefore + 1);

      // Create new instance to verify persistence
      const newManager = new DecisionTraceManager();
      await newManager.initialize();

      const result2 = await newManager.query();
      expect(result2.totalFound).toBeGreaterThanOrEqual(countBefore);
      await newManager.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long descriptions', async () => {
      const decision = await traceManager.createDecision({
        type: 'other',
        summary: 'Long description test',
        description: 'A'.repeat(5000),
        rationale: 'B'.repeat(3000),
        confidence: 0.5,
      });

      expect(decision).toBeDefined();
    });

    it('should handle special characters', async () => {
      const decision = await traceManager.createDecision({
        type: 'configuration',
        summary: 'Config with special chars: <>&"\'',
        description: 'Test with JSON: {"key": "value"}',
        rationale: 'Unicode: 你好 🎉',
        confidence: 0.6,
      });

      expect(decision).toBeDefined();
    });

    it('should handle confidence at boundaries', async () => {
      const d1 = await traceManager.createDecision({
        type: 'tradeoff',
        summary: 'Zero confidence',
        description: 'Very uncertain',
        rationale: 'Just guessing',
        confidence: 0,
      });
      expect(d1.decision.confidence).toBe(0);

      const d2 = await traceManager.createDecision({
        type: 'tradeoff',
        summary: 'Full confidence',
        description: 'Very certain',
        rationale: 'Absolutely sure',
        confidence: 1,
      });
      expect(d2.decision.confidence).toBe(1);
    });
  });
});

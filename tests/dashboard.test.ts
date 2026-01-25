/**
 * Titan Memory Dashboard Tests
 * Tests for REST API endpoints and WebSocket functionality
 */

import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DashboardServer } from '../src/dashboard/server';
import { TitanMemory } from '../src/titan';
import { updateConfig } from '../src/utils/config';
import { MemoryLayer } from '../src/types';

// Test helper for making HTTP requests
async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: data ? JSON.parse(data) : null,
          });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe('Dashboard Server', () => {
  let server: DashboardServer;
  let testDir: string;
  const port = 13939; // Use different port for tests

  beforeAll(async () => {
    // Create isolated test directory
    testDir = path.join(os.tmpdir(), `titan-dashboard-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Update config to use test directory
    updateConfig({
      dataDir: testDir,
      offlineMode: true,
    });

    // Start dashboard server
    server = new DashboardServer({ port, host: '127.0.0.1' });
    await server.start();
  }, 30000);

  afterAll(async () => {
    await server.stop();
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Health Check', () => {
    test('GET /api/health returns OK status', async () => {
      const res = await request(port, 'GET', '/api/health');
      expect(res.status).toBe(200);
      expect((res.data as any).status).toBe('ok');
      expect((res.data as any).version).toBe('1.0.0');
    });
  });

  describe('Stats Endpoints', () => {
    test('GET /api/stats returns memory statistics', async () => {
      const res = await request(port, 'GET', '/api/stats');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('totalMemories');
      expect((res.data as any)).toHaveProperty('byLayer');
    });

    test('GET /api/stats/hash returns hash statistics', async () => {
      const res = await request(port, 'GET', '/api/stats/hash');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('totalHashes');
      expect((res.data as any)).toHaveProperty('avgEntriesPerHash');
    });

    test('GET /api/stats/patterns returns pattern statistics', async () => {
      const res = await request(port, 'GET', '/api/stats/patterns');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('byType');
      expect((res.data as any)).toHaveProperty('byFrequency');
    });

    test('GET /api/stats/graph returns graph statistics', async () => {
      const res = await request(port, 'GET', '/api/stats/graph');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('entityCount');
      expect((res.data as any)).toHaveProperty('relationshipCount');
    });

    test('GET /api/stats/learning returns learning statistics', async () => {
      const res = await request(port, 'GET', '/api/stats/learning');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('totalPatterns');
    });

    test('GET /api/stats/phase3 returns combined Phase 3 stats', async () => {
      const res = await request(port, 'GET', '/api/stats/phase3');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('graph');
      expect((res.data as any)).toHaveProperty('decisions');
      expect((res.data as any)).toHaveProperty('learning');
    });
  });

  describe('Memory Operations', () => {
    let memoryId: string;

    test('POST /api/memories adds a new memory', async () => {
      const res = await request(port, 'POST', '/api/memories', {
        content: 'Test memory for dashboard API',
        tags: ['test', 'dashboard'],
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('id');
      expect((res.data as any).content).toBe('Test memory for dashboard API');
      memoryId = (res.data as any).id;
    });

    test('GET /api/memories/:id retrieves a specific memory', async () => {
      const res = await request(port, 'GET', `/api/memories/${memoryId}`);
      expect(res.status).toBe(200);
      expect((res.data as any).id).toBe(memoryId);
    });

    test('GET /api/memories/:id returns 400 for non-existent memory', async () => {
      const res = await request(port, 'GET', '/api/memories/nonexistent-id');
      expect(res.status).toBe(400);
      expect((res.data as any)).toHaveProperty('error');
    });

    test('DELETE /api/memories/:id deletes a memory', async () => {
      const res = await request(port, 'DELETE', `/api/memories/${memoryId}`);
      expect(res.status).toBe(200);
      expect((res.data as any).success).toBe(true);
    });
  });

  describe('Search', () => {
    beforeAll(async () => {
      // Add some test memories for search
      await request(port, 'POST', '/api/memories', {
        content: 'TypeScript is a typed superset of JavaScript',
        tags: ['programming', 'typescript'],
      });
      await request(port, 'POST', '/api/memories', {
        content: 'React is a JavaScript library for building UIs',
        tags: ['programming', 'react'],
      });
    });

    test('POST /api/search returns matching memories', async () => {
      const res = await request(port, 'POST', '/api/search', {
        query: 'JavaScript',
        limit: 10,
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('fusedMemories');
      expect(Array.isArray((res.data as any).fusedMemories)).toBe(true);
    });

    test('POST /api/search with layer filter works', async () => {
      const res = await request(port, 'POST', '/api/search', {
        query: 'JavaScript',
        layers: [MemoryLayer.LONG_TERM],
        limit: 5,
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('results');
    });

    test('POST /api/search returns error without query', async () => {
      const res = await request(port, 'POST', '/api/search', {});
      expect(res.status).toBe(400);
      expect((res.data as any)).toHaveProperty('error');
    });
  });

  describe('Projects', () => {
    test('GET /api/projects lists all projects', async () => {
      const res = await request(port, 'GET', '/api/projects');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('active');
      expect((res.data as any)).toHaveProperty('projects');
      expect(Array.isArray((res.data as any).projects)).toBe(true);
    });

    test('POST /api/projects/switch changes active project', async () => {
      const res = await request(port, 'POST', '/api/projects/switch', {
        projectId: 'default',
      });
      expect(res.status).toBe(200);
      expect((res.data as any).success).toBe(true);
    });
  });

  describe('Decisions', () => {
    test('GET /api/decisions returns decision history', async () => {
      const res = await request(port, 'GET', '/api/decisions');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('decisions');
    });

    test('POST /api/decisions creates a decision trace', async () => {
      const res = await request(port, 'POST', '/api/decisions', {
        type: 'implementation',
        summary: 'Test decision for dashboard API',
        description: 'Testing decision creation via dashboard',
        rationale: 'Need to verify decision API works',
        confidence: 0.9,
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('id');
      // Decision summary is nested under decision.summary
      expect((res.data as any).decision?.summary).toBe('Test decision for dashboard API');
    });
  });

  describe('Graph', () => {
    test('GET /api/graph returns graph data', async () => {
      const res = await request(port, 'GET', '/api/graph');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('stats');
    });

    test('POST /api/graph/query queries the knowledge graph', async () => {
      const res = await request(port, 'POST', '/api/graph/query', {
        entities: ['TypeScript'],
        maxDepth: 2,
      });
      expect(res.status).toBe(200);
    });

    test('POST /api/graph/extract extracts entities from content', async () => {
      const res = await request(port, 'POST', '/api/graph/extract', {
        content: 'John works at Google using Python and TensorFlow',
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('entities');
    });
  });

  describe('Learning', () => {
    test('GET /api/rehearsals returns pending rehearsals', async () => {
      const res = await request(port, 'GET', '/api/rehearsals');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    test('GET /api/forgetting-risk returns risk assessment', async () => {
      const res = await request(port, 'GET', '/api/forgetting-risk');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('alert');
      expect((res.data as any)).toHaveProperty('riskLevel');
    });
  });

  describe('Validation', () => {
    test('GET /api/validation returns validation report', async () => {
      const res = await request(port, 'GET', '/api/validation');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('healthScore');
    });

    test('GET /api/validation/issues returns validation issues', async () => {
      const res = await request(port, 'GET', '/api/validation/issues');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('issues');
    });
  });

  describe('Export', () => {
    test('GET /api/export returns memory export in JSON', async () => {
      const res = await request(port, 'GET', '/api/export');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('version');
      expect((res.data as any)).toHaveProperty('exportedAt');
      expect((res.data as any)).toHaveProperty('layers');
    });

    test('GET /api/export?format=markdown returns markdown export', async () => {
      const res = await request(port, 'GET', '/api/export?format=markdown');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('format');
      expect((res.data as any).format).toBe('markdown');
      expect((res.data as any)).toHaveProperty('content');
    });
  });

  describe('Episodic', () => {
    test('GET /api/today returns today\'s entries', async () => {
      const res = await request(port, 'GET', '/api/today');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    test('GET /api/dates returns available dates', async () => {
      const res = await request(port, 'GET', '/api/dates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  describe('World Model', () => {
    test('GET /api/world returns world state', async () => {
      const res = await request(port, 'GET', '/api/world');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('activeContext');
    });
  });

  describe('Curate', () => {
    test('POST /api/curate adds to MEMORY.md', async () => {
      const res = await request(port, 'POST', '/api/curate', {
        content: 'Important insight from dashboard test',
        section: 'Testing',
      });
      expect(res.status).toBe(200);
      expect((res.data as any).success).toBe(true);
    });

    test('POST /api/curate returns error without content', async () => {
      const res = await request(port, 'POST', '/api/curate', {});
      expect(res.status).toBe(400);
      expect((res.data as any)).toHaveProperty('error');
    });
  });

  describe('Prune', () => {
    test('POST /api/prune prunes decayed memories', async () => {
      const res = await request(port, 'POST', '/api/prune', {
        decayThreshold: 0.05,
      });
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('pruned');
    });
  });

  describe('Clusters', () => {
    test('GET /api/clusters returns memory clusters', async () => {
      const res = await request(port, 'GET', '/api/clusters');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('clusters');
    });
  });

  describe('Consolidate', () => {
    test('POST /api/consolidate consolidates memories', async () => {
      const res = await request(port, 'POST', '/api/consolidate');
      expect(res.status).toBe(200);
      expect((res.data as any)).toHaveProperty('consolidated');
    });
  });

  describe('404 Handling', () => {
    test('Unknown API endpoint returns 404', async () => {
      const res = await request(port, 'GET', '/api/nonexistent');
      expect(res.status).toBe(404);
      expect((res.data as any)).toHaveProperty('error');
    });
  });
});

describe('Dashboard WebSocket', () => {
  let server: DashboardServer;
  let testDir: string;
  const port = 13940;

  beforeAll(async () => {
    testDir = path.join(os.tmpdir(), `titan-ws-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    updateConfig({ dataDir: testDir, offlineMode: true });

    server = new DashboardServer({ port, host: '127.0.0.1' });
    await server.start();
  }, 30000);

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('Server emits events', () => {
    // This test just verifies the emitEvent method exists and doesn't throw
    expect(() => {
      server.emitEvent('test', { message: 'test event' });
    }).not.toThrow();
  });

  test('getTitan returns TitanMemory instance', () => {
    const titan = server.getTitan();
    expect(titan).toBeInstanceOf(TitanMemory);
  });
});

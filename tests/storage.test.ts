/**
 * Storage Module Tests
 * Tests for IVectorStorage interface and ZillizClient implementation
 */

import {
  IVectorStorage,
  IEmbeddingGenerator,
  VectorSearchResult,
  VectorStorageConfig,
  ZillizClient,
  DefaultEmbeddingGenerator,
} from '../src/storage/index.js';

describe('Storage Module', () => {
  describe('DefaultEmbeddingGenerator', () => {
    let generator: DefaultEmbeddingGenerator;

    beforeEach(() => {
      generator = new DefaultEmbeddingGenerator();
    });

    it('should create generator with default dimension', () => {
      expect(generator.getDimension()).toBe(1024);
    });

    it('should create generator with custom dimension', () => {
      const customGenerator = new DefaultEmbeddingGenerator(768);
      expect(customGenerator.getDimension()).toBe(768);
    });

    it('should generate embedding of correct length', async () => {
      const embedding = await generator.generateEmbedding('test content');
      expect(embedding.length).toBe(1024);
    });

    it('should generate deterministic embeddings', async () => {
      const embedding1 = await generator.generateEmbedding('same content');
      const embedding2 = await generator.generateEmbedding('same content');
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different content', async () => {
      const embedding1 = await generator.generateEmbedding('content A');
      const embedding2 = await generator.generateEmbedding('content B');
      expect(embedding1).not.toEqual(embedding2);
    });

    it('should handle empty string', async () => {
      const embedding = await generator.generateEmbedding('');
      expect(embedding.length).toBe(1024);
    });

    it('should handle unicode content', async () => {
      const embedding = await generator.generateEmbedding('Unicode 你好 αβγ 🚀');
      expect(embedding.length).toBe(1024);
    });

    it('should generate embeddings with values in reasonable range', async () => {
      const embedding = await generator.generateEmbedding('test content');
      embedding.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('ZillizClient', () => {
    let client: ZillizClient;
    const mockConfig: VectorStorageConfig = {
      uri: 'https://mock-zilliz.example.com',
      token: 'mock-token',
      collection: 'test-collection',
    };

    beforeEach(() => {
      client = new ZillizClient(mockConfig);
    });

    it('should create client with config', () => {
      expect(client).toBeDefined();
    });

    it('should create client with custom dimension', () => {
      const customClient = new ZillizClient({
        ...mockConfig,
        dimension: 768,
      });
      expect(customClient).toBeDefined();
    });

    it('should create client with custom metric type', () => {
      const customClient = new ZillizClient({
        ...mockConfig,
        metricType: 'L2',
      });
      expect(customClient).toBeDefined();
    });

    it('should accept custom embedding generator', () => {
      const customGenerator = new DefaultEmbeddingGenerator(512);
      const customClient = new ZillizClient(mockConfig, customGenerator);
      expect(customClient).toBeDefined();
    });

    it('should implement IVectorStorage interface', () => {
      // Verify all interface methods exist
      expect(typeof client.initialize).toBe('function');
      expect(typeof client.insert).toBe('function');
      expect(typeof client.search).toBe('function');
      expect(typeof client.get).toBe('function');
      expect(typeof client.getRecent).toBe('function');
      expect(typeof client.delete).toBe('function');
      expect(typeof client.count).toBe('function');
      expect(typeof client.close).toBe('function');
    });

    it('should close without error', async () => {
      await expect(client.close()).resolves.not.toThrow();
    });

    it('should be closable multiple times', async () => {
      await client.close();
      await expect(client.close()).resolves.not.toThrow();
    });
  });

  describe('VectorSearchResult', () => {
    it('should have correct structure', () => {
      const result: VectorSearchResult = {
        id: 'test-id',
        content: 'test content',
        score: 0.95,
        metadata: { tag: 'test' },
      };

      expect(result.id).toBe('test-id');
      expect(result.content).toBe('test content');
      expect(result.score).toBe(0.95);
      expect(result.metadata).toEqual({ tag: 'test' });
    });

    it('should support empty metadata', () => {
      const result: VectorSearchResult = {
        id: 'test-id',
        content: 'test content',
        score: 1.0,
        metadata: {},
      };

      expect(result.metadata).toEqual({});
    });

    it('should support complex metadata', () => {
      const result: VectorSearchResult = {
        id: 'test-id',
        content: 'test content',
        score: 0.8,
        metadata: {
          tags: ['a', 'b'],
          nested: { key: 'value' },
          number: 42,
        },
      };

      expect(result.metadata.tags).toEqual(['a', 'b']);
      expect((result.metadata.nested as { key: string }).key).toBe('value');
    });
  });

  describe('VectorStorageConfig', () => {
    it('should require uri, token, and collection', () => {
      const config: VectorStorageConfig = {
        uri: 'https://example.com',
        token: 'secret',
        collection: 'memories',
      };

      expect(config.uri).toBe('https://example.com');
      expect(config.token).toBe('secret');
      expect(config.collection).toBe('memories');
    });

    it('should support optional dimension', () => {
      const config: VectorStorageConfig = {
        uri: 'https://example.com',
        token: 'secret',
        collection: 'memories',
        dimension: 768,
      };

      expect(config.dimension).toBe(768);
    });

    it('should support optional metric type', () => {
      const config: VectorStorageConfig = {
        uri: 'https://example.com',
        token: 'secret',
        collection: 'memories',
        metricType: 'COSINE',
      };

      expect(config.metricType).toBe('COSINE');
    });
  });

  describe('IVectorStorage Interface', () => {
    // This test ensures the interface contract is correct
    it('should define all required methods', () => {
      // Mock implementation to verify interface
      const mockStorage: IVectorStorage = {
        initialize: jest.fn(),
        insert: jest.fn(),
        search: jest.fn(),
        get: jest.fn(),
        getRecent: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        close: jest.fn(),
      };

      expect(mockStorage.initialize).toBeDefined();
      expect(mockStorage.insert).toBeDefined();
      expect(mockStorage.search).toBeDefined();
      expect(mockStorage.get).toBeDefined();
      expect(mockStorage.getRecent).toBeDefined();
      expect(mockStorage.delete).toBeDefined();
      expect(mockStorage.count).toBeDefined();
      expect(mockStorage.close).toBeDefined();
    });
  });

  describe('IEmbeddingGenerator Interface', () => {
    it('should define required methods', () => {
      const mockGenerator: IEmbeddingGenerator = {
        generateEmbedding: jest.fn(),
        getDimension: jest.fn().mockReturnValue(1024),
      };

      expect(mockGenerator.generateEmbedding).toBeDefined();
      expect(mockGenerator.getDimension()).toBe(1024);
    });
  });
});

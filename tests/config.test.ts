/**
 * Tests for configuration management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadConfig,
  getConfig,
  updateConfig,
  saveConfig,
  validateConfig,
  ensureDirectories,
  resetConfig,
} from '../src/utils/config';

describe('Configuration', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    testDir = path.join(os.tmpdir(), `titan-config-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Reset config state for test isolation
    resetConfig();
    // Reset environment
    delete process.env.ZILLIZ_URI;
    delete process.env.ZILLIZ_TOKEN;
    delete process.env.TITAN_SURPRISE_THRESHOLD;
    delete process.env.TITAN_OFFLINE_MODE;
  });

  describe('loadConfig', () => {
    it('should load default config', () => {
      const config = loadConfig(path.join(testDir, 'nonexistent.json'));

      expect(config).toBeDefined();
      expect(config.surpriseThreshold).toBe(0.3);
      expect(config.decayHalfLife).toBe(180);
    });

    it('should merge file config with defaults', () => {
      const configPath = path.join(testDir, 'test-config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        surpriseThreshold: 0.5,
        maxMemoriesPerLayer: 5000,
      }));

      const config = loadConfig(configPath);

      expect(config.surpriseThreshold).toBe(0.5);
      expect(config.maxMemoriesPerLayer).toBe(5000);
      expect(config.decayHalfLife).toBe(180); // Default
    });

    it('should override with environment variables', () => {
      process.env.ZILLIZ_URI = 'https://test-uri.zilliz.cloud';
      process.env.ZILLIZ_TOKEN = 'test-token';
      process.env.TITAN_SURPRISE_THRESHOLD = '0.7';
      process.env.TITAN_OFFLINE_MODE = 'true';

      const config = loadConfig(path.join(testDir, 'nonexistent.json'));

      expect(config.zillizUri).toBe('https://test-uri.zilliz.cloud');
      expect(config.zillizToken).toBe('test-token');
      expect(config.surpriseThreshold).toBe(0.7);
      expect(config.offlineMode).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      const config = getConfig();

      expect(config).toBeDefined();
      expect(config.surpriseThreshold).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update config values', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));

      const updated = updateConfig({
        surpriseThreshold: 0.8,
        offlineMode: true,
      });

      expect(updated.surpriseThreshold).toBe(0.8);
      expect(updated.offlineMode).toBe(true);
    });

    it('should preserve other values', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      const original = getConfig();
      const originalHalfLife = original.decayHalfLife;

      updateConfig({ surpriseThreshold: 0.9 });

      const updated = getConfig();
      expect(updated.decayHalfLife).toBe(originalHalfLife);
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({ surpriseThreshold: 0.6 });

      const savePath = path.join(testDir, 'saved-config.json');
      saveConfig(savePath);

      expect(fs.existsSync(savePath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
      expect(saved.surpriseThreshold).toBe(0.6);
    });

    it('should not save sensitive data', () => {
      process.env.ZILLIZ_TOKEN = 'secret-token';
      loadConfig(path.join(testDir, 'nonexistent.json'));

      const savePath = path.join(testDir, 'saved-config-sensitive.json');
      saveConfig(savePath);

      const saved = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
      expect(saved.zillizToken).toBeUndefined();
    });

    it('should create directory if not exists', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));

      const savePath = path.join(testDir, 'subdir', 'config.json');
      saveConfig(savePath);

      expect(fs.existsSync(savePath)).toBe(true);
    });
  });

  describe('validateConfig', () => {
    it('should validate offline mode without credentials', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({ offlineMode: true });

      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require credentials for online mode', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({ offlineMode: false, zillizUri: '', zillizToken: '' });

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate surprise threshold range', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({ offlineMode: true, surpriseThreshold: 1.5 });

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('surpriseThreshold must be between 0 and 1');
    });

    it('should validate decay half-life', () => {
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({ offlineMode: true, decayHalfLife: 0 });

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('decayHalfLife must be at least 1 day');
    });
  });

  describe('ensureDirectories', () => {
    it('should create data directories', () => {
      const customDataDir = path.join(testDir, 'custom-data');
      loadConfig(path.join(testDir, 'nonexistent.json'));
      updateConfig({
        dataDir: customDataDir,
        episodicDir: path.join(customDataDir, 'episodic'),
        factualDbPath: path.join(customDataDir, 'facts.db'),
      });

      ensureDirectories();

      expect(fs.existsSync(customDataDir)).toBe(true);
      expect(fs.existsSync(path.join(customDataDir, 'episodic'))).toBe(true);
    });
  });
});

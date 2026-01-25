/**
 * Configuration Management for Titan Memory
 */

import * as fs from 'fs';
import * as path from 'path';
import { TitanConfig } from '../types.js';

const DEFAULT_CONFIG: TitanConfig = {
  // Storage paths
  dataDir: path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'titan-memory', 'data'),
  episodicDir: path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'titan-memory', 'data', 'episodic'),
  factualDbPath: path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'titan-memory', 'data', 'factual', 'facts.db'),
  memoryMdPath: path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'titan-memory', 'MEMORY.md'),

  // Zilliz Cloud settings
  zillizUri: process.env.ZILLIZ_URI || '',
  zillizToken: process.env.ZILLIZ_TOKEN || '',
  zillizCollectionName: 'titan_memory',

  // Thresholds
  surpriseThreshold: 0.3,
  decayHalfLife: 180,
  maxMemoriesPerLayer: 10000,

  // Performance
  hashTableSize: 1000000,
  batchSize: 100,
  maxConcurrentQueries: 5,

  // Features
  enablePreCompactionFlush: true,
  enableSurpriseFiltering: true,
  enableContinualLearning: true,
  offlineMode: false,
};

let currentConfig: TitanConfig = { ...DEFAULT_CONFIG };

/**
 * Load configuration from file and environment
 */
export function loadConfig(configPath?: string): TitanConfig {
  const defaultPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'titan-memory',
    'config.json'
  );
  const filePath = configPath || defaultPath;

  // Start with defaults
  currentConfig = { ...DEFAULT_CONFIG };

  // Load from file if exists
  if (fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      currentConfig = { ...currentConfig, ...fileConfig };
    } catch (error) {
      console.warn(`Failed to load config from ${filePath}:`, error);
    }
  }

  // Override with environment variables
  if (process.env.ZILLIZ_URI) {
    currentConfig.zillizUri = process.env.ZILLIZ_URI;
  }
  if (process.env.ZILLIZ_TOKEN) {
    currentConfig.zillizToken = process.env.ZILLIZ_TOKEN;
  }
  if (process.env.TITAN_SURPRISE_THRESHOLD) {
    currentConfig.surpriseThreshold = parseFloat(process.env.TITAN_SURPRISE_THRESHOLD);
  }
  if (process.env.TITAN_OFFLINE_MODE === 'true') {
    currentConfig.offlineMode = true;
  }

  return currentConfig;
}

/**
 * Get current configuration
 */
export function getConfig(): TitanConfig {
  return currentConfig;
}

/**
 * Update configuration
 */
export function updateConfig(updates: Partial<TitanConfig>): TitanConfig {
  currentConfig = { ...currentConfig, ...updates };
  return currentConfig;
}

/**
 * Save configuration to file
 */
export function saveConfig(configPath?: string): void {
  const defaultPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'titan-memory',
    'config.json'
  );
  const filePath = configPath || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Remove sensitive data before saving
  const configToSave = { ...currentConfig };
  delete (configToSave as Record<string, unknown>).zillizToken;

  fs.writeFileSync(filePath, JSON.stringify(configToSave, null, 2));
}

/**
 * Ensure all data directories exist
 */
export function ensureDirectories(): void {
  const dirs = [
    currentConfig.dataDir,
    currentConfig.episodicDir,
    path.dirname(currentConfig.factualDbPath),
    path.join(currentConfig.dataDir, 'semantic'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Validate configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required for online mode
  if (!currentConfig.offlineMode) {
    if (!currentConfig.zillizUri) {
      errors.push('ZILLIZ_URI is required for online mode');
    }
    if (!currentConfig.zillizToken) {
      errors.push('ZILLIZ_TOKEN is required for online mode');
    }
  }

  // Validate thresholds
  if (currentConfig.surpriseThreshold < 0 || currentConfig.surpriseThreshold > 1) {
    errors.push('surpriseThreshold must be between 0 and 1');
  }

  if (currentConfig.decayHalfLife < 1) {
    errors.push('decayHalfLife must be at least 1 day');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

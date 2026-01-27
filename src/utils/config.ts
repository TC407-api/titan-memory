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

  // FR-3: Proactive Context Flush
  contextFlushThreshold: 0.5,  // 50%
  enableProactiveFlush: true,
};

let currentConfig: TitanConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;

/**
 * Load configuration from file and environment
 * Idempotent - only loads once unless a specific configPath is provided
 * Preserves any manual overrides from updateConfig()
 */
export function loadConfig(configPath?: string): TitanConfig {
  // If already loaded and no specific path requested, preserve existing config
  // This prevents TitanMemory constructor from resetting test isolation overrides
  if (configLoaded && !configPath) {
    return currentConfig;
  }

  const defaultPath = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'titan-memory',
    'config.json'
  );
  const filePath = configPath || defaultPath;

  // Preserve any manual overrides before resetting
  const manualOverrides = configLoaded ? { ...currentConfig } : {};

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

  // Re-apply any manual overrides (important for test isolation)
  if (Object.keys(manualOverrides).length > 0) {
    currentConfig = { ...currentConfig, ...manualOverrides };
  }

  configLoaded = true;
  return currentConfig;
}

/**
 * Get current configuration
 */
export function getConfig(): TitanConfig {
  return currentConfig;
}

/**
 * Update configuration (marks config as loaded to prevent reset)
 */
export function updateConfig(updates: Partial<TitanConfig>): TitanConfig {
  currentConfig = { ...currentConfig, ...updates };
  configLoaded = true; // Prevent loadConfig() from resetting these overrides
  return currentConfig;
}

/**
 * Reset configuration to defaults (for testing)
 */
export function resetConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  configLoaded = false;
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
 * Ensure all data directories exist (for default project)
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
 * Get project-specific data directory
 * @param projectId - Optional project identifier. If undefined or 'default', returns the default data dir.
 * @returns Path to the project's data directory
 */
export function getProjectDataDir(projectId?: string): string {
  // Use configured dataDir (respects updateConfig for test isolation)
  const baseDir = currentConfig.dataDir;

  if (!projectId || projectId === 'default') {
    return baseDir;
  }

  return path.join(baseDir, 'projects', projectId);
}

/**
 * Get project-specific paths for all storage locations
 * @param projectId - Optional project identifier
 * @returns Object with all project-specific paths
 */
export function getProjectPaths(projectId?: string): {
  dataDir: string;
  episodicDir: string;
  factualDbPath: string;
  semanticDir: string;
  memoryMdPath: string;
} {
  const projectDir = getProjectDataDir(projectId);

  return {
    dataDir: projectDir,
    episodicDir: path.join(projectDir, 'episodic'),
    factualDbPath: path.join(projectDir, 'factual', 'facts.json'),
    semanticDir: path.join(projectDir, 'semantic'),
    memoryMdPath: path.join(projectDir, 'MEMORY.md'),
  };
}

/**
 * Ensure project-specific directories exist
 * @param projectId - Optional project identifier
 */
export function ensureProjectDirectories(projectId?: string): void {
  const paths = getProjectPaths(projectId);

  const dirs = [
    paths.dataDir,
    paths.episodicDir,
    path.dirname(paths.factualDbPath),
    paths.semanticDir,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get Zilliz collection name for a project
 * @param projectId - Optional project identifier
 * @returns Collection name with project suffix
 */
export function getProjectCollectionName(projectId?: string): string {
  const baseCollection = currentConfig.zillizCollectionName || 'titan_memory';

  if (!projectId || projectId === 'default') {
    return baseCollection;
  }

  // Sanitize projectId for collection name (alphanumeric and underscores only)
  const sanitized = projectId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `${baseCollection}_${sanitized}`;
}

/**
 * List all project IDs that have data directories
 * @returns Array of project IDs
 */
export function listProjects(): string[] {
  const projectsDir = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude',
    'titan-memory',
    'data',
    'projects'
  );

  if (!fs.existsSync(projectsDir)) {
    return ['default'];
  }

  const projects = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  return ['default', ...projects];
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

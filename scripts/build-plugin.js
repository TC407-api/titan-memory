#!/usr/bin/env node
/**
 * Build script for Titan Memory Claude Code Plugin
 *
 * Assembles a self-contained plugin directory from the compiled output.
 * Run: npm run build-plugin (after npm run build)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugin');
const PLUGIN_DIST = path.join(PLUGIN, 'dist');
const PLUGIN_BIN = path.join(PLUGIN, 'bin');
const ROOT_DIST = path.join(ROOT, 'dist');
const ROOT_BIN = path.join(ROOT, 'bin');

function log(msg) {
  console.log(`[build-plugin] ${msg}`);
}

function clean() {
  log('Cleaning plugin build artifacts...');
  for (const dir of [PLUGIN_DIST, PLUGIN_BIN, path.join(PLUGIN, 'node_modules')]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

// Directories to exclude from dist/ copy (not needed for MCP server)
const DIST_EXCLUDE = new Set(['dashboard', 'cli']);

function copyDir(src, dest, excludeSet) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeSet && excludeSet.has(entry.name)) {
      log(`  Skipping ${entry.name}/ (excluded)`);
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyDist() {
  if (!fs.existsSync(ROOT_DIST)) {
    console.error('[build-plugin] ERROR: dist/ not found. Run "npm run build" first.');
    process.exit(1);
  }
  log('Copying dist/ -> plugin/dist/ (excluding dashboard, cli)');
  copyDir(ROOT_DIST, PLUGIN_DIST, DIST_EXCLUDE);
}

function copyBin() {
  const mcpSrc = path.join(ROOT_BIN, 'titan-mcp.js');
  if (!fs.existsSync(mcpSrc)) {
    console.error('[build-plugin] ERROR: bin/titan-mcp.js not found.');
    process.exit(1);
  }
  log('Copying bin/titan-mcp.js -> plugin/bin/titan-mcp.js');
  fs.mkdirSync(PLUGIN_BIN, { recursive: true });

  // Read the original and rewrite the import path for plugin context
  let content = fs.readFileSync(mcpSrc, 'utf-8');
  // In the plugin, dist/ is a sibling of bin/, so ../dist/ still works
  fs.writeFileSync(path.join(PLUGIN_BIN, 'titan-mcp.js'), content);
}

function generatePackageJson() {
  log('Generating plugin/package.json with production deps...');
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

  const pluginPkg = {
    name: 'titan-memory-plugin',
    version: rootPkg.version,
    description: 'Titan Memory Claude Code Plugin — 5-layer cognitive memory',
    main: 'dist/index.js',
    bin: {
      'titan-mcp': './bin/titan-mcp.js',
    },
    dependencies: rootPkg.dependencies,
    engines: rootPkg.engines,
    license: rootPkg.license,
    private: true,
  };

  fs.writeFileSync(
    path.join(PLUGIN, 'package.json'),
    JSON.stringify(pluginPkg, null, 2) + '\n'
  );
}

function installDeps() {
  log('Installing production dependencies in plugin/...');
  execSync('npm install --omit=dev', {
    cwd: PLUGIN,
    stdio: 'inherit',
  });
}

function syncVersions() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const version = rootPkg.version;
  log(`Syncing version ${version} into plugin manifests...`);

  const manifests = [
    path.join(PLUGIN, '.claude-plugin', 'plugin.json'),
    path.join(PLUGIN, '.claude-plugin', 'marketplace.json'),
    path.join(ROOT, 'marketplace.json'),
  ];

  for (const file of manifests) {
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

    if (data.version) {
      data.version = version;
    }
    if (data.plugins) {
      for (const p of data.plugins) {
        if (p.version) p.version = version;
      }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
}

function reportSize() {
  log('Calculating plugin size...');
  let totalSize = 0;
  let fileCount = 0;

  function walkSize(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkSize(full);
      } else {
        totalSize += fs.statSync(full).size;
        fileCount++;
      }
    }
  }

  walkSize(PLUGIN);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
  log(`Plugin size: ${sizeMB} MB (${fileCount} files)`);
}

// Main
async function main() {
  log('Building Titan Memory Claude Code Plugin...');
  log('');

  clean();
  copyDist();
  copyBin();
  generatePackageJson();
  installDeps();
  syncVersions();

  log('');
  reportSize();
  log('');
  log('Plugin built successfully!');
  log('Test with: claude --plugin-dir ./plugin');
}

main().catch((err) => {
  console.error('[build-plugin] Fatal error:', err);
  process.exit(1);
});

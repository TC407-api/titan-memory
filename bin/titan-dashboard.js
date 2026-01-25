#!/usr/bin/env node

/**
 * Titan Memory Dashboard CLI Entry Point
 */

import { startDashboard } from '../dist/dashboard/index.js';

const args = process.argv.slice(2);
const options = {
  port: 3939,
  host: '127.0.0.1',
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    options.port = parseInt(args[++i]) || 3939;
  } else if (args[i] === '--host' || args[i] === '-h') {
    options.host = args[++i] || '127.0.0.1';
  } else if (args[i] === '--project') {
    options.projectId = args[++i];
  } else if (args[i] === '--help') {
    console.log(`
Titan Memory Dashboard

Usage: titan-dashboard [options]

Options:
  -p, --port <number>    Port to listen on (default: 3939)
  -h, --host <string>    Host to bind to (default: 127.0.0.1)
  --project <string>     Project ID to load
  --help                 Show this help message

Examples:
  titan-dashboard
  titan-dashboard --port 8080
  titan-dashboard --project my-project
`);
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down dashboard...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down dashboard...');
  process.exit(0);
});

// Start the dashboard
startDashboard(options).catch((error) => {
  console.error('Failed to start dashboard:', error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Titan Memory MCP Server Executable
 *
 * Usage:
 *   titan-mcp              # Start with stdio transport (default, backward compatible)
 *   titan-mcp --http       # Start with HTTP transport (OAuth secured)
 *   titan-mcp --http --port 3000  # HTTP on custom port
 *   titan-mcp --dual       # Both stdio and HTTP transports
 *
 * Environment Variables:
 *   AUTH0_DOMAIN    - Auth0 tenant domain (e.g., your-tenant.auth0.com)
 *   AUTH0_AUDIENCE  - Auth0 API audience (e.g., https://titan-memory.api)
 *   TITAN_HTTP_PORT - HTTP port (default: 3000)
 *   TITAN_ALLOW_LOCALHOST_BYPASS - Allow unauthenticated localhost (default: true in dev)
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('titan-mcp')
  .description('Titan Memory MCP Server - Universal Cognitive Memory Layer')
  .version('1.0.0')
  .option('--http', 'Use HTTP transport with OAuth authentication')
  .option('--dual', 'Use both stdio and HTTP transports')
  .option('-p, --port <number>', 'HTTP port (default: 3000)', parseInt)
  .option('-h, --host <address>', 'HTTP host (default: 127.0.0.1)')
  .option('--no-localhost-bypass', 'Disable localhost authentication bypass')
  .option('--no-audit-log', 'Disable authentication audit logging')
  .action(async (options) => {
    try {
      // Determine transport mode
      let mode = 'stdio';
      if (options.dual) {
        mode = 'dual';
      } else if (options.http) {
        mode = 'http';
      }

      // Build config
      const config = {
        mode,
        port: options.port,
        host: options.host,
        allowLocalhostBypass: options.localhostBypass !== false,
        enableAuditLog: options.auditLog !== false,
      };

      // Import and start server with config
      const { startServerWithConfig } = await import('../dist/mcp/server.js');
      await startServerWithConfig(config);
    } catch (error) {
      console.error('[titan-memory] Fatal error:', error);
      process.exit(1);
    }
  });

program.parse();

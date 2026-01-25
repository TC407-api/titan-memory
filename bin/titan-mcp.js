#!/usr/bin/env node
/**
 * Titan Memory MCP Server Executable
 * Run with: npx titan-mcp or titan-mcp (if globally installed)
 */

import('../dist/mcp/server.js').then(({ startServer }) => {
  startServer().catch((error) => {
    console.error('[titan-memory] Fatal error:', error);
    process.exit(1);
  });
});

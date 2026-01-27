/**
 * Titan Memory MCP Server
 * Exposes TitanMemory as an MCP-compatible server
 * Supports both stdio (default) and HTTP transports
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolDefinitions, ToolHandler } from './tools.js';
import { startHttpServer, HttpServerConfig } from './http-server.js';

const SERVER_NAME = 'titan-memory';
const SERVER_VERSION = '1.0.0';

/**
 * Transport mode for the MCP server
 */
export type TransportMode = 'stdio' | 'http' | 'dual';

/**
 * Server configuration options
 */
export interface ServerConfig extends HttpServerConfig {
  /** Transport mode (default: stdio for backward compatibility) */
  mode?: TransportMode;
}

/**
 * Create and configure the Titan Memory MCP Server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const toolHandler = new ToolHandler();

  // Handle tools/list request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ToolDefinitions,
    };
  });

  // Handle tools/call request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return toolHandler.handleToolCall(name, args as Record<string, unknown>);
  });

  // Graceful shutdown
  const cleanup = async () => {
    await toolHandler.close();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return server;
}

/**
 * Start the MCP server with stdio transport (default, backward compatible)
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so it doesn't interfere with JSON-RPC on stdout
  console.error(`[titan-memory] MCP server started (v${SERVER_VERSION})`);
  console.error(`[titan-memory] Ready to accept connections via stdio`);
}

/**
 * Start the MCP server with specified configuration
 */
export async function startServerWithConfig(config: ServerConfig = {}): Promise<void> {
  const { mode = 'stdio', ...httpConfig } = config;

  switch (mode) {
    case 'stdio':
      await startServer();
      break;

    case 'http':
      await startHttpServer(httpConfig);
      break;

    case 'dual':
      // Start both transports
      console.error(`[titan-memory] Starting dual-mode server...`);

      // Start HTTP server (doesn't block)
      startHttpServer(httpConfig).catch((error) => {
        console.error(`[titan-memory] HTTP server error:`, error);
      });

      // Start stdio server (blocks)
      await startServer();
      break;

    default:
      throw new Error(`Unknown transport mode: ${mode}`);
  }
}

// Export for HTTP server module
export { startHttpServer, HttpServerConfig } from './http-server.js';

// Note: Use bin/titan-mcp.js as the entry point
// This module exports startServer() for programmatic use

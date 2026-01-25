/**
 * Titan Memory MCP Server
 * Exposes TitanMemory as an MCP-compatible server via stdio transport
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolDefinitions, ToolHandler } from './tools.js';

const SERVER_NAME = 'titan-memory';
const SERVER_VERSION = '1.0.0';

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
 * Start the MCP server with stdio transport
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so it doesn't interfere with JSON-RPC on stdout
  console.error(`[titan-memory] MCP server started (v${SERVER_VERSION})`);
  console.error(`[titan-memory] Ready to accept connections via stdio`);
}

// Note: Use bin/titan-mcp.js as the entry point
// This module exports startServer() for programmatic use

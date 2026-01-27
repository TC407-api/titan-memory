/**
 * Titan Memory MCP Server - Public Exports
 */

// Server exports
export {
  createServer,
  startServer,
  startServerWithConfig,
  startHttpServer,
  TransportMode,
  ServerConfig,
  HttpServerConfig,
} from './server.js';

// Tool exports
export { ToolHandler, ToolDefinitions, ToolSchemas } from './tools.js';

// HTTP server exports
export { createHttpApp, getActiveSessionCount } from './http-server.js';

// Discovery exports
export {
  createDiscoveryRouter,
  getResourceMetadata,
  ProtectedResourceMetadata,
  ExtendedResourceMetadata,
  DiscoveryConfig,
} from './discovery.js';

// Auth exports
export * from './auth/index.js';

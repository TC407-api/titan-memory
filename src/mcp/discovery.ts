/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * Discovery endpoints for OAuth-protected MCP server
 */

import { Router, Request, Response } from 'express';
import { AllScopes, ScopeDescriptions } from './auth/scopes.js';

/**
 * OAuth Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
  /** Resource identifier */
  resource: string;
  /** Authorization servers that can issue tokens */
  authorization_servers: string[];
  /** Supported scopes */
  scopes_supported: string[];
  /** Bearer token methods supported */
  bearer_methods_supported: string[];
  /** Resource documentation URL */
  resource_documentation?: string;
  /** Resource policy URL */
  resource_policy_uri?: string;
  /** Resource terms of service URL */
  resource_tos_uri?: string;
}

/**
 * Extended metadata with scope descriptions
 */
export interface ExtendedResourceMetadata extends ProtectedResourceMetadata {
  /** Human-readable scope descriptions */
  scope_descriptions: Record<string, string>;
  /** MCP server info */
  mcp_server: {
    name: string;
    version: string;
    transport: string;
  };
}

/**
 * Discovery endpoint configuration
 */
export interface DiscoveryConfig {
  /** Resource identifier (e.g., 'https://titan-memory.api') */
  resourceId: string;
  /** Auth0 domain for authorization server */
  auth0Domain: string;
  /** Server version */
  serverVersion?: string;
  /** Documentation URL */
  documentationUrl?: string;
}

/**
 * Create discovery router with OAuth metadata endpoints
 */
export function createDiscoveryRouter(config: DiscoveryConfig): Router {
  const router = Router();

  const metadata: ExtendedResourceMetadata = {
    resource: config.resourceId,
    authorization_servers: [`https://${config.auth0Domain}/`],
    scopes_supported: AllScopes,
    bearer_methods_supported: ['header'],
    resource_documentation: config.documentationUrl || 'https://github.com/travhall/titan-memory',
    scope_descriptions: ScopeDescriptions as Record<string, string>,
    mcp_server: {
      name: 'titan-memory',
      version: config.serverVersion || '1.0.0',
      transport: 'streamable-http',
    },
  };

  /**
   * RFC 9728 - OAuth Protected Resource Metadata
   * GET /.well-known/oauth-protected-resource
   */
  router.get('/oauth-protected-resource', (_req: Request, res: Response) => {
    res.json(metadata);
  });

  /**
   * Extended discovery endpoint with tool-scope mappings
   * GET /.well-known/mcp-server
   */
  router.get('/mcp-server', (_req: Request, res: Response) => {
    res.json({
      ...metadata,
      tool_scopes: {
        titan_recall: ['memory:read'],
        titan_get: ['memory:read'],
        titan_stats: ['memory:read'],
        titan_today: ['memory:read'],
        titan_add: ['memory:write'],
        titan_curate: ['memory:write'],
        titan_delete: ['memory:delete'],
        titan_feedback: ['memory:feedback'],
        titan_flush: ['memory:admin'],
        titan_prune: ['memory:admin'],
      },
    });
  });

  return router;
}

/**
 * Get base metadata without Express router (for testing)
 */
export function getResourceMetadata(config: DiscoveryConfig): ExtendedResourceMetadata {
  return {
    resource: config.resourceId,
    authorization_servers: [`https://${config.auth0Domain}/`],
    scopes_supported: AllScopes,
    bearer_methods_supported: ['header'],
    resource_documentation: config.documentationUrl || 'https://github.com/travhall/titan-memory',
    scope_descriptions: ScopeDescriptions as Record<string, string>,
    mcp_server: {
      name: 'titan-memory',
      version: config.serverVersion || '1.0.0',
      transport: 'streamable-http',
    },
  };
}

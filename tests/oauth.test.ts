/**
 * OAuth 2.1 Authentication Tests
 * Tests for JWT validation, scopes, and middleware
 */

import { describe, it, expect } from '@jest/globals';
import {
  Scopes,
  ToolScopes,
  AllScopes,
  expandScopes,
  hasRequiredScopes,
  getRequiredScopes,
  ScopeDescriptions,
} from '../src/mcp/auth/scopes';
import {
  extractBearerToken,
  checkToolAccess,
} from '../src/mcp/auth/middleware';
import {
  getResourceMetadata,
  DiscoveryConfig,
} from '../src/mcp/discovery';

describe('Scopes Module', () => {
  describe('Scope definitions', () => {
    it('should define all required scopes', () => {
      expect(Scopes.READ).toBe('memory:read');
      expect(Scopes.WRITE).toBe('memory:write');
      expect(Scopes.DELETE).toBe('memory:delete');
      expect(Scopes.FEEDBACK).toBe('memory:feedback');
      expect(Scopes.ADMIN).toBe('memory:admin');
      expect(Scopes.FULL).toBe('memory:full');
    });

    it('should have all scopes in AllScopes', () => {
      expect(AllScopes).toContain(Scopes.READ);
      expect(AllScopes).toContain(Scopes.WRITE);
      expect(AllScopes).toContain(Scopes.DELETE);
      expect(AllScopes).toContain(Scopes.FEEDBACK);
      expect(AllScopes).toContain(Scopes.ADMIN);
      expect(AllScopes).toContain(Scopes.FULL);
    });

    it('should have descriptions for all scopes', () => {
      for (const scope of AllScopes) {
        expect(ScopeDescriptions[scope]).toBeDefined();
        expect(typeof ScopeDescriptions[scope]).toBe('string');
      }
    });
  });

  describe('Tool to scope mapping', () => {
    it('should map read tools to memory:read', () => {
      expect(ToolScopes.titan_recall).toContain(Scopes.READ);
      expect(ToolScopes.titan_get).toContain(Scopes.READ);
      expect(ToolScopes.titan_stats).toContain(Scopes.READ);
      expect(ToolScopes.titan_today).toContain(Scopes.READ);
    });

    it('should map write tools to memory:write', () => {
      expect(ToolScopes.titan_add).toContain(Scopes.WRITE);
      expect(ToolScopes.titan_curate).toContain(Scopes.WRITE);
    });

    it('should map delete tools to memory:delete', () => {
      expect(ToolScopes.titan_delete).toContain(Scopes.DELETE);
    });

    it('should map feedback tools to memory:feedback', () => {
      expect(ToolScopes.titan_feedback).toContain(Scopes.FEEDBACK);
    });

    it('should map admin tools to memory:admin', () => {
      expect(ToolScopes.titan_flush).toContain(Scopes.ADMIN);
      expect(ToolScopes.titan_prune).toContain(Scopes.ADMIN);
    });
  });

  describe('expandScopes', () => {
    it('should pass through regular scopes', () => {
      const result = expandScopes(['memory:read', 'memory:write']);
      expect(result).toContain('memory:read');
      expect(result).toContain('memory:write');
    });

    it('should expand memory:full to all scopes', () => {
      const result = expandScopes(['memory:full']);
      expect(result).toContain('memory:full');
      expect(result).toContain('memory:read');
      expect(result).toContain('memory:write');
      expect(result).toContain('memory:delete');
      expect(result).toContain('memory:feedback');
      expect(result).toContain('memory:admin');
    });

    it('should deduplicate scopes', () => {
      const result = expandScopes(['memory:read', 'memory:read', 'memory:full']);
      const readCount = result.filter(s => s === 'memory:read').length;
      expect(readCount).toBe(1);
    });
  });

  describe('hasRequiredScopes', () => {
    it('should return true when token has required scope', () => {
      expect(hasRequiredScopes('titan_recall', ['memory:read'])).toBe(true);
      expect(hasRequiredScopes('titan_add', ['memory:write'])).toBe(true);
      expect(hasRequiredScopes('titan_delete', ['memory:delete'])).toBe(true);
    });

    it('should return true when token has memory:full', () => {
      expect(hasRequiredScopes('titan_recall', ['memory:full'])).toBe(true);
      expect(hasRequiredScopes('titan_add', ['memory:full'])).toBe(true);
      expect(hasRequiredScopes('titan_delete', ['memory:full'])).toBe(true);
      expect(hasRequiredScopes('titan_prune', ['memory:full'])).toBe(true);
    });

    it('should return false when token lacks required scope', () => {
      expect(hasRequiredScopes('titan_add', ['memory:read'])).toBe(false);
      expect(hasRequiredScopes('titan_delete', ['memory:read', 'memory:write'])).toBe(false);
      expect(hasRequiredScopes('titan_prune', ['memory:read'])).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(hasRequiredScopes('unknown_tool', ['memory:full'])).toBe(false);
    });
  });

  describe('getRequiredScopes', () => {
    it('should return required scopes for known tools', () => {
      expect(getRequiredScopes('titan_recall')).toEqual([Scopes.READ]);
      expect(getRequiredScopes('titan_add')).toEqual([Scopes.WRITE]);
      expect(getRequiredScopes('titan_prune')).toEqual([Scopes.ADMIN]);
    });

    it('should return empty array for unknown tools', () => {
      expect(getRequiredScopes('unknown_tool')).toEqual([]);
    });
  });
});

describe('Middleware Module', () => {
  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
      expect(extractBearerToken('bearer xyz789')).toBe('xyz789');
    });

    it('should return null for invalid headers', () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken('')).toBeNull();
      expect(extractBearerToken('Basic abc123')).toBeNull();
      expect(extractBearerToken('Bearer')).toBeNull();
      expect(extractBearerToken('Bearer token extra')).toBeNull();
    });
  });

  describe('checkToolAccess', () => {
    it('should allow access when auth is bypassed', () => {
      const result = checkToolAccess(
        { token: null as any, bypassed: true },
        'titan_prune'
      );
      expect(result.allowed).toBe(true);
    });

    it('should deny access when no auth info', () => {
      const result = checkToolAccess(undefined, 'titan_recall');
      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Authentication required');
    });

    it('should allow access when token has required scope', () => {
      const result = checkToolAccess(
        {
          token: {
            sub: 'user123',
            scopes: ['memory:read'],
            iss: 'https://test.auth0.com/',
            aud: 'test',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            claims: {},
          },
          bypassed: false,
        },
        'titan_recall'
      );
      expect(result.allowed).toBe(true);
    });

    it('should deny access when token lacks required scope', () => {
      const result = checkToolAccess(
        {
          token: {
            sub: 'user123',
            scopes: ['memory:read'],
            iss: 'https://test.auth0.com/',
            aud: 'test',
            exp: Date.now() / 1000 + 3600,
            iat: Date.now() / 1000,
            claims: {},
          },
          bypassed: false,
        },
        'titan_add'
      );
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Missing required scopes');
    });
  });
});

describe('Discovery Module', () => {
  const testConfig: DiscoveryConfig = {
    resourceId: 'https://titan-memory.api',
    auth0Domain: 'test.auth0.com',
    serverVersion: '1.0.0',
    documentationUrl: 'https://docs.example.com',
  };

  describe('getResourceMetadata', () => {
    it('should return valid metadata structure', () => {
      const metadata = getResourceMetadata(testConfig);

      expect(metadata.resource).toBe('https://titan-memory.api');
      expect(metadata.authorization_servers).toContain('https://test.auth0.com/');
      expect(metadata.bearer_methods_supported).toContain('header');
      expect(metadata.resource_documentation).toBe('https://docs.example.com');
    });

    it('should include all scopes', () => {
      const metadata = getResourceMetadata(testConfig);

      expect(metadata.scopes_supported).toContain('memory:read');
      expect(metadata.scopes_supported).toContain('memory:write');
      expect(metadata.scopes_supported).toContain('memory:delete');
      expect(metadata.scopes_supported).toContain('memory:admin');
      expect(metadata.scopes_supported).toContain('memory:full');
    });

    it('should include scope descriptions', () => {
      const metadata = getResourceMetadata(testConfig);

      expect(metadata.scope_descriptions['memory:read']).toBeDefined();
      expect(metadata.scope_descriptions['memory:write']).toBeDefined();
    });

    it('should include MCP server info', () => {
      const metadata = getResourceMetadata(testConfig);

      expect(metadata.mcp_server.name).toBe('titan-memory');
      expect(metadata.mcp_server.version).toBe('1.0.0');
      expect(metadata.mcp_server.transport).toBe('streamable-http');
    });
  });
});

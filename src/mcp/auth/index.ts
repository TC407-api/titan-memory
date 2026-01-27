/**
 * Auth module exports for titan-memory MCP server
 */

export {
  Auth0Verifier,
  Auth0VerifierConfig,
  VerifiedToken,
  TokenVerificationError,
  createAuth0VerifierFromEnv,
} from './auth0-verifier.js';

export {
  Scopes,
  Scope,
  ToolScopes,
  AllScopes,
  ScopeDescriptions,
  expandScopes,
  hasRequiredScopes,
  getRequiredScopes,
} from './scopes.js';

export {
  AuthMiddlewareConfig,
  AuthenticatedRequest,
  extractBearerToken,
  createAuthMiddleware,
  createScopeMiddleware,
  checkToolAccess,
} from './middleware.js';

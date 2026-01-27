/**
 * Auth0 JWT Token Verifier
 * Validates JWT tokens using Auth0 JWKS endpoint with caching
 */

import * as jose from 'jose';

/**
 * Verified token payload with extracted claims
 */
export interface VerifiedToken {
  /** Subject (user ID or client ID) */
  sub: string;
  /** Scopes granted to the token */
  scopes: string[];
  /** Token issuer (Auth0 domain) */
  iss: string;
  /** Audience the token was issued for */
  aud: string | string[];
  /** Token expiration time (unix timestamp) */
  exp: number;
  /** Token issued at time (unix timestamp) */
  iat: number;
  /** All claims from the token */
  claims: jose.JWTPayload;
}

/**
 * Auth0 verifier configuration
 */
export interface Auth0VerifierConfig {
  /** Auth0 domain (e.g., 'your-tenant.auth0.com') */
  domain: string;
  /** Expected audience for API tokens */
  audience: string;
  /** JWKS cache TTL in milliseconds (default: 10 minutes) */
  jwksCacheTtl?: number;
}

/**
 * Token verification error
 */
export class TokenVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 'EXPIRED' | 'INVALID_SIGNATURE' | 'INVALID_CLAIMS' | 'NETWORK_ERROR' | 'MISSING_TOKEN'
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

/**
 * Auth0 JWT Verifier with JWKS caching
 */
export class Auth0Verifier {
  private jwks: jose.JWTVerifyGetKey | null = null;
  private jwksLastFetch: number = 0;
  private readonly config: Required<Auth0VerifierConfig>;

  constructor(config: Auth0VerifierConfig) {
    this.config = {
      ...config,
      jwksCacheTtl: config.jwksCacheTtl ?? 10 * 60 * 1000, // 10 minutes default
    };
  }

  /**
   * Get the JWKS key set, with caching
   */
  private async getJWKS(): Promise<jose.JWTVerifyGetKey> {
    const now = Date.now();

    // Check if cache is still valid
    if (this.jwks && now - this.jwksLastFetch < this.config.jwksCacheTtl) {
      return this.jwks;
    }

    try {
      const issuerUrl = `https://${this.config.domain}/`;
      this.jwks = jose.createRemoteJWKSet(new URL(`${issuerUrl}.well-known/jwks.json`));
      this.jwksLastFetch = now;

      console.error(`[titan-memory] JWKS refreshed from ${this.config.domain}`);
      return this.jwks;
    } catch (error) {
      throw new TokenVerificationError(
        `Failed to fetch JWKS from Auth0: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Verify a JWT token
   * @param token - The JWT token string (without 'Bearer ' prefix)
   * @returns Verified token payload with extracted scopes
   * @throws TokenVerificationError if verification fails
   */
  async verify(token: string): Promise<VerifiedToken> {
    if (!token) {
      throw new TokenVerificationError('No token provided', 'MISSING_TOKEN');
    }

    const jwks = await this.getJWKS();
    const issuer = `https://${this.config.domain}/`;

    try {
      const { payload } = await jose.jwtVerify(token, jwks, {
        issuer,
        audience: this.config.audience,
      });

      // Extract scopes from token
      // Auth0 typically puts scopes in 'scope' claim as space-separated string
      // or 'permissions' as an array
      const scopes = this.extractScopes(payload);

      return {
        sub: payload.sub || '',
        scopes,
        iss: payload.iss || issuer,
        aud: payload.aud || this.config.audience,
        exp: payload.exp || 0,
        iat: payload.iat || 0,
        claims: payload,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenVerificationError('Token has expired', 'EXPIRED');
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new TokenVerificationError('Invalid token signature', 'INVALID_SIGNATURE');
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        throw new TokenVerificationError(
          `Token claims validation failed: ${error.message}`,
          'INVALID_CLAIMS'
        );
      }
      if (error instanceof TokenVerificationError) {
        throw error;
      }
      throw new TokenVerificationError(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
        'INVALID_CLAIMS'
      );
    }
  }

  /**
   * Extract scopes from JWT payload
   * Handles both 'scope' (space-separated string) and 'permissions' (array) claims
   */
  private extractScopes(payload: jose.JWTPayload): string[] {
    const scopes = new Set<string>();

    // Standard 'scope' claim (space-separated string)
    if (typeof payload.scope === 'string') {
      for (const scope of payload.scope.split(' ')) {
        if (scope) {
          scopes.add(scope);
        }
      }
    }

    // Auth0 'permissions' claim (array)
    if (Array.isArray(payload.permissions)) {
      for (const perm of payload.permissions) {
        if (typeof perm === 'string') {
          scopes.add(perm);
        }
      }
    }

    return Array.from(scopes);
  }

  /**
   * Force refresh of JWKS cache
   */
  invalidateCache(): void {
    this.jwks = null;
    this.jwksLastFetch = 0;
  }

  /**
   * Get the expected issuer URL
   */
  getIssuer(): string {
    return `https://${this.config.domain}/`;
  }

  /**
   * Get the expected audience
   */
  getAudience(): string {
    return this.config.audience;
  }
}

/**
 * Create an Auth0 verifier from environment variables
 * Uses AUTH0_DOMAIN and AUTH0_AUDIENCE env vars
 */
export function createAuth0VerifierFromEnv(): Auth0Verifier | null {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;

  if (!domain || !audience) {
    return null;
  }

  return new Auth0Verifier({ domain, audience });
}

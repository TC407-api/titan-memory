/**
 * Tests for authentication utilities
 */

import {
  initAuth,
  getAuthConfig,
  generateToken,
  validateDashboardToken,
  validateA2AToken,
  isLocalhost,
  shouldBypassAuth,
  sanitizeFilterValue,
  isValidUUID,
  isAllowedOrigin,
} from '../src/utils/auth.js';

describe('Auth Utilities', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Reset auth config before each test
    initAuth({
      enabled: false,
      dashboardTokens: [],
      a2aTokens: [],
      tokenHeader: 'X-Titan-Token',
      allowLocalhostWithoutAuth: true,
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('initAuth', () => {
    it('should initialize with default config', () => {
      const config = initAuth();
      expect(config).toBeDefined();
      expect(config.tokenHeader).toBe('X-Titan-Token');
    });

    it('should merge custom config', () => {
      const config = initAuth({
        enabled: true,
        dashboardTokens: ['test-token'],
      });
      expect(config.enabled).toBe(true);
      expect(config.dashboardTokens).toContain('test-token');
    });
  });

  describe('getAuthConfig', () => {
    it('should return current config', () => {
      initAuth({ enabled: true });
      const config = getAuthConfig();
      expect(config.enabled).toBe(true);
    });
  });

  describe('generateToken', () => {
    it('should generate a token with titan_ prefix', () => {
      const token = generateToken();
      expect(token).toMatch(/^titan_[a-f0-9]{64}$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateDashboardToken', () => {
    it('should return true when auth is disabled', () => {
      initAuth({ enabled: false });
      expect(validateDashboardToken(undefined)).toBe(true);
    });

    it('should return false for undefined token when auth is enabled', () => {
      initAuth({ enabled: true, dashboardTokens: ['valid-token'] });
      expect(validateDashboardToken(undefined)).toBe(false);
    });

    it('should validate correct token', () => {
      initAuth({ enabled: true, dashboardTokens: ['valid-token'] });
      expect(validateDashboardToken('valid-token')).toBe(true);
    });

    it('should reject invalid token', () => {
      initAuth({ enabled: true, dashboardTokens: ['valid-token'] });
      expect(validateDashboardToken('invalid-token')).toBe(false);
    });
  });

  describe('validateA2AToken', () => {
    it('should return true when auth is disabled', () => {
      initAuth({ enabled: false });
      expect(validateA2AToken(undefined)).toBe(true);
    });

    it('should return false for undefined token when auth is enabled', () => {
      initAuth({ enabled: true, a2aTokens: ['valid-a2a-token'] });
      expect(validateA2AToken(undefined)).toBe(false);
    });

    it('should validate correct token', () => {
      initAuth({ enabled: true, a2aTokens: ['valid-a2a-token'] });
      expect(validateA2AToken('valid-a2a-token')).toBe(true);
    });

    it('should reject invalid token', () => {
      initAuth({ enabled: true, a2aTokens: ['valid-a2a-token'] });
      expect(validateA2AToken('invalid-token')).toBe(false);
    });
  });

  describe('isLocalhost', () => {
    it('should return true for 127.0.0.1', () => {
      expect(isLocalhost('127.0.0.1')).toBe(true);
    });

    it('should return true for ::1', () => {
      expect(isLocalhost('::1')).toBe(true);
    });

    it('should return true for localhost', () => {
      expect(isLocalhost('localhost')).toBe(true);
    });

    it('should return true for ::ffff:127.x.x.x', () => {
      expect(isLocalhost('::ffff:127.0.0.1')).toBe(true);
    });

    it('should return false for external IP', () => {
      expect(isLocalhost('192.168.1.1')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isLocalhost(undefined)).toBe(false);
    });
  });

  describe('shouldBypassAuth', () => {
    it('should return true when auth is disabled', () => {
      initAuth({ enabled: false });
      expect(shouldBypassAuth('192.168.1.1')).toBe(true);
    });

    it('should return true for localhost when allowLocalhostWithoutAuth is true', () => {
      initAuth({ enabled: true, allowLocalhostWithoutAuth: true });
      expect(shouldBypassAuth('127.0.0.1')).toBe(true);
    });

    it('should return false for localhost when allowLocalhostWithoutAuth is false', () => {
      initAuth({ enabled: true, allowLocalhostWithoutAuth: false });
      expect(shouldBypassAuth('127.0.0.1')).toBe(false);
    });

    it('should return false for external IP when auth is enabled', () => {
      initAuth({ enabled: true, allowLocalhostWithoutAuth: true });
      expect(shouldBypassAuth('192.168.1.1')).toBe(false);
    });
  });

  describe('sanitizeFilterValue', () => {
    it('should escape backslashes', () => {
      expect(sanitizeFilterValue('test\\value')).toBe('test\\\\value');
    });

    it('should escape double quotes', () => {
      expect(sanitizeFilterValue('test"value')).toBe('test\\"value');
    });

    it('should escape single quotes', () => {
      expect(sanitizeFilterValue("test'value")).toBe("test\\'value");
    });

    it('should escape backticks', () => {
      expect(sanitizeFilterValue('test`value')).toBe('test\\`value');
    });

    it('should escape dollar signs', () => {
      expect(sanitizeFilterValue('test$value')).toBe('test\\$value');
    });

    it('should escape curly braces', () => {
      expect(sanitizeFilterValue('test{value}')).toBe('test\\{value\\}');
    });

    it('should handle multiple special characters', () => {
      const input = '"; DROP TABLE users; --';
      const result = sanitizeFilterValue(input);
      // Should escape quotes, not remove them
      expect(result).toBe('\\"; DROP TABLE users; --');
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUID v4', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should return true for valid UUID v1', () => {
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should return false for invalid UUID', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    it('should return false for UUID with wrong format', () => {
      expect(isValidUUID('123e4567e89b12d3a456426614174000')).toBe(false);
    });
  });

  describe('isAllowedOrigin', () => {
    it('should return true for wildcard origin', () => {
      expect(isAllowedOrigin('https://example.com', ['*'])).toBe(true);
    });

    it('should return true for exact match', () => {
      expect(isAllowedOrigin('https://example.com', ['https://example.com'])).toBe(true);
    });

    it('should return false for non-matching origin', () => {
      expect(isAllowedOrigin('https://other.com', ['https://example.com'])).toBe(false);
    });

    it('should return false for undefined origin', () => {
      expect(isAllowedOrigin(undefined, ['https://example.com'])).toBe(false);
    });

    it('should support wildcard subdomains', () => {
      expect(isAllowedOrigin('https://sub.example.com', ['*.example.com'])).toBe(true);
    });

    it('should return true for base domain with wildcard subdomain', () => {
      expect(isAllowedOrigin('https://example.com', ['*.example.com'])).toBe(true);
    });
  });
});

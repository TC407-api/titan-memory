/**
 * CatBrain Types Tests
 */

import {
  DEFAULT_CATBRAIN_CONFIG,
  CATEGORY_LAYER_MAP,
} from '../src/catbrain/types';
import { MemoryLayer } from '../src/types';

describe('CatBrain Types', () => {
  describe('DEFAULT_CATBRAIN_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('enabled', false);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('retrieveCount', 50);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('highlightThreshold', 0.8);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('classifierConfidenceThreshold', 0.6);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('enableGuardrails', false);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('enableDriftMonitor', false);
      expect(DEFAULT_CATBRAIN_CONFIG).toHaveProperty('enableProjectHooks', false);
    });

    it('should be disabled by default', () => {
      expect(DEFAULT_CATBRAIN_CONFIG.enabled).toBe(false);
    });
  });

  describe('CATEGORY_LAYER_MAP', () => {
    it('should map knowledge to FACTUAL and LONG_TERM', () => {
      expect(CATEGORY_LAYER_MAP.knowledge).toContain(MemoryLayer.FACTUAL);
      expect(CATEGORY_LAYER_MAP.knowledge).toContain(MemoryLayer.LONG_TERM);
    });

    it('should map profile to SEMANTIC', () => {
      expect(CATEGORY_LAYER_MAP.profile).toContain(MemoryLayer.SEMANTIC);
    });

    it('should map event to EPISODIC', () => {
      expect(CATEGORY_LAYER_MAP.event).toContain(MemoryLayer.EPISODIC);
    });

    it('should map behavior to SEMANTIC', () => {
      expect(CATEGORY_LAYER_MAP.behavior).toContain(MemoryLayer.SEMANTIC);
    });

    it('should map skill to SEMANTIC', () => {
      expect(CATEGORY_LAYER_MAP.skill).toContain(MemoryLayer.SEMANTIC);
    });

    it('should have all 5 categories', () => {
      const categories = Object.keys(CATEGORY_LAYER_MAP);
      expect(categories).toHaveLength(5);
      expect(categories).toContain('knowledge');
      expect(categories).toContain('profile');
      expect(categories).toContain('event');
      expect(categories).toContain('behavior');
      expect(categories).toContain('skill');
    });
  });
});

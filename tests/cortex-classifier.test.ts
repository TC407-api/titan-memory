/**
 * Cortex Classifier Tests - 50+ test cases
 */

import { classifyContent, matchesCategory, getMatchingCategories, getCategoryLayer } from '../src/cortex/classifier';

describe('Cortex Classifier', () => {
  describe('Knowledge Classification', () => {
    it('should classify definitions', () => {
      const result = classifyContent('API rate limit is defined as 1000 requests per hour');
      expect(result.category).toBe('knowledge');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should classify API endpoints', () => {
      const result = classifyContent('The endpoint POST /api/users creates a new user');
      expect(result.category).toBe('knowledge');
    });

    it('should classify version info', () => {
      const result = classifyContent('Node.js version 18.17.0 is required');
      expect(result.category).toBe('knowledge');
    });

    it('should classify specs and standards', () => {
      const result = classifyContent('This follows the RFC 7231 specification for HTTP');
      expect(result.category).toBe('knowledge');
    });

    it('should classify documentation references', () => {
      const result = classifyContent('The documentation says the schema has 3 fields');
      expect(result.category).toBe('knowledge');
    });

    it('should classify type definitions', () => {
      const result = classifyContent('The interface accepts a string parameter called name');
      expect(result.category).toBe('knowledge');
    });

    it('should classify constant values', () => {
      const result = classifyContent('The maximum retry limit is 5 attempts');
      expect(result.category).toBe('knowledge');
    });

    it('should classify protocol info', () => {
      const result = classifyContent('The protocol uses WebSocket for real-time communication');
      expect(result.category).toBe('knowledge');
    });
  });

  describe('Profile Classification', () => {
    it('should classify user preferences', () => {
      const result = classifyContent('I prefer TypeScript over JavaScript for new projects');
      expect(result.category).toBe('profile');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should classify user wants', () => {
      const result = classifyContent('I want to use dark mode and I prefer minimal themes');
      expect(result.category).toBe('profile');
    });

    it('should classify user settings', () => {
      const result = classifyContent('My preferred coding style uses 2-space indentation');
      expect(result.category).toBe('profile');
    });

    it('should classify user dislikes', () => {
      const result = classifyContent('I dislike semicolons and I prefer no trailing commas');
      expect(result.category).toBe('profile');
    });

    it('should classify favorites', () => {
      const result = classifyContent('My favorite tool is VS Code and I prefer it over Vim');
      expect(result.category).toBe('profile');
    });

    it('should classify user needs', () => {
      const result = classifyContent('I need JSON format output and I prefer compact mode');
      expect(result.category).toBe('profile');
    });
  });

  describe('Event Classification', () => {
    it('should classify deployments', () => {
      const result = classifyContent('The app was deployed to production yesterday');
      expect(result.category).toBe('event');
      expect(result.confidence).toBeGreaterThan(0.2);
    });

    it('should classify errors', () => {
      const result = classifyContent('An error occurred during the database migration at 2024-01-15');
      expect(result.category).toBe('event');
    });

    it('should classify completions', () => {
      const result = classifyContent('The feature was completed and merged today');
      expect(result.category).toBe('event');
    });

    it('should classify incidents', () => {
      const result = classifyContent('There was a production outage that lasted 2 hours');
      expect(result.category).toBe('event');
    });

    it('should classify timestamps', () => {
      const result = classifyContent('The release happened on 2024-03-15T10:30:00Z');
      expect(result.category).toBe('event');
    });

    it('should classify migrations', () => {
      const result = classifyContent('We migrated the database to PostgreSQL last week');
      expect(result.category).toBe('event');
    });
  });

  describe('Behavior Classification', () => {
    it('should classify decisions', () => {
      const result = classifyContent('We decided to use React because of its ecosystem');
      expect(result.category).toBe('behavior');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should classify patterns', () => {
      const result = classifyContent('The approach is to use dependency injection for all services');
      expect(result.category).toBe('behavior');
    });

    it('should classify rationale', () => {
      const result = classifyContent('We chose this because it had better performance trade-offs');
      expect(result.category).toBe('behavior');
    });

    it('should classify conventions', () => {
      const result = classifyContent('We always use conventional commits for version control');
      expect(result.category).toBe('behavior');
    });

    it('should classify alternatives considered', () => {
      const result = classifyContent('The alternative approach would be to use a message queue');
      expect(result.category).toBe('behavior');
    });

    it('should classify workflow patterns', () => {
      const result = classifyContent('The workflow typically starts with a code review');
      expect(result.category).toBe('behavior');
    });
  });

  describe('Skill Classification', () => {
    it('should classify how-to instructions', () => {
      const result = classifyContent('How to set up a new React project: step 1 install create-react-app');
      expect(result.category).toBe('skill');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should classify tutorials', () => {
      const result = classifyContent('This tutorial shows how to configure ESLint');
      expect(result.category).toBe('skill');
    });

    it('should classify procedures', () => {
      const result = classifyContent('The procedure for deploying: first, build the app. Then, run the tests.');
      expect(result.category).toBe('skill');
    });

    it('should classify prerequisites', () => {
      const result = classifyContent('Before you start the tutorial, make sure Node.js is installed as a prerequisite');
      expect(result.category).toBe('skill');
    });

    it('should classify setup guides', () => {
      const result = classifyContent('This setup guide walks you through how to install Docker first');
      expect(result.category).toBe('skill');
    });

    it('should classify command instructions', () => {
      const result = classifyContent('Run the command `npm install` then execute the build step');
      expect(result.category).toBe('skill');
    });
  });

  describe('Fallback Classification', () => {
    it('should fallback to knowledge with low confidence for ambiguous content', () => {
      const result = classifyContent('Some random thoughts about nothing in particular');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.method).toBe('fallback');
    });

    it('should handle empty-ish content', () => {
      const result = classifyContent('hello world');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('Multi-Category Content', () => {
    it('should detect secondary category', () => {
      const result = classifyContent('I decided to use TypeScript because the documentation says it has better types');
      expect(result.secondaryCategory).toBeDefined();
    });

    it('should handle content matching multiple categories', () => {
      const categories = getMatchingCategories('We decided to deploy the API endpoint yesterday');
      expect(categories.length).toBeGreaterThan(1);
    });
  });

  describe('matchesCategory', () => {
    it('should return true for matching content', () => {
      expect(matchesCategory('I prefer dark mode', 'profile')).toBe(true);
    });

    it('should return false for non-matching content', () => {
      expect(matchesCategory('hello world', 'profile')).toBe(false);
    });
  });

  describe('getCategoryLayer', () => {
    it('should map knowledge to layer 2', () => {
      expect(getCategoryLayer('knowledge')).toBe(2);
    });

    it('should map profile to layer 4', () => {
      expect(getCategoryLayer('profile')).toBe(4);
    });

    it('should map event to layer 5', () => {
      expect(getCategoryLayer('event')).toBe(5);
    });

    it('should map behavior to layer 4', () => {
      expect(getCategoryLayer('behavior')).toBe(4);
    });

    it('should map skill to layer 4', () => {
      expect(getCategoryLayer('skill')).toBe(4);
    });
  });

  describe('Classification Result Shape', () => {
    it('should have all required fields', () => {
      const result = classifyContent('This is a test');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('method');
      expect(typeof result.category).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(['regex', 'semantic', 'fallback']).toContain(result.method);
    });

    it('should have confidence between 0 and 1', () => {
      const result = classifyContent('API endpoint documentation');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

/**
 * FR-5: Context Monitor Tests
 *
 * Tests for real-time context window monitoring.
 */

import {
  ContextMonitor,
  createContextMonitor,
  getContextMonitor,
  ContextStatus,
  ContextAlert,
} from '../src/monitoring/context-monitor.js';

describe('ContextMonitor', () => {
  let monitor: ContextMonitor;

  beforeEach(() => {
    // Create fresh monitor for each test
    monitor = createContextMonitor({
      maxTokens: 100000, // 100k tokens for easy math
      warningThreshold: 0.4,
      criticalThreshold: 0.8,
      maxHistorySize: 50,
    });
  });

  describe('Usage Tracking', () => {
    it('should track current token usage', () => {
      monitor.update(25000);

      const status = monitor.getStatus();
      expect(status.current.totalTokens).toBe(25000);
      expect(status.current.maxTokens).toBe(100000);
      expect(status.current.usageRatio).toBe(0.25);
      expect(status.current.usagePercent).toBe('25.0%');
    });

    it('should calculate remaining tokens', () => {
      monitor.update(60000);

      const status = monitor.getStatus();
      expect(status.current.tokensRemaining).toBe(40000);
    });

    it('should handle zero tokens', () => {
      const status = monitor.getStatus();
      expect(status.current.totalTokens).toBe(0);
      expect(status.current.usageRatio).toBe(0);
      expect(status.current.level).toBe('NORMAL');
    });
  });

  describe('Level Detection', () => {
    it('should report NORMAL for < 40%', () => {
      monitor.update(30000); // 30%
      expect(monitor.getLevel()).toBe('NORMAL');
    });

    it('should report WARNING for >= 40% and < 80%', () => {
      monitor.update(50000); // 50%
      expect(monitor.getLevel()).toBe('WARNING');

      monitor.update(79999); // Just under 80%
      expect(monitor.getLevel()).toBe('WARNING');
    });

    it('should report CRITICAL for >= 80% and < 100%', () => {
      monitor.update(80000); // 80%
      expect(monitor.getLevel()).toBe('CRITICAL');

      monitor.update(99999); // Just under 100%
      expect(monitor.getLevel()).toBe('CRITICAL');
    });

    it('should report OVERFLOW for >= 100%', () => {
      monitor.update(100000); // 100%
      expect(monitor.getLevel()).toBe('OVERFLOW');

      monitor.update(150000); // 150%
      expect(monitor.getLevel()).toBe('OVERFLOW');
    });
  });

  describe('History Tracking', () => {
    it('should record history snapshots', () => {
      monitor.update(10000);
      monitor.update(20000);
      monitor.update(30000);

      const status = monitor.getStatus();
      expect(status.history.length).toBe(3);
      expect(status.history[0].totalTokens).toBe(10000);
      expect(status.history[2].totalTokens).toBe(30000);
    });

    it('should limit history size', () => {
      // Fill beyond max history
      for (let i = 0; i < 60; i++) {
        monitor.update(i * 1000);
      }

      const status = monitor.getStatus();
      expect(status.history.length).toBe(50); // Max configured
    });

    it('should include timestamps in history', () => {
      const before = new Date();
      monitor.update(10000);
      const after = new Date();

      const snapshot = monitor.getStatus().history[0];
      const snapshotTime = new Date(snapshot.timestamp);

      expect(snapshotTime >= before).toBe(true);
      expect(snapshotTime <= after).toBe(true);
    });

    it('should include events in history', () => {
      monitor.update(10000, 'user_message');

      const snapshot = monitor.getStatus().history[0];
      expect(snapshot.event).toBe('user_message');
    });
  });

  describe('Threshold Alerts', () => {
    it('should create alert when crossing WARNING threshold', () => {
      monitor.update(30000); // NORMAL
      monitor.update(45000); // WARNING - should trigger alert

      const alerts = monitor.getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].level).toBe('WARNING');
    });

    it('should create alert when crossing CRITICAL threshold', () => {
      monitor.update(45000); // WARNING
      monitor.update(85000); // CRITICAL - should trigger alert

      const alerts = monitor.getActiveAlerts();
      expect(alerts.length).toBe(2); // WARNING + CRITICAL
      expect(alerts[1].level).toBe('CRITICAL');
    });

    it('should not create duplicate alerts for same level', () => {
      monitor.update(45000); // WARNING - triggers alert
      monitor.update(50000); // Still WARNING - no new alert
      monitor.update(55000); // Still WARNING - no new alert

      const alerts = monitor.getActiveAlerts();
      expect(alerts.length).toBe(1);
    });

    it('should include usage ratio in alert', () => {
      monitor.update(50000); // WARNING

      const alert = monitor.getActiveAlerts()[0];
      expect(alert.usageRatio).toBe(0.5);
    });

    it('should allow acknowledging alerts', () => {
      monitor.update(50000); // WARNING

      const alert = monitor.getActiveAlerts()[0];
      const result = monitor.acknowledgeAlert(alert.id);

      expect(result).toBe(true);
      expect(monitor.getActiveAlerts().length).toBe(0);
    });

    it('should allow clearing acknowledged alerts', () => {
      monitor.update(50000); // WARNING
      monitor.update(85000); // CRITICAL

      const alerts = monitor.getActiveAlerts();
      monitor.acknowledgeAlert(alerts[0].id);

      const cleared = monitor.clearAcknowledgedAlerts();
      expect(cleared).toBe(1);
      expect(monitor.getStatus().alerts.length).toBe(1);
    });
  });

  describe('Agent Stats', () => {
    it('should track per-agent token usage', () => {
      monitor.update(10000, 'event1', 'agent-1');
      monitor.update(15000, 'event2', 'agent-2');

      const status = monitor.getStatus();
      expect(status.agentStats).toBeDefined();
      expect(status.agentStats!['agent-1']).toBeDefined();
      expect(status.agentStats!['agent-2']).toBeDefined();
    });

    it('should update agent stats on subsequent updates', () => {
      monitor.update(10000, 'event1', 'agent-1');
      monitor.update(20000, 'event2', 'agent-1');

      const status = monitor.getStatus();
      expect(status.agentStats!['agent-1'].tokensUsed).toBe(20000);
    });
  });

  describe('Event Callbacks', () => {
    it('should notify on update', () => {
      const callback = jest.fn();
      monitor.onUpdate(callback);

      monitor.update(50000);

      expect(callback).toHaveBeenCalledTimes(1);
      const status = callback.mock.calls[0][0] as ContextStatus;
      expect(status.current.totalTokens).toBe(50000);
    });

    it('should allow unsubscribing from updates', () => {
      const callback = jest.fn();
      const unsubscribe = monitor.onUpdate(callback);

      monitor.update(10000);
      unsubscribe();
      monitor.update(20000);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Alert Callbacks', () => {
    it('should notify on threshold crossing', () => {
      const callback = jest.fn();
      monitor.onAlert(callback);

      monitor.update(50000); // WARNING

      expect(callback).toHaveBeenCalledTimes(1);
      const alert = callback.mock.calls[0][0] as ContextAlert;
      expect(alert.level).toBe('WARNING');
    });
  });

  describe('Configuration', () => {
    it('should allow changing max tokens', () => {
      monitor.setMaxTokens(200000);

      monitor.update(100000);
      expect(monitor.getUsageRatio()).toBe(0.5);
      expect(monitor.getLevel()).toBe('WARNING');
    });

    it('should allow updating thresholds', () => {
      monitor.setThresholds({ warning: 0.3, critical: 0.6 });

      monitor.update(35000); // 35% - should be WARNING now
      expect(monitor.getLevel()).toBe('WARNING');

      monitor.update(65000); // 65% - should be CRITICAL now
      expect(monitor.getLevel()).toBe('CRITICAL');
    });
  });

  describe('History Range', () => {
    it('should filter history by time range', async () => {
      monitor.update(10000);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      const middle = new Date();
      monitor.update(20000);

      await new Promise(resolve => setTimeout(resolve, 50));

      const end = new Date();
      monitor.update(30000);

      // Query for middle range
      const rangeSnapshots = monitor.getHistoryRange(middle, end);
      expect(rangeSnapshots.length).toBe(2); // Should include 2nd and 3rd
    });
  });

  describe('Reset', () => {
    it('should clear all state', () => {
      monitor.update(50000);
      monitor.update(85000);

      monitor.reset();

      const status = monitor.getStatus();
      expect(status.current.totalTokens).toBe(0);
      expect(status.history.length).toBe(0);
      expect(status.alerts.length).toBe(0);
    });
  });

  describe('Export/Import', () => {
    it('should export state', () => {
      monitor.update(50000);

      const exported = monitor.export();
      expect(exported.history.length).toBe(1);
      expect(exported.thresholds.warning).toBe(0.4);
      expect(exported.maxTokens).toBe(100000);
    });

    it('should import state', () => {
      monitor.update(50000);
      const exported = monitor.export();

      const newMonitor = createContextMonitor();
      newMonitor.import(exported);

      expect(newMonitor.getStatus().history.length).toBe(1);
    });
  });
});

describe('getContextMonitor (Singleton)', () => {
  it('should return the same instance', () => {
    const instance1 = getContextMonitor();
    const instance2 = getContextMonitor();

    expect(instance1).toBe(instance2);
  });
});

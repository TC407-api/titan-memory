---
name: status
description: Check Titan Memory health — layer counts, MIRAS stats, LLM mode
user_invocable: true
---

# Titan Memory Status

Run a comprehensive health check on Titan Memory and report results.

## Steps

1. **Get core stats** by calling `titan_stats`
2. **Get MIRAS stats** by calling `titan_miras_stats`
3. **Get NOOP stats** by calling `titan_noop_stats`

## Report Format

Present a clean status report:

```
Titan Memory v2.1.0 — Status Report
====================================

Layers:
  Factual (L2):   XX memories
  Long-term (L3): XX memories
  Semantic (L4):  XX memories
  Episodic (L5):  XX memories
  Total:          XX memories

MIRAS Enhancements:
  Embedding:       [active/inactive]
  Highlighting:    [active/inactive]
  Surprise Filter: [active/inactive]
  Decay:           [active/inactive]
  Cross-Project:   [active/inactive]

LLM Turbo Layer:   [enabled/disabled]

Memory Hygiene:
  Writes today:    XX
  NOOPs today:     XX
  Write ratio:     XX%

Status: [HEALTHY / DEGRADED / ERROR]
```

If any component shows errors, suggest fixes.

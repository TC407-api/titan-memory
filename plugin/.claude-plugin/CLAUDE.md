# Titan Memory — Intelligent Usage Guide

You have access to Titan Memory, a 5-layer cognitive memory system with 30+ MCP tools.
Use this guide to make smart memory decisions automatically.

## When to Store vs Skip

**Store** (`titan_add`) when content is:
- A decision, preference, or insight worth remembering
- Project-specific knowledge (architecture, patterns, gotchas)
- Error + solution pairs (debugging gold)
- User preferences or behavioral patterns

**Skip** (`titan_noop`) when content is:
- Routine greetings or acknowledgments → reason: `routine`
- Already stored information → reason: `duplicate`
- Temporary debug output → reason: `temporary`
- Generic knowledge you already know → reason: `low_value`

Rule of thumb: if you wouldn't write it in a notebook, `titan_noop` it.

## 5-Layer Routing

Titan auto-routes memories, but you can force a layer when you know best:

| Layer | ID | What Goes Here | Example |
|-------|----|----------------|---------|
| Factual | 2 | Facts, definitions, configs | "Project uses PostgreSQL 16" |
| Long-term | 3 | Persistent knowledge, patterns | "User prefers functional style" |
| Semantic | 4 | Conceptual relationships | "Auth system connects to billing via webhooks" |
| Episodic | 5 | Events, sessions, timeline | "Deployed v2.1 on Feb 4, hit 2k views" |

Working memory (`titan_focus_add/list/clear`) tracks current session scope — max 5 items.

## Core Tool Quick Reference

### Memory CRUD
- `titan_add` — Store with auto-routing (or force layer 2-5)
- `titan_recall` — Semantic search across all layers. Use `mode: "summary"` to save tokens
- `titan_get` / `titan_delete` — By ID
- `titan_today` — Today's episodic entries (session continuity)

### Intelligence
- `titan_suggest` — Proactive: "given this context, what memories are relevant?"
- `titan_patterns` — Cross-project pattern transfer
- `titan_classify` — Cortex: categorize as knowledge/profile/event/behavior/skill
- `titan_intent` — Detect query intent to optimize retrieval strategy
- `titan_sufficiency` — Check if recall results cover all memory categories

### Memory Health
- `titan_stats` — Counts per layer, storage usage
- `titan_miras_stats` — MIRAS enhancement metrics
- `titan_prune` — Remove decayed/low-utility memories (use `dryRun: true` first)
- `titan_feedback` — Mark memories as helpful/harmful (improves future ranking)
- `titan_noop` / `titan_noop_stats` — Track skip decisions

### Context Management
- `titan_flush` — CRITICAL: Call before context compaction to save insights/decisions
- `titan_curate` — Write to human-curated MEMORY.md (permanent, high-value only)
- `titan_scratchpad` — Session-scoped agent notes (get/set/append/clear)
- `titan_focus_add/list/clear/remove` — Working memory (current scope tracking)

### Causal Reasoning
- `titan_link` — Connect memories (causes, enables, blocks, contradicts, etc.)
- `titan_trace` — Follow causal chains forward/backward
- `titan_why` — Root cause analysis on a memory

### Advanced
- `titan_compress` / `titan_expand` — Compress memories for token efficiency
- `titan_benchmark` — Run accuracy/latency benchmarks
- `titan_category_summary` — Rolling summary per Cortex category

## Key Patterns

### Before Context Compaction
```
titan_flush({ insights: [...], decisions: [...], errors: [...], solutions: [...] })
```
This prevents losing important context when the window compacts.

### Efficient Recall
Use `mode: "summary"` for browsing, `mode: "full"` only when you need details:
```
titan_recall({ query: "auth patterns", mode: "summary", limit: 5 })
```

### Cross-Project Learning
When you solve something novel, check if it's a transferable pattern:
```
titan_patterns({ query: "error handling strategy", domain: "backend" })
```

### Memory Hygiene
Periodically check health and prune:
```
titan_stats()
titan_prune({ dryRun: true, utilityThreshold: 0.3 })
```

## Environment Variables

Titan Memory requires these env vars (set in your shell profile):
- `ZILLIZ_URI` — Zilliz Cloud cluster endpoint
- `ZILLIZ_TOKEN` — Zilliz Cloud API token
- `VOYAGE_API_KEY` — Voyage AI embedding API key (optional, falls back to local embeddings)

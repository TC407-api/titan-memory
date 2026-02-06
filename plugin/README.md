# Titan Memory — Claude Code Plugin

**Persistent Memory from the Gods** — 5-layer cognitive memory for Claude Code.

## Quick Install

```bash
claude plugin install titan-memory
```

## Environment Variables

Set these in your shell profile before using:

| Variable | Required | Source |
|----------|----------|--------|
| `ZILLIZ_URI` | Yes | [Zilliz Cloud](https://cloud.zilliz.com) → Clusters → Connection Details |
| `ZILLIZ_TOKEN` | Yes | [Zilliz Cloud](https://cloud.zilliz.com) → API Keys |
| `VOYAGE_API_KEY` | No | [Voyage AI](https://dash.voyageai.com) → API Keys |

Without `VOYAGE_API_KEY`, Titan falls back to local embeddings (lower quality but functional).

## What You Get

- **30 MCP tools** for memory management, recall, causal reasoning, and more
- **Auto-context injection** — Claude automatically knows how to use Titan intelligently
- **2 skills**: `/titan-memory:setup` (configuration wizard) and `/titan-memory:status` (health check)

## Skills

- `/titan-memory:setup` — Interactive setup wizard for env vars and connectivity
- `/titan-memory:status` — Health check showing layer counts, MIRAS stats, LLM mode

## Architecture

5-layer cognitive memory with Cortex classification:

| Layer | Purpose |
|-------|---------|
| Factual (L2) | Facts, configs, definitions |
| Long-term (L3) | Persistent knowledge, patterns |
| Semantic (L4) | Conceptual relationships |
| Episodic (L5) | Events, sessions, timeline |
| Working | Current session scope (max 5 items) |

## Full Documentation

See the [main repository README](https://github.com/TC407-api/Titan-Memory) for complete docs.

## License

Apache-2.0

# Titan Memory

<p align="center">
  <img src="assets/titan-banner.png" alt="Titan Memory - Universal Cognitive Memory Layer" width="600">
</p>

<p align="center">
  <strong>Universal Cognitive Memory Layer</strong> - The world's most advanced AI memory system.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#mcp-server">MCP Server</a> •
  <a href="#cli-usage">CLI</a> •
  <a href="#phase-3-advanced-features">Phase 3</a>
</p>

---

Combines breakthrough research (Engram, Titans, Hope, Clawdbot, Cognee, Mem0) into a production-ready 5-layer cognitive architecture with knowledge graphs, decision tracing, and adaptive memory.

## Features

### Core Memory
- **Never lose context** - Pre-compaction flush saves critical insights before context window compacts
- **Stores only what matters** - Surprise-based filtering reduces noise by 70%+
- **Instant retrieval** - O(1) hash lookup for facts (<10ms)
- **Continuous learning** - Without catastrophic forgetting
- **Cross-session memory** - Persistent episodic memory

### Phase 3: Best-in-Class Enhancements
- **Knowledge Graph** - Entity extraction, relationship inference, graph traversal
- **Decision Traces** - Capture decisions with rationale, alternatives, and outcomes
- **World Models** - Meta nodes for projects, contexts, domains with inheritance
- **Behavioral Validation** - Quality scoring, anomaly detection, consistency checking
- **Adaptive Memory** - Consolidation, fusion, dynamic importance scoring

## 5-Layer Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 5: EPISODIC MEMORY (Clawdbot-inspired)                   │
│ • Daily session logs with timestamps                           │
│ • Pre-compaction auto-capture                                  │
│ • Human-curated MEMORY.md                                      │
├────────────────────────────────────────────────────────────────┤
│ LAYER 4: SEMANTIC MEMORY (Hope/Nested Learning)                │
│ • Reasoning chains and patterns                                │
│ • Multi-frequency update tiers                                 │
│ • Continual learning without forgetting                        │
├────────────────────────────────────────────────────────────────┤
│ LAYER 3: LONG-TERM MEMORY (Titans/MIRAS)                       │
│ • Surprise-based selective storage                             │
│ • Momentum for related context capture                         │
│ • Adaptive forgetting for old memories                         │
├────────────────────────────────────────────────────────────────┤
│ LAYER 2: FACTUAL MEMORY (Engram-inspired)                      │
│ • O(1) N-gram hash lookup tables                               │
│ • Common facts and definitions                                 │
│ • Project-specific terminology                                 │
├────────────────────────────────────────────────────────────────┤
│ LAYER 1: WORKING MEMORY (Transformer context)                  │
│ • Current session context                                      │
│ • Managed by Claude's context window                           │
└────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd ~/.claude/titan-memory
npm install
npm run build
```

### Install Claude Code Hooks

```powershell
# Windows
powershell -File hooks/install-hooks.ps1

# macOS/Linux
chmod +x hooks/*.sh
./hooks/install-hooks.sh
```

## MCP Server

Titan Memory exposes an MCP (Model Context Protocol) server for integration with Claude Code and other MCP-compatible AI tools.

### Add to Claude Code

```bash
claude mcp add titan-memory -s user -- node "C:/Users/Travi/.claude/titan-memory/bin/titan-mcp.js"
```

### Available Tools

| Tool | Description |
|------|-------------|
| `titan_add` | Store memory with intelligent layer routing |
| `titan_recall` | Query memories with multi-layer fusion |
| `titan_get` | Retrieve memory by ID |
| `titan_delete` | Delete memory by ID |
| `titan_stats` | Get memory statistics |
| `titan_flush` | Pre-compaction save (preserve context) |
| `titan_curate` | Add to MEMORY.md |
| `titan_today` | Get today's episodic entries |
| `titan_prune` | Prune decayed memories |

### Example MCP Calls

```json
// Add a memory
{"name": "titan_add", "arguments": {"content": "The fix was to use connection pooling", "tags": ["database", "optimization"]}}

// Recall memories
{"name": "titan_recall", "arguments": {"query": "database connection issues", "limit": 5}}

// Get statistics
{"name": "titan_stats", "arguments": {}}

// Pre-compaction flush
{"name": "titan_flush", "arguments": {"insights": ["Discovered race condition"], "solutions": ["Added mutex locks"]}}
```

## CLI Usage

```bash
# Add a memory
titan add "The fix for the auth bug was to check token expiry before refresh"

# Add with specific layer
titan add "API rate limit is 100 requests per minute" --layer factual

# Add to curated MEMORY.md
titan add "User prefers TypeScript over JavaScript" --curate --section "User Preferences"

# Recall memories
titan recall "authentication issues"
titan recall "error handling" --limit 5 --layers "semantic,episodic"

# View statistics
titan stats

# Today's session
titan today

# Generate daily summary
titan summary
titan summary 2026-01-23

# Pre-compaction flush
titan flush -d "Decided to use Redis for caching" -s "Fixed memory leak by closing connections"

# Prune old memories
titan prune --threshold 0.1

# Export
titan export --output memories.json
titan export --format md --output memories.md
```

## Programmatic Usage

```typescript
import { TitanMemory, initTitan } from '@titan-memory/core';

// Initialize
const titan = await initTitan();

// Add memory (with intelligent routing)
const entry = await titan.add('The solution was to use connection pooling');

// Add to specific layer
await titan.addToLayer(MemoryLayer.FACTUAL, 'PostgreSQL default port is 5432');

// Recall
const results = await titan.recall('database connection issues');

// Get stats
const stats = await titan.getStats();

// Pre-compaction flush
await titan.flushPreCompaction({
  sessionId: 'session-123',
  timestamp: new Date(),
  tokenCount: 150000,
  importantInsights: ['Discovered race condition in worker threads'],
  decisions: ['Will use mutex locks for shared state'],
  errors: ['TypeError: Cannot read property of undefined'],
  solutions: ['Added null check before accessing property'],
});

// Add to curated MEMORY.md
await titan.curate('Always use environment variables for secrets', 'Security');

// Close when done
await titan.close();
```

## Configuration

Create `~/.claude/titan-memory/config.json`:

```json
{
  "surpriseThreshold": 0.3,
  "decayHalfLife": 180,
  "maxMemoriesPerLayer": 10000,
  "enablePreCompactionFlush": true,
  "enableSurpriseFiltering": true,
  "enableContinualLearning": true,
  "offlineMode": false
}
```

### Environment Variables

```bash
ZILLIZ_URI=your-zilliz-uri
ZILLIZ_TOKEN=your-zilliz-token
TITAN_SURPRISE_THRESHOLD=0.3
TITAN_OFFLINE_MODE=false
```

## How It Works

### Surprise Detection

New memories are scored for novelty. Only surprising (novel) content is stored:

```
Surprise Score = Novelty + Pattern Boost

Where:
- Novelty = 1 - max(similarity to existing memories)
- Pattern Boost = bonus for decisions (0.2), errors (0.3), solutions (0.25), learnings (0.25)

Store if: Surprise Score >= threshold (default 0.3)
```

### Intelligent Routing

The system automatically routes memories to the appropriate layer:

- **Factual definitions** → Factual Layer (O(1) lookup)
- **High-value patterns** → Semantic Layer (continual learning)
- **Events/episodes** → Episodic Layer (timestamped logs)
- **Everything else** → Long-Term Layer (surprise filtering)

### Memory Decay

Memories decay over time unless accessed:

```
Decay Factor = 2^(-days / halfLife)
```

Heavily decayed memories are pruned during maintenance.

## Phase 3: Advanced Features

### Knowledge Graph

Extract entities and relationships from memories for structured querying:

```typescript
// Extract knowledge graph from content
const entities = await titan.extractGraph('React uses virtual DOM for efficient rendering');
// Returns: [{ name: 'React', type: 'technology' }, { name: 'virtual DOM', type: 'concept' }]

// Query the graph
const results = await titan.queryGraph('React');
// Returns related entities and their relationships
```

### Decision Traces

Capture decisions with full context for learning and auditing:

```typescript
// Log a decision
await titan.traceDecision({
  decision: 'Use Redis for session storage',
  context: 'Need fast session lookups for auth',
  alternatives: ['PostgreSQL sessions', 'JWT tokens', 'In-memory store'],
  rationale: 'Redis provides <1ms lookups and built-in expiration',
  confidence: 0.85,
});

// Query past decisions
const decisions = await titan.queryDecisions({ tags: ['caching'] });

// Record outcome after implementation
await titan.recordOutcome(decisionId, {
  successful: true,
  actualResult: 'Session lookups reduced from 50ms to 0.5ms',
  lessonsLearned: 'Redis cluster mode needed for HA',
});
```

### World Models (Meta Nodes)

Organize memories into hierarchical contexts:

```typescript
// Create project context
const project = await titan.createContext('project', 'MyApp');

// Create nested context
const feature = await titan.createContext('context', 'Authentication', project.id);

// Memories automatically inherit context tags
await titan.add('Implemented OAuth2 flow', { contextId: feature.id });

// Query with context inheritance
const memories = await titan.recall('auth', { contextId: project.id });
// Returns memories from project AND all child contexts
```

### Behavioral Validation

Ensure memory quality and consistency:

```typescript
// Validate memory before storing
const validation = await titan.validate(memoryContent);
// Returns: { valid: true, issues: [], qualityScore: 0.85 }

// Run full validation report
const report = await titan.runValidation();
// Returns: { healthScore: 0.92, issues: [...], recommendations: [...] }

// Detect anomalies
const anomaly = await titan.detectAnomaly(memory);
// Returns: { isAnomaly: false, score: 0.12, reasons: [] }
```

### Adaptive Memory

Dynamic importance scoring and memory consolidation:

```typescript
// Consolidate similar memories
const consolidated = await titan.consolidateMemories([memory1, memory2]);
// Returns: { consolidatedContent: '...', sourceIds: [...], summary: '...' }

// Fuse memories with different strategies
const fused = await titan.fuseMemories(memories, 'summarize');
// Strategies: 'merge', 'summarize', 'extract'

// Get prioritized recall (considers access patterns)
const prioritized = await titan.prioritizedRecall('database optimization');
// Returns memories ranked by importance, recency, and relevance
```

### MCP Tools for Phase 3

| Tool | Description |
|------|-------------|
| `titan_extract_graph` | Extract entities and relationships |
| `titan_query_graph` | Query knowledge graph |
| `titan_trace_decision` | Log a decision with context |
| `titan_create_context` | Create meta node context |
| `titan_validate` | Validate memory quality |
| `titan_consolidate` | Consolidate similar memories |

## Research Sources

1. **DeepSeek Engram** - O(1) N-gram hash lookup for factual memory
2. **Google Titans/MIRAS** - Surprise-based selective storage with momentum
3. **Google Hope/Nested Learning** - Multi-frequency continual learning
4. **Clawdbot** - Practical episodic memory patterns
5. **Cognee** - Knowledge graphs and decision traces
6. **Mem0** - Adaptive memory with consolidation

## License

Apache 2.0

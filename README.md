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
  <a href="#miras-enhancements">MIRAS</a> •
  <a href="#cli-usage">CLI</a> •
  <a href="#phase-3-advanced-features">Phase 3</a>
</p>

---

Combines breakthrough research (Engram, Titans, Hope, Clawdbot, Cognee, Mem0, MIRAS) into a production-ready 5-layer cognitive architecture with knowledge graphs, decision tracing, semantic embeddings, and adaptive memory.

## Features

### Core Memory
- **Never lose context** - Pre-compaction flush saves critical insights before context window compacts
- **Stores only what matters** - Surprise-based filtering reduces noise by 70%+
- **Instant retrieval** - O(1) hash lookup for facts (<10ms)
- **Continuous learning** - Without catastrophic forgetting
- **Cross-session memory** - Persistent episodic memory

### MIRAS Enhancement System (NEW)
- **Semantic Embeddings** - Voyage AI / local embeddings with LRU caching
- **Semantic Highlighting** - Query-relevant sentence extraction for RAG precision
- **Data-Dependent Decay** - Content-type aware memory aging
- **Auto Context Capture** - Momentum-triggered context preservation
- **Auto-Consolidation** - Merge similar memories automatically
- **Proactive Suggestions** - Context-aware memory recommendations
- **Cross-Project Learning** - Pattern transfer between projects

### Phase 3: Best-in-Class Enhancements
- **Knowledge Graph** - Entity extraction, relationship inference, graph traversal
- **Decision Traces** - Capture decisions with rationale, alternatives, and outcomes
- **World Models** - Meta nodes for projects, contexts, domains with inheritance
- **Behavioral Validation** - Quality scoring, anomaly detection, consistency checking
- **Adaptive Memory** - Consolidation, fusion, dynamic importance scoring

### OAuth/Token MCP Server
- **Auth0 Integration** - JWT verification with JWKS caching
- **Scope-based Authorization** - Read/write/admin tool permissions
- **HTTP Server Mode** - OAuth2 discovery endpoint for enterprise deployment

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
│ • Semantic embeddings for similarity (NEW)                     │
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
| `titan_feedback` | FR-1: Utility tracking (helpful/harmful) |
| `titan_suggest` | MIRAS: Get proactive memory suggestions |
| `titan_patterns` | MIRAS: Find cross-project patterns |
| `titan_miras_stats` | MIRAS: Get enhancement statistics |

### Example MCP Calls

```json
// Add a memory
{"name": "titan_add", "arguments": {"content": "The fix was to use connection pooling", "tags": ["database", "optimization"]}}

// Recall memories
{"name": "titan_recall", "arguments": {"query": "database connection issues", "limit": 5}}

// Get proactive suggestions (MIRAS)
{"name": "titan_suggest", "arguments": {"context": "working on database optimization", "limit": 5}}

// Find cross-project patterns (MIRAS)
{"name": "titan_patterns", "arguments": {"query": "authentication patterns", "domain": "backend"}}

// Get statistics
{"name": "titan_stats", "arguments": {}}

// Pre-compaction flush
{"name": "titan_flush", "arguments": {"insights": ["Discovered race condition"], "solutions": ["Added mutex locks"]}}
```

## MIRAS Enhancements

MIRAS (Memory with Intelligent Retrieval and Adaptive Storage) brings 7 advanced features to Titan Memory. All features default to OFF for backward compatibility.

### Feature Overview

| Feature | Default | Purpose |
|---------|---------|---------|
| Semantic Embeddings | `hash` | Use Voyage AI or local embeddings for similarity |
| Semantic Highlighting | `off` | Extract query-relevant sentences from memories |
| Semantic Surprise | `lsh` | Use embeddings for novelty detection |
| Data-Dependent Decay | `time-only` | Content-type aware memory aging |
| Auto Context Capture | `off` | Momentum-triggered context preservation |
| Auto-Consolidation | `off` | Merge highly similar memories |
| Proactive Suggestions | `off` | Context-aware memory recommendations |
| Cross-Project Learning | `off` | Pattern transfer between projects |
| **Hybrid Search** | `off` | BM25 keyword + dense semantic search with RRF reranking |

### Enable MIRAS Features

```json
// config.json
{
  "embedding": {
    "provider": "voyage",
    "model": "voyage-4-lite",
    "dimension": 1024,
    "cacheSize": 10000
  },
  "semanticHighlight": {
    "enabled": true,
    "threshold": 0.5,
    "highlightOnRecall": true
  },
  "semanticSurprise": {
    "algorithm": "semantic",
    "similarityThreshold": 0.7
  },
  "dataDependentDecay": {
    "strategy": "data-dependent"
  },
  "proactiveSuggestions": {
    "enabled": true,
    "maxSuggestions": 5
  },
  "crossProject": {
    "enabled": true,
    "minApplicability": 0.7
  },
  "hybridSearch": {
    "enabled": true,
    "rerankStrategy": "rrf",
    "rrfK": 60,
    "denseWeight": 0.5,
    "sparseWeight": 0.5
  }
}
```

### Programmatic MIRAS API

```typescript
import { TitanMemory, initTitan } from '@titan-memory/core';

const titan = await initTitan();

// Get proactive suggestions based on context
const suggestions = await titan.suggest('working on database optimization');
// Returns: [{ memory, relevance, reason, tags }, ...]

// Find cross-project patterns
const patterns = await titan.findRelevantPatterns('authentication patterns');
// Returns: [{ pattern, relevance, matchedTerms }, ...]

// Highlight relevant portions of memories
const highlighted = await titan.highlightMemories('error handling', memories);
// Returns memories with highlightedContent and compressionRate

// Calculate semantic surprise
const surprise = await titan.calculateSurprise('new content', recentMemories);
// Returns: { score, shouldStore }

// Calculate data-dependent decay
const decayFactor = titan.calculateDecay(memory);

// Get MIRAS statistics
const mirasStats = await titan.getMirasStats();
// Returns: { embeddingEnabled, highlightingEnabled, crossProjectStats, ... }
```

### Content-Type Decay Half-Lives

| Content Type | Half-Life (days) | Rationale |
|--------------|------------------|-----------|
| `decision` | 365 | Long-lived, important for future context |
| `architecture` | 365 | Structural decisions persist |
| `preference` | 300 | User preferences remain relevant |
| `solution` | 270 | Solutions stay useful |
| `learning` | 180 | Learnings need periodic refresh |
| `general` | 180 | Default for unclassified content |
| `error` | 90 | Errors get fixed, less relevant over time |

### Hybrid Search (NEW)

Hybrid search combines dense semantic vectors with BM25 sparse keyword vectors for superior retrieval quality.

**Why Hybrid Search?**
- **Semantic search** captures meaning: "database connection issues" finds "PostgreSQL timeout errors"
- **BM25 keyword search** captures exact terms: "ECONNREFUSED 127.0.0.1:5432" finds exact matches
- **Combined** covers both failure modes for comprehensive retrieval

**Reranking Strategies:**

| Strategy | Best For | How It Works |
|----------|----------|--------------|
| **RRF** (default) | Balanced results | Combines rankings from both searches using Reciprocal Rank Fusion |
| **Weighted** | Domain-specific | Applies explicit weights (e.g., 0.7 dense, 0.3 sparse) |

**Configuration:**
```json
{
  "hybridSearch": {
    "enabled": true,
    "rerankStrategy": "rrf",  // or "weighted"
    "rrfK": 60,               // RRF smoothing parameter
    "denseWeight": 0.5,       // For weighted strategy
    "sparseWeight": 0.5,      // For weighted strategy
    "bm25K1": 1.2,            // Term frequency saturation
    "bm25B": 0.75             // Length normalization
  }
}
```

**BM25 Parameters:**
- `bm25K1` (1.2): Higher values give more weight to term frequency
- `bm25B` (0.75): 0 = no length normalization, 1 = full normalization

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
  "offlineMode": false,

  "embedding": {
    "provider": "hash",
    "cacheSize": 10000
  },
  "semanticHighlight": {
    "enabled": false
  },
  "proactiveSuggestions": {
    "enabled": false
  },
  "crossProject": {
    "enabled": false
  }
}
```

### Environment Variables

```bash
ZILLIZ_URI=your-zilliz-uri
ZILLIZ_TOKEN=your-zilliz-token
VOYAGE_API_KEY=your-voyage-api-key
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

With MIRAS semantic surprise enabled, similarity uses embedding cosine similarity instead of LSH.

### Intelligent Routing

The system automatically routes memories to the appropriate layer:

- **Factual definitions** → Factual Layer (O(1) lookup)
- **High-value patterns** → Semantic Layer (continual learning)
- **Events/episodes** → Episodic Layer (timestamped logs)
- **Everything else** → Long-Term Layer (surprise filtering)

### Memory Decay

With MIRAS data-dependent decay:

```
Effective Half-Life = Base Half-Life × Utility Multiplier × Access Multiplier

Where:
- Base Half-Life = content-type dependent (90-365 days)
- Utility Multiplier = 0.5 + (utilityScore × 1.0)
- Access Multiplier = 1 + min(0.5, accessCount × 0.05)

Decay Factor = 2^(-days / Effective Half-Life)
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

## OAuth/Token MCP Server

For enterprise deployments, Titan Memory supports OAuth2 authentication via Auth0.

### HTTP Server Mode

```bash
# Start HTTP server with OAuth
node bin/titan-mcp.js --http --port 3456

# Environment variables
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://titan-memory.example.com
AUTH0_CLIENT_ID=your-client-id
```

### Scopes

| Scope | Permissions |
|-------|-------------|
| `titan:read` | Query, get, stats, today |
| `titan:write` | Add, delete, flush, curate, prune |
| `titan:admin` | All operations + configuration |

### OAuth2 Discovery

```bash
curl http://localhost:3456/.well-known/oauth-authorization-server
```

## Research Sources

1. **DeepSeek Engram** - O(1) N-gram hash lookup for factual memory
2. **Google Titans** - Surprise-based selective storage with momentum
3. **MIRAS** - Memory with Intelligent Retrieval and Adaptive Storage
4. **Google Hope/Nested Learning** - Multi-frequency continual learning
5. **Clawdbot** - Practical episodic memory patterns
6. **Cognee** - Knowledge graphs and decision traces
7. **Mem0** - Adaptive memory with consolidation
8. **Voyage AI** - State-of-the-art embedding models
9. **Auth0** - OAuth2/OIDC authentication and JWKS token verification

## License

Apache 2.0

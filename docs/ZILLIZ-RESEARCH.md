# Zilliz Cloud Configuration Research for MIRAS

## Research Date: 2026-01-27

## Summary

Comprehensive research into Zilliz Cloud best practices for the Titan Memory MIRAS integration. This document covers optimal configuration, verified settings, and potential future enhancements.

---

## Current Configuration Status: ✓ VERIFIED CORRECT

### Embedding Configuration
| Setting | Value | Status | Notes |
|---------|-------|--------|-------|
| Model | `voyage-4-lite` | ✓ Correct | Best balance of quality/latency/cost |
| Dimension | 1024 | ✓ Correct | All voyage-4 series use 1024 dimensions |
| Metric Type | COSINE | ✓ Correct | Recommended for semantic search |

### Why These Settings Are Optimal

**voyage-4-lite (1024 dimensions)**
- Voyage-4 series is the latest generation (2024-2025)
- All voyage-4 models output 1024 dimensions by default
- voyage-4-lite provides best balance: quality similar to voyage-4, faster, lower cost
- Optimized for latency-sensitive applications like memory retrieval

**COSINE Similarity**
- Recommended for text embeddings by Zilliz
- Measures angle between vectors, ignoring magnitude
- Ideal for semantic similarity where text length shouldn't affect results
- Voyage AI embeddings are normalized, making COSINE equivalent to IP

**AUTOINDEX**
- Zilliz Cloud automatically uses AUTOINDEX when no index type is specified
- Provides up to 3x QPS improvement over manual configuration
- Uses SIMD operations, dynamic quantization, and optimized graphing
- Eliminates need for manual tuning of nprobe/ef parameters

---

## Configuration Changes Made (Previous Session)

### Fixed: Dimension Mismatch Bug
**Before (WRONG):**
```typescript
model: 'voyage-3-lite'  // Was using legacy model
dimension: 1536         // Wrong dimension!
```

**After (CORRECT):**
```typescript
model: 'voyage-4-lite'  // Current best model
dimension: 1024         // Correct for voyage-4 series
```

### Files Updated
1. `src/storage/embeddings/voyage-embedding.ts` - Comprehensive model dimension mapping
2. `src/utils/config.ts` - Default config updated
3. `src/storage/zilliz-client.ts` - Default dimension updated
4. `src/storage/embeddings/index.ts` - Factory default updated
5. `tests/storage.test.ts` - Test expectations updated
6. `README.md` - Documentation updated

---

## Key Zilliz Best Practices Findings

### 1. Similarity Metrics
| Metric | Range | When to Use |
|--------|-------|-------------|
| **COSINE** | [-1, 1] | ✓ Default for text embeddings, direction-only comparison |
| L2 | [0, ∞) | When magnitude matters, continuous data |
| IP | [-1, 1] | Only with normalized embeddings, equivalent to COSINE |

**Recommendation:** Use COSINE for all text embedding search (already implemented).

### 2. Search Level Parameter
Zilliz AUTOINDEX exposes a `level` parameter (1-10) for quality/speed tuning:
- Level 1 (default): ~90% recall, fastest
- Level 5-7: ~95% recall, moderate latency
- Level 10: ~99% recall, highest latency

**Current:** Not exposed in API. Could add for power users.

### 3. Consistency Levels
| Level | Use Case |
|-------|----------|
| **Bounded** (default) | Balanced freshness/latency - recommended |
| Strong | Absolute recency, higher latency |
| Eventually | Minimum latency, stale results possible |
| Session | Same-client visibility guarantee |

**Current:** Using default (Bounded) - optimal for memory system.

### 4. Partitioning Strategies
Two approaches for multi-project data:
1. **Separate collections** (current) - Full isolation, simple
2. **Partition keys** - Single collection, faster cross-project queries

**Current:** Using separate collections via `getProjectCollectionName()` - valid approach.

### 5. Scalar Indexes
For frequently filtered fields, add indexes:
- `timestamp` - For temporal queries
- `layer` - For layer-based filtering
- `projectId` - For project filtering
- `tags` - For tag-based search

**Current:** No explicit scalar indexes. Could add for large datasets.

### 6. Data Insertion
- **Asynchronous:** Inserts are async, may not appear immediately in search
- **Batch insertion:** Dramatically faster than individual inserts

**Current:** Using batch operations correctly.

### 7. TTL (Time-to-Live)
Can configure automatic deletion of old memories:
```javascript
{ collectionName: 'titan_memory', ttl: 2592000 } // 30 days
```

**Current:** Not implemented. Could add for memory cleanup.

---

## Voyage AI Model Reference

### Current Models (voyage-4 series)
| Model | Dimension | Best For |
|-------|-----------|----------|
| voyage-4-large | 1024 | Highest quality retrieval |
| voyage-4 | 1024 | Optimized general-purpose |
| **voyage-4-lite** | 1024 | ✓ Best latency/cost balance |
| voyage-4-nano | 1024 | Open-weight, smallest |

### Domain-Specific Models
| Model | Dimension | Domain |
|-------|-----------|--------|
| voyage-code-3 | 1024 | Code retrieval |
| voyage-finance-2 | 1024 | Finance |
| voyage-law-2 | 1024 | Legal |
| voyage-multilingual-2 | 1024 | 100+ languages |

### Legacy Models (avoid)
| Model | Dimension | Notes |
|-------|-----------|-------|
| voyage-3-lite | **512** | ⚠️ NOT 1024! Fixed this bug |
| voyage-large-2 | 1536 | Older generation |
| voyage-02 | 1024 | Deprecated |

---

## Potential Future Enhancements

### High Priority
1. **Hybrid Search (BM25 + Dense)** - Combine keyword and semantic search
2. **Reranking** - RRF or weighted reranker for improved RAG quality

### Medium Priority
3. **Search level parameter** - Expose for quality/speed tuning
4. **Scalar indexes** - For large-scale deployments
5. **TTL configuration** - Automatic memory cleanup

### Low Priority
6. **Partition keys** - Alternative to separate collections
7. **Sparse embeddings** - For keyword-focused retrieval

---

## Validation Checklist

- [x] Embedding dimension matches Voyage model output
- [x] COSINE metric type for semantic search
- [x] AUTOINDEX used (no manual index type)
- [x] Bounded consistency (default)
- [x] UUID validation on delete operations
- [x] JSON metadata stored as VARCHAR
- [x] Error handling for offline mode
- [x] Tests updated for 1024 dimensions

---

## References

1. [Zilliz AUTOINDEX Explained](https://docs.zilliz.com/docs/autoindex-explained)
2. [Zilliz Similarity Metrics](https://docs.zilliz.com/docs/search-metrics-explained)
3. [Voyage AI Documentation](https://docs.zilliz.com/docs/voyage-ai)
4. [Zilliz Partition Keys](https://docs.zilliz.com/docs/use-partition-key)
5. [Zilliz Consistency Levels](https://docs.zilliz.com/docs/consistency-level)
6. [Zilliz Scalar Indexes](https://docs.zilliz.com/docs/index-scalar-fields)
7. [Zilliz Hybrid Search](https://docs.zilliz.com/docs/hybrid-search)

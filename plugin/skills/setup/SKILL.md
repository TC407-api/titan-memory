---
name: setup
description: Configure Titan Memory environment variables and verify connectivity
user_invocable: true
---

# Titan Memory Setup

Guide the user through configuring Titan Memory. Check each requirement and help fix issues.

## Steps

1. **Check environment variables:**
   - Run: `echo $ZILLIZ_URI` (or `$env:ZILLIZ_URI` on Windows)
   - Run: `echo $ZILLIZ_TOKEN` (or `$env:ZILLIZ_TOKEN` on Windows)
   - Run: `echo $VOYAGE_API_KEY` (or `$env:VOYAGE_API_KEY` on Windows)

2. **For each missing variable, explain:**
   - `ZILLIZ_URI`: Get from Zilliz Cloud console → Clusters → your cluster → Connection Details. Format: `https://xxx.api.gcp-us-west1.zillizcloud.com`
   - `ZILLIZ_TOKEN`: Get from Zilliz Cloud console → API Keys. Create a read/write key.
   - `VOYAGE_API_KEY`: Get from dash.voyageai.com → API Keys. Optional — Titan falls back to local embeddings without it, but quality is lower.

3. **Guide shell profile setup:**
   - **bash/zsh**: Add to `~/.bashrc` or `~/.zshrc`:
     ```
     export ZILLIZ_URI="your-uri"
     export ZILLIZ_TOKEN="your-token"
     export VOYAGE_API_KEY="your-key"
     ```
   - **PowerShell**: Add to `$PROFILE`:
     ```
     $env:ZILLIZ_URI = "your-uri"
     $env:ZILLIZ_TOKEN = "your-token"
     $env:VOYAGE_API_KEY = "your-key"
     ```

4. **Verify connectivity:**
   - Call `titan_stats` to test the MCP connection
   - If it works, report success with memory counts
   - If it fails, show the error and suggest fixes

5. **Report status:**
   - Which env vars are set
   - Whether Zilliz connection works
   - Whether Voyage AI embeddings are available
   - Embedding mode: "voyage" (cloud) or "local" (fallback)

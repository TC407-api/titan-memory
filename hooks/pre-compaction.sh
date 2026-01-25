#!/bin/bash
#
# Pre-compaction memory flush hook for Titan Memory
# Automatically saves important context before Claude Code compacts its context window.
#

set -e

TITAN_DIR="$HOME/.claude/titan-memory"
TITAN_CLI="$TITAN_DIR/dist/cli/index.js"

# Check if Titan is built
if [ ! -f "$TITAN_CLI" ]; then
    echo "Titan Memory not built. Run: cd ~/.claude/titan-memory && npm install && npm run build"
    exit 0
fi

SESSION_ID="${1:-$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)}"
CONTEXT="${2:-}"

# Extract insights using grep patterns
extract_decisions() {
    echo "$1" | grep -iE "(decided|decision|chose|choosing|went with|picked)" | head -5 | tr '\n' ',' | sed 's/,$//'
}

extract_errors() {
    echo "$1" | grep -iE "(error|bug|issue|problem|failed|failure|exception)" | head -5 | tr '\n' ',' | sed 's/,$//'
}

extract_solutions() {
    echo "$1" | grep -iE "(fixed|solved|resolved|solution|workaround|fix was)" | head -5 | tr '\n' ',' | sed 's/,$//'
}

extract_learnings() {
    echo "$1" | grep -iE "(learned|discovered|realized|insight|understood)" | head -5 | tr '\n' ',' | sed 's/,$//'
}

# Extract insights
DECISIONS=$(extract_decisions "$CONTEXT")
ERRORS=$(extract_errors "$CONTEXT")
SOLUTIONS=$(extract_solutions "$CONTEXT")
LEARNINGS=$(extract_learnings "$CONTEXT")

# Count total
TOTAL=0
[ -n "$DECISIONS" ] && TOTAL=$((TOTAL + 1))
[ -n "$ERRORS" ] && TOTAL=$((TOTAL + 1))
[ -n "$SOLUTIONS" ] && TOTAL=$((TOTAL + 1))
[ -n "$LEARNINGS" ] && TOTAL=$((TOTAL + 1))

if [ $TOTAL -eq 0 ]; then
    echo "No significant insights to flush"
    exit 0
fi

# Build command
CMD="node $TITAN_CLI flush"
[ -n "$DECISIONS" ] && CMD="$CMD -d \"$DECISIONS\""
[ -n "$ERRORS" ] && CMD="$CMD -e \"$ERRORS\""
[ -n "$SOLUTIONS" ] && CMD="$CMD -s \"$SOLUTIONS\""
[ -n "$LEARNINGS" ] && CMD="$CMD -i \"$LEARNINGS\""

# Execute
eval $CMD

echo "Titan Memory: Flushed insights before compaction"
exit 0

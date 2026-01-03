#!/bin/bash
# session-end.sh - Persist session state for continuity
#
# Runs when Claude finishes responding (Stop hook).
# Logs session summary to help with continuity across sessions.
#
# This hook is non-blocking - failures don't affect Claude's operation.

# Read stop hook input
INPUT=$(cat)

# Check for stop_hook_active to prevent infinite loops
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$STOP_ACTIVE" = "true" ]; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CLAUDE_DIR="$PROJECT_DIR/.claude"
SESSION_LOG="$CLAUDE_DIR/session-log.md"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE_READABLE=$(date "+%Y-%m-%d %H:%M")

# Create .claude directory if it doesn't exist
mkdir -p "$CLAUDE_DIR"

# ============================================
# Capture Session Summary
# ============================================

{
    echo ""
    echo "---"
    echo ""
    echo "### Session: $DATE_READABLE"
    echo ""
    
    # Git changes (what was modified this session)
    if git rev-parse --git-dir > /dev/null 2>&1; then
        BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
        echo "**Branch**: \`$BRANCH\`"
        echo ""
        
        # Get uncommitted changes
        CHANGES=$(git status --short 2>/dev/null)
        if [ -n "$CHANGES" ]; then
            echo "**Changes**:"
            echo '```'
            echo "$CHANGES"
            echo '```'
        else
            echo "**Changes**: None (working tree clean)"
        fi
        
        # Get recent commits from this session (last 3)
        RECENT_COMMITS=$(git log --oneline -3 --since="1 hour ago" 2>/dev/null)
        if [ -n "$RECENT_COMMITS" ]; then
            echo ""
            echo "**Recent Commits**:"
            echo '```'
            echo "$RECENT_COMMITS"
            echo '```'
        fi
    else
        echo "**Git**: Not a repository"
    fi
    echo ""
    
    # Current task (try to extract from sprint.md)
    if [ -f "$CLAUDE_DIR/sprint.md" ]; then
        # Find first in-progress task
        IN_PROGRESS=$(grep -m1 "🚧" "$CLAUDE_DIR/sprint.md" 2>/dev/null || true)
        if [ -n "$IN_PROGRESS" ]; then
            echo "**Active Task**: $IN_PROGRESS"
        fi
    fi
    
} >> "$SESSION_LOG"

# ============================================
# Trim old entries (keep last 50 sessions)
# ============================================

if [ -f "$SESSION_LOG" ]; then
    # Count session entries
    SESSION_COUNT=$(grep -c "^### Session:" "$SESSION_LOG" 2>/dev/null || echo "0")
    
    if [ "$SESSION_COUNT" -gt 50 ]; then
        # Keep header and last 50 sessions
        # This is a simple approach - we keep the file manageable
        TEMP_FILE=$(mktemp)
        head -10 "$SESSION_LOG" > "$TEMP_FILE"  # Keep header
        echo "" >> "$TEMP_FILE"
        # Get last 50 sessions worth of content (roughly)
        tail -500 "$SESSION_LOG" >> "$TEMP_FILE"
        mv "$TEMP_FILE" "$SESSION_LOG"
    fi
fi

exit 0

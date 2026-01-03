#!/bin/bash
# session-start.sh - Bootstrap every session with project context
#
# This hook ensures Claude always starts with:
# 1. Project context (memory.md, sprint.md)
# 2. Git status
# 3. Full principles reminder (since this is session start)
#
# Output is injected into Claude's context at session start.

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CLAUDE_DIR="$PROJECT_DIR/.claude"

echo "=== SESSION CONTEXT ==="
echo ""

# ============================================
# 1. Load Project Memory (Critical)
# ============================================
if [ -f "$CLAUDE_DIR/memory.md" ]; then
    echo "## Project Memory"
    echo ""
    cat "$CLAUDE_DIR/memory.md"
    echo ""
else
    echo "## Project Memory"
    echo ""
    echo "⚠️ No memory.md found. Create .claude/memory.md with project context."
    echo ""
fi

# ============================================
# 2. Load Current Sprint (What we're working on)
# ============================================
if [ -f "$CLAUDE_DIR/sprint.md" ]; then
    echo "---"
    echo "## Current Sprint"
    echo ""
    # Show first 100 lines to avoid overwhelming context
    head -100 "$CLAUDE_DIR/sprint.md"
    SPRINT_LINES=$(wc -l < "$CLAUDE_DIR/sprint.md")
    if [ "$SPRINT_LINES" -gt 100 ]; then
        echo ""
        echo "[... truncated, $SPRINT_LINES total lines. Read full file if needed.]"
    fi
    echo ""
fi

# ============================================
# 3. Git Context (Where we are in version control)
# ============================================
echo "---"
echo "## Git Status"
echo ""

if git rev-parse --git-dir > /dev/null 2>&1; then
    BRANCH=$(git branch --show-current 2>/dev/null || echo "detached HEAD")
    echo "**Branch**: $BRANCH"
    echo ""
    
    # Uncommitted changes
    CHANGES=$(git status --short 2>/dev/null)
    if [ -n "$CHANGES" ]; then
        echo "**Uncommitted Changes**:"
        echo '```'
        echo "$CHANGES"
        echo '```'
    else
        echo "**Working tree clean**"
    fi
    echo ""
    
    # Recent commits (last 5)
    echo "**Recent Commits**:"
    echo '```'
    git log --oneline -5 2>/dev/null || echo "No commits yet"
    echo '```'
else
    echo "Not a git repository"
fi
echo ""

# ============================================
# 4. Recent Lessons (Avoid past mistakes)
# ============================================
if [ -f "$CLAUDE_DIR/lessons.md" ]; then
    # Check if lessons.md has actual content beyond the template
    LESSON_COUNT=$(grep -c "^### " "$CLAUDE_DIR/lessons.md" 2>/dev/null || echo "0")
    if [ "$LESSON_COUNT" -gt 0 ]; then
        echo "---"
        echo "## Recent Lessons ($LESSON_COUNT entries)"
        echo ""
        echo "⚠️ Check .claude/lessons.md before similar work to avoid repeating past mistakes."
        echo ""
    fi
fi

# ============================================
# 5. Development Standards (Full reminder at session start)
# ============================================
echo "---"
echo "## Development Standards"
echo ""
echo "### Meta-Cognitive Loop"
echo "Before any significant task: **UNDERSTAND → PLAN → VALIDATE → EXECUTE → REFLECT**"
echo ""
echo "### Pre-Implementation"
echo "□ **Investigate First**: Search codebase for existing components/patterns before creating new"
echo "□ **Check Documentation**: Review memory.md for established patterns and decisions"
echo "□ **Plan Before Coding**: What's the simplest, most maintainable solution?"
echo ""
echo "### Implementation Standards"
echo "□ **Clean, Modular Code**: Functions <100 lines, single responsibility, descriptive naming"
echo "□ **No Quick Fixes**: Fix root causes, not symptoms. No technical debt without tickets."
echo "□ **Follow Patterns**: Use existing components, maintain consistency with codebase"
echo "□ **Handle All Cases**: Error handling, input validation, edge cases"
echo ""
echo "### Quality Assurance (MANDATORY)"
echo "□ **Test Everything**: Unit tests for logic, integration tests for APIs"
echo "□ **Run Test Suite**: Build must pass, tests must pass, no regressions"
echo "□ **Document Changes**: Update docs/ for API changes, docstrings for functions >20 lines"
echo ""
echo "### Continuous Improvement"
echo "□ **Fix or Ticket**: Inefficient code? Fix if <30 mins, otherwise create TECH-DEBT ticket"
echo "□ **Update Learnings**: Add significant bugs to lessons.md, patterns to memory.md"
echo ""
echo "**Remember**: You're the lead engineer. Investigate thoroughly. Build systematically. Test rigorously. Own the outcome."
echo ""
echo "=== END SESSION CONTEXT ==="

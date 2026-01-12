#!/bin/bash
# user-prompt.sh - Inject task reminder before processing each user message
#
# This hook runs every time the user submits a prompt.
# It injects a brief reminder of key standards and the meta-cognitive loop.
#
# Think of this as the "dementia mitigation" hook - frequent gentle reminders.
#
# Output (stdout) is added to context before Claude processes the message.

set -e

# Read the user prompt input (we don't need to parse it, just inject context)
INPUT=$(cat)

# Keep this SHORT since it runs on every message
# Longer reminders are in session-start.sh

cat << 'EOF'
=== TASK APPROACH ===
**Before starting**: UNDERSTAND → PLAN → VALIDATE → EXECUTE → REFLECT

Pre-Implementation:
□ Investigate codebase first - don't reinvent existing patterns
□ Check memory.md for conventions and architecture decisions
□ Plan your approach - what's the simplest correct solution?

Implementation:
□ Write clean, modular code - follow existing patterns
□ Handle errors and edge cases
□ No quick fixes - fix root causes

After Implementation (MANDATORY):
□ Run build and tests - must pass before reporting complete
□ Update documentation if APIs/interfaces changed
□ Update sprint.md with progress

**Think step-by-step**: What do I know? What do I need to investigate? What's my plan?
===================
EOF

# Load rules.md if it exists (lightweight project-specific reminders)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$PROJECT_ROOT/rules.md" ]; then
    echo ""
    cat "$PROJECT_ROOT/rules.md"
fi

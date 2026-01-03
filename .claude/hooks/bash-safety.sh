#!/bin/bash
# bash-safety.sh - Safety gate for bash commands
#
# Blocks truly dangerous commands. Warns on potentially risky ones.
# This is a safety net, not a replacement for Claude's judgment.
#
# Exit codes:
#   0 - Allow command (may print warnings)
#   2 - Block command (stderr tells Claude why and how to proceed)

# Read tool input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# If no command found, allow
if [ -z "$COMMAND" ]; then
    exit 0
fi

# ============================================
# BLOCKED: Catastrophic operations
# ============================================

# rm -rf on root, home, or overly broad paths
if echo "$COMMAND" | grep -qE 'rm\s+(-[rf]+\s+)*(/|/\*|~|\$HOME|/home|/usr|/etc|/var|/bin|/sbin|\.\./)'; then
    echo "BLOCKED: Destructive rm command on dangerous path." >&2
    echo "" >&2
    echo "This pattern could delete critical system or user files." >&2
    echo "If you need to delete files, use a specific path like:" >&2
    echo "  rm -rf ./dist" >&2
    echo "  rm -rf ./node_modules" >&2
    echo "  rm -rf /path/to/specific/directory" >&2
    exit 2
fi

# sudo commands
if echo "$COMMAND" | grep -qE '^\s*sudo\s+'; then
    echo "BLOCKED: sudo command requires human approval." >&2
    echo "" >&2
    echo "Explain what you need to accomplish and escalate to the user." >&2
    echo "The user can run the sudo command manually if needed." >&2
    exit 2
fi

# Direct modification of .git/config (could change remote)
if echo "$COMMAND" | grep -qE '(>\s*|cat\s+.*>\s*|echo\s+.*>\s*)\.git/config'; then
    echo "BLOCKED: Direct modification of .git/config." >&2
    echo "" >&2
    echo "Use git config commands instead:" >&2
    echo "  git config user.name 'Name'" >&2
    echo "  git remote set-url origin <url>" >&2
    exit 2
fi

# ============================================
# BLOCKED: Protected branch operations
# ============================================

# Direct push to protected branches
if echo "$COMMAND" | grep -qE 'git\s+push\s+(--force\s+|--force-with-lease\s+)?(origin\s+)?(main|master|production|prod|release)(\s|$|:)'; then
    echo "BLOCKED: Direct push to protected branch." >&2
    echo "" >&2
    echo "Use a feature branch and pull request workflow:" >&2
    echo "  git checkout -b feature/your-feature" >&2
    echo "  git push origin feature/your-feature" >&2
    echo "Then create a PR for review." >&2
    exit 2
fi

# Force push (anywhere - very dangerous)
if echo "$COMMAND" | grep -qE 'git\s+push\s+--force(\s|$)'; then
    echo "BLOCKED: Force push is dangerous and can lose history." >&2
    echo "" >&2
    echo "If you really need to force push, use --force-with-lease which is safer:" >&2
    echo "  git push --force-with-lease origin <branch>" >&2
    echo "Or explain why force push is necessary and escalate to user." >&2
    exit 2
fi

# ============================================
# WARNINGS: Potentially risky (allow but notify)
# ============================================

# Operations on .env files (might be intentional)
if echo "$COMMAND" | grep -qE '\.(env|env\.local|env\.production|env\.development)'; then
    echo "WARNING: Operation involves environment file." >&2
    echo "Ensure you're not exposing or committing secrets." >&2
    # Don't block - might be legitimate (e.g., creating .env.example)
fi

# Package installations
if echo "$COMMAND" | grep -qE '(npm install|yarn add|pip install|cargo add|go get)\s+'; then
    echo "NOTE: Package installation detected." >&2
    echo "Ensure the dependency is documented and necessary." >&2
fi

# Dropping database or tables
if echo "$COMMAND" | grep -qiE '(drop\s+database|drop\s+table|truncate\s+table)'; then
    echo "WARNING: Database destructive operation detected." >&2
    echo "Ensure you're targeting the correct database/table and have backups." >&2
fi

# chmod 777 (overly permissive)
if echo "$COMMAND" | grep -qE 'chmod\s+777'; then
    echo "WARNING: chmod 777 is overly permissive." >&2
    echo "Consider more restrictive permissions like 755 or 644." >&2
fi

# ============================================
# Allow command
# ============================================

exit 0

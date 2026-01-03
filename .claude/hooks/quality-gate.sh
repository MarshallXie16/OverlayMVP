#!/bin/bash
# quality-gate.sh - Post-write quality checks
#
# Runs after Write, Edit, or MultiEdit operations.
# Auto-formats when possible, blocks on lint errors.
#
# Exit codes:
#   0 - Success (may have auto-formatted)
#   2 - Blocking error (lint errors that must be fixed)

set -e

# Read tool input from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

# If no file path or file doesn't exist, allow
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

ERRORS=""
WARNINGS=""

# ============================================
# Language-specific linting
# ============================================

case "$FILE_PATH" in
    # JavaScript/TypeScript
    *.js|*.jsx|*.ts|*.tsx)
        # ESLint (if available)
        if command -v npx &> /dev/null && [ -f "package.json" ]; then
            # Check if eslint is available in the project
            if npx eslint --version &> /dev/null 2>&1; then
                LINT_OUTPUT=$(npx eslint "$FILE_PATH" 2>&1) || {
                    LINT_EXIT=$?
                    if [ $LINT_EXIT -eq 1 ]; then
                        ERRORS="${ERRORS}[ESLint Errors]\n$LINT_OUTPUT\n\n"
                    fi
                }
            fi
        fi
        
        # Prettier auto-format (if available)
        if command -v npx &> /dev/null; then
            if npx prettier --version &> /dev/null 2>&1; then
                if ! npx prettier --check "$FILE_PATH" &> /dev/null 2>&1; then
                    npx prettier --write "$FILE_PATH" 2>&1
                    echo "INFO: Auto-formatted $FILE_PATH with Prettier" >&2
                fi
            fi
        fi
        ;;
    
    # Python
    *.py)
        # Ruff (fast Python linter)
        if command -v ruff &> /dev/null; then
            LINT_OUTPUT=$(ruff check "$FILE_PATH" 2>&1) || {
                # Ruff returns non-zero on errors
                ERRORS="${ERRORS}[Ruff Errors]\n$LINT_OUTPUT\n\n"
            }
            # Ruff auto-fix
            ruff check --fix "$FILE_PATH" &> /dev/null || true
        elif command -v flake8 &> /dev/null; then
            LINT_OUTPUT=$(flake8 "$FILE_PATH" 2>&1) || {
                ERRORS="${ERRORS}[Flake8 Errors]\n$LINT_OUTPUT\n\n"
            }
        fi
        
        # Black auto-format (if available)
        if command -v black &> /dev/null; then
            if ! black --check "$FILE_PATH" &> /dev/null 2>&1; then
                black "$FILE_PATH" 2>&1
                echo "INFO: Auto-formatted $FILE_PATH with Black" >&2
            fi
        fi
        ;;
    
    # Shell scripts
    *.sh|*.bash)
        if command -v shellcheck &> /dev/null; then
            LINT_OUTPUT=$(shellcheck "$FILE_PATH" 2>&1) || {
                # Filter to just errors (SC codes with "error" severity)
                SHELL_ERRORS=$(echo "$LINT_OUTPUT" | grep -E "error:|^In " || true)
                if [ -n "$SHELL_ERRORS" ]; then
                    ERRORS="${ERRORS}[ShellCheck Errors]\n$LINT_OUTPUT\n\n"
                else
                    # Warnings only - don't block
                    WARNINGS="${WARNINGS}[ShellCheck Warnings]\n$LINT_OUTPUT\n\n"
                fi
            }
        fi
        ;;
    
    # Go
    *.go)
        if command -v gofmt &> /dev/null; then
            gofmt -w "$FILE_PATH" 2>&1
            echo "INFO: Auto-formatted $FILE_PATH with gofmt" >&2
        fi
        if command -v go &> /dev/null; then
            LINT_OUTPUT=$(go vet "$FILE_PATH" 2>&1) || {
                ERRORS="${ERRORS}[Go Vet Errors]\n$LINT_OUTPUT\n\n"
            }
        fi
        ;;
    
    # Rust
    *.rs)
        if command -v rustfmt &> /dev/null; then
            rustfmt "$FILE_PATH" 2>&1 || true
            echo "INFO: Auto-formatted $FILE_PATH with rustfmt" >&2
        fi
        ;;
esac

# ============================================
# Check for debugging artifacts
# ============================================

DEBUG_ARTIFACTS=$(grep -n -E "(console\.log|print\(.*DEBUG|debugger;|TODO.*REMOVE|FIXME.*TEMP|XXX.*DELETE)" "$FILE_PATH" 2>/dev/null || true)

if [ -n "$DEBUG_ARTIFACTS" ]; then
    WARNINGS="${WARNINGS}[Debugging Artifacts Found]\nReview before committing:\n$DEBUG_ARTIFACTS\n\n"
fi

# ============================================
# Report Results
# ============================================

# Show warnings but don't block
if [ -n "$WARNINGS" ]; then
    echo -e "WARNINGS for $FILE_PATH:\n$WARNINGS" >&2
fi

# Block on errors
if [ -n "$ERRORS" ]; then
    echo -e "QUALITY CHECK FAILED for $FILE_PATH:\n" >&2
    echo -e "$ERRORS" >&2
    echo "Fix these errors before proceeding. Use lint ignore comments if an error is a false positive." >&2
    exit 2
fi

# ============================================
# Success - Inject Quality Reminder
# ============================================

# This stdout is shown in transcript and reminds about next steps
echo "✓ Quality check passed for $FILE_PATH"
echo ""
echo "REMINDER after modifying code:"
echo "□ Run tests for affected components (build + unit + integration)"
echo "□ Update documentation if this changes APIs or interfaces"
echo "□ Check for debugging artifacts before committing"

exit 0

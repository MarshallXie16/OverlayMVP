#!/bin/bash
# Chrome Debug Launcher for Extension Development
# This script launches Chrome with remote debugging enabled so Chrome DevTools MCP can connect

set -e

# Configuration
DEBUG_PORT="${DEBUG_PORT:-9222}"
CHROME_PROFILE="${CHROME_PROFILE:-$HOME/.chrome-debug-profile}"
EXTENSION_PATH="${EXTENSION_PATH:-$(pwd)/extension/dist}"

# Detect Chrome path based on OS
detect_chrome() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if [ -d "/Applications/Google Chrome.app" ]; then
            echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        elif [ -d "/Applications/Google Chrome Canary.app" ]; then
            echo "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
        else
            echo "Error: Chrome not found. Please install Google Chrome." >&2
            exit 1
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v google-chrome &> /dev/null; then
            echo "google-chrome"
        elif command -v chromium-browser &> /dev/null; then
            echo "chromium-browser"
        else
            echo "Error: Chrome not found. Please install Google Chrome." >&2
            exit 1
        fi
    else
        echo "Error: Unsupported OS. Please launch Chrome manually with --remote-debugging-port=$DEBUG_PORT" >&2
        exit 1
    fi
}

CHROME_PATH=$(detect_chrome)

echo "=========================================="
echo "  Chrome Debug Launcher for Extensions"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  - Debug Port: $DEBUG_PORT"
echo "  - Profile Dir: $CHROME_PROFILE"
echo "  - Extension Path: $EXTENSION_PATH"
echo "  - Chrome Path: $CHROME_PATH"
echo ""

# Check if extension is built
if [ ! -d "$EXTENSION_PATH" ]; then
    echo "Warning: Extension dist folder not found at $EXTENSION_PATH"
    echo "Build the extension first with: cd extension && npm run build"
    echo ""
    read -p "Continue without loading extension? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    LOAD_EXTENSION=""
else
    LOAD_EXTENSION="--load-extension=$EXTENSION_PATH"
fi

echo "Starting Chrome with remote debugging..."
echo ""
echo "IMPORTANT: To use Chrome DevTools MCP:"
echo "  1. In Chrome, go to chrome://inspect/#remote-debugging"
echo "  2. Enable 'Remote debugging'"
echo "  3. The MCP server will auto-connect using --autoConnect"
echo ""
echo "Press Ctrl+C to stop Chrome"
echo ""

# Launch Chrome with remote debugging
"$CHROME_PATH" \
    --remote-debugging-port=$DEBUG_PORT \
    --user-data-dir="$CHROME_PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    $LOAD_EXTENSION \
    "$@"

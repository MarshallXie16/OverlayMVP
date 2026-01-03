# Debugging with Chrome DevTools MCP

This project uses Chrome DevTools MCP to enable AI-assisted debugging of the Chrome extension and web dashboard.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Detailed Setup Guide](#detailed-setup-guide)
- [Available MCP Tools](#available-mcp-tools)
- [Common Debugging Workflows](#common-debugging-workflows)
- [Troubleshooting](#troubleshooting)
- [MCP Setup Guide (For New Projects)](#mcp-setup-guide-for-new-projects)

---

## Overview

Chrome DevTools MCP is a Model Context Protocol server that bridges Claude with a live Chrome browser instance. This allows Claude to:

- **Inspect DOM elements** on any page, including pages where the extension is active
- **View console logs** to catch JavaScript errors and debugging output
- **Monitor network requests** to debug API calls
- **Take screenshots** of the current page state
- **Execute JavaScript** in the page context
- **Analyze performance** with Chrome's built-in tracing

---

## Quick Start

**TL;DR** - Get debugging working in 3 steps:

```bash
# 1. Start Chrome with remote debugging (in a terminal, keep it running)
./scripts/debug-chrome.sh

# 2. Verify Chrome is accessible
curl -s http://localhost:9222/json/version

# 3. Start a new Claude Code session (MCP will auto-connect)
claude
```

---

## Detailed Setup Guide

### Prerequisites

- Node.js v22+ (current: v22.13.0)
- Chrome browser (stable, beta, canary, or dev channel)
- Claude Code CLI installed

### Step 1: Configure the MCP Server

There are **two connection modes** for Chrome DevTools MCP. Choose based on your workflow:

#### Option A: Connect to Existing Chrome (Recommended)

Use this when you want to control which Chrome instance to debug.

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222
```

**Workflow:**
1. You start Chrome manually with `--remote-debugging-port=9222`
2. MCP connects to your existing Chrome instance
3. You have full control over Chrome lifecycle

#### Option B: Auto-Launch Chrome

Use this for a simpler setup where MCP manages Chrome.

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --userDataDir=$HOME/.chrome-debug-profile
```

**Workflow:**
1. MCP launches Chrome automatically when tools are called
2. Chrome uses the specified profile directory
3. MCP manages Chrome lifecycle

**Important:** Don't mix these approaches. If Chrome is already running with the same profile, MCP will fail with "browser is already running" error.

### Step 2: Start Chrome with Remote Debugging

For **Option A** (connect to existing Chrome), start Chrome manually:

```bash
# Use our helper script (recommended)
./scripts/debug-chrome.sh

# Or manually on macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/.chrome-debug-profile" \
    --load-extension="$(pwd)/extension" \
    --no-first-run

# Or manually on Linux
google-chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/.chrome-debug-profile" \
    --load-extension="$(pwd)/extension" \
    --no-first-run
```

**Verify Chrome is accepting connections:**

```bash
curl -s http://localhost:9222/json/version
# Should return JSON with Browser, Protocol-Version, etc.

curl -s http://localhost:9222/json/list
# Lists all open pages/tabs
```

### Step 3: Start Claude Code

Start a **new** Claude Code session. The MCP server initializes when the session starts.

```bash
claude
```

**Important:** If you change the MCP configuration, you must restart your Claude Code session for changes to take effect. The MCP server configuration is loaded at session start.

### Step 4: Verify MCP Connection

In Claude Code, check the MCP status:

```bash
/mcp
```

You should see `chrome-devtools: Connected`.

Alternatively, ask Claude to list pages:
```
List all open Chrome pages using the Chrome DevTools MCP
```

---

## Available MCP Tools

Once connected, Claude has access to these debugging tools:

### Page Management
| Tool | Description |
|------|-------------|
| `list_pages` | List all open browser pages/tabs |
| `new_page` | Open a new page with specified URL |
| `close_page` | Close a specific page |
| `navigate_page` | Navigate current page to a URL |
| `reload_page` | Reload the current page |

### DOM & Inspection
| Tool | Description |
|------|-------------|
| `take_snapshot` | Get DOM structure and element details |
| `take_screenshot` | Capture current page state as PNG image |
| `evaluate_script` | Execute JavaScript in page context |
| `query_selector` | Find elements matching CSS selector |

### User Interaction
| Tool | Description |
|------|-------------|
| `click` | Click an element |
| `fill` | Enter text in an input field |
| `select_option` | Select option in a dropdown |
| `press_key` | Simulate keyboard input |
| `hover` | Hover over an element |
| `wait_for` | Wait for element/condition |

### Console & Logging
| Tool | Description |
|------|-------------|
| `list_console_messages` | Get all console output |
| `get_console_message` | Get specific console message details |

### Network
| Tool | Description |
|------|-------------|
| `list_network_requests` | View all network activity |
| `get_network_request` | Get request/response details |

### Performance
| Tool | Description |
|------|-------------|
| `performance_start_trace` | Begin recording performance trace |
| `performance_stop_trace` | Stop and analyze trace |
| `performance_analyze_insight` | Get performance recommendations |

### Emulation
| Tool | Description |
|------|-------------|
| `set_viewport` | Change viewport size |
| `emulate_device` | Emulate mobile devices |
| `set_geolocation` | Set geolocation |
| `set_network_conditions` | Throttle network |

---

## Common Debugging Workflows

### Debug Extension Overlay Not Appearing

Ask Claude:
```
Use Chrome DevTools to check if the walkthrough overlay elements exist in the DOM
on the current page. Look for elements with class "overlay-walkthrough" or similar.
Also check the console for any JavaScript errors from the extension.
```

### Debug API Communication Issues

Ask Claude:
```
Use Chrome DevTools to list all network requests to our backend API
(localhost:8000 or the production API). Show me any failed requests
and their error responses.
```

### Debug Element Finding Issues

Ask Claude:
```
Take a screenshot of the current page and list all interactive elements
(buttons, inputs, links). I'm trying to debug why the walkthrough can't
find a specific element.
```

### Debug Recording Widget

Ask Claude:
```
Check the console for any errors when I click the Start Recording button.
Also take a snapshot of the DOM to verify the recording widget is being
injected properly.
```

### End-to-End Workflow Testing

Ask Claude:
```
Navigate to the dashboard at http://localhost:5173, take a screenshot,
then click on the first workflow card. Monitor any API calls made and
report any errors.
```

---

## Extension-Specific Debugging

When debugging the Chrome extension:

1. **Content Scripts**: Injected into web pages, visible via normal DOM inspection with MCP
2. **Background Service Worker**: Use Chrome's built-in `chrome://extensions` → "Inspect views: service worker"
3. **Popup UI**: Click extension icon, right-click → "Inspect popup"

Chrome DevTools MCP can inspect content scripts and the pages they modify. For background/popup debugging, you may need to use Chrome's native DevTools in addition to MCP.

---

## Troubleshooting

### "Not connected" Error

**Cause:** MCP server is not connected to Chrome.

**Solutions:**

1. **Check Chrome is running with remote debugging:**
   ```bash
   curl -s http://localhost:9222/json/version
   ```
   If this fails, Chrome isn't running or isn't accepting debug connections.

2. **Restart your Claude Code session:**
   MCP configuration is loaded at session start. If you changed config, restart:
   ```bash
   # Exit current session, then:
   claude
   ```

3. **Check MCP configuration:**
   ```bash
   claude mcp list
   ```

### "Browser is already running" Error

**Cause:** MCP is configured with `--userDataDir` but Chrome is already running with that profile.

**Solutions:**

1. **Close the existing Chrome instance:**
   ```bash
   pkill -f "chrome-debug-profile"
   ```

2. **Or switch to `--browserUrl` mode:**
   ```bash
   claude mcp remove chrome-devtools
   claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222
   ```
   Then restart your Claude Code session.

### Extension Not Loaded

1. **Check if extension is in the correct path:**
   ```bash
   ls extension/src/manifest.json
   ```

2. **Check Chrome's extension page:** Navigate to `chrome://extensions` and look for errors

3. **Verify the extension loads manually:**
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/` folder

### MCP Tools Not Found

**Cause:** MCP tools need to be "loaded" before use in Claude Code.

**Solution:** First search for the tool:
```
Search for chrome-devtools MCP tools
```

Or directly select a specific tool:
```
Use the list_pages tool from Chrome DevTools MCP
```

### Console/Network Not Showing Data

**Cause:** Data may be from before MCP connected.

**Solution:** Refresh the page after MCP connects to capture fresh events.

---

## MCP Setup Guide (For New Projects)

This section explains how to set up Chrome DevTools MCP from scratch for any project.

### What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI assistants to external tools and data sources. MCP servers provide capabilities that Claude can use during conversations.

### Step 1: Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### Step 2: Add the Chrome DevTools MCP Server

```bash
# Option 1: Connect to existing Chrome (you manage Chrome)
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222

# Option 2: Auto-launch Chrome (MCP manages Chrome)
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --userDataDir=$HOME/.chrome-debug-profile

# Option 3: Headless mode (no visible browser)
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --headless
```

### Step 3: Verify Configuration

Check that the MCP was added:

```bash
claude mcp list
```

You should see:
```
chrome-devtools: npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222 - ✓ Connected
```

### Step 4: Configuration File Location

MCP configuration is stored in `~/.claude.json`. You can edit it directly:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]
    }
  }
}
```

### Available MCP Options

| Option | Description | Example |
|--------|-------------|---------|
| `--browserUrl` | Connect to existing Chrome | `--browserUrl http://127.0.0.1:9222` |
| `--wsEndpoint` | Connect via WebSocket | `--wsEndpoint ws://127.0.0.1:9222/devtools/browser/abc` |
| `--userDataDir` | Launch Chrome with profile | `--userDataDir=$HOME/.chrome-profile` |
| `--headless` | Run without visible browser | `--headless` |
| `--isolated` | Use temp profile (auto-cleanup) | `--isolated` |
| `--channel` | Chrome channel | `--channel canary` |
| `--viewport` | Initial window size | `--viewport 1280x720` |
| `--executablePath` | Custom Chrome path | `--executablePath /path/to/chrome` |

### MCP Management Commands

```bash
# List all configured MCP servers
claude mcp list

# Add a new MCP server
claude mcp add <name> -- <command> [args...]

# Remove an MCP server
claude mcp remove <name>

# Check MCP status in Claude Code
/mcp
```

### Best Practices

1. **Use `--browserUrl` for development**: Gives you control over Chrome and allows loading extensions
2. **Use `--headless` for CI/testing**: No UI needed, faster execution
3. **Use `--isolated` for one-off debugging**: Clean profile, no state persistence
4. **Restart Claude Code after config changes**: MCP is initialized at session start
5. **Keep Chrome running**: If using `--browserUrl`, start Chrome before Claude Code

### Creating a Debug Helper Script

For projects with Chrome extensions, create a helper script:

```bash
#!/bin/bash
# scripts/debug-chrome.sh

DEBUG_PORT="${DEBUG_PORT:-9222}"
CHROME_PROFILE="${CHROME_PROFILE:-$HOME/.chrome-debug-profile}"

# Detect Chrome
if [[ "$OSTYPE" == "darwin"* ]]; then
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
    CHROME="google-chrome"
fi

echo "Starting Chrome on port $DEBUG_PORT..."
"$CHROME" \
    --remote-debugging-port=$DEBUG_PORT \
    --user-data-dir="$CHROME_PROFILE" \
    --no-first-run \
    "$@"
```

Make it executable:
```bash
chmod +x scripts/debug-chrome.sh
```

---

## Quick Reference

### Verify Everything is Working

```bash
# 1. Check Chrome is running with debug port
curl -s http://localhost:9222/json/version

# 2. List open pages
curl -s http://localhost:9222/json/list

# 3. Check MCP configuration
claude mcp list

# 4. In Claude Code, check MCP status
/mcp
```

### Common MCP Commands in Claude

```
"List all open Chrome pages"
"Take a screenshot of the current page"
"Check the console for errors"
"Navigate to http://localhost:5173"
"Click the button with text 'Submit'"
"List all network requests to the API"
```

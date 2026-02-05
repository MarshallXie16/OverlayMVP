# Rules & Reminders

<!--
PURPOSE: Lightweight bullet points loaded with every message via UserPromptSubmit hook.
Keep this file CONCISE - it's injected into every prompt, so bloat = wasted tokens.

GUIDELINES:
- Maximum ~50 lines of actual content (excluding this header)
- Only include rules that are frequently forgotten or critical
- Use short, actionable bullet points
- Remove rules once they become habitual
- Group by category for quick scanning
-->

## Build & Test
- Always run `npm run build` in extension/ (not just `vite build`) - content scripts need esbuild step
- Run tests before marking work complete - `pytest` for backend, `npm test` for frontend
- Check content script format after extension builds: `head -5 dist/content/*.js` (must be IIFE, not ES modules)

## Extension Development
- After rebuilding extension, **reload it in chrome://extensions** for changes to take effect
- Content scripts cannot use ES module imports - must be self-contained IIFE bundles
- Recording/walkthrough suddenly broken? First suspect is build issue - rebuild and reload
- **Walkthrough changes**: ALWAYS test manually after build - look for "placeholder" in console logs (indicates incomplete implementation)

## Code Quality
- Read files before editing - understand existing patterns
- Fix root causes, not symptoms
- No TODO comments without backlog tickets
- Log exceptions before swallowing them

## API & Data
- Check response status before calling `.json()` (204 No Content has no body)
- Validate user input at API boundaries
- Clean up associated files when deleting database records

## Documentation
- Update sprint.md with progress as you work
- Add significant bugs to lessons.md after fixing
- Update memory.md if architecture/conventions change

## Common Gotchas
- Click validation: use `contains()` not strict equality (handles nested elements)
- File uploads: need explicit linking calls after creation
- AI APIs: use tool calling for structured output, not text parsing
- Message format: verify sender and receiver agree on structure (check payload vs direct fields)
- SPA navigation: dispatch PAGE_LOADED immediately (no webNavigation events for client-side routing)
- **Recording ↔ Walkthrough data**: Check actual API response field names (snake_case: `selectors`, `action_type`), not assumed names

## State Machine / Async
- Serialize dispatch calls via promise queue to prevent race conditions
- Use chrome.alarms for timeouts in service workers (setTimeout lost on restart)
- User-initiated state changes should complete in single transition (no stranding)

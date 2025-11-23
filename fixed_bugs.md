# Fixed Bugs

Quick reference of bugs fixed, how they were resolved, and lessons learned.

---

## Sprint 1: MVP Development

1. **Extension manifest.json missing from dist/** - Fixed: Added vite-plugin-static-copy to copy static files. Lesson: Vite doesn't copy non-imported files by default.

2. **Dashboard signup 400 error** - Fixed: Made company_name required in signup, added /api/auth/me endpoint. Lesson: Backend validation must match frontend expectations.

3. **Content script not loading** - Fixed: Removed CSS imports from TypeScript, loaded via manifest.json. Lesson: Content scripts can't import CSS like regular modules.

4. **Widget buttons being recorded** - Fixed: Filter clicks on #workflow-recording-widget. Lesson: Always exclude recorder UI from recordings.

5. **Response parsing errors** - Fixed: Changed `response.success` to `response.payload.success`. Lesson: Message structure must be consistent across components.

6. **Duplicate step numbers** - Fixed: Atomic increment with `const stepNumber = ++state.counter`. Lesson: Race conditions happen even in single-threaded JavaScript due to async/await.

7. **400 Bad Request on workflow upload** - Root cause: Duplicate step numbers violating database unique constraint. Lesson: Database constraints catch bugs tests might miss.

8. **Too many redundant steps (13 for login)** - Fixed: Implemented EventDeduplicator with 100ms buffering and priority system. Lesson: Record user intent, not DOM events.

9. **Checkbox clicks recording 3 events** - Fixed: Suppress label/input clicks, only record change event. Lesson: Related events should be grouped and deduplicated.

10. **Form submit recording button + form** - Fixed: Prioritize submit event over button click. Lesson: Use event hierarchy (submit > change > blur > click).

11. **Empty input clicks being recorded** - Fixed: Track values on focus, skip blur if no change. Lesson: Value change detection eliminates noise.

12. **Browser autofill creating spam** - Fixed: Value change detection filters unchanged blurs. Lesson: 60-70% of blur events are noise from autofill.

---

## Key Patterns

- **Race conditions**: Capture state atomically before async operations
- **Event deduplication**: Buffer + group + prioritize for semantic recording  
- **Database constraints**: Use them to enforce business rules and catch bugs
- **CSS in extensions**: Always load via manifest.json, never import in TS
- **Error logging**: Serialize and log full error objects for debugging

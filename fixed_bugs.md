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

## Sprint 2: AI Labeling & Integration (2024-11-23)

13. **Screenshots not linked to steps** - Root cause: Extension uploaded screenshots but never called PATCH endpoint to associate them with steps. Fix: Added `linkScreenshotToStep()` to extension after upload, created PATCH `/api/steps/{id}/screenshot` endpoint. Lesson: Multi-step upload flows need explicit linking, don't assume backend will auto-associate.

14. **Race condition: AI processing before screenshots ready** - Root cause: Celery task triggered immediately on workflow creation, before extension linked screenshots. Fix: Removed immediate trigger, added POST `/api/workflows/{id}/start-processing` endpoint that extension calls after screenshots ready. Lesson: Let client control async workflow timing when it has critical dependencies.

15. **Anthropic API 'messages' attribute error** - Root cause: Outdated anthropic package (0.7.1) with completely different API structure. Fix: Upgraded to anthropic>=0.74.1, updated all API calls to use `client.messages.create()`. Lesson: Major version upgrades in AI SDKs often have breaking API changes.

16. **Claude API "Only HTTPS URLs supported" error** - Root cause: Local screenshot URLs served via HTTP, Claude requires HTTPS. Fix: Convert local files to base64 before sending to API. Lesson: AI vision APIs have strict security requirements, local dev needs workarounds.

17. **Claude returning plain text instead of JSON** - Root cause: Prompt asked for JSON but didn't guarantee structured output. Fix: Implemented tool calling with explicit schema (`record_workflow_labels` tool). Lesson: Use tool calling for reliable JSON extraction, not regex parsing of text responses.

18. **Screenshots showing as broken images** - Root cause: S3 utilities were completely mocked, files never actually saved to disk. Fix: Implemented real local file storage in `backend/screenshots/`, served via FastAPI StaticFiles. Lesson: MVP needs real storage, even if local; mocked storage breaks dependent features.

19. **Review page not accessible from UI** - Root cause: Page existed at `/workflows/:id/review` but no navigation button. Fix: Added "Review & Edit" button to workflow detail page for draft/active workflows. Lesson: ALWAYS add UI navigation in same commit as new page/feature.

20. **Delete workflow JSON parse error** - Root cause: API client tried to parse JSON from 204 No Content response. Fix: Check response status and content-length before calling `.json()`. Lesson: DELETE endpoints often return empty body, handle gracefully.

21. **Timestamp showing "-475ms"** - Root cause: Date calculation with negative time difference (future dates), no validation. Fix: Added date validation, handle negative differences as "Just now", better error handling. Lesson: Always validate date inputs and handle edge cases.

22. **Screenshot upload 401 Unauthorized** - Root cause: Duplicate `get_current_user()` function in screenshots.py shadowing correct import, calling undefined `decode_token()`. Fix: Removed duplicate function, use proper dependency import. Lesson: Don't redefine dependency functions, always import from utils.

23. **TypeError: 'User' object is not subscriptable** - Root cause: Code tried `current_user["company_id"]` but dependency returns User object, not dict. Fix: Changed all references to `current_user.company_id` (object attribute access). Lesson: Check what type dependencies actually return, don't assume dict.

---

## Key Patterns

- **Race conditions**: Capture state atomically before async operations
- **Event deduplication**: Buffer + group + prioritize for semantic recording  
- **Database constraints**: Use them to enforce business rules and catch bugs
- **CSS in extensions**: Always load via manifest.json, never import in TS
- **Error logging**: Serialize and log full error objects for debugging
- **Multi-step workflows**: Explicit triggers better than detection logic
- **AI SDK upgrades**: Major version changes have breaking APIs
- **Tool calling**: Use for structured output, not regex parsing
- **Local development**: Need real storage even for MVP, mocks break features
- **UI navigation**: Add buttons/links in same commit as new pages
- **Response parsing**: Check status/content before parsing JSON
- **Type assumptions**: Verify what dependencies actually return

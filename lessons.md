# Lessons Learned

Curated collection of bugs, fixes, and patterns to prevent future issues. Quality over quantity - only entries that provide actionable learning.

---

## Testing Patterns

### 1. Tests Must Call Actual Functions

**Symptom**: Tests pass but actual functions are broken.

**Root Cause**: Tests verify underlying logic (filesystem operations) directly instead of calling the function being tested.

**Example (Bad)**:
```python
def test_delete_file(self, tmp_path):
    file = tmp_path / "test.jpg"
    file.write_bytes(b"content")
    # BAD: Tests filesystem, not delete_file()
    if file.exists():
        file.unlink()
    assert not file.exists()
```

**Example (Good)**:
```python
def test_delete_file_actually_deletes(self, real_screenshots_dir):
    test_key = "test/file.jpg"
    test_file = real_screenshots_dir / test_key
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_bytes(b"content")

    # GOOD: Calls the actual function
    result = delete_file(test_key)

    assert result is True
    assert not test_file.exists()
```

**Prevention**: Integration tests should call actual functions with real (or properly mocked) dependencies.

---

### 2. Log All Exceptions Before Swallowing

**Symptom**: Operations fail silently with no way to diagnose issues.

**Root Cause**: Catching exceptions without logging.

**Example (Bad)**:
```python
try:
    file_path.unlink()
    return True
except Exception:
    return False  # Silent failure - no debugging info
```

**Example (Good)**:
```python
try:
    file_path.unlink()
    return True
except Exception as e:
    logger.warning(f"Failed to delete file {storage_key}: {e}")
    return False  # Graceful failure with diagnostic info
```

**Prevention**: Every `except` block should either re-raise or log the exception.

---

## Event Handling Patterns

### 3. Click Validation Must Handle Child Elements

**Symptom**: Click validation fails when user clicks on nested elements (SVG icon inside button).

**Root Cause**: Using strict equality `event.target === targetElement`.

**Example (Bad)**:
```typescript
if (event.target !== targetElement) {
    return false;  // Fails for <button><svg/></button> clicks
}
```

**Example (Good)**:
```typescript
function isClickOnTarget(event: Event, targetElement: HTMLElement): boolean {
    const eventTarget = event.target as HTMLElement;

    // Check if target contains the clicked element
    if (targetElement.contains(eventTarget)) {
        return true;
    }

    // Shadow DOM support
    if (event.composedPath) {
        return event.composedPath().includes(targetElement);
    }

    return false;
}
```

**Prevention**: Always use `contains()` or `composedPath()` for click validation, never strict equality.

---

## Data Integrity Patterns

### 4. Clean Up Associated Files on Deletion

**Symptom**: Storage bloat from orphaned files.

**Root Cause**: Database cascade deletes records but doesn't touch filesystem.

**Example (Bad)**:
```python
def delete_workflow(db, workflow_id, company_id):
    workflow = get_workflow(workflow_id)
    db.delete(workflow)  # Records deleted, files remain
    db.commit()
```

**Example (Good)**:
```python
def delete_workflow(db, workflow_id, company_id):
    workflow = get_workflow(workflow_id)
    storage_path = f"companies/{company_id}/workflows/{workflow_id}"

    db.delete(workflow)
    db.commit()

    # Clean up files AFTER successful DB commit
    if not delete_directory(storage_path):
        logger.warning(f"Failed to delete files at {storage_path}")
```

**Prevention**: Whenever deleting records that have associated files, add file cleanup logic.

---

## Chrome Extension Build Patterns

### 5. Content Scripts Must Be IIFE Bundles (Not ES Modules)

**Symptom**: Content script fails with "Cannot use import statement outside a module" error.

**Root Cause**: Chrome content scripts cannot use ES module `import` statements - they must be self-contained IIFE (Immediately Invoked Function Expression) bundles. If your build tool (Vite, Webpack) outputs ES modules with chunks, content scripts will break.

**Example (Bad Build Output)**:
```javascript
// dist/content/recorder.js - BROKEN
import{e as A}from"../chunks/metadata-eFzR7xkA.js";
// Chrome throws: "Cannot use import statement outside a module"
```

**Example (Good Build Output)**:
```javascript
// dist/content/recorder.js - WORKS
"use strict";
(() => {
  // All code inlined, no imports
  function extractMetadata() { ... }
})();
```

**Solution**: Use a two-stage build:
1. Main build (Vite) for popup, background worker
2. Separate esbuild step to rebuild content scripts as IIFE

```javascript
// scripts/build-content-scripts.mjs
await esbuild.build({
  entryPoints: ['src/content/recorder.ts'],
  bundle: true,
  format: 'iife',  // Critical: self-contained, no imports
  outfile: 'dist/content/recorder.js',
});
```

**Prevention**:
- Always verify content script output starts with IIFE pattern, not `import`
- After any build config changes, check `head -5 dist/content/*.js`
- Include esbuild step in `npm run build`: `"build": "vite build && node scripts/build-content-scripts.mjs"`
- If recording/walkthrough suddenly breaks, first suspect is build issue - rebuild and reload extension

---

## Error Recovery Patterns

### 6. Retain Data on Upload Failure

**Symptom**: User loses recorded data when upload fails.

**Root Cause**: Data discarded on error without persistence option.

**Example (Bad)**:
```typescript
try {
    await uploadWorkflow(data);
} catch (error) {
    showError("Upload failed");
    // Data is lost!
}
```

**Example (Good)**:
```typescript
try {
    await uploadWorkflow(data);
} catch (error) {
    // Store locally for retry
    await storeFailedUpload(data, error.message);
    showError("Upload failed - saved locally for retry");
}
```

**Prevention**: For operations with valuable user data, always implement local persistence on failure.

---

## Historical Bug Fixes

### Sprint 1: MVP Development

1. **Extension manifest.json missing** - Vite doesn't copy non-imported files. Use vite-plugin-static-copy.

2. **Content script CSS imports fail** - Content scripts can't import CSS like modules. Load via manifest.json.

3. **Widget buttons being recorded** - Filter clicks on recorder UI elements.

4. **Duplicate step numbers** - Race conditions in async operations. Use atomic increments.

5. **Event spam (13 events for login)** - Implement EventDeduplicator with buffering and priority.

### Sprint 2: AI Labeling

6. **Screenshots not linked to steps** - Multi-step uploads need explicit linking calls.

7. **AI processing before screenshots ready** - Let client control async workflow timing.

8. **Anthropic SDK breaking changes** - Major version upgrades in AI SDKs often break APIs.

9. **Claude requires HTTPS for images** - Convert local files to base64 for AI APIs.

10. **Claude returning text instead of JSON** - Use tool calling for reliable structured output.

11. **Screenshots showing broken** - MVP needs real storage, not mocked.

12. **Delete returns 204 No Content** - Check response status before parsing JSON.

### Sprint 3: Admin Dashboard

13. **Silent file deletion failures** - Always log exceptions before swallowing.

14. **Tests don't test actual functions** - Integration tests must call real functions.

15. **Click validation fails for nested elements** - Use contains() not equality.

16. **Lost data on upload failure** - Store locally for retry.

### Sprint 5: Team & Settings

17. **Content scripts broken with ES module error** - Vite outputs ES modules with chunks, but Chrome content scripts can't use imports. Must rebuild with esbuild as IIFE. Always run full `npm run build` (not just `vite build`) and verify output format.

18. **Session lost on direct URL navigation** - Zustand auth store initialized with `isLoading: false`, causing ProtectedRoute to redirect to login before `checkAuth()` completes. Fix: Initialize `isLoading: true` so ProtectedRoute shows loading spinner until auth check finishes.

19. **Notification dropdown positioned off-screen** - Bell icon at bottom of sidebar, dropdown CSS used `mt-2` (position below), causing dropdown to appear below viewport. Fix: Use `bottom-full mb-2` to position above the bell instead.

20. **Vitest fake timers must be enabled BEFORE the action** - When testing code that schedules setTimeout, enable `vi.useFakeTimers()` BEFORE dispatching the action. If enabled after, the timeout is scheduled with real timers and `vi.runAllTimersAsync()` won't advance it. Pattern: `vi.useFakeTimers() → action → vi.advanceTimersByTimeAsync(ms) → vi.useRealTimers()`.

21. **sendMessage mock must return Promise** - Chrome's `chrome.runtime.sendMessage` returns a Promise, but Vitest's `vi.fn()` returns undefined. Code calling `.catch()` on the result will crash. Fix: Add `vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)` in beforeEach.

---

## Key Patterns Summary

| Pattern | Description |
|---------|-------------|
| Test the function | Integration tests call actual functions, not underlying logic |
| Log before swallowing | Every catch block logs or re-raises |
| Use contains() for clicks | Never use strict equality for event target validation |
| Clean up files on delete | Database deletes need corresponding file cleanup |
| Persist on failure | Valuable user data stored locally for retry |
| Tool calling for AI | Use tools for structured output, not text parsing |
| Check before parse | Verify response status before calling .json() |
| IIFE for content scripts | Chrome content scripts must be IIFE bundles, not ES modules |
| isLoading starts true | Auth stores should start with isLoading: true to prevent race conditions |
| Position-aware dropdowns | Dropdowns near viewport edges must position away from the edge |
| Fake timers before action | Enable vi.useFakeTimers() BEFORE dispatching actions that schedule timeouts |
| sendMessage returns Promise | Mock chrome.runtime.sendMessage to return Promise, not undefined |

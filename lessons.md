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

## Error Recovery Patterns

### 5. Retain Data on Upload Failure

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

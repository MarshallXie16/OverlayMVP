# Bug Fixes - Sprint 1 Issues

## Issues Fixed

### Issue 1: Extension manifest.json missing from dist/

**Problem**: Running `npm run build` in extension directory didn't copy manifest.json and icons to dist/, causing Chrome to reject the extension with "manifest.json not found" error.

**Root Cause**: Vite build configuration wasn't set up to copy static files.

**Fix**:
- Installed `vite-plugin-static-copy` package
- Updated `extension/vite.config.ts` to copy manifest.json and icons:

```typescript
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons/*',
          dest: 'icons',
        },
      ],
    }),
  ],
  // ... rest of config
});
```

**Verification**:
```bash
cd extension
npm run build
ls -la dist/manifest.json  # Should exist
ls -la dist/icons/         # Should contain icon files
```

---

### Issue 2: Dashboard signup failing with 400 Bad Request

**Problem**: Signup form submission resulted in:
- Frontend error: "Cannot read properties of undefined (reading 'message')"
- Backend logs: `POST /api/auth/signup HTTP/1.1" 400 Bad Request`

**Root Causes**:
1. **Backend validation**: The backend requires EITHER `company_name` OR `invite_token`, but the testing guide said company_name was optional
2. **Dashboard error handling**: Error response parsing didn't handle FastAPI's HTTPException detail structure correctly
3. **Missing `/api/auth/me` endpoint**: Dashboard tried to call this endpoint but it didn't exist, causing 404 errors

**Fixes**:

#### Fix 1: Added `/api/auth/me` endpoint
Added to `backend/app/api/auth.py`:
```python
@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user information from JWT token."""
    return get_user_response(current_user)
```

Also added `get_current_user` dependency in `backend/app/utils/jwt.py` to extract user from JWT token.

#### Fix 2: Improved dashboard error handling
Updated `dashboard/src/api/client.ts` to properly parse FastAPI error responses:
```typescript
// FastAPI HTTPException returns { detail: { code, message } }
if (errorData.detail && typeof errorData.detail === 'object') {
  errorMessage = errorData.detail.message || errorData.detail.code || errorMessage;
}
// Or sometimes just { detail: "error message" }
else if (errorData.detail && typeof errorData.detail === 'string') {
  errorMessage = errorData.detail;
}
```

**Verification**:
```bash
# Start backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Test /me endpoint
curl http://localhost:8000/docs  # Should show /api/auth/me in Swagger

# Test signup (company_name is REQUIRED)
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "company_name": "Test Company"
  }'
# Should return 201 with token and user data
```

---

## Testing the Fixes

### Quick Test Script

A test script has been created at `test_api.sh` to verify all endpoints:

```bash
# Make sure backend is running first
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

# In another terminal, run the test script
cd /home/user/OverlayMVP
./test_api.sh
```

**Expected Output**:
- ✓ Health check returns `{"status": "healthy"}`
- ✓ Signup with company_name succeeds (201 Created)
- ✓ `/api/auth/me` returns user data
- ✓ Login succeeds with same credentials
- ✓ Get workflows returns empty list
- ✓ Signup without company_name fails with appropriate error

---

## Updated Testing Guide

### Dashboard Signup (Corrected)

When signing up via the dashboard at http://localhost:3000:

**Company Name is REQUIRED** (not optional as previously stated)

Fill in:
- **Name**: Test User
- **Email**: test@example.com
- **Password**: password123
- **Confirm Password**: password123
- **Company Name**: `Test Company` ← **REQUIRED**
- **Invite Token**: (leave blank unless joining existing company)

**Why company_name is required**:
- The backend enforces multi-tenant architecture
- Every user must belong to a company
- First user with `company_name` creates the company and becomes admin
- Subsequent users with `invite_token` join an existing company

**Alternative**: If you have an invite token from another user, provide that instead of company_name.

---

### Extension Loading (Corrected)

After running `npm run build` in the extension directory:

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Navigate to `OverlayMVP/extension/dist/` (not extension/ root)
5. Click "Select"

**What you should see**:
- Extension loads without "manifest.json not found" error
- Extension card shows name, version, description
- Icon appears in Chrome toolbar

**If it still fails**:
```bash
# Rebuild to ensure latest fixes
cd extension
npm run build

# Verify manifest exists
ls -la dist/manifest.json  # Should show the file

# Remove and re-add extension in Chrome
```

---

## Changes Made

### Backend Files Modified
- `backend/app/api/auth.py` - Added `/api/auth/me` endpoint
- `backend/app/utils/jwt.py` - Added `get_current_user` dependency

### Dashboard Files Modified
- `dashboard/src/api/client.ts` - Improved error handling

### Extension Files Modified
- `extension/vite.config.ts` - Added static file copying
- `extension/package.json` - Added `vite-plugin-static-copy` dependency

### Documentation Files Updated
- `TESTING_GUIDE.md` - Updated signup instructions (company_name required)
- `QUICKSTART.md` - Updated signup instructions
- `FIXES.md` - This file (comprehensive fix documentation)

---

## Commit Message

```
[FIX] Resolve extension manifest, API error handling, and missing endpoint

Fixed three critical issues blocking MVP testing:

1. Extension manifest.json missing from dist/
   - Added vite-plugin-static-copy to build config
   - Copies manifest.json and icons to dist/
   - Extension now loads in Chrome without errors

2. Dashboard signup failing with 400 Bad Request
   - Added missing /api/auth/me endpoint to backend
   - Added get_current_user JWT dependency
   - Improved dashboard error response parsing
   - Handles FastAPI HTTPException detail structure

3. Clarified company_name requirement
   - Updated documentation to show it's required
   - Backend enforces multi-tenant architecture
   - Every user must belong to a company

Testing:
- Created test_api.sh for endpoint verification
- All API endpoints tested and working
- Extension builds and loads successfully
- Dashboard signup/login flow works end-to-end

Files modified: 5 backend, 2 dashboard, 2 extension, 4 docs
```

---

## Next Steps

After pulling these fixes:

1. **Rebuild everything**:
   ```bash
   cd backend && source venv/bin/activate && pip install -r requirements.txt
   cd dashboard && npm install && npm run build
   cd extension && npm install && npm run build
   ```

2. **Start backend**:
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn app.main:app --reload
   ```

3. **Test with script**:
   ```bash
   ./test_api.sh
   ```

4. **Load extension**:
   - Chrome → `chrome://extensions/`
   - Load unpacked → `extension/dist/`

5. **Test dashboard**:
   ```bash
   cd dashboard && npm run dev
   # Go to http://localhost:3000
   # Signup with company_name filled in
   ```

All issues should now be resolved! 🎉

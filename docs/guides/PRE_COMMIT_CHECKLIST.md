# Pre-Commit Testing Checklist

Use this checklist before committing code to catch issues early and maintain code quality.

## 🔧 Extension Changes

If you modified extension code (`extension/src/**`):

### Build Verification
- [ ] Run `npm run build` in `extension/` directory
- [ ] Verify `dist/manifest.json` exists
- [ ] Verify `dist/content/styles/` contains CSS files (if modified)
- [ ] Verify `dist/icons/` contains icon files
- [ ] Check build output for errors or warnings

### Dependency Updates
- [ ] If you added new imports, check if new dependencies were added
- [ ] If new dependencies exist:
  - [ ] Add to `extension/package.json` dependencies or devDependencies
  - [ ] Update `extension/vite.config.ts` if new static files need copying
  - [ ] Run `npm install` to update `package-lock.json`

### Automated Tests
```bash
cd extension
npm test
```
- [ ] All extension tests pass
- [ ] No new warnings or errors in test output

### Manual Verification (Critical Changes Only)
If you changed core functionality (recording, authentication, overlay):
- [ ] Load extension in Chrome (`chrome://extensions/`)
- [ ] Click "Reload" on the extension
- [ ] Test the modified functionality works

---

## 🐍 Backend Changes

If you modified backend code (`backend/app/**`):

### Automated Tests
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python -m pytest tests/ -v
```
- [ ] All backend tests pass
- [ ] No new failures or warnings

### API Endpoint Changes
If you added/modified API endpoints:
- [ ] Added corresponding test in `backend/tests/test_api_*.py`
- [ ] Test covers success case
- [ ] Test covers error cases (400, 401, 404, etc.)
- [ ] Verified endpoint returns correct status codes

### Database Model Changes
If you modified models (`backend/app/models/**`):
- [ ] Created Alembic migration: `alembic revision --autogenerate -m "description"`
- [ ] Reviewed migration for correctness
- [ ] Tested migration: `alembic upgrade head`
- [ ] Tested rollback: `alembic downgrade -1` then `alembic upgrade head`

### Dependency Updates
- [ ] If you added new imports, verify dependencies in `requirements.txt`
- [ ] If new dependencies:
  - [ ] Add to `requirements.txt` with version pin
  - [ ] Run `pip install -r requirements.txt` to verify

---

## 🎨 Dashboard Changes

If you modified dashboard code (`dashboard/src/**`):

### Build Verification
```bash
cd dashboard
npm run build
```
- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] No ESLint errors or warnings

### Dependency Updates
- [ ] If new imports added, check `dashboard/package.json`
- [ ] If new dependencies, run `npm install`

### Manual Verification (Critical Changes Only)
If you changed authentication or core workflows:
- [ ] Start dev server: `npm run dev`
- [ ] Test signup flow works
- [ ] Test login flow works
- [ ] Verify no console errors in browser DevTools

---

## 📝 Documentation Changes

If your changes affect user-facing behavior or setup:
- [ ] Update `README.md` if setup changed
- [ ] Update `docs/guides/QUICKSTART.md` if quick start flow changed
- [ ] Update `docs/guides/TESTING_GUIDE.md` if testing scenarios changed
- [ ] Update `docs/architecture.md` if system structure changed
- [ ] Update `docs/recording-process.md` if recording logic changed
- [ ] Add entry to `memory.md` for key lessons learned
- [ ] Add non-trivial bug learnings to `lessons.md`

---

## 🔍 Integration Testing

For changes that span multiple components (e.g., new feature end-to-end):

### Full System Test
1. **Start Backend**:
   ```bash
   cd backend
   source venv/bin/activate
   uvicorn app.main:app --reload
   ```
   - [ ] Backend starts without errors
   - [ ] Visit http://localhost:8000/docs - API docs load

2. **Start Dashboard**:
   ```bash
   cd dashboard
   npm run dev
   ```
   - [ ] Dashboard starts without errors
   - [ ] Visit http://localhost:3000 - login page loads

3. **Load Extension**:
   - [ ] Chrome accepts extension at `chrome://extensions/`
   - [ ] Extension icon appears in toolbar
   - [ ] Click extension - popup opens without errors

4. **Test Critical Path** (if feature affects these):
   - [ ] Signup: Create account with company name
   - [ ] Login: Login with created account (both dashboard and extension)
   - [ ] Recording: Start/stop recording captures events
   - [ ] Dashboard: View workflows in dashboard

---

## 🚨 Common Issues Checklist

Based on past bugs, verify you didn't introduce these common issues:

### Build Configuration
- [ ] **Static files copied**: All necessary files (manifest, CSS, icons) copied to dist/
- [ ] **Dependencies installed**: New packages added to package.json/requirements.txt
- [ ] **Build scripts updated**: vite.config.ts or webpack configs updated for new assets

### API Integration
- [ ] **Endpoints exist**: All API routes called by frontend exist in backend
- [ ] **Error handling**: Frontend handles API errors gracefully
- [ ] **Status codes**: Backend returns correct HTTP status codes (200, 201, 400, 401, 404)
- [ ] **Response format**: API responses match TypeScript interfaces

### Authentication
- [ ] **Token validation**: JWT tokens properly validated with `get_current_user`
- [ ] **Database sessions**: Dependency injection used correctly (no manual `next(get_db())`)
- [ ] **Required fields**: Required fields (like `company_name`) clearly documented

### Testing
- [ ] **Tests added**: New functionality has corresponding tests
- [ ] **Tests pass**: All test suites pass before commit
- [ ] **Test coverage**: Critical paths covered by automated tests

---

## ✅ Final Check

Before pushing your commit:
- [ ] All applicable tests pass
- [ ] Build succeeds without errors
- [ ] No sensitive data (API keys, passwords) in committed code
- [ ] Commit message clearly describes what changed and why

## 🔄 Quick Test Commands

**Run all tests:**
```bash
# Extension tests
cd extension && npm test

# Backend tests
cd backend && source venv/bin/activate && python -m pytest tests/ -v
```

**Build everything:**
```bash
# Extension
cd extension && npm run build

# Dashboard
cd dashboard && npm run build

# Backend (verify no import errors)
cd backend && source venv/bin/activate && python -c "from app.main import app; print('Backend imports OK')"
```

---

## 📋 Issue Reporting

If you find that tests don't catch an issue:
1. Document the issue in `lessons.md` (if non-trivial)
2. Add a test that would have caught it
3. Update this checklist if needed
4. Consider what process would prevent it (e.g., better pre-commit hooks)

# Shared Utilities

This directory contains shared utilities used throughout the Chrome extension, including TypeScript types, API client, and storage utilities.

## Files Overview

- **`types.ts`** - TypeScript type definitions matching backend Pydantic schemas
- **`api.ts`** - API client for making authenticated requests to the backend
- **`storage.ts`** - Chrome storage utilities for persisting auth tokens and recording state
- **`*.test.ts`** - Comprehensive test suites (39 tests, 100% passing)

---

## TypeScript Types (`types.ts`)

Complete type definitions matching the backend API schemas. All types are exported and can be imported throughout the extension.

### Auth Types
```typescript
import type {
  SignupRequest,
  LoginRequest,
  TokenResponse,
  UserResponse
} from '@/shared/types';
```

- `SignupRequest` - User signup payload
- `LoginRequest` - User login payload
- `TokenResponse` - Authentication response with JWT token
- `UserResponse` - User data structure

### Workflow Types
```typescript
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowResponse,
  WorkflowListItem,
  WorkflowListResponse
} from '@/shared/types';
```

- `CreateWorkflowRequest` - Create workflow with steps
- `UpdateWorkflowRequest` - Update workflow metadata
- `WorkflowResponse` - Full workflow with steps
- `WorkflowListItem` - Workflow summary for lists
- `WorkflowListResponse` - Paginated workflow list

### Step Types
```typescript
import type { StepCreate, StepResponse, StepUpdate } from '@/shared/types';
```

- `StepCreate` - Create new step in workflow
- `StepResponse` - Full step data with AI labels
- `StepUpdate` - Update step labels (admin editing)

### Screenshot Types
```typescript
import type { ScreenshotUploadRequest, ScreenshotResponse } from '@/shared/types';
```

### Extension-Specific Types
```typescript
import type {
  ExtensionMessage,
  RecordingState,
  AuthState,
  MessageType
} from '@/shared/types';
```

- `RecordingState` - Current recording session state
- `AuthState` - Authentication state in storage
- `ExtensionMessage` - Message passing structure
- `MessageType` - Message type union

---

## API Client (`api.ts`)

Type-safe API client with automatic JWT token injection, error handling, and retries.

### Usage

```typescript
import { apiClient } from '@/shared/api';

// Authentication
const response = await apiClient.login({
  email: 'user@example.com',
  password: 'Password123'
});

// Create workflow
const workflow = await apiClient.createWorkflow({
  name: 'My Workflow',
  starting_url: 'https://example.com',
  steps: [/* ... */]
});

// List workflows with pagination
const workflows = await apiClient.listWorkflows({
  limit: 10,
  offset: 0,
  status: 'active'
});

// Get single workflow
const workflow = await apiClient.getWorkflow(123);

// Update workflow
await apiClient.updateWorkflow(123, {
  name: 'Updated Name',
  status: 'active'
});

// Delete workflow
await apiClient.deleteWorkflow(123);

// Upload screenshot
const blob = new Blob([imageData], { type: 'image/jpeg' });
const screenshot = await apiClient.uploadScreenshot(blob, workflowId);
```

### Features

- **Automatic Auth**: Automatically injects JWT token from storage
- **Error Handling**: Throws `ApiClientError` with status codes and details
- **Retries**: Automatic retry for network errors and 5xx responses (max 3 attempts)
- **Token Management**: Saves tokens on login/signup, clears on logout/401
- **Type Safety**: Full TypeScript support with request/response types

### Configuration

```typescript
const API_CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
};
```

### Error Handling

```typescript
try {
  await apiClient.login({ email, password });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.status);
    console.error('Details:', error.details);
  }
}
```

---

## Storage Utilities (`storage.ts`)

Type-safe wrappers around `chrome.storage.local` for persisting authentication and recording state.

### Auth Storage

```typescript
import {
  saveToken,
  getToken,
  getCurrentUser,
  isAuthenticated,
  clearAuthState,
} from '@/shared/storage';

// Save token after login
await saveToken('jwt-token', user, 7); // 7 days expiration

// Get current token (returns null if expired)
const token = await getToken();

// Get current user
const user = await getCurrentUser();

// Check if authenticated
const isAuth = await isAuthenticated();

// Clear auth (logout)
await clearAuthState();
```

### Recording Storage

```typescript
import {
  saveRecordingState,
  getRecordingState,
  clearRecordingState,
  createEmptyRecordingState,
} from '@/shared/storage';

// Start recording
const state = createEmptyRecordingState();
state.isRecording = true;
state.workflowName = 'My Workflow';
state.startingUrl = 'https://example.com';
await saveRecordingState(state);

// Get current recording state
const state = await getRecordingState();

// Clear recording
await clearRecordingState();
```

### Storage Listeners

Listen for changes to auth or recording state across extension components:

```typescript
import { onAuthStateChanged, onRecordingStateChanged } from '@/shared/storage';

// Listen for auth changes
onAuthStateChanged((authState) => {
  if (authState) {
    console.log('User logged in:', authState.user);
  } else {
    console.log('User logged out');
  }
});

// Listen for recording changes
onRecordingStateChanged((recordingState) => {
  if (recordingState?.isRecording) {
    console.log('Recording started');
  }
});
```

### Features

- **Type Safety**: Full TypeScript support with proper types
- **Expiration Handling**: Automatically handles token expiration
- **Promise-based**: All functions return Promises
- **Error Handling**: Rejects with Error if chrome.storage fails

---

## Testing

All shared utilities have comprehensive test coverage (39 tests, 100% passing).

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Files

- `storage.test.ts` - Tests for chrome.storage utilities (21 tests)
- `api.test.ts` - Tests for API client (18 tests)

### Test Coverage

- Auth storage: Save, get, clear, token expiration
- Recording storage: Save, get, clear, empty state
- API client: Auth endpoints, workflow CRUD, screenshots, error handling
- Error scenarios: Network errors, 401/403/404, retries

---

## Usage in Extension Components

### In Popup UI

```typescript
import { apiClient } from '@/shared/api';
import { getCurrentUser } from '@/shared/storage';

export function useAuth() {
  const login = async (email: string, password: string) => {
    const response = await apiClient.login({ email, password });
    return response.user;
  };

  const getCurrentUser = async () => {
    return await getCurrentUser();
  };

  return { login, getCurrentUser };
}
```

### In Background Worker

```typescript
import { apiClient } from '@/shared/api';
import { getRecordingState } from '@/shared/storage';

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'STOP_RECORDING') {
    const state = await getRecordingState();
    if (state && state.isRecording) {
      // Upload workflow to backend
      const response = await apiClient.createWorkflow({
        name: state.workflowName!,
        starting_url: state.startingUrl!,
        steps: state.steps,
      });
      sendResponse({ success: true, workflowId: response.workflow_id });
    }
  }
});
```

### In Content Scripts

```typescript
import { getToken } from '@/shared/storage';
import type { StepCreate } from '@/shared/types';

async function captureStep(): Promise<StepCreate> {
  // Content scripts can check auth status
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  return {
    step_number: 1,
    action_type: 'click',
    selectors: { /* ... */ },
    element_meta: { /* ... */ },
    page_context: { /* ... */ },
  };
}
```

---

## Environment Variables

The API client uses the following environment variable:

- `API_BASE_URL` - Backend API base URL (default: `http://localhost:8000`)

Set in `vite.config.ts`:

```typescript
define: {
  'process.env.API_BASE_URL': JSON.stringify(
    process.env.API_BASE_URL || 'http://localhost:8000'
  ),
}
```

---

## Architecture Notes

### Token Storage
- Tokens stored in `chrome.storage.local` (persists across sessions)
- Expiration checked on every `getToken()` call
- Expired tokens automatically cleared

### API Client Singleton
- Single `apiClient` instance exported
- Shared across all extension components
- Stateless (state managed in chrome.storage)

### Error Handling Strategy
- Client errors (4xx): No retry, throw immediately
- Auth errors (401/403): Clear auth state, throw
- Server errors (5xx): Retry with exponential backoff
- Network errors: Retry with exponential backoff

### Type Safety
- All API requests/responses typed
- Storage utilities return typed data
- Compile-time type checking prevents errors

---

## Future Improvements (Post-MVP)

- [ ] Implement request caching for GET endpoints
- [ ] Add request queue for offline support
- [ ] Implement request deduplication
- [ ] Add request cancellation support
- [ ] Implement token refresh (when backend supports it)
- [ ] Add analytics/telemetry hooks
- [ ] Implement rate limiting
- [ ] Add request/response interceptors

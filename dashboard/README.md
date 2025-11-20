# Workflow Automation Platform - Dashboard

Web dashboard for managing and monitoring recorded workflows.

## Features

- **Authentication**: Login and signup with email/password
- **Workflow Management**: View, browse, and delete workflows
- **Workflow Details**: Inspect individual workflow steps
- **Protected Routes**: Authentication-required pages
- **Responsive Design**: Tailwind CSS for modern UI

## Tech Stack

- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **React Router v6**: Client-side routing
- **Zustand**: Lightweight state management
- **Tailwind CSS**: Utility-first styling
- **Vitest**: Unit testing framework

## Project Structure

```
dashboard/
├── src/
│   ├── api/                  # API client and types
│   │   ├── client.ts         # HTTP client with retry logic
│   │   └── types.ts          # TypeScript types (matches backend schemas)
│   ├── store/                # Zustand state management
│   │   └── auth.ts           # Authentication store
│   ├── pages/                # Page components
│   │   ├── Login.tsx         # Login page
│   │   ├── Signup.tsx        # Signup page
│   │   ├── Dashboard.tsx     # Workflow list
│   │   └── WorkflowDetail.tsx # Workflow detail view
│   ├── components/           # Reusable components
│   │   ├── Layout.tsx        # Main layout with navbar
│   │   └── ProtectedRoute.tsx # Auth guard
│   ├── utils/                # Utilities
│   │   └── validation.ts     # Form validation helpers
│   ├── App.tsx               # Root app with routing
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles
├── vite.config.ts            # Vite configuration
├── vitest.config.ts          # Test configuration
├── tsconfig.json             # TypeScript configuration
├── tailwind.config.js        # Tailwind CSS configuration
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on `http://localhost:8000`

### Installation

```bash
cd dashboard
npm install
```

### Development

Start the dev server:

```bash
npm run dev
```

Dashboard will be available at `http://localhost:3000`

### Building for Production

```bash
npm run build
```

Output will be in `dist/` directory.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Configuration

### Environment Variables

Create a `.env` file in the dashboard directory:

```env
VITE_API_URL=http://localhost:8000
```

If not specified, defaults to `http://localhost:8000`.

### API Proxy

In development, the Vite dev server proxies `/api` requests to the backend:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```

## Routes

| Path | Component | Protected | Description |
|------|-----------|-----------|-------------|
| `/` | Redirect | No | Redirects to `/dashboard` |
| `/login` | Login | No | Login page |
| `/signup` | Signup | No | Signup page |
| `/dashboard` | Dashboard | Yes | Workflow list |
| `/workflows/:id` | WorkflowDetail | Yes | Workflow detail view |

## Authentication

### Login Flow

1. User enters email and password
2. Client validates input (format, length)
3. API client sends POST request to `/api/auth/login`
4. On success, JWT token stored in `localStorage`
5. User data cached in `localStorage`
6. Redirect to `/dashboard`

### Token Management

- JWT tokens stored in `localStorage` as `auth_token`
- Token expiry tracked in `auth_token_expiry`
- Tokens checked on every API request
- Expired tokens automatically cleared

### Protected Routes

The `ProtectedRoute` component:
- Checks for authenticated user on mount
- Shows loading spinner while checking auth
- Redirects to `/login` if not authenticated
- Renders children if authenticated

## State Management

### Auth Store (Zustand)

```typescript
interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  error: string | null;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}
```

Usage:

```typescript
import { useAuthStore } from '@/store/auth';

const { user, login, logout } = useAuthStore();
```

## API Client

### Features

- Automatic JWT token injection
- Token expiration checking
- Retry logic with exponential backoff (1s, 2s, 4s)
- Error handling and type safety
- Request/response TypeScript types

### Usage

```typescript
import { apiClient } from '@/api/client';

// Get workflows
const response = await apiClient.getWorkflows(50, 0);

// Get single workflow
const workflow = await apiClient.getWorkflow(123);

// Delete workflow
await apiClient.deleteWorkflow(123);
```

## Form Validation

Client-side validation for all forms:

- **Email**: Format validation (`validateEmail`)
- **Password**: Min 8 chars, letter + number (`validatePassword`)
- **Name**: Min 2 chars (`validateName`)
- **Password Confirmation**: Matching validation

All validators return:

```typescript
interface ValidationResult {
  isValid: boolean;
  error: string | null;
}
```

## Styling

### Tailwind CSS

Configured with custom primary color palette:

```javascript
// tailwind.config.js
theme: {
  extend: {
    colors: {
      primary: {
        50: '#eff6ff',
        // ... through ...
        900: '#1e3a8a',
      },
    },
  },
}
```

### Component Patterns

- Forms: Consistent input styling with focus states
- Buttons: Primary/secondary variants with loading states
- Lists: Card-based layouts with hover states
- Status badges: Color-coded workflow statuses
- Loading states: Animated spinners

## Testing

### Test Coverage

- Validation utilities (15 tests)
- Email validation (4 tests)
- Password validation (5 tests)
- Password confirmation (1 test)
- Name validation (4 tests)

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction()).toBe(expectedValue);
  });
});
```

## Deployment

### Build Output

```bash
npm run build
```

Creates optimized production build in `dist/`:

- `dist/index.html` - Entry HTML
- `dist/assets/*.js` - JavaScript bundles
- `dist/assets/*.css` - CSS bundles

### Hosting

Static hosting options:
- Netlify
- Vercel
- AWS S3 + CloudFront
- GitHub Pages

### Environment Variables

Set `VITE_API_URL` to production backend URL.

## Development Guidelines

### Code Style

- Use functional components
- Prefer `const` over `let`
- Use TypeScript strict mode
- Avoid `any` types
- Add JSDoc comments for complex functions

### Component Structure

```typescript
/**
 * Component description
 */
interface ComponentProps {
  // Props definition
}

export const Component: React.FC<ComponentProps> = ({ prop1, prop2 }) => {
  // State and hooks
  const [state, setState] = useState();

  // Event handlers
  const handleEvent = () => {};

  // Render
  return <div>...</div>;
};
```

### File Naming

- Components: PascalCase (`LoginForm.tsx`)
- Utilities: camelCase (`validation.ts`)
- Tests: `.test.ts` suffix (`validation.test.ts`)

## Troubleshooting

### Build Errors

**Issue**: `Property 'env' does not exist on type 'ImportMeta'`

**Solution**: Ensure `src/vite-env.d.ts` exists with type definitions.

### Auth Issues

**Issue**: "Unauthorized" errors on protected routes

**Solution**: Check that:
1. Backend is running
2. Token is valid (check `localStorage`)
3. Token not expired

### CORS Errors

**Issue**: CORS errors in browser console

**Solution**: Backend must allow `http://localhost:3000` origin.

## Performance

### Bundle Size

Production build:
- JS: ~191 KB (gzipped: ~60 KB)
- CSS: ~14 KB (gzipped: ~3.5 KB)

### Optimizations

- Code splitting by route (React Router)
- Lazy loading components
- Minified production build
- Tree shaking for unused code

## Future Enhancements

- [ ] React Testing Library for component tests
- [ ] ESLint + Prettier for code quality
- [ ] Workflow editing capabilities
- [ ] Real-time workflow status updates (WebSocket)
- [ ] Advanced filtering and search
- [ ] Workflow execution from dashboard
- [ ] Analytics and usage charts

## License

MIT

# Authentication API Examples

## POST /api/auth/signup

### Create New Company (Admin Role)

```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah@acme.com",
    "password": "SecurePass123",
    "name": "Sarah Johnson",
    "company_name": "Acme Corp"
  }'
```

**Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "sarah@acme.com",
    "name": "Sarah Johnson",
    "role": "admin",
    "company_id": 1,
    "company_name": "Acme Corp",
    "created_at": "2025-11-19T10:30:00Z",
    "last_login_at": null
  }
}
```

### Join Existing Company (Regular Role)

```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@acme.com",
    "password": "SecurePass123",
    "name": "Alex Smith",
    "invite_token": "COMPANY_INVITE_TOKEN_HERE"
  }'
```

**Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 2,
    "email": "alex@acme.com",
    "name": "Alex Smith",
    "role": "regular",
    "company_id": 1,
    "company_name": "Acme Corp",
    "created_at": "2025-11-19T10:35:00Z",
    "last_login_at": null
  }
}
```

## POST /api/auth/login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sarah@acme.com",
    "password": "SecurePass123"
  }'
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "sarah@acme.com",
    "name": "Sarah Johnson",
    "role": "admin",
    "company_id": 1,
    "company_name": "Acme Corp",
    "created_at": "2025-11-19T10:30:00Z",
    "last_login_at": "2025-11-19T11:00:00Z"
  }
}
```

## Using the Access Token

Include the token in the Authorization header for protected endpoints:

```bash
curl -X GET http://localhost:8000/api/workflows \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## Error Responses

### 400 Bad Request - Email Already Exists
```json
{
  "detail": {
    "code": "EMAIL_EXISTS",
    "message": "User with email 'sarah@acme.com' already exists"
  }
}
```

### 400 Bad Request - Invalid Invite Token
```json
{
  "detail": {
    "code": "INVALID_INVITE_TOKEN",
    "message": "Invalid company invite token"
  }
}
```

### 401 Unauthorized - Invalid Credentials
```json
{
  "detail": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

### 422 Unprocessable Entity - Validation Error
```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "password"],
      "msg": "String should have at least 8 characters",
      "input": "short",
      "ctx": {"min_length": 8}
    }
  ]
}
```

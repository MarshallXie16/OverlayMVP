# API Reference

Complete REST API documentation for the Workflow Automation Platform.

**Base URL:** `http://localhost:8000/api`

**Authentication:** All endpoints except auth require Bearer token:
```
Authorization: Bearer <access_token>
```

---

## Table of Contents

1. [Authentication](#authentication)
2. [Company](#company)
3. [Invites](#invites)
4. [Workflows](#workflows)
5. [Steps](#steps)
6. [Screenshots](#screenshots)
7. [Healing](#healing)
8. [Error Responses](#error-responses)
9. [Environment Variables](#environment-variables)

---

## Authentication

### POST /api/auth/signup

Create a new user account. First user creates a company (admin role), subsequent users join via invite token.

**Request - Create Company (Admin):**
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

**Request - Join Company (Regular):**
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

**Errors:**
- `400`: Email already exists or invalid invite token
- `422`: Validation error (password too short, etc.)

---

### POST /api/auth/login

Authenticate user and get access token.

**Request:**
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

**Errors:**
- `401`: Invalid credentials

---

### GET /api/auth/me

Get current user information from JWT token.

**Request:**
```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "id": 1,
  "email": "sarah@acme.com",
  "name": "Sarah Johnson",
  "role": "admin",
  "company_id": 1,
  "company_name": "Acme Corp",
  "created_at": "2025-11-19T10:30:00Z",
  "last_login_at": "2025-11-19T11:00:00Z"
}
```

---

## Company

### GET /api/companies/me

Get current user's company information including invite token.

**Request:**
```bash
curl http://localhost:8000/api/companies/me \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "id": 1,
  "name": "Acme Corp",
  "invite_token": "abc123secure...",
  "created_at": "2025-11-19T10:30:00Z",
  "member_count": 5
}
```

---

### GET /api/companies/me/members

List all team members in the current user's company.

**Request:**
```bash
curl http://localhost:8000/api/companies/me/members \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Sarah Johnson",
    "email": "sarah@acme.com",
    "role": "admin",
    "created_at": "2025-11-19T10:30:00Z",
    "last_login_at": "2025-11-20T15:00:00Z"
  },
  {
    "id": 2,
    "name": "Alex Smith",
    "email": "alex@acme.com",
    "role": "regular",
    "created_at": "2025-11-20T09:00:00Z",
    "last_login_at": null
  }
]
```

---

### DELETE /api/companies/me/members/{user_id}

Remove a team member from the company (admin only).

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/companies/me/members/2 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `204 No Content`

**Errors:**
- `403`: User is not admin
- `400`: Cannot remove yourself
- `404`: User not found or not in company

---

### GET /api/companies/invite/{token}

Get company information from invite token (public, no auth required).

**Request:**
```bash
curl http://localhost:8000/api/companies/invite/abc123secure
```

**Response (200 OK):**
```json
{
  "company_name": "Acme Corp"
}
```

**Errors:**
- `404`: Invalid or expired invite token

---

### PATCH /api/companies/me/members/{user_id}/role

Update a team member's role (admin only).

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/companies/me/members/2/role \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "editor"}'
```

**Request Body:**
| Field | Type | Values | Description |
|-------|------|--------|-------------|
| role | string | admin, editor, viewer | New role for the user |

**Response (200 OK):**
```json
{
  "id": 2,
  "name": "Alex Smith",
  "email": "alex@acme.com",
  "role": "editor",
  "status": "active",
  "created_at": "2025-11-20T09:00:00Z",
  "last_login_at": "2025-11-21T10:00:00Z"
}
```

**Errors:**
- `400`: Cannot modify own role, or last admin protection
- `403`: User is not admin
- `404`: User not found or not in company

---

### PATCH /api/companies/me/members/{user_id}/status

Suspend or reactivate a team member (admin only).

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/companies/me/members/2/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "suspended"}'
```

**Request Body:**
| Field | Type | Values | Description |
|-------|------|--------|-------------|
| status | string | active, suspended | New status for the user |

**Response (200 OK):**
```json
{
  "id": 2,
  "name": "Alex Smith",
  "email": "alex@acme.com",
  "role": "editor",
  "status": "suspended",
  "created_at": "2025-11-20T09:00:00Z",
  "last_login_at": "2025-11-21T10:00:00Z"
}
```

**Errors:**
- `400`: Cannot modify own status, or last admin protection
- `403`: User is not admin
- `404`: User not found or not in company

---

## Invites

### GET /api/invites/me/invites

List all pending invites for the company (admin only).

**Request:**
```bash
curl http://localhost:8000/api/invites/me/invites \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "invites": [
    {
      "id": 1,
      "token": "abc123-uuid-token",
      "email": "newuser@example.com",
      "role": "editor",
      "company_id": 1,
      "invited_by_id": 1,
      "expires_at": "2025-11-27T10:30:00Z",
      "accepted_at": null,
      "created_at": "2025-11-20T10:30:00Z"
    }
  ],
  "total": 1
}
```

**Errors:**
- `403`: User is not admin

---

### POST /api/invites/me/invites

Create a new invite and send email (admin only).

**Request:**
```bash
curl -X POST http://localhost:8000/api/invites/me/invites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "role": "editor"
  }'
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| email | string | Yes | - | Email address to invite |
| role | string | No | viewer | Role to assign (admin, editor, viewer) |

**Response (201 Created):**
```json
{
  "id": 1,
  "token": "abc123-uuid-token",
  "email": "newuser@example.com",
  "role": "editor",
  "company_id": 1,
  "invited_by_id": 1,
  "expires_at": "2025-11-27T10:30:00Z",
  "accepted_at": null,
  "created_at": "2025-11-20T10:30:00Z"
}
```

**Side Effects:**
- Sends invitation email via Resend (async via Celery)

**Errors:**
- `400`: `USER_ALREADY_EXISTS` - Email already registered in company
- `400`: `INVITE_ALREADY_EXISTS` - Pending invite already exists for email
- `403`: User is not admin

---

### DELETE /api/invites/me/invites/{invite_id}

Revoke a pending invite (admin only).

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/invites/me/invites/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `204 No Content`

**Errors:**
- `403`: User is not admin
- `404`: Invite not found or already accepted

---

### GET /api/invites/verify/{token}

Verify an invite token (public endpoint, no auth required).

**Use Case:** Called by signup page to validate invite before registration.

**Request:**
```bash
curl http://localhost:8000/api/invites/verify/abc123-uuid-token
```

**Response (200 OK) - Valid Invite:**
```json
{
  "valid": true,
  "company_name": "Acme Corp",
  "role": "editor",
  "email": "newuser@example.com",
  "expired": false
}
```

**Response (200 OK) - Invalid/Expired/Used:**
```json
{
  "valid": false,
  "company_name": "Acme Corp",
  "role": null,
  "email": null,
  "expired": true
}
```

**Note:** Always returns 200, use `valid` field to check status.

---

## Workflows

### POST /api/workflows

Create a new workflow with steps.

**Request:**
```bash
curl -X POST http://localhost:8000/api/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Complete Checkout",
    "description": "Fill checkout form and submit order",
    "starting_url": "https://shop.example.com/checkout",
    "tags": ["checkout", "e-commerce"],
    "steps": [
      {
        "step_number": 1,
        "timestamp": 1000,
        "action_type": "click",
        "selectors": {
          "primary": "#email-input",
          "fallback": ["input[name=\"email\"]", "[data-testid=\"email-field\"]"]
        },
        "element_meta": {
          "tagName": "INPUT",
          "type": "email",
          "id": "email-input",
          "classes": ["form-input", "email-field"],
          "text": "",
          "placeholder": "Enter your email",
          "innerText": ""
        },
        "page_context": {
          "url": "https://shop.example.com/checkout",
          "title": "Checkout - Example Shop",
          "domain": "shop.example.com"
        },
        "action_data": {
          "inputValue": "user@example.com"
        }
      },
      {
        "step_number": 2,
        "timestamp": 3000,
        "action_type": "click",
        "selectors": {
          "primary": "#submit-order",
          "fallback": ["button[type=\"submit\"]"]
        },
        "element_meta": {
          "tagName": "BUTTON",
          "type": "submit",
          "id": "submit-order",
          "text": "Place Order",
          "classes": ["btn", "btn-primary"]
        },
        "page_context": {
          "url": "https://shop.example.com/checkout",
          "title": "Checkout - Example Shop",
          "domain": "shop.example.com"
        }
      }
    ]
  }'
```

**Response (201 Created):**
```json
{
  "workflow_id": 1,
  "status": "draft"
}
```

**Notes:**
- Returns immediately, AI labeling happens asynchronously
- Call `POST /api/workflows/{id}/start-processing` after uploading screenshots

---

### GET /api/workflows

List workflows for current user's company.

**Request:**
```bash
curl "http://localhost:8000/api/workflows?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | int | 10 | Items per page (max 100) |
| offset | int | 0 | Number of items to skip |

**Response (200 OK):**
```json
{
  "total": 25,
  "limit": 10,
  "offset": 0,
  "workflows": [
    {
      "id": 1,
      "company_id": 1,
      "created_by": 1,
      "name": "Complete Checkout",
      "description": "Fill checkout form and submit order",
      "starting_url": "https://shop.example.com/checkout",
      "tags": ["checkout", "e-commerce"],
      "status": "active",
      "success_rate": 0.95,
      "total_uses": 47,
      "consecutive_failures": 0,
      "created_at": "2025-11-19T10:30:00Z",
      "updated_at": "2025-11-20T15:45:00Z",
      "last_successful_run": "2025-11-20T15:45:00Z",
      "last_failed_run": null,
      "step_count": 5
    }
  ]
}
```

---

### GET /api/workflows/{workflow_id}

Get a single workflow with all steps.

**Request:**
```bash
curl http://localhost:8000/api/workflows/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "id": 1,
  "company_id": 1,
  "created_by": 1,
  "name": "Complete Checkout",
  "description": "Fill checkout form and submit order",
  "starting_url": "https://shop.example.com/checkout",
  "tags": ["checkout", "e-commerce"],
  "status": "active",
  "success_rate": 0.95,
  "total_uses": 47,
  "consecutive_failures": 0,
  "created_at": "2025-11-19T10:30:00Z",
  "updated_at": "2025-11-20T15:45:00Z",
  "last_successful_run": "2025-11-20T15:45:00Z",
  "last_failed_run": null,
  "step_count": 2,
  "steps": [
    {
      "id": 1,
      "workflow_id": 1,
      "step_number": 1,
      "timestamp": 1000,
      "action_type": "click",
      "selectors": {
        "primary": "#email-input",
        "fallback": ["input[name=\"email\"]"]
      },
      "element_meta": {
        "tagName": "INPUT",
        "type": "email",
        "id": "email-input"
      },
      "page_context": {
        "url": "https://shop.example.com/checkout",
        "title": "Checkout"
      },
      "action_data": {
        "inputValue": "user@example.com"
      },
      "dom_context": null,
      "screenshot_id": 1,
      "field_label": "Email Address",
      "instruction": "Enter your email address in the email field",
      "ai_confidence": 0.92,
      "ai_model": "claude-3.5-sonnet",
      "ai_generated_at": "2025-11-19T10:31:00Z",
      "label_edited": false,
      "instruction_edited": false,
      "edited_by": null,
      "edited_at": null,
      "healed_selectors": null,
      "healed_at": null,
      "healing_confidence": null,
      "healing_method": null,
      "created_at": "2025-11-19T10:30:00Z"
    }
  ]
}
```

**Errors:**
- `404`: Workflow not found (or belongs to different company)

---

### PUT /api/workflows/{workflow_id}

Update workflow metadata.

**Request:**
```bash
curl -X PUT http://localhost:8000/api/workflows/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Checkout Flow",
    "description": "Updated description",
    "tags": ["checkout", "updated"],
    "status": "active"
  }'
```

**Updatable Fields:**
- `name`: Workflow name
- `description`: Workflow description
- `tags`: Tags array
- `status`: draft | processing | active | needs_review | broken | archived

**Response (200 OK):** Full workflow object (same as GET)

---

### PATCH /api/workflows/{workflow_id}/steps/reorder

Reorder workflow steps via drag-and-drop.

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/workflows/1/steps/reorder \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "step_order": [3, 1, 2]
  }'
```

**Notes:**
- `step_order` must contain all step IDs for the workflow
- Each ID can only appear once
- Order in array determines new step_number values

**Response (200 OK):** Updated workflow with reordered steps

**Errors:**
- `400`: Invalid step_order (missing IDs, duplicates, wrong workflow)

---

### POST /api/workflows/{workflow_id}/start-processing

Trigger AI labeling after screenshots are uploaded.

**Request:**
```bash
curl -X POST http://localhost:8000/api/workflows/1/start-processing \
  -H "Authorization: Bearer $TOKEN"
```

**Response (202 Accepted):**
```json
{
  "task_id": "abc123-def456",
  "workflow_id": 1,
  "message": "AI processing started",
  "status": "processing"
}
```

**Use Case:**
1. Create workflow (POST /api/workflows)
2. Upload screenshots (POST /api/screenshots)
3. Link screenshots to steps (PATCH /api/steps/{id}/screenshot)
4. Trigger processing (POST /api/workflows/{id}/start-processing)

---

### POST /api/workflows/{workflow_id}/executions

Log workflow execution result and update health metrics.

**Request:**
```bash
curl -X POST http://localhost:8000/api/workflows/1/executions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "step_results": [
      {"step_id": 1, "status": "success", "element_found": true},
      {"step_id": 2, "status": "success", "element_found": true}
    ],
    "total_duration_ms": 5000,
    "error_message": null
  }'
```

**Status Values:**
- `success`: Workflow completed without issues
- `healed_deterministic`: Element found with fallback selector
- `healed_ai`: Element found with AI-assisted healing
- `failed`: Workflow failed

**Response (201 Created):**
```json
{
  "execution_id": 1,
  "workflow_status": "active",
  "consecutive_failures": 0,
  "success_rate": 0.96
}
```

**Health Metrics Updated:**
- `total_uses`: Incremented by 1
- `success_rate`: Updated with exponential moving average
- `consecutive_failures`: Reset to 0 on success, incremented on failure
- `status`: Changed to 'broken' if consecutive_failures >= 3

---

### DELETE /api/workflows/{workflow_id}

Delete a workflow and all associated data.

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/workflows/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `204 No Content`

**Cascade Deletion:**
- All steps
- All screenshots
- All health logs
- All notifications

---

## Steps

### GET /api/steps/{step_id}

Get step details.

**Request:**
```bash
curl http://localhost:8000/api/steps/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):** Step object (see workflow GET response for structure)

**Errors:**
- `403`: Step belongs to another company
- `404`: Step not found

---

### PATCH /api/steps/{step_id}/screenshot

Link a screenshot to a step.

**Request:**
```bash
curl -X PATCH "http://localhost:8000/api/steps/1/screenshot?screenshot_id=5" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):** Updated step object

---

### PUT /api/steps/{step_id}

Update step labels (admin editing).

**Request:**
```bash
curl -X PUT http://localhost:8000/api/steps/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "field_label": "Email Input Field",
    "instruction": "Enter your email address in the highlighted field"
  }'
```

**Validation:**
- `field_label`: 1-100 characters (if provided)
- `instruction`: 1-500 characters (if provided)
- At least one field must be provided

**Response (200 OK):** Updated step with edit tracking:
```json
{
  "id": 1,
  "field_label": "Email Input Field",
  "instruction": "Enter your email address in the highlighted field",
  "label_edited": true,
  "instruction_edited": true,
  "edited_by": 1,
  "edited_at": "2025-11-20T16:00:00Z"
}
```

---

### DELETE /api/steps/{step_id}

Delete a step and renumber remaining steps.

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/steps/2 \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `204 No Content`

**Auto-renumbering:**
- Remaining steps are renumbered to maintain sequence (1, 2, 3...)
- Example: Deleting step 2 from [1, 2, 3] results in [1, 2]

---

## Screenshots

### POST /api/screenshots

Upload a screenshot with automatic deduplication.

**Request:**
```bash
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer $TOKEN" \
  -F "workflow_id=1" \
  -F "step_id=temp-1" \
  -F "image=@screenshot.png"
```

**Form Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| workflow_id | int | Yes | Workflow this screenshot belongs to |
| step_id | string | No | Temporary client-side step ID |
| image | file | Yes | JPEG or PNG, max 5MB |

**Response (201 Created):**
```json
{
  "screenshot_id": 1,
  "storage_url": "https://presigned-url...",
  "storage_key": "companies/1/workflows/1/screenshots/1.jpg",
  "hash": "sha256-abcd1234...",
  "file_size": 125432,
  "width": 1920,
  "height": 1080,
  "format": "image/jpeg",
  "created_at": "2025-11-19T10:30:00Z",
  "deduplicated": false
}
```

**Deduplication:**
- Screenshots with identical content (same SHA-256 hash) are stored only once
- If `deduplicated: true`, existing screenshot was reused

---

### GET /api/screenshots/{screenshot_id}/url

Get a fresh pre-signed URL for a screenshot.

**Request:**
```bash
curl http://localhost:8000/api/screenshots/1/url \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "screenshot_id": 1,
  "url": "https://presigned-url-valid-15-minutes..."
}
```

**Use Case:** Pre-signed URLs expire after 15 minutes. Call this to get a fresh URL.

---

### GET /api/screenshots/{screenshot_id}/image

Get the actual screenshot image file.

**Request:**
```bash
curl http://localhost:8000/api/screenshots/1/image \
  -H "Authorization: Bearer $TOKEN" \
  -o screenshot.jpg
```

**Response:** Binary image data with `Content-Type: image/jpeg` or `image/png`

---

## Healing

### POST /api/healing/validate

Validate an auto-healing candidate match using AI.

**When to Call:**
- Deterministic score is 0.70-0.85 (uncertain range)
- Multiple candidates within 0.10 of each other
- Soft vetoes applied during deterministic matching

**Request:**
```bash
curl -X POST http://localhost:8000/api/healing/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": 10,
    "step_id": 45,
    "original_context": {
      "tag_name": "button",
      "text": "Submit",
      "role": "button",
      "id": null,
      "name": null,
      "classes": ["btn", "btn-primary"],
      "data_testid": null,
      "label_text": null,
      "placeholder": null,
      "aria_label": null,
      "x": 100,
      "y": 450,
      "width": 120,
      "height": 40,
      "visual_region": "main",
      "form_context": {
        "form_id": "checkout-form",
        "form_action": "/checkout",
        "form_name": "checkout",
        "form_classes": ["checkout-form"],
        "field_index": 5,
        "total_fields": 6
      },
      "nearby_landmarks": {
        "closest_heading": {
          "text": "Checkout",
          "level": 2,
          "distance": 150
        },
        "closest_label": null,
        "sibling_texts": ["Back", "Submit"],
        "container_text": "Complete your order"
      }
    },
    "candidate_context": {
      "tag_name": "button",
      "text": "Submit Order",
      "role": "button",
      "id": null,
      "name": null,
      "classes": ["btn", "btn-primary", "checkout-btn"],
      "data_testid": null,
      "x": 105,
      "y": 460,
      "width": 120,
      "height": 40,
      "visual_region": "main",
      "form_context": {
        "form_id": "checkout-form",
        "form_action": "/checkout",
        "field_index": 5,
        "total_fields": 6
      },
      "nearby_landmarks": {
        "closest_heading": {
          "text": "Checkout",
          "level": 2,
          "distance": 155
        },
        "sibling_texts": ["Back", "Submit Order"],
        "container_text": "Complete your order"
      }
    },
    "deterministic_score": 0.78,
    "factor_scores": {
      "contextualProximity": 1.0,
      "textSimilarity": 0.65,
      "roleMatch": 1.0,
      "positionSimilarity": 0.8,
      "attributeMatch": 0.6
    },
    "page_url": "https://shop.example.com/checkout",
    "original_url": "https://shop.example.com/checkout",
    "field_label": "Submit Button",
    "original_screenshot": "https://example.com/screenshots/original.png",
    "current_screenshot": "https://example.com/screenshots/current.png"
  }'
```

**Response (200 OK) - Match Confirmed:**
```json
{
  "is_match": true,
  "ai_confidence": 0.92,
  "reasoning": "Both elements are submit buttons in the same checkout form. Text changed from 'Submit' to 'Submit Order' which is a common UI update.",
  "combined_score": 0.84,
  "recommendation": "accept",
  "ai_model": "claude-haiku-4-5-20251001"
}
```

**Response (200 OK) - Match Rejected:**
```json
{
  "is_match": false,
  "ai_confidence": 0.88,
  "reasoning": "While both are buttons in the checkout form, the original 'Submit' was for order submission while 'Add Coupon' serves a different purpose.",
  "combined_score": 0.42,
  "recommendation": "reject",
  "ai_model": "claude-haiku-4-5-20251001"
}
```

**Response (200 OK) - AI Unavailable:**
```json
{
  "is_match": true,
  "ai_confidence": 0.0,
  "reasoning": "AI validation unavailable. Using deterministic score only.",
  "combined_score": 0.78,
  "recommendation": "prompt_user",
  "ai_model": "deterministic_fallback"
}
```

**Recommendation Values:**
- `accept`: Combined score >= 0.85, auto-heal with high confidence
- `prompt_user`: Combined score 0.50-0.85, ask user to confirm
- `reject`: Combined score < 0.50, don't heal

---

### GET /api/healing/status

Check AI healing service availability.

**Request:**
```bash
curl http://localhost:8000/api/healing/status \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "ai_available": true,
  "model": "claude-haiku-4-5-20251001",
  "ai_weight": 0.4,
  "thresholds": {
    "accept": 0.85,
    "reject": 0.5
  },
  "fallback_mode": "deterministic_with_strict_thresholds"
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "detail": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | EMAIL_EXISTS | Email already registered |
| 400 | INVALID_INVITE_TOKEN | Company invite token invalid |
| 401 | INVALID_CREDENTIALS | Email or password incorrect |
| 401 | TOKEN_EXPIRED | JWT token has expired |
| 401 | INVALID_TOKEN | JWT token is malformed |
| 403 | FORBIDDEN | User lacks permission |
| 404 | NOT_FOUND | Resource not found |
| 422 | VALIDATION_ERROR | Request validation failed |
| 500 | INTERNAL_ERROR | Server error |

### Validation Error (422)

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

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /api/auth/login | 10 requests/minute |
| POST /api/auth/signup | 5 requests/minute |
| POST /api/healing/validate | 30 requests/minute |
| All other endpoints | 100 requests/minute |

---

## Workflow Status Values

| Status | Description |
|--------|-------------|
| draft | Newly created, not yet processed |
| processing | AI labeling in progress |
| active | Ready for use |
| needs_review | Requires admin attention |
| broken | Failed 3+ consecutive times |
| archived | Soft-deleted, hidden from UI |

---

## Action Types

| Type | Description |
|------|-------------|
| click | Mouse click on element |
| input | Text input into field |
| select | Dropdown selection |
| navigate | Page navigation |
| scroll | Scroll action |
| submit | Form submission |

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing secret (min 32 chars) | `your-super-secret-key-min-32-chars` |
| `DATABASE_URL` | SQLite/PostgreSQL connection | `sqlite:///./overlay.db` |
| `REDIS_URL` | Redis connection for Celery | `redis://localhost:6379/0` |

### Email Configuration (Resend)

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key | `re_xxxxxxxxxxxx` |
| `FROM_EMAIL` | Sender email address | `noreply@overlay.io` |
| `FRONTEND_URL` | Frontend URL for email links | `http://localhost:5173` |

**Note:** If `RESEND_API_KEY` is not set, emails are logged to console (mock mode for development).

### AI Services

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-xxxxxxxxxxxx` |

### Storage (Production)

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `S3_BUCKET_NAME` | S3 bucket for screenshots | `overlay-screenshots` |

### Example .env File

```bash
# Security
SECRET_KEY=your-super-secret-key-minimum-32-characters-long

# Database
DATABASE_URL=sqlite:///./overlay.db

# Redis (Celery)
REDIS_URL=redis://localhost:6379/0

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
FROM_EMAIL=noreply@overlay.io
FRONTEND_URL=http://localhost:5173

# AI
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# Storage (optional for local dev)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=us-east-1
# S3_BUCKET_NAME=overlay-screenshots
```

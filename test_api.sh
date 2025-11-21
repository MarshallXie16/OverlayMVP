#!/bin/bash
# Quick API endpoint test script

BASE_URL="http://localhost:8000"

echo "Testing Workflow Platform API Endpoints"
echo "========================================"
echo ""

# Test 1: Health check
echo "1. Testing /health endpoint..."
curl -s "${BASE_URL}/health" | python3 -m json.tool || echo "FAILED"
echo ""

# Test 2: Signup with company_name
echo "2. Testing /api/auth/signup with company_name..."
SIGNUP_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "company_name": "Test Company"
  }')

echo "$SIGNUP_RESPONSE" | python3 -m json.tool || echo "Error: $SIGNUP_RESPONSE"
echo ""

# Extract token if signup succeeded
TOKEN=$(echo "$SIGNUP_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)

if [ -n "$TOKEN" ]; then
  echo "✓ Signup successful, got token"
  echo ""

  # Test 3: Get current user with /me endpoint
  echo "3. Testing /api/auth/me endpoint..."
  curl -s "${BASE_URL}/api/auth/me" \
    -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool || echo "FAILED"
  echo ""

  # Test 4: Login with same credentials
  echo "4. Testing /api/auth/login..."
  curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }' | python3 -m json.tool || echo "FAILED"
  echo ""

  # Test 5: Get workflows (should be empty)
  echo "5. Testing /api/workflows endpoint..."
  curl -s "${BASE_URL}/api/workflows" \
    -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool || echo "FAILED"
  echo ""
else
  echo "✗ Signup failed, skipping authenticated endpoints"
  echo ""
fi

# Test 6: Signup without company_name or invite_token (should fail)
echo "6. Testing /api/auth/signup without company_name (should fail)..."
curl -s -X POST "${BASE_URL}/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test2@example.com",
    "password": "password123",
    "name": "Test User 2"
  }' | python3 -m json.tool || echo "FAILED"
echo ""

echo "========================================"
echo "API Testing Complete"

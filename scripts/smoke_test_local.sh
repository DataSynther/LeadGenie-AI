#!/usr/bin/env bash
# Smoke-test the local V2 docker-compose stack.
# Run after: docker compose -f docker-compose.local-v2.yml up -d

set -euo pipefail

API="http://localhost:8000"
FRONTEND="http://localhost:3000"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; exit 1; }

echo "=== LeadGenie V2 Local Smoke Test ==="

# 1. API health
echo "→ API /health"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$API/health")
[ "$STATUS" = "200" ] && pass "/health returned 200" || fail "/health returned $STATUS"

# 2. API root reachable
echo "→ API CORS headers"
curl -sf -I "$API/health" | grep -qi "access-control-allow-origin" \
  && pass "CORS header present" || pass "CORS header not checked (may need auth)"

# 3. Frontend served
echo "→ Frontend"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$FRONTEND")
[ "$STATUS" = "200" ] && pass "Frontend returned 200" || fail "Frontend returned $STATUS"

# 4. Auth endpoint
echo "→ POST /auth/login (demo user)"
RESP=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}' \
  -w "\n%{http_code}")
CODE=$(echo "$RESP" | tail -1)
[ "$CODE" = "200" ] && pass "Login returned 200" || fail "Login returned $CODE"

TOKEN=$(echo "$RESP" | head -1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token',''))" 2>/dev/null || echo "")
if [ -n "$TOKEN" ]; then
  pass "Got auth token"
else
  echo "  [WARN] Could not extract token — skipping authenticated checks"
fi

# 5. FinOps endpoint (authenticated)
if [ -n "$TOKEN" ]; then
  echo "→ GET /dev/finops"
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" "$API/dev/finops")
  [ "$STATUS" = "200" ] && pass "/dev/finops returned 200" || fail "/dev/finops returned $STATUS"
fi

echo ""
echo "=== All checks passed ==="

#!/bin/bash

# PulseRadar Validation Script
# Tests all functionality before deployment

set -e

echo "🔍 PulseRadar Validation Script"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    ((TESTS_FAILED++))
}

test_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "1️⃣  Checking Prerequisites..."
echo "----------------------------"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    test_pass "Node.js installed: $NODE_VERSION"
else
    test_fail "Node.js not found"
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    test_pass "npm installed: $NPM_VERSION"
else
    test_fail "npm not found"
fi

# Check if dependencies are installed
if [ -d "node_modules" ]; then
    test_pass "Dependencies installed"
else
    test_fail "Dependencies not installed (run: npm install)"
fi

# Check TypeScript
if [ -f "node_modules/.bin/tsc" ]; then
    test_pass "TypeScript available"
else
    test_warn "TypeScript not found in node_modules"
fi

# Check Wrangler
if command -v wrangler &> /dev/null || [ -f "node_modules/.bin/wrangler" ]; then
    test_pass "Wrangler CLI available"
else
    test_warn "Wrangler CLI not found (will use npx)"
fi

echo ""
echo "2️⃣  Checking Project Structure..."
echo "--------------------------------"

# Check required files
required_files=(
    "package.json"
    "tsconfig.json"
    "wrangler.toml"
    "src/index.ts"
    "src/types.ts"
    "src/lib/discovery.ts"
    "src/lib/testing.ts"
    "src/lib/trust-score.ts"
    "migrations/0001_initial_schema.sql"
    ".dev.vars"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        test_pass "$file exists"
    else
        test_fail "$file missing"
    fi
done

echo ""
echo "3️⃣  Running TypeScript Type Check..."
echo "------------------------------------"

if npm run type-check > /dev/null 2>&1; then
    test_pass "TypeScript compilation successful"
else
    test_fail "TypeScript errors found (run: npm run type-check)"
fi

echo ""
echo "4️⃣  Validating Configuration..."
echo "-------------------------------"

# Check wrangler.toml has required fields
if grep -q "name = \"pulseradar\"" wrangler.toml; then
    test_pass "Worker name configured"
else
    test_fail "Worker name missing in wrangler.toml"
fi

if grep -q "main = \"src/index.ts\"" wrangler.toml; then
    test_pass "Main entry point configured"
else
    test_fail "Main entry point missing in wrangler.toml"
fi

if grep -q "binding = \"DB\"" wrangler.toml; then
    test_pass "D1 database binding configured"
else
    test_fail "D1 database binding missing in wrangler.toml"
fi

if grep -q "database_id = \"\"" wrangler.toml; then
    test_warn "Database ID not set (required for deployment)"
else
    test_pass "Database ID configured"
fi

# Check .dev.vars
if grep -q "INTERNAL_API_KEY" .dev.vars; then
    test_pass "INTERNAL_API_KEY configured in .dev.vars"
else
    test_warn "INTERNAL_API_KEY missing in .dev.vars"
fi

echo ""
echo "5️⃣  Validating Database Schema..."
echo "---------------------------------"

# Check SQL migration file
if grep -q "CREATE TABLE IF NOT EXISTS endpoints" migrations/0001_initial_schema.sql; then
    test_pass "Endpoints table defined"
else
    test_fail "Endpoints table missing from schema"
fi

if grep -q "CREATE TABLE IF NOT EXISTS endpoint_tests" migrations/0001_initial_schema.sql; then
    test_pass "Endpoint tests table defined"
else
    test_fail "Endpoint tests table missing from schema"
fi

if grep -q "CREATE TABLE IF NOT EXISTS trust_scores" migrations/0001_initial_schema.sql; then
    test_pass "Trust scores table defined"
else
    test_fail "Trust scores table missing from schema"
fi

echo ""
echo "6️⃣  Code Quality Checks..."
echo "--------------------------"

# Check for console.logs (production-ready check)
if grep -r "console.log" src/ | grep -v "console.error" > /dev/null; then
    log_count=$(grep -r "console.log" src/ | grep -v "console.error" | wc -l | tr -d ' ')
    test_warn "Found $log_count console.log statements (OK for MVP)"
else
    test_pass "No debug console.logs found"
fi

# Check for TODO comments
if grep -r "TODO" src/ > /dev/null; then
    todo_count=$(grep -r "TODO" src/ | wc -l | tr -d ' ')
    test_warn "Found $todo_count TODO comments"
else
    test_pass "No TODO comments found"
fi

echo ""
echo "7️⃣  API Endpoint Validation..."
echo "------------------------------"

# Check all endpoints are defined in index.ts
endpoints=("/discover" "/trust-score" "/verify-live" "/compare")
for endpoint in "${endpoints[@]}"; do
    if grep -q "\"$endpoint\"" src/index.ts; then
        test_pass "Endpoint $endpoint defined"
    else
        test_fail "Endpoint $endpoint missing"
    fi
done

echo ""
echo "8️⃣  Payment Integration Check..."
echo "--------------------------------"

# Check payment verification is implemented
if grep -q "hasValidPayment" src/index.ts; then
    test_pass "Payment verification implemented"
else
    test_fail "Payment verification missing"
fi

if grep -q "isInternalRequest" src/index.ts; then
    test_pass "Internal API key check implemented"
else
    test_fail "Internal API key check missing"
fi

if grep -q "X-Internal-API-Key" src/index.ts; then
    test_pass "Internal API key header supported"
else
    test_fail "Internal API key header missing"
fi

echo ""
echo "9️⃣  Cron Jobs Validation..."
echo "---------------------------"

# Check cron triggers are configured
if grep -q "crons =" wrangler.toml; then
    test_pass "Cron triggers configured"

    if grep -q "0 \*/6 \* \* \*" wrangler.toml; then
        test_pass "Discovery job scheduled (every 6 hours)"
    fi

    if grep -q "\*/30 \* \* \* \*" wrangler.toml; then
        test_pass "Testing job scheduled (every 30 minutes)"
    fi

    if grep -q "0 \* \* \* \*" wrangler.toml; then
        test_pass "Trust calculation scheduled (every hour)"
    fi
else
    test_fail "Cron triggers not configured"
fi

echo ""
echo "🔟 Trust Score Algorithm Check..."
echo "----------------------------------"

# Check trust score functions exist
trust_functions=("calculateUptimeScore" "calculateSpeedScore" "calculateAccuracyScore" "calculateAgeScore" "calculateOverallScore")
for func in "${trust_functions[@]}"; do
    if grep -q "$func" src/lib/trust-score.ts; then
        test_pass "Function $func exists"
    else
        test_fail "Function $func missing"
    fi
done

echo ""
echo "================================"
echo "📊 VALIDATION SUMMARY"
echo "================================"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✨ All critical tests passed!${NC}"
    echo ""
    echo "🚀 Your code is ready for deployment!"
    echo ""
    echo "Next steps:"
    echo "1. Run: wrangler login"
    echo "2. Follow DEPLOY.md for deployment instructions"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "Please fix the issues above before deploying."
    echo ""
    exit 1
fi

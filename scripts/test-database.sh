#!/usr/bin/env bash
#
# test-database.sh — Run FoconFlow SQL/RLS assertion suites against the local
# Supabase database.
#
# The existing test files use PL/pgSQL assertions (RAISE EXCEPTION on failure)
# rather than pgTAP, so `supabase test db` (which wraps pg_prove and expects
# TAP output) reports a false "FAIL: No plan found". This runner executes each
# test file directly with psql and ON_ERROR_STOP=1, propagating the real exit
# code.
#
# Usage:
#   scripts/test-database.sh
#
# Requirements:
#   - Local Supabase stack running (`supabase start`)
#   - Database reset with migrations applied (`supabase db reset`)
#
# Exit codes:
#   0 — all test files passed
#   1 — one or more test files failed (or setup error)

set -euo pipefail

# Locate the project root (where supabase/ lives) regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_DIR="${PROJECT_ROOT}/supabase/tests"

if [ ! -d "${TEST_DIR}" ]; then
  echo "ERROR: supabase/tests/ not found at ${TEST_DIR}" >&2
  exit 1
fi

# Obtain the local DB connection string from `supabase status`.
# This avoids hardcoding credentials and uses the same local instance.
DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d'"' -f2)"

if [ -z "${DB_URL}" ]; then
  echo "ERROR: could not determine DB_URL from 'supabase status'." >&2
  echo "       Is the local Supabase stack running? (supabase start)" >&2
  exit 1
fi

echo "=========================================="
echo " FoconFlow Database/RLS Test Runner"
echo "=========================================="
echo "Database: ${DB_URL}"
echo ""

# Collect test files in deterministic order.
TEST_FILES=()
while IFS= read -r line; do
  TEST_FILES+=("$line")
done < <(find "${TEST_DIR}" -type f -name '*.sql' | sort)

if [ "${#TEST_FILES[@]}" -eq 0 ]; then
  echo "ERROR: no .sql test files found in ${TEST_DIR}" >&2
  exit 1
fi

echo "Found ${#TEST_FILES[@]} test file(s):"
for f in "${TEST_FILES[@]}"; do
  echo "  - $(basename "$f")"
done
echo ""

FAILED=0
PASSED=0

for test_file in "${TEST_FILES[@]}"; do
  file_name="$(basename "$test_file")"
  echo "------------------------------------------"
  echo "Running: ${file_name}"
  echo "------------------------------------------"

  if psql "${DB_URL}" \
    -v ON_ERROR_STOP=1 \
    -X \
    -f "${test_file}" 2>&1; then
    echo "=> PASS: ${file_name}"
    PASSED=$((PASSED + 1))
  else
    echo "=> FAIL: ${file_name}" >&2
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "=========================================="
echo " Summary"
echo "=========================================="
echo "Files passed: ${PASSED}/${#TEST_FILES[@]}"
echo "Files failed: ${FAILED}/${#TEST_FILES[@]}"

if [ "${FAILED}" -gt 0 ]; then
  echo "RESULT: FAIL" >&2
  exit 1
fi

echo "RESULT: PASS"
exit 0

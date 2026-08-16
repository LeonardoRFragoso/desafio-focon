#!/usr/bin/env bash
# Static analysis for Supabase Edge Functions using Deno.
# Runs deno check (type checking) and deno lint (linting) on all Edge Functions.
#
# This script is called by CI. It also includes a negative test that verifies
# deno check actually catches type errors (preventing false "all green" states).
set -euo pipefail

FUNCTIONS_DIR="supabase/functions"
DENO_CONFIG="$FUNCTIONS_DIR/deno.json"
FAILED=0

echo "=== Deno check (type checking) ==="
for dir in "$FUNCTIONS_DIR"/*/; do
  func_name=$(basename "$dir")
  entry="${dir}index.ts"
  if [ -f "$entry" ]; then
    echo "  Checking $func_name..."
    if ! deno check --config "$DENO_CONFIG" "$entry"; then
      echo "  FAIL: deno check failed for $func_name"
      FAILED=1
    fi
  fi
done

echo ""
echo "=== Deno lint ==="
for dir in "$FUNCTIONS_DIR"/*/; do
  func_name=$(basename "$dir")
  entry="${dir}index.ts"
  if [ -f "$entry" ]; then
    echo "  Linting $func_name..."
    if ! deno lint --config "$DENO_CONFIG" "$entry"; then
      echo "  FAIL: deno lint failed for $func_name"
      FAILED=1
    fi
  fi
done

echo ""
echo "=== Negative test: verify deno check catches type errors ==="
# Create a temporary file with a deliberate type error
TMP_FILE=$(mktemp --suffix=.ts)
cat > "$TMP_FILE" <<'TYPE_ERROR'
const x: number = "this is a string, not a number";
TYPE_ERROR

if deno check "$TMP_FILE" 2>/dev/null; then
  echo "  FAIL: deno check did NOT catch a deliberate type error — the gate is ineffective!"
  FAILED=1
  rm -f "$TMP_FILE"
else
  echo "  PASS: deno check correctly caught the deliberate type error"
  rm -f "$TMP_FILE"
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS — all Edge Functions pass deno check and deno lint"
else
  echo "RESULT: FAIL — one or more Edge Functions failed static analysis"
fi
exit "$FAILED"

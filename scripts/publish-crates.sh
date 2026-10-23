#!/usr/bin/env bash
set -euo pipefail

# Publishes all workspace crates to crates.io in topological dependency order.
# Skips crates marked `publish = false`. Retries on rate-limit (HTTP 429) by
# parsing the retry-after time from the error message. Treats "already uploaded"
# as success for idempotent re-runs.
#
# Usage: scripts/publish-crates.sh [--dry-run]

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

MAX_RETRIES=20
MIN_RETRY_DELAY=10
MAX_RETRY_DELAY=900

# Topological sort via cargo metadata + python: leaves (no workspace deps) first,
# umbrella crates (flight-sdk) last.
ORDER=$(cargo metadata --format-version 1 --no-deps | python3 -c '
import json, sys
from collections import defaultdict, deque

meta = json.load(sys.stdin)
workspace_members = set(meta.get("workspace_members", []))

pkgs = {}
for p in meta["packages"]:
    if p["id"] not in workspace_members:
        continue
    pub = p.get("publish")
    if pub is not None and len(pub) == 0:
        continue
    pkgs[p["name"]] = p

deps = defaultdict(set)
for name, p in pkgs.items():
    for d in p.get("dependencies", []):
        dep_name = d["name"]
        if dep_name in pkgs:
            deps[name].add(dep_name)

in_degree = {name: len(deps[name]) for name in pkgs}
queue = deque(name for name, deg in in_degree.items() if deg == 0)
order = []
while queue:
    n = queue.popleft()
    order.append(n)
    for name in pkgs:
        if n in deps[name]:
            deps[name].discard(n)
            in_degree[name] -= 1
            if in_degree[name] == 0:
                queue.append(name)

if len(order) != len(pkgs):
    remaining = set(pkgs) - set(order)
    print(f"Cycle detected among: {remaining}", file=sys.stderr)
    sys.exit(1)

for name in order:
    print(name)
')

if [ -z "$ORDER" ]; then
  echo "No publishable crates found."
  exit 0
fi

TOTAL=$(echo "$ORDER" | wc -l)
CURRENT=0
FAILED=()
SKIPPED=0

echo "Publishing $TOTAL crates in dependency order..."
echo ""

# Parse "try again after <HTTP date>" from crates.io error and return seconds to wait.
# Falls back to the provided default if parsing fails.
parse_retry_after() {
  local output="$1"
  local default_delay="$2"

  local retry_date
  retry_date=$(echo "$output" | grep -oiP 'try again after \K[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT' | head -1)
  if [ -z "$retry_date" ]; then
    echo "$default_delay"
    return
  fi

  local retry_epoch now_epoch wait_seconds
  retry_epoch=$(date -d "$retry_date" +%s 2>/dev/null) || { echo "$default_delay"; return; }
  now_epoch=$(date +%s)
  wait_seconds=$((retry_epoch - now_epoch + 5))

  if (( wait_seconds < MIN_RETRY_DELAY )); then
    wait_seconds=$MIN_RETRY_DELAY
  elif (( wait_seconds > MAX_RETRY_DELAY )); then
    wait_seconds=$MAX_RETRY_DELAY
  fi
  echo "$wait_seconds"
}

publish_one() {
  local crate="$1"
  local attempt=0

  while (( attempt < MAX_RETRIES )); do
    OUTPUT=$(cargo publish -p "$crate" $DRY_RUN --no-verify --allow-dirty 2>&1) && RC=0 || RC=$?

    if [ $RC -eq 0 ]; then
      return 0
    fi

    if echo "$OUTPUT" | grep -q "already uploaded"; then
      echo "  (already published)"
      SKIPPED=$((SKIPPED + 1))
      return 0
    fi

    if echo "$OUTPUT" | grep -qiE "429|rate limit|try again|503|504"; then
      attempt=$((attempt + 1))
      if (( attempt < MAX_RETRIES )); then
        local delay
        delay=$(parse_retry_after "$OUTPUT" "$MIN_RETRY_DELAY")
        echo "  rate-limited, retry $attempt/$MAX_RETRIES in ${delay}s..."
        sleep "$delay"
        continue
      fi
    fi

    # Non-retryable error
    echo "$OUTPUT"
    return $RC
  done

  echo "$OUTPUT"
  return 1
}

for CRATE in $ORDER; do
  CURRENT=$((CURRENT + 1))
  echo "[$CURRENT/$TOTAL] $CRATE"

  if publish_one "$CRATE"; then
    echo "  ok"
  else
    echo "  FAIL"
    FAILED+=("$CRATE")
  fi

  # Brief pause between publishes to stay under rate limits
  if [ -z "$DRY_RUN" ]; then
    sleep 2
  fi
done

echo ""
echo "=== Summary ==="
echo "Total: $TOTAL"
echo "Published: $((TOTAL - ${#FAILED[@]} - SKIPPED))"
echo "Already published: $SKIPPED"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed (${#FAILED[@]}):"
  for f in "${FAILED[@]}"; do
    echo "  - $f"
  done
  exit 1
else
  echo "All crates published successfully."
fi

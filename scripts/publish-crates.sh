#!/usr/bin/env bash
set -euo pipefail

# Publishes all workspace crates to crates.io in topological dependency order.
# Skips crates marked `publish = false`.
# Usage: scripts/publish-crates.sh [--dry-run]

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

# Extract the topological publish order from cargo metadata.
# cargo metadata lists workspace packages and their path-dependencies;
# we build the DAG and emit a topological sort (leaves first).
ORDER=$(cargo metadata --format-version 1 --no-deps | python3 -c '
import json, sys
from collections import defaultdict, deque

meta = json.load(sys.stdin)
workspace_members = set(meta.get("workspace_members", []))

# Index packages by name
pkgs = {}
for p in meta["packages"]:
    if p["id"] not in workspace_members:
        continue
    # Skip publish = false (null means publishable, [] means publishable,
    # but an explicit publish = false renders as an empty list in some cargo versions
    # or is absent). cargo metadata: publish is null (default) or a list of registries.
    pub = p.get("publish")
    if pub is not None and len(pub) == 0:
        continue
    pkgs[p["name"]] = p

# Build adjacency: edges from dependency -> dependent
# (we need reverse: dependents wait for dependencies)
deps = defaultdict(set)  # crate -> set of workspace crates it depends on
for name, p in pkgs.items():
    for d in p.get("dependencies", []):
        dep_name = d["name"]
        if dep_name in pkgs:
            deps[name].add(dep_name)

# Kahn topological sort
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

echo "Publishing $TOTAL crates in dependency order..."
echo ""

for CRATE in $ORDER; do
  CURRENT=$((CURRENT + 1))
  echo "[$CURRENT/$TOTAL] Publishing $CRATE..."

  OUTPUT=$(cargo publish -p "$CRATE" $DRY_RUN --no-verify 2>&1) && RC=0 || RC=$?

  if [ $RC -eq 0 ]; then
    echo "  ok $CRATE"
  elif echo "$OUTPUT" | grep -q "already uploaded"; then
    echo "  ok $CRATE (already published)"
  else
    echo "$OUTPUT"
    echo "  FAIL $CRATE (exit $RC)"
    FAILED+=("$CRATE")
  fi

  # crates.io rate-limits publishes; pause between them
  if [ -z "$DRY_RUN" ] && [ $RC -eq 0 ]; then
    sleep 3
  fi
done

echo ""
echo "=== Summary ==="
echo "Published: $((TOTAL - ${#FAILED[@]}))/$TOTAL"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed:"
  for f in "${FAILED[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

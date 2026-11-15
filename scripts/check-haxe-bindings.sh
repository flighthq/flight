#!/usr/bin/env bash
set -euo pipefail

# Validates that the generated Haxe bindings type-check cleanly on all targets.
#
# Generates into a temp directory, then runs haxe --no-output for HL, cpp, and JS.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

"$SCRIPT_DIR/generate-haxe-bindings.sh" "$WORK_DIR/haxe"

echo "==> Type-checking HL target..."
haxe --no-output \
    -cp "$WORK_DIR/haxe" \
    --hl /dev/null \
    --macro 'include("flight", true, ["flight._cpp", "flight._js"])' \
    2>&1

echo "==> Type-checking cpp target..."
haxe --no-output \
    -cp "$WORK_DIR/haxe" \
    --cpp /dev/null \
    --macro 'include("flight", true, ["flight._hl", "flight._js"])' \
    2>&1

echo "==> Type-checking JS/ESM target..."
haxe --no-output \
    -cp "$WORK_DIR/haxe" \
    --js /dev/null \
    -D flight_esm \
    --macro 'include("flight", true, ["flight._hl", "flight._cpp"])' \
    2>&1

echo "==> All Haxe targets type-check passed."

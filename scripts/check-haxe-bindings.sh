#!/usr/bin/env bash
set -euo pipefail

# Validates that the generated Haxe bindings type-check cleanly.
#
# Pipeline:
#   1. cargo build -p flight-ffi           (generates FFI wrappers)
#   2. cargo run -p flight-offsets         (emits struct layout JSON)
#   3. extract ffi-names from build output
#   4. cargo run -p flight-bindgen         (emits Haxe files)
#   5. haxe --no-output                   (type-checks without codegen)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cd "$REPO_DIR"

echo "==> Building flight-ffi..."
cargo build -p flight-ffi 2>&1

echo "==> Running flight-offsets..."
cargo run --bin flight-offsets 2>/dev/null > "$WORK_DIR/offsets.json"

echo "==> Extracting FFI names..."
FFI_BUILD_DIR=$(ls -d target/debug/build/flight-ffi-*/out 2>/dev/null | head -1)
if [ -z "$FFI_BUILD_DIR" ]; then
    echo "ERROR: flight-ffi build output not found" >&2
    exit 1
fi
grep -oP '(?<=fn )(flight_[a-z0-9_]+)' "$FFI_BUILD_DIR/ffi_generated.rs" \
    | sort -u > "$WORK_DIR/ffi-names.txt"
echo "   $(wc -l < "$WORK_DIR/ffi-names.txt") FFI names"

echo "==> Generating Haxe bindings..."
cargo run -p flight-bindgen -- \
    --target haxe \
    --out "$WORK_DIR/haxe" \
    --offsets "$WORK_DIR/offsets.json" \
    --ffi-names "$WORK_DIR/ffi-names.txt" \
    2>&1

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

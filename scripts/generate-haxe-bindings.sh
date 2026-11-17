#!/usr/bin/env bash
set -euo pipefail

# Generates Haxe extern bindings from the Rust FFI layer.
#
# Usage: scripts/generate-haxe-bindings.sh <output-dir>
#
# Pipeline:
#   1. cargo build -p flight-ffi       (generates FFI wrappers + offsets binary)
#   2. cargo run --bin flight-offsets   (emits struct layout JSON)
#   3. extract ffi-names from build output
#   4. cargo run -p flight-bindgen      (emits Haxe files)

if [ $# -lt 1 ]; then
    echo "Usage: $0 <output-dir>" >&2
    exit 1
fi

OUT_DIR="$1"
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

echo "==> Generating Haxe bindings to $OUT_DIR..."
cargo run -p flight-bindgen -- \
    --target haxe \
    --out "$OUT_DIR" \
    --offsets "$WORK_DIR/offsets.json" \
    --ffi-names "$WORK_DIR/ffi-names.txt" \
    2>&1

echo "==> Done."

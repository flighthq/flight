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
# target/debug/build keeps one flight-ffi-<hash> dir per past build configuration, so the
# generated-wrapper dir is read from this build's own cargo messages, never globbed.
cargo build -p flight-ffi --message-format=json-render-diagnostics > "$WORK_DIR/build.jsonl"
FFI_BUILD_DIR=$(node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n");
const dirs = lines
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line))
  .filter((m) => m.reason === "build-script-executed" && /[/#]flight-ffi[#@]/.test(m.package_id))
  .map((m) => m.out_dir);
if (dirs.length !== 1) {
  console.error(`expected exactly one flight-ffi build-script output, found ${dirs.length}`);
  process.exit(1);
}
console.log(dirs[0]);
' "$WORK_DIR/build.jsonl")
if [ ! -f "$FFI_BUILD_DIR/ffi_generated.rs" ]; then
    echo "ERROR: flight-ffi build output not found at $FFI_BUILD_DIR" >&2
    exit 1
fi

echo "==> Running flight-offsets..."
cargo run --bin flight-offsets 2>/dev/null > "$WORK_DIR/offsets.json"

echo "==> Extracting FFI names from $FFI_BUILD_DIR..."
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

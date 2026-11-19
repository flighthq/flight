#!/usr/bin/env bash
set -euo pipefail

# Generates and runs the typed node-handle contract on both native Haxe targets.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

HAXE_BIN="${HAXE_BIN:-$(command -v haxe || true)}"
HL_BIN="${HL_BIN:-$(command -v hl || true)}"
if [ -z "$HAXE_BIN" ] || [ ! -x "$HAXE_BIN" ]; then
    echo "ERROR: HAXE_BIN must name an executable Haxe compiler" >&2
    exit 1
fi
if [ -z "$HL_BIN" ] || [ ! -x "$HL_BIN" ]; then
    echo "ERROR: HL_BIN must name an executable HashLink runtime" >&2
    exit 1
fi
HASHLINK_DIR="${HASHLINK_DIR:-$(cd "$(dirname "$HL_BIN")" && pwd)}"
if [ ! -f "$HASHLINK_DIR/libhl.so" ] || [ ! -f "$HASHLINK_DIR/src/hl.h" ]; then
    echo "ERROR: HASHLINK_DIR must contain libhl.so and src/hl.h" >&2
    exit 1
fi

export PATH="$(cd "$(dirname "$HAXE_BIN")" && pwd):$PATH"
command -v haxelib >/dev/null
haxelib path hxcpp >/dev/null

cd "$REPO_DIR"
"$SCRIPT_DIR/generate-haxe-bindings.sh" "$WORK_DIR/generated"

cargo build -p flight-ffi --message-format=json-render-diagnostics > "$WORK_DIR/build.jsonl"
FFI_BUILD_DIR=$(node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n");
const dirs = lines
  .filter((line) => line.startsWith("{"))
  .map((line) => JSON.parse(line))
  .filter((message) =>
    message.reason === "build-script-executed" &&
    /[/#]flight-ffi[#@]/.test(message.package_id)
  )
  .map((message) => message.out_dir);
if (dirs.length !== 1) {
  console.error("expected exactly one flight-ffi build output, found " + dirs.length);
  process.exit(1);
}
console.log(dirs[0]);
' "$WORK_DIR/build.jsonl")
FFI_LIBRARY_DIR=$(cargo metadata --format-version 1 --no-deps |
    node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => console.log(JSON.parse(input).target_directory + "/debug"));
')

mkdir -p "$WORK_DIR/source"
node - "$REPO_DIR/crates/flight-bindgen/tests/fixtures/NativeNodeHandleRuntime.hx" \
    "$WORK_DIR/source/NativeNodeHandleRuntime.hx" "$FFI_BUILD_DIR" "$FFI_LIBRARY_DIR" <<'NODE'
const fs = require("fs");
const [source, destination, includeDir, libraryDir] = process.argv.slice(2);
const rendered = fs.readFileSync(source, "utf8")
  .replaceAll("@FLIGHT_FFI_INCLUDE@", includeDir)
  .replaceAll("@FLIGHT_FFI_HEADER@", includeDir + "/flight_ffi.h")
  .replaceAll("@FLIGHT_FFI_LIBRARY@", libraryDir);
fs.writeFileSync(destination, rendered);
NODE

echo "==> Compiling HashLink node-handle runtime..."
"$HAXE_BIN" \
    -cp "$WORK_DIR/generated" \
    -cp "$WORK_DIR/source" \
    --hl "$WORK_DIR/native-node-handle.hl" \
    -main NativeNodeHandleRuntime

cc -shared -fPIC \
    -I"$HASHLINK_DIR/src" \
    -I"$FFI_BUILD_DIR" \
    "$FFI_BUILD_DIR/flight_hl.c" \
    -L"$HASHLINK_DIR" \
    -L"$FFI_LIBRARY_DIR" \
    -lhl \
    -lflight_ffi \
    -Wl,-rpath,"$HASHLINK_DIR" \
    -Wl,-rpath,"$FFI_LIBRARY_DIR" \
    -o "$WORK_DIR/flight.hdll"

echo "==> Running HashLink node-handle runtime..."
(
    cd "$WORK_DIR"
    LD_LIBRARY_PATH="$HASHLINK_DIR:$FFI_LIBRARY_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
        "$HL_BIN" native-node-handle.hl
)

echo "==> Compiling hxcpp node-handle runtime..."
"$HAXE_BIN" \
    -cp "$WORK_DIR/generated" \
    -cp "$WORK_DIR/source" \
    --cpp "$WORK_DIR/cpp" \
    -main NativeNodeHandleRuntime

echo "==> Running hxcpp node-handle runtime..."
"$WORK_DIR/cpp/NativeNodeHandleRuntime"

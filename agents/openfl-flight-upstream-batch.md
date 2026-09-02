Approved work batch: Flight upstream improvements surfaced by openfl-flight gap analysis. These are general-purpose Flight improvements, not OpenFL-specific adapters. Each is independent and can be dispatched to separate builders.

---

## 1. Byte compression — named compress functions

Package: @flighthq/compression

Add named compress functions alongside the existing decompress registry. No registry for compression — the caller knows what algorithm they want.

- `compressDeflate(bytes: Uint8Array): Uint8Array` — RFC 1951 DEFLATE compression (raw)
- `compressDeflateZlib(bytes: Uint8Array): Uint8Array` — RFC 1950 zlib-framed compression (or a framing parameter; match however the existing decompress side distinguishes Raw vs Rfc1950)

Each is a standalone export, tree-shakes independently. No `registerCompressor`, no enum dispatch. If LZMA/Brotli compress are needed later, they are new exports — not a registry addition.

The existing decompress registry stays as-is (container parsers need runtime dispatch on header bytes).

---

## 2. Raw TCP socket seam

Packages: @flighthq/types, @flighthq/socket

The existing `SocketBackend` interface is already transport-agnostic. The work is defining the types and API surface for raw TCP stream connections so host adapters (Electron, Tauri, native) can implement them. The web host returns null for non-WebSocket URLs (this is already the behavior).

- Define `TcpSocketConnection` or extend `SocketConnection` with a stream-oriented read/write surface (not frame-based like WebSocket).
- The API lives in @flighthq/socket; implementation lives in host adapters.
- No built-in implementation ships for web (raw TCP is not available in browsers).

---

## 3. Child process seam

Packages: @flighthq/types, @flighthq/shell

Define types and API for process spawn, stdio streaming, and exit status. Implementation lives in host adapters.

- `spawnShellProcess(host, command, args, options?) -> ShellProcess`
- `ShellProcess` exposes stdin write, stdout/stderr signals or streams, and exit status.
- The API lives in @flighthq/shell; host adapters (Electron, Tauri, native) provide the backend.
- No built-in implementation for web.

---

## 4. Per-channel audio pan

Packages: @flighthq/types, @flighthq/audio

- Add `pan: number` to `AudioChannel` (range -1 to 1, 0 center).
- Add `setSourcePan(source, pan)` to `AudioDeviceBackend`.
- Web implementation uses `StereoPannerNode` in the Web Audio API.

Small, isolated change.

---

## 5. Net request cancellation (AbortSignal)

Packages: @flighthq/types, @flighthq/net

- Add optional `signal?: AbortSignal` to `NetRequestOptions`.
- `sendNetRequest` forwards the signal to the underlying fetch/transport.
- Standard web pattern.

---

## 6. File operation cancellation (AbortSignal)

Packages: @flighthq/types, @flighthq/filesystem, @flighthq/dialog

- Add optional `signal?: AbortSignal` to filesystem read/write operations and dialog operations where applicable.
- Small, follows the same pattern as net request cancellation.

---

## 7. Public UTF-8 byte codec

Package: determine the right home (could be @flighthq/compression, a new @flighthq/encoding, or wherever makes sense)

- Promote the internal `_TextEncoder`/`_TextDecoder` to public exports.
- `encodeUTF8(text: string): Uint8Array`
- `decodeUTF8(bytes: Uint8Array, offset?: number, length?: number): string`
- Trivial surface.

---

## 8. Cursor re-resolve on set

Package: @flighthq/interaction

When `setNodeCursor` is called on a node that the pointer is currently hovering over (or an ancestor of the current hover target), the cursor should update immediately — not wait for the next pointer move/rollover event.

The interaction manager already tracks the current rollover target. The fix: after writing the cursor value, if the interaction manager is available and the node is the current target or an ancestor of it, call the cursor resolve/apply path.

Shape options:
- `setNodeCursor` could accept an optional `InteractionManager` argument to trigger immediate resolve.
- Or a new `invalidateInteractionCursor(manager)` function that re-resolves from the current target.
- The second is cleaner — it separates the data write from the side effect and lets the caller control when the re-resolve happens.

---

## 9. Double-click interaction signal

Package: @flighthq/interaction

Add `onPointerDoubleClick` as an interaction signal, with opt-in per node.

- Double-click detection: timing window + distance threshold (configurable on InteractionManager).
- `enableDoubleClick(source)` or a flag on NodeInteractionState to opt in per node.
- Signal fires after the second click within the window.
- Standard interaction feature, not Flash-specific.

---

## 10. Bitmap displacement effect

Packages: @flighthq/types, @flighthq/effects, @flighthq/effects-gl (and potentially effects-wgpu, effects-canvas)

A new effect kind: `BitmapDisplacementEffect`.

- Takes a texture/bitmap source as the displacement map.
- Channel selection: which source channels drive X and Y offset.
- Scale factors for X and Y displacement magnitude.
- Edge mode (clamp, wrap, etc.).

This is a standard graphics operation distinct from the existing procedural `DisplacementEffect` (sine-field shimmer). The bitmap-map variant uses per-pixel lookup from the displacement texture to shift sample coordinates.

GL implementation: single-pass fragment shader sampling the displacement map, then offsetting the main texture sample.

---

## Verification for all items

Each item: `npm run fix`, relevant `npm run check <package>`, `npm run test <package>`, `npm run exports:check`, `npm run api:check`. Items that add exports also need `npm run order` and `npm run size`. Items that touch types need focused types build verification.

## What is NOT in this batch

- Signal dispatch safety / connections / scopes — already commissioned separately.
- Interaction pre-dispatch hook — separate commission, discuss first.
- Three-phase event routing — openfl-flight adapter concern.
- Context3D / AGAL — not worth supporting in Flight.
- Synchronous clipboard reads — async is correct; adapter concern.
- SharedObject quota/remote sync — Flash-specific; Flight storage is sufficient.
- Arbitrary tile hierarchy — quadbatch already serves this need.

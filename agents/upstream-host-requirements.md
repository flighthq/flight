# Upstream Host Requirements

_2026-08-28. Requirements record — feedback from the flight-hx Haxe/Lime binding layer, identifying gaps in Flight's host seam that prevent complete native host integration._

**Status: unratified.** Read before working on host backend extraction, backend lifecycle, operation availability, or any new host package (`host-node`, `host-lime`, etc.).

**Source:** these requirements come from flight-hx, an in-progress Haxe binding that consumes Flight through Lime (a cross-platform Haxe framework with its own window, OpenGL context, audio, and event loop). The gaps identified here are not Lime-specific — they affect any native host that provides its own windowing, graphics context, audio device, or network transport.

## Priority order

1. Partial backend composition and per-operation availability
2. AudioBackend
3. Complete Net installation and prohibit transport bypasses
4. Existing-window attachment and backend lifetime
5. DOM/scratch-surface/socket/GPU seams (subsequent design work)

---

## P1 — Partial backend composition and per-operation availability

### The problem

A `*Backend` interface is a flat bag of methods. A host must implement every method or leave it as a sentinel. But real hosts are partial: Lime can `open` and `close` windows but cannot `setProgress` (taskbar progress) or `setContentProtection`. Today, the host either implements `WindowBackend` with 30+ methods (stubbing most) or does not install a window backend at all.

Worse, a sentinel return is indistinguishable from a legitimate operation result. `showConfirmDialog()` returning `false` could mean the user clicked "No" or that the host has no dialog capability. `getDeviceMemory()` returning `-1` could mean the API is unavailable or that the device genuinely cannot report memory. The caller cannot tell.

### What Flight needs

**Per-operation availability.** Each backend operation should be queryable for whether the host actually implements it, distinct from its return value:

```typescript
// Option A: capability query functions
hasDialogConfirm(): boolean
hasWindowProgress(): boolean

// Option B: richer return types for ambiguous operations
showConfirmDialog(...): { supported: true, result: boolean } | { supported: false }
```

Option A is simpler and does not change existing return types. Option B is more honest but touches every signature. The choice is a design decision.

**Backend-level `explain*Backend()` already exists** (42 backends have `explain*` functions) but reports at the backend granularity, not the operation granularity. `explainDialogBackend()` says "a dialog backend is installed" — it does not say which dialog operations that backend supports. The per-operation layer sits below this.

**Partial composition.** A host should be able to install a partial backend that covers only the operations it genuinely implements, with uncovered operations falling through to the next precedence layer (host → sentinel) or reporting as unsupported. Today, `set*Backend` is all-or-nothing.

This could be:
- A `Partial<*Backend>` that merges with a sentinel for unimplemented methods
- Per-method registration (too granular, likely impractical)
- A capability bitfield on the backend declaring which operations are real

The host-web extraction's strict-majority analysis (148 sentinel methods across 38 backends, 79.9% false concentration in 12 NONE rows) demonstrates the problem quantitatively. Those 148 sentinels are invisible lies.

### What this is NOT

Legitimate host capability limitations are not defects. Lime cannot provide rich clipboard formats, POSIX file operations, or arbitrary haptic patterns — those are real platform limits. The requirement is that Flight can **represent these limits truthfully**, not that every host implements everything.

---

## P2 — AudioBackend

No `AudioBackend` interface exists in Flight. Audio playback is currently web-only (`<audio>` element, Web Audio API). A native host that provides its own audio device (Lime's OpenAL backend, a Node.js audio library, a mobile platform's audio API) has no seam to install.

`audio` needs the same `get*Backend` / `set*Backend` / `enableHostWeb*` treatment as every other capability. The backend interface should cover: source creation, playback control (play/pause/stop/seek), volume, spatial/3D positioning, and stream management.

---

## P3 — Complete Net seam and prohibit transport bypasses

### Net seam gaps

`net` has `setNetBackend` and `getNetBackend`, but no `enableHostWebNet` in `host-web`. It is classified as an ambient-language facility (the web implementation uses `fetch`, which is standard JS and available in Node 18+), so it was not extracted. However, a native host like Lime uses Haxe's own HTTP stack, not browser `fetch`. The ambient-language classification is wrong for this host: `net` needs a host-layer installation slot.

### Transport bypasses

Several packages make HTTP requests outside the Net seam:

- **`loader` / `assets`** — resource fetching should route through `NetBackend`. Any direct `fetch` call means a native host's HTTP stack is silently bypassed.
- **`image`** — `imageResourceReference.ts` has a `fetch` seam but it is image-specific, not routed through `NetBackend`.
- **`socket`** — `socket.ts` directly constructs `new WebSocket()` (line 67-68). A native host that provides WebSocket-equivalent persistent connections (Haxe's `sys.net.Socket`, a Node.js `ws` library) has no way to replace this.

These bypasses are the most practically damaging gap. A host that installs `setNetBackend` with a native transport discovers that loaders, image fetches, and socket connections still go through browser APIs. The backend seam is only as useful as its coverage.

### Required audit

Every source file that uses `fetch`, `XMLHttpRequest`, `new WebSocket()`, `new Request()`, `new Image()`, or `new EventSource()` outside of a `createWeb*Backend` function should be identified. Each site should either route through the appropriate backend or be moved into the web backend implementation.

---

## P4 — Existing-window attachment and backend lifetime

### Window attachment

`WindowBackend.open()` assumes Flight creates the window. A host like Lime already owns its window and OpenGL context before Flight runs. The backend needs an attachment path:

```typescript
// Current: Flight creates
open(win: ApplicationWindow, options: Readonly<WindowOptions>): boolean

// Needed: host attaches an existing window
attach(win: ApplicationWindow, handle: NativeWindowHandle): boolean
```

The attachment path must provide:
- **Stable identity** — the `ApplicationWindow` entity maps to the host's existing window, not a new one.
- **Event routing** — pointer, keyboard, resize, focus, and close events from the host window reach Flight's `input` / `interaction` dispatch.
- **Disposal** — who destroys the window? If the host owns it, `close()` should detach Flight's state without destroying the native window. If Flight owns it, `close()` destroys. The ownership must be explicit at attachment time.

### Backend lifetime

The backend seam does not define transitions:

- **Replacement** — calling `set*Backend(newBackend)` while the old backend holds resources (GPU textures, audio contexts, open sockets). What happens to them? Does the old backend get a `dispose` call?
- **Uninstall** — calling `set*Backend(null)` clears the custom slot and reveals the host layer (or sentinel). But if the old backend allocated resources, they leak.
- **Hot reload** — in development, a host may want to replace a backend without restarting the application. The transition must be safe.
- **Multiple instances** — can two `Application` instances coexist with different backends? The module-scoped `_backend` variable is a singleton. Multiple windows (Electron, desktop) may each need their own backend state.

### Required contract

```
install(backend)    — replaces the current backend; calls dispose on the previous if it has one
uninstall()         — clears to sentinel; calls dispose on the removed backend
dispose(backend)    — releases all resources the backend allocated (GPU, audio, sockets, native handles)
```

Whether `dispose` is a method on the backend interface or a separate lifecycle function is a design decision. The key requirement is that replacement and removal are safe, not silent leaks.

---

## P5 — DOM, scratch surface, socket, and GPU seams

These are subsequent design items that block specific native host capabilities.

### Scratch surfaces and image decoding

`bitmap` directly creates `<canvas>` elements for pixel manipulation:
- `bitmapFrom.ts` — `document.createElement('canvas')` (lines 10, 68)
- `bitmapEncode.ts` — `document.createElement('canvas')` (line 4)
- `explainBitmapReadback.ts` — `document.createElement('canvas')` (line 28)

`image-codec` uses `ImageData` and canvas-based encoding (`registerWebImageEncoders.ts`).

A native host (Node.js with Sharp, Lime with its own image codec, a C/C++ port) cannot use these. The fix is a `ScratchSurfaceBackend` or an `ImageCodecBackend` that provides pixel-buffer manipulation without DOM:

```typescript
interface ScratchSurfaceBackend {
  createSurface(width: number, height: number): ScratchSurface;
  readPixels(surface: ScratchSurface, out: Uint8ClampedArray): void;
  writePixels(surface: ScratchSurface, data: Uint8ClampedArray): void;
  destroy(surface: ScratchSurface): void;
}
```

### Canvas/element creation in renderers

`render-gl` and `render-wgpu` create `<canvas>` elements directly:
- `glElement.ts` — `document.createElement('canvas')`
- `wgpuElement.ts` — `document.createElement('canvas')`

A native host provides its own rendering surface (Lime's `Window.context`, a native WGPU `Surface`). The renderer initialization path needs a seam where the host provides the surface/context rather than Flight creating a canvas.

For WebGPU specifically, if native WGPU is expected (wgpu-native, Dawn), the device/adapter acquisition path needs to accept a host-provided `GPUDevice` or `GPUSurface` rather than calling `navigator.gpu.requestAdapter()`.

### Socket factory

`socket.ts` directly constructs `new WebSocket()`. A native host needs a socket factory backend:

```typescript
interface SocketBackend {
  createSocket(url: string, protocols?: string[]): SocketHandle;
  send(handle: SocketHandle, data: string | ArrayBuffer): void;
  close(handle: SocketHandle, code?: number, reason?: string): void;
  // ... event attachment
}
```

This is the `socket` package's equivalent of the `NetBackend` seam.

### Input ingress contract

Flight's `input` and `interaction` packages receive pointer, keyboard, and wheel events. On web, these come from DOM `addEventListener`. A native host routes events differently (Lime's event callbacks, SDL events, GLFW callbacks).

The input-ingress contract should define:
- **Pointer identity** — how pointer IDs map between the host's event system and Flight's `pointerId`.
- **Coordinate scaling** — device pixels vs. CSS pixels vs. the host's coordinate space. Who scales?
- **IME composition** — text input composition events for CJK and other input methods.
- **Touch** — touch-specific events vs. pointer events (Flight uses the pointer event model).
- **Gamepads** — how gamepad state is polled or event-driven.
- **Multiple windows** — which window an event targets.

This need not be another global backend — a per-window event adapter may be more appropriate:

```typescript
interface InputIngress {
  dispatchPointerDown(windowId: number, data: PointerEventData): void;
  dispatchPointerMove(windowId: number, data: PointerEventData): void;
  dispatchPointerUp(windowId: number, data: PointerEventData): void;
  dispatchKeyDown(windowId: number, data: KeyboardEventData): void;
  dispatchKeyUp(windowId: number, data: KeyboardEventData): void;
  dispatchWheel(windowId: number, data: WheelEventData): void;
  dispatchTextInput(windowId: number, text: string): void;
}
```

Flight's `dispatchInteraction*` functions in the `interaction` package already have this shape. The gap is formalizing it as a stable contract that a host implements, rather than an internal implementation detail.

---

## What is NOT a defect

Host capability limitations are legitimate, not Flight defects — as long as Flight can represent them truthfully:

- Lime cannot provide rich clipboard formats beyond plain text — that is a Lime limitation, not a Flight bug.
- POSIX file operations unavailable on web — legitimate, reported via sentinel.
- Arbitrary haptic patterns not supported by the browser Vibration API — legitimate.
- Missing audio spatialization on a platform without 3D audio — legitimate.

The requirement is truthful reporting (P1's per-operation availability), not universal implementation.

---

## Relationship to existing work

- **host-web extraction** (in progress) — addresses the "extract web backends from capability packages" portion but does not cover P1 (partial composition), P4 (lifetime), or P5 (bypass elimination). The extraction is a prerequisite for these requirements, not a replacement.
- **host-web architecture record** — defines the precedence model (custom > host > sentinel) and the `explain*Backend` viability model. P1 extends this to per-operation granularity.
- **host-node** (planned in server-side architecture) — the first non-web host. Will exercise these requirements immediately.
- **host-electron / host-tauri / host-capacitor** (existing shells) — partial hosts that already face P1's partial-composition problem. An audit would quantify their sentinel methods.

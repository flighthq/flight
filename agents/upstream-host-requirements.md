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

### Wrappers over partial backends must compose conditionally — ruled 2026-08-28

A wrapper that delegates to another backend — a `host-*` layer over the web default, a decorator that adds
observation or logging — **must carry an operation only when the backend it delegates to carries it.**

```ts
// WRONG — compiles, and re-presents an operation nothing can perform
const backend: MediaSessionBackend = {
  setMetadata(metadata) { inner.setMetadata?.(metadata); },
};

// RIGHT — the wrapper offers what the inner backend actually implements
const backend: Mutable<MediaSessionBackend> = {};
if (inner.setMetadata !== undefined) {
  backend.setMetadata = (metadata) => inner.setMetadata!(metadata);
}
```

★ **Optional-call guards alone are forbidden.** `inner.setMetadata?.(…)` type-checks and looks defensive,
but it gives the wrapper a `setMetadata` that silently does nothing when the inner backend has none. The
wrapper then reports as implementing an operation it cannot perform, so `has*Operation` / `explain*Operation`
**lie through the host layer** — which is precisely the sentinel masquerade the absence-declared interface
exists to remove, reintroduced one level up.

The rule follows from the standing absence-of-an-export ruling: absence is the declaration, and a wrapper
that manufactures presence out of absence has overridden a declaration it does not own.

**How this was found.** Making the four `MediaSessionBackend` operations optional broke four call sites in
`host-web/src/webMediasession.ts`, and the tempting repair was the optional-call guard. It compiles; it is
wrong. `npm run check <package>` did not catch the break at all, because its typecheck gate is
package-scoped and never compiles consumers — **an interface change requires a consumer typecheck**
(`npx tsc --noEmit -p tsconfig.json`, or the consuming package's own project), never a package-scoped one.

### What this is NOT

Legitimate host capability limitations are not defects. Lime cannot provide rich clipboard formats, POSIX file operations, or arbitrary haptic patterns — those are real platform limits. The requirement is that Flight can **represent these limits truthfully**, not that every host implements everything.

---

## P2 — Audio device seam

The installable audio-device seam belongs in `@flighthq/media`, not `@flighthq/audio`. `media` owns channels, mixing, and playback; `audio` owns resources and decoding. The device backend that replaces `AudioContext`/`GainNode`/`AudioBufferSourceNode` is a `media` concern.

`media` needs the same `get*Backend` / `set*Backend` / `enableHostWeb*` treatment as every other capability. The backend interface should cover: source creation, playback control (play/pause/stop/seek), volume, spatial/3D positioning, and stream management. See [AudioDeviceBackend design](audio-device-backend-design.md) for the concrete proposal.

### Audit findings (2026-08-27)

The `@flighthq/audio` package was audited for Application coupling, global state, and direct web API usage:

- **Zero Application coupling.** No import of `@flighthq/application` or `Application` anywhere in `audio/src/`. The package is fully standalone.
- **Caller-owned AudioContext.** Every decode/load function accepts an `AudioContext` parameter; the package never creates or stores one. The native host retains full control of audio device lifecycle.
- **Direct web leak: `new Audio().canPlayType()`** in `audioFormat.ts`. This was the only hard web dependency — a capability probe that native hosts cannot satisfy without a DOM `HTMLAudioElement`.

### Slice implemented: `canPlayType` seam (in `@flighthq/audio`)

The `new Audio()` leak has been moved behind a process-global `AudioBackend` seam:

- `AudioBackend` interface in `@flighthq/types` — single operation: `canPlayType(mimeType: string): boolean`.
- Process-global plumbing in `@flighthq/audio/contract`: `getAudioBackend`, `setAudioBackend`, `installAudioHostBackend`, `explainAudioBackend`, `observeAudioHostResult`, `resetAudioBackendForTest`, `createWebAudioBackend`.
- Three-tier precedence: custom > host > sentinel (sentinel returns `false`).
- `enableHostWebAudio()` in `@flighthq/host-web` creates the web backend (`new Audio().canPlayType()`), wraps with observation, installs into the host slot. Called by the umbrella `enableHostWeb()`.
- `canPlayAudioType()` in `@flighthq/audio` now routes through the backend instead of constructing `new Audio()` directly.

### P2 remains OPEN

The `canPlayType` slice addresses only the direct web leak. The broader audio-device seam — source creation, playback control (play/pause/stop/seek), volume, spatial/3D positioning, and stream management — is specified in the [AudioDeviceBackend design proposal](audio-device-backend-design.md). P2 is not satisfied until a native host can install its own audio playback device.

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

The landed listener-ingress contract defines:

- **Source identity** — one process-global, Application-independent `InputIngressBackend` receives
  exact host-neutral `InputIngressSource` identities for many simultaneous windows/sources.
- **Attachment ownership** — the existing six attach/detach families retain their originating release;
  the canonical lifecycle rule is in `backend-lifecycle-ownership.md`.
- **Pointer identity** — how pointer IDs map between the host's event system and Flight's `pointerId`.
- **Coordinate scaling** — device pixels vs. CSS pixels vs. the host's coordinate space. Who scales?
- **IME composition** — text input composition events for CJK and other input methods.
- **Touch** — touch-specific events vs. pointer events (Flight uses the pointer event model).
- **Gamepads** — how gamepad state is polled or event-driven.
- **Multiple windows** — which window an event targets.

All legacy DOM callers use the broadened host-neutral API; there is no parallel DOM path. The explicit
Web adapter interprets browser identities internally. The remaining gap is the adjacent gamepad
polling/scheduling and pointer lock/capture/coalescing capability set, not listener ingress or
multi-window routing.

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


---

# Manager review — 2026-08-28

Accepted as a requirements record. It is grounded in a real consumer, the bypass sites are cataloged
with file and line rather than asserted, and it separates legitimate platform limits from defects. The
priority order stands. What follows narrows the design space before anyone starts building.

## H1. ★ P1 is mostly a COMPLIANCE problem with a ruling the user already made, not a new design

**Standing user ruling: a host must not implement no-op methods — the ABSENCE OF AN EXPORT IS THE
DECLARATION.** That already answers "how does a host declare partial support": by not providing the
operation. So:

- **"Partial composition" is not a mechanism to invent.** It is what the existing ruling mandates, and
  a `Partial<*Backend>` merged against a sentinel is the shape that follows from it.
- **Per-operation availability is a structural check on the installed backend** — does it provide this
  operation — not a parallel capability bitfield to keep in sync. A bitfield is a second source of truth
  about the same fact, and it will drift from the methods it describes.
- ★ **Option B is REJECTED.** Richer return types (`{ supported: false }`) touch every signature and
  introduce exactly the result-wrapping this SDK does not use: expected failures return sentinels, and
  the diagnostics inversion rule gives every silent sentinel a shakeable `explain*`. Option A, expressed
  as absence, is the answer.

**The 148 sentinel methods are therefore evidence of an existing ruling being violated, not evidence
that a new design is needed.** That reframes P1 from "design a capability system" to "make the codebase
comply, and add the query that makes compliance observable." Much smaller, and it will not be discovered
halfway through.

**Extending `explain*` from backend to operation granularity needs no new ruling** — the diagnostics
inversion rule already requires an `explain*` for every silent sentinel. This is that rule applied one
level down.

## H2. ★ The P3 audit must be a DERIVED GATE, never a documented list

The doc says every site using `fetch`, `XMLHttpRequest`, `new WebSocket()`, `new Image()` or
`new EventSource()` outside a `createWeb*Backend` "should be identified." A list of sites in a record
goes stale the moment someone adds the next one, and nothing reports it — this record already carries a
catalog that will be wrong within a week of the first fix.

Build it as a **check that derives the population at runtime and fails on a new bypass**, naming both
the population it scanned and the exclusions it allowed. Same standard as the scene-document kind
census: hand down the predicate, never the roster. The catalog in P5 is then a snapshot for humans, and
the gate is the thing that stays true.

This is also the highest practical value in the document. A host installs `setNetBackend`, and loaders,
image fetches and sockets still go through browser APIs — **a permissive acceptor with a narrower
consumer and the gap silent.** The seam is only as good as its coverage, and only a gate keeps coverage.

## H3. `net`'s ambient-language classification is wrong, and correcting it is consistent with policy

`net` was left ambient because `fetch` is standard JS. That reasoning holds for a JS runtime and fails
for a native host with its own HTTP stack. Adding an `enableHostWebNet` slot is consistent with the
standing explicit-enabling ruling and with the existing precedence model (custom > host > sentinel).
Reclassify it; no user ruling is needed for a correction that restores the model's own rules.

## H4. ★ P4's lifecycle verb is WRONG and would ship the wrong name

The doc proposes `dispose(backend)` to release "GPU, audio, sockets, native handles." **Those are
`destroy*`, not `dispose*`.** The standing distinction: `dispose*` detaches listeners and clears
registries so an entity becomes GC-eligible — there is nothing to free; `destroy*` immediately frees a
non-GC resource the entity owns, leaving it invalid. A backend holding GPU textures, audio contexts and
open sockets is squarely the second.

Get this right before the contract is written. A teardown verb that ships with the wrong meaning is
corrected in every consumer afterwards, and both verbs already exist with settled meanings.

The rest of P4's lifetime contract is sound: replacement and removal must be explicit and must not leak,
and window ownership must be decided **at attachment time** rather than inferred at close.

## H5. RULED BY THE USER 2026-08-28 — the backend seam is PROCESS-GLOBAL and independent of `Application`

**User ruling:** *"the backend system is separate from the application system. I don't think you need to
create an application in order to have a backend. I suspect backend is within the current process. If
you wanted two things with two backends, they would run separately."*

Three consequences, and they make P4 **smaller**, not larger:

**H5a. The module-scoped `_backend` singleton is the design, not a limitation to engineer around.**
P4 lists "multiple instances" as a gap; it is not one. Two backends means two processes. Nothing in the
host seam needs per-application state, and **`set*Backend` signatures stay exactly as they are** — the
per-application parameter I warned would touch every signature is not happening. Do not build a registry
of backends keyed by application.

**H5b. A backend does not require an `Application`, and this is a capability, not a technicality.**
Host capabilities — `net`, `storage`, `clipboard`, `filesystem`, and the rest — are installable and
usable with no window, no render loop and no `Application` at all. That is what makes them usable from a
server, a CLI, a test harness or a build tool. Anything that makes a backend reachable only through an
`Application` is a defect against this ruling.

**H5c. Multi-window hosts are unaffected.** Electron and desktop hosts running several windows in one
process share **one** backend; it is the backend that is singular, not the windows. A window backend
managing many windows is the normal case, so P4's attachment work proceeds unchanged — attaching an
existing window is a backend operation, never an application-scoped one.

**What survives from P4.** Backend lifetime still matters, now scoped to a single process: replacement
and removal must be explicit and must not leak the GPU textures, audio contexts, native handles and open
sockets the outgoing backend held. Per H4 that teardown verb is **`destroy*`, not `dispose*`**. Window
ownership is still decided at attachment time.


---

# Consumer feedback — flight-hx integration review, 2026-08-28

flight-hx reviewed the current develop tree against its existing Haxe/Lime binding layer (HostLime)
and reported what is immediately usable, what requires workarounds, and what is still missing.

## What works now

**AudioDeviceBackend (P2)** — the 13 operations match HostLime's existing buffered OpenAL
implementation. Usable immediately. However, mixers, buses/pan, decoding, spatial audio, and streaming
are not covered by the 13-op Option A scope; `LimeAudio.hx` must remain for those capabilities until
Option B lands. This confirms the partial-satisfaction framing: a native host CAN install its device
(the core P2 requirement), but playback-without-mixing is real and declared.

**Window attachment (P4)** — the `attach(win, handle, ownership)` seam fits Lime's ownership model.
Ready to use.

**Input ingress (P5)** — keyboard, pointer, relative pointer, text, touch, and wheel are all ready.
HostLime can refactor `LimeInput.hx` around `InputIngressBackend`.

**GL bridge (P5)** — not blocking. HostLime already passes Lime's existing context to
`createGlRenderState`, and that path has working native coverage. A `GlHostBackend` would be
architectural cleanup, not an unblock.

**WGPU acquisition (P5)** — properly abstracted but Lime provides no native WGPU device, so there is
nothing honest for HostLime to install. Correctly a non-issue.

## Gaps confirmed by consumer exercise

### F1. Net and Socket lack `install*HostBackend` slots

`net` and `socket` have `set*Backend` / `get*Backend` (custom slot) but no `install*HostBackend`
function. This means `enableHostLime()` cannot install them at the host precedence layer — it can
only use the custom slot, which overrides rather than layers. Every other capability package has the
host-layer slot. HostLime currently has `LimeNet` but no `LimeSocket` implementation.

**Why it matters:** the precedence model is custom > host > sentinel. Without a host slot, a Lime
backend installed via `setNetBackend` cannot be overridden by a caller's custom backend later —
`setNetBackend` IS the custom slot. The host layer exists precisely for this.

**Fix:** add `installNetHostBackend` and `installSocketHostBackend` in each package, matching the
pattern every other capability uses. Small, mechanical, no design decision needed.

### F2. Native gamepad ingress is incomplete

The ingress sink has no axis/button callbacks. Flight still polls through
`requestAnimationFrame` / `navigator.getGamepads()`. HostLime's explicit Lime gamepad path must
remain.

This was flagged as "adjacent work" in the input-ingress-seam plan and never built. For any native
host with its own gamepad event API (Lime, SDL, GLFW), the polling path is unusable — they push
events, they do not poll a browser API.

**Fix:** extend `InputIngressSink` with gamepad axis/button/connect/disconnect callbacks, and move
the web polling loop into `createWebInputIngressBackend()` so a native host can push events instead.

### F3. WindowBackend's 28 required methods

Only `attach` is optional on `WindowBackend`. The other 28 methods remain required, so HostLime
still needs stubs for every unsupported window operation (`setProgress`, `setContentProtection`,
`setMinimumSize`, etc.).

This is the P1 problem at its most visible: Lime can open, close, resize, and attach windows, but
must implement 28 stubs to install a `WindowBackend` at all.

**Fix:** WindowBackend is the highest-priority P1 migration target. Migrate it to optional methods
with conditional composition (the MediaSession pattern), so HostLime implements only the operations
it genuinely supports.

### F4. AudioDeviceBackend atomicity

All 13 AudioDeviceBackend operations are required at the type level. Should a host be able to
implement, say, playback without `onSourceEnded` or without `setSourcePlaybackRate`?

Given P1's direction (absence-as-declaration), making operations individually optional would be
consistent. However, the 13-op set is small and cohesive — a device that can create and start
sources but not stop them or set gain is arguably not a device. This is a design question.

**Recommendation:** keep all 13 required for now. The set is small enough that a native host
implementing any of them will implement all of them — these are not the 28 window stubs where half
are platform-specific GUI chrome. Revisit if a real host surfaces a case where a subset is honest.

### F5. Operation ratchet floor stale

The P1 operation ratchet's derived count is 13 (including AudioDeviceBackend), but the committed
minimum floor is still 12. The floor should advance to match.

**Fix:** mechanical — update the ratchet floor. One line.

### F6. Interface count discrepancy

flight-hx counts 46 backend interface shapes on current develop; 13 expose per-operation explain/has
APIs and 33 do not. The doc quotes 42 interfaces. The discrepancy may be new interfaces added since
the original audit (AudioDeviceBackend, InputIngressBackend, WgpuHostBackend, possibly others).

**Fix:** re-derive the count from current develop. The ratchet gate already does this — check whether
its denominator matches 46.

## flight-hx integration order

flight-hx will proceed:

1. Regenerate against the exact develop SHA and handle generator/type-contract changes.
2. Add AudioDeviceBackend while retaining LimeAudio for decoding/mixers.
3. Move non-gamepad input through InputIngressBackend.
4. Add host-owned window attachment.
5. Preserve the current GL bridge.
6. Treat Net/Socket registration as provisional until host installation slots land.

## Actionable items for Flight (prioritized)

1. **F1** — add `installNetHostBackend` / `installSocketHostBackend` (small, mechanical, unblocks
   proper host-layer precedence for HostLime)
2. **F3** — migrate WindowBackend to optional methods with conditional composition (P1 highest-value
   target — 28 stubs is the largest consumer pain point)
3. **F2** — extend gamepad ingress with axis/button callbacks and move web polling into the web
   backend
4. **F5** — advance ratchet floor from 12 to 13 (mechanical)
5. **F6** — reconcile interface denominator (42 vs 46, re-derive)
6. **F4** — AudioDevice atomicity: decide and document (recommendation: keep 13 required)
7. **GL host seam** — add `GlHostBackend` for caller-owned GL context (cleanup, not blocking)

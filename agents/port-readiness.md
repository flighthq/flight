# Port-readiness roadmap (DRAFT)

> **Unblessed design draft.** Records the JS-isms that bite non-JS ports (Haxe/Lime today,
> Rust/C++ later), Flight's stance on each, and the rule a mechanical converter keys off.
> Priorities and reference counts come from the downstream Lime port's generated-code analysis.

## Why this exists

Flight is written for a future C/C++ port and a mechanical TS→Haxe conversion. Most of the SDK
is already port-conscious by design (free functions over methods, string kinds over `Symbol`,
sentinels over throw, the `*Backend` seam pattern, the `create`/`dispose`/`destroy`/`acquire`/
`release` ownership vocabulary). This doc tracks the JS-isms that still need a decision, so the
port maps them predictably instead of guessing.

## Stance taxonomy

- **abstracted** — hidden behind a Flight contract/seam; the port swaps the implementation.
- **disciplined** — can't be removed (GC, typing); made *explicit* so the port can map it.
- **open** — needs a convention the port keys off; not yet pinned.
- **port-side** — fixed in the port repo (`flighthq` Haxe/`_internal`), not this monorepo.

## Priorities (Lime port data)

| # | JS concept | Stance | Flight target | Notes |
|---|---|---|---|---|
| 1 | `ArrayBuffer`, typed arrays, `DataView` | **open → new abstraction** | byte-buffer boundary type + "all binary is ArrayBuffer-backed views" rule | Highest volume: Float32Array 161, Uint8Array 56, Uint32Array 46, U8Clamped 20, DataView 13. Unlocks scene-formats, surface/image, GPU upload, Lime DataPointer interop. **Decision open** (below). |
| 2 | `fetch`, `AbortController` | **abstracted (mostly done)** + new | `NetBackend` (exists) + portable `CancelToken`/`CancelSource` | scene-resources already calls `sendNetRequest`, not `fetch`. Cancellation is new and **converges with the Future charter**. |
| 3 | `setTimeout/Interval`, `requestAnimationFrame`, `performance.now` | **abstracted — consolidate** | one scheduler/clock seam owning the Future continuation queue | `clock` + `LoopBackend` exist. Frame scheduling should come from `Application.update/render`, not simulated rAF. |
| 4 | `Map`, `Set`, `WeakMap`, `WeakSet` | **open — audit** | portable identity collections + explicit weak policy | Map 156, **WeakMap 142**, Set 60. Runtime-slot design *should* minimize WeakMaps — audit where they leaked; move to runtime slots where possible, else document retention + strong fallback. |
| 5 | `TextEncoder/Decoder`, `atob/btoa` | **abstracted (small)** | encoding/base64 boundary utilities | Small; boundary-only (image/font/net). |
| 6 | `structuredClone` | **abstracted — localized** | explicit deep-clone utility | Lives in `snapshot`. Port swaps the mechanism (`derive(Clone)`), does not replicate. |
| 7 | `number`, `parseFloat/Int`, `Date` | **open (low volume) / abstracted** | int/float/signedness convention; `Date` behind clock | `number` erases int/float/signed — port can't infer. Convention or branded types (`Rgba`, `JointIndex`) at boundaries. Lower volume than 1/4 but silent. |

## The one genuinely-new foundational abstraction: byte buffers

TS typed arrays are already the closest JS thing to native buffers, so the fix is **not** to wrap
them everywhere (that would tax the mesh/GPU hot paths). It is:

1. a **consistency rule** — all binary data is ArrayBuffer-backed typed views, never `number[]`; and
2. a clear **byte-buffer boundary type** at the seams where raw bytes flow — parsing
   (`scene-formats`), pixels (`surface` / `image-codec`), GPU upload (`render-gl` / `render-wgpu`).

That gives the port *one* thing to back with `haxe.io.Bytes` / Lime buffers (and native GL /
DataPointer interop) instead of mapping five typed-array types onto Haxe arrays. The port already
has partial shims (`_internal/_Float32Array.hx`) that currently fall back to plain Haxe arrays —
efficient enough for calculation, but not for parsing, GPU upload, or DataPointer interop.

**Decision open:** thin `ByteBuffer` value type at the boundaries, vs consistency-rule-only plus a
documented "back this with `haxe.io.Bytes`" note. This determines how invasive #1 is.

## What stays host-specific (agrees with the port analysis)

These are **not** made universally portable — they remain capability backends with availability
checks (the platform suite already works this way; web backends return sentinels):

`window` / `document` / `navigator`, Canvas2D, WebGPU, clipboard/notifications, browser media
elements, Electron/Tauri/Capacitor modules, dynamic imports. WebGL already models this correctly —
HTML5 uses WebGL externs, native Lime gets a Lime-specific graphics route.

## TS-side vs port-side

The fix lands in two repos:

- **This monorepo (TS SDK):** provides the *abstraction surface* — byte-buffer boundary type,
  `CancelToken`, `Future`, the consolidated scheduler seam, the collection/number conventions.
- **Port repo (Haxe/Lime `_internal`):** provides the *native backing* — `Bytes`-backed typed-view
  shims, `_Map`/`_Set` routing, `_Runtime`. **Port-side-only** items include the `setInterval`
  bug (non-JS `setInterval` uses `haxe.Timer.delay`, so it fires once instead of repeating).

## The minimal portable foundation

Per the port analysis, a native Lime scene stack needs: **Future** + **byte buffers & typed views**
+ **scheduler/clock** + **cancellation** + **Lime NetBackend** + **Lime image decoder** + **native
GL buffer adapter**. On the TS side this is mostly *seam-completion* plus **two new abstractions
(byte-buffer, cancellation-token)** — Future is already designed, and the net/image-codec/loop
seams already exist.

## Sequencing

1. **Foundational, parallel:** byte-buffer (#1) and Future (with cancellation folded in, #2).
2. **Then:** scheduler/clock consolidation (#3) — Future's continuation queue depends on it.
3. **Then:** the WeakMap/collection audit (#4).
4. **Then:** the utilities (#5–#7) as they surface.

## Ties

- `agents/packages/future/charter.md` — the Future contract (entry item; shares cancellation).
- `import-diagnostics` charter — the never-throw / sentinel-reason model the Future's `T | null`
  relies on; async + progress + failure-reason converge at the I/O boundary.

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

## Friction budget: bend the converter, not the SDK

The **authoritative environment is the TS SDK**. Portability work must not casually degrade it into
a less idiomatic API to serve a downstream consumer. The default is: **make the converter/runtime
bridge the JS-ism; reshape the TS only where the converter fundamentally can't** — which is rarer
than it looks. Lime already mimics HTML5 typed arrays; `await`→`flatMap` is a standard CPS
transform a converter can do; `Map`/`Set` map trivially to Haxe collections.

Decision rule, per JS-ism:

1. **Can the converter/runtime bridge it?** → do it there. Zero TS friction. (The default answer.)
2. **If not** — is a TS-side seam *net-positive/neutral* (improves or barely changes the TS), or
   *pure tax with real friction*?
   - **net-positive/neutral + isolated at a boundary** → worth a TS seam.
   - **pure tax + pervasive** (touches *all* async / *all* binary code) → push to the converter;
     do **not** reshape the SDK-wide.

The line that falls out: **isolated boundary seams are cheap and often net-positive; pervasive
reshapes are expensive and belong in the converter.**

Friction map of the candidates:

- **Net-positive / neutral — do:** diagnostics (structured crumbs *improved* the code over prose
  *and* shrank the bundle), `cancel` (a token is cleaner than threading `AbortSignal` by hand),
  `Future` as a named *thenable* type (rename + boundary hygiene; consumers keep `await`).
- **High friction, separable — reconsider:** the **`await`-ban**. Only justified if the converter
  *cannot* do `await`→`flatMap`. Ask the converter team first; if it can, **skip the ban** and keep
  linear async in the TS — that removes nearly all the friction. If it can't, apply it only in the
  narrowest orchestration hotspots, never SDK-wide.
- **Port-only, no current benefit — defer:** `bytes`. Lime already handles typed arrays, so it buys
  the current port nothing; commission it when a Rust port makes the need concrete (Rust
  `Index`/`IndexMut` may keep it converter-side anyway).

Model to copy: the diagnostics charter — a boundary abstraction that improved the TS and shrank the
bundle. Anti-model: a pervasive `await`-ban that turns linear async into combinator soup for no
unique gain.

## The unified seam: `_internal.backend.*`

The "abstracted" items below are **not** separate one-off wrappers — they share one mechanism.
The downstream port already references a `flighthq._internal.backend.*` package of "expected
feature" classes (`WebGLRenderContext`, etc.) that the generated code targets, with the
platform-conditional implementations kept *outside* the generated classes. Every abstracted item
here lands as a member of that seam family: render context, **byte buffers**, net, image decode,
scheduler, cancellation. A port implements the seam; the generated/portable code never sees the
platform branch.

The rule for what goes *in* each seam is **minimal-by-usage**: expose only the operations Flight
actually calls, so a port (Haxe today, Rust later) implements a bounded surface instead of an
entire browser API. Web backings are the native APIs themselves (typed arrays, `fetch`, WebGL
externs), so JS pays nothing.

## Priorities (Lime port data)

| # | JS concept | Stance | Flight target | Notes |
|---|---|---|---|---|
| 1 | `ArrayBuffer`, typed arrays, `DataView` | **abstracted — seam by usage** | a minimal byte-buffer seam (only the ops Flight uses), backed by native typed arrays on web | Highest volume: Float32Array 161, Uint8Array 56, Uint32Array 46, U8Clamped 20, DataView 13. Unlocks scene-formats, surface/image, GPU upload, Lime DataPointer interop. **Resolved: seam by usage** (below). |
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
   (`scene-formats`), pixels (`bitmap` / `image-codec`), GPU upload (`render-gl` / `render-wgpu`).

That gives the port *one* thing to back with `haxe.io.Bytes` / Lime buffers (and native GL /
DataPointer interop) instead of mapping five typed-array types onto Haxe arrays. The port already
has partial shims (`_internal/_Float32Array.hx`) that currently fall back to plain Haxe arrays —
efficient enough for calculation, but not for parsing, GPU upload, or DataPointer interop.

**Resolved: a seam defined by usage, not by the full API.** Lime *can* mimic the entire HTML5
typed-array surface, but a mechanical Rust port should not have to reimplement the whole spec to
satisfy the SDK. So the seam exposes **only the operations Flight actually uses** — each port
implements that bounded set (~a dozen-and-a-half ops), not the full typed-array API. This is the
same `flighthq._internal.backend.*` "expected feature" pattern already used for host features like
`WebGLRenderContext`: platform conditionals live outside the generated classes, which reference
the abstract seam.

Design properties:

- **Seam by usage.** First task is a *usage audit*: enumerate Flight's real typed-array/`DataView`
  surface (create buffer / create views, indexed get+set, `length`, `subarray`/`set`, and
  offset-read/write-with-endianness for parsing) → that list *is* the seam. Nothing more.
- **Indexable, so ergonomics survive.** The seam views keep `view[i]` (Haxe `@:arrayAccess`, Rust
  `Index`/`IndexMut`, Lime's HTML5-compatible arrays) — no rewrite to `read(buf, i)` calls, and no
  hot-path function-call overhead.
- **Zero-cost on web.** The web backing *is* native typed arrays; the seam is a thin typed
  interface they satisfy structurally, so JS pays nothing.
- **The discipline:** portable Flight code goes through the seam **factories** (create/view) rather
  than `new Float32Array(...)` directly, so the port controls the backing. Direct global
  typed-array references move behind the seam or into the web-backend leaf.

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

## Package shape

Two kinds of seam, which get different package shapes:

- **Runtime seams** — the host provides/registers the implementation, possibly swapped at runtime:
  full `get*Backend`/`set*Backend`/`register*`/`createWeb*Backend` surface. `net`, `image-codec`,
  the platform suite. A native host genuinely supplies HTTP / decoders / dialogs.
- **Port-time seams** — exactly one implementation per build; the *port* substitutes the module
  (`_internal.backend.*`), no runtime choice, **no `set*Backend`**. On JS these are thin functions
  straight over the native API (zero indirection). `bytes`, `cancel`, most of `future`, encoding.

`@flighthq/bytes` (the worked example) is port-time: types (`Bytes`, view interfaces) in
`@flighthq/types`; the package is thin functions only — `createBytes`, `viewFloat32`/u8/u16/u32/…,
`readFloat32(bytes, off, le)` / `writeFloat32` (the `DataView` parse ops), `subarrayBytes`,
`setBytes`, `byteLength`. Views stay indexable (`view[i]`). On JS the functions inline to native
typed arrays (zero cost); the port replaces the module with `Bytes`-backed impls. No runtime
backend object — the seam *is* the function surface. (Named `bytes`, not `buffer`, which is
overloaded by GPU/vertex buffers.)

| Package | Kind | Shape | Depends on |
|---|---|---|---|
| `@flighthq/bytes` | port-time | thin fns, no backend object | `types` |
| `@flighthq/cancel` | port-time | `CancelToken`/`CancelSource`, tiny | `types` |
| `@flighthq/future` | port-time | `Future`/`Deferred` + combinators | `cancel` (+ scheduler) |
| `@flighthq/scheduler` | mixed | timer/rAF/microtask/`now`; `clock`+`future` consume it | `types` (audit) |
| `@flighthq/encoding` | port-time | base64 / UTF-8 byte↔string | `bytes` |
| `@flighthq/net` (exists) | runtime | already `*Backend`; add cancellation | `future`, `cancel`, `bytes` |
| `@flighthq/image-codec` (exists) | runtime | already the decode seam | `future`, `bytes` |

`cancel` is its own package (not folded into `future`) so `net` can cancel without importing the
async layer. `bytes` + `cancel` are the new bedrock leaves; `bytes` becomes the widest new
foundational dependency (`scene-formats`, `bitmap`, `mesh`, `render-*` all gain it) — appropriate
for the binary bedrock.

## The minimal portable foundation

Per the port analysis, a native Lime scene stack needs: **Future** + **byte buffers & typed views**
+ **scheduler/clock** + **cancellation** + **Lime NetBackend** + **Lime image decoder** + **native
GL buffer adapter**. On the TS side this is mostly *seam-completion* plus **two new abstractions
(byte-buffer, cancellation-token)** — Future is already designed, and the net/image-codec/loop
seams already exist.

## Commissioning order (selective — per the friction budget)

This is **not** a mandate to build the whole list into the TS. Commission only what earns its
friction; push the rest to the converter.

1. **Now — cheap / net-positive, boundary-isolated:** finish diagnostics (in flight); add `cancel`;
   introduce `Future` as a named *thenable* type — **without** the `await`-ban.
2. **Gate on the converter:** the `await`-ban — commission only if the converter can't do
   `await`→`flatMap`. Confirm before touching orchestration code.
3. **Opportunistic — low stakes:** scheduler/clock consolidation (#3), encoding (#5). Do when a
   consumer needs them, not speculatively.
4. **Defer — port-driven, no current benefit:** `bytes` (#1) until a Rust port makes it concrete;
   the WeakMap/collection audit (#4) as a cleanup pass; the `number` int/float convention (#7) as a
   documentation task.

The roadmap's value is a **map of the landmines plus this decision rule**, not a build order for
all of it. Most items belong in the converter/runtime; the TS-side subset is the small,
boundary-isolated, net-positive slice.

## Ties

- `agents/packages/future/charter.md` — the Future contract (entry item; shares cancellation).
- `import-diagnostics` charter — the never-throw / sentinel-reason model the Future's `T | null`
  relies on; async + progress + failure-reason converge at the I/O boundary.

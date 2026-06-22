# Flight Rust Port

This is the map for the Rust port of the Flight SDK (the `rust` worktree). The TypeScript packages under `packages/` are the **authoritative** specification; the Rust crates under `crates/` are an implementation that **conforms** to them. Read this once at the start of a Rust session, then revisit the section a task touches.

The TS [codebase map](../index.md) still applies — it defines the feature target, the package boundaries, and the API philosophy (plain data over runtime objects, free functions over methods, explicit allocation, `*Kind` symbols, entity/runtime split). This document covers only what is specific to the Rust port: how TS maps to Rust, the decisions that have no TS equivalent, and the vocabulary for testing the port against upstream.

## Intent

The goal is **1:1 conformance**: the Rust crates compose into a complete, drop-in replacement for the TS packages. Rust is a genuine production target — native-first (winit, SDL, headless), with a wasm/web build as well. Whether any of it is published to NPM is a separate, downstream decision and does not change the conformance goal.

The wasm/web path deserves a specific note: its **primary** role is a quality instrument — it lets the upstream TS browser test harness compare a TS render against a Rust render in the same page. People _can_ deploy the wasm build to the web, but that is not its reason to exist; native is the production story the port is built around. Do not optimize the authoritative type seams in `flighthq-types` for wasm's benefit (see the async/`Send` note under [Host layer](#host-layer)).

## Vocabulary: parity, conformance, mixing

These three were one overloaded word ("parity") and are now kept distinct:

- **Parity** is an _instrument_ — a matrix differ that runs several environments in parallel and reports where they disagree. The cells are `impl × backend`. See [parity](parity.md).
- **Conformance** is a _property_ — "the Rust crates match upstream TS." Parity runs are one of the tools that measure it, alongside assertion-ported unit tests. The intentional TS↔Rust divergences live in a committed, auditable map. See [conformance](conformance.md).
- **Mixing** is using a single Rust crate (compiled to wasm) as a drop-in inside an otherwise-TS app — e.g. a future `surface-rs` NPM package. This is only viable for **value-typed leaf crates** whose package seam is plain data; it is impossible for the stateful graph crates. See [Mixing](#mixing).

"Backend parity" (the TS backends agree with each other) and "Rust↔TS conformance" are not different tools — they are different _selections of cells_ in the same parity matrix. The kind of comparison is decided by which cells you pick.

## Workspace shape

A root Cargo workspace (`Cargo.toml` + `crates/flighthq-*`). Each crate is named `flighthq-<name>` and ports the TS package of the same `<name>`, except for the renames and the Rust-only / TS-only sets recorded in the [conformance map](conformance.md#conformance-map). Native-first/headless is the target, not a wasm mirror of TS.

## TS → Rust mapping rules

- **Package → crate.** TS `@flighthq/<name>` → Rust `flighthq-<name>`, identity unless renamed in the conformance map.
- **Names keep their full, unabbreviated type words.** `getDisplayObjectBounds` → `get_display_object_bounds`. camelCase → snake_case; the type word is never abbreviated (same rule as TS).
- **Free functions over methods**, matching the TS design and the C/C++ portability goal. Functions are the default unit.
- **Out-parameters** are `&mut` / an explicit `out` argument, mirroring the TS `out`/`target` convention. Out-functions must be alias-safe (read inputs into locals before writing).
- **`Readonly<T>` → `&T` / `&` borrows.** Default to immutable borrows; opt into `&mut` only where mutation is deliberate. This is the same "const by default" intent as the TS `Readonly<>` rule.
- **Teardown verbs are preserved:** `dispose_*` (detach/release-to-GC), `destroy_*` (free a non-GC resource now — GPU textures, native handles), `acquire_*`/`release_*` (pool brackets). Same meanings as TS.
- **Sentinels vs panics:** return `Option`/`bool`/`-1` for expected failure (missing lookups, invalid input); `panic!`/`unreachable!` only for programmer error that correct code cannot reach. Matches the TS "return sentinel, throw only on misuse" rule.

## Decisions with no TS equivalent

These are Rust-port-specific and locked in:

- **Scene graph: slotmap arena.** `NodeId`, `NodeArena<T>`, and free functions over `(&mut NodeArena<T>, NodeId)`. No `Rc`/`RefCell`, no raw pointers. This is the Rust expression of the TS entity/runtime hierarchy.
- **`KindId`: a `u64` newtype.** `KindId::of::<T>()` (hashes `TypeId`) for compile-time kinds; `KindId::new()` (an `AtomicU64`) for runtime kinds. The renderer registry is `HashMap<KindId, _>`; insert replaces. This is the Rust form of the TS `*Kind` `Symbol()`.
- **Signals: `Signal<T>` parameterized by payload** (not by a function type). The internal callback is `Arc<dyn Fn(&T) + Send + Sync>`; one generic `emit_signal(&Signal<T>, &T)`; `()` payload for bare notifications, named payload structs for built-ins. Lives in `flighthq-signals`, re-exported from `flighthq-types`.
- **Color convention: sRGB pass-through.** Targets are non-sRGB `Rgba8Unorm`; packed `0xRRGGBBAA` maps 1:1 with no gamma conversion, matching the TS renderers (RGBA8 non-sRGB, premultiplied alpha). Hosts prefer a non-sRGB surface format. Linear-internal was rejected — it would break cross-backend and Rust↔TS conformance for ~zero perceptible gain.
- **Renderer scope: GPU + portable software** (see [renderer taxonomy](#renderer-scope-gpu--portable-software) below). There is no Canvas2D or DOM renderer in Rust — their substrate (the Canvas2D context, the DOM tree) does not exist in the box, and building them would be an emulator. The software-render capability is instead provided by `render-skia`. Decided by the [crate existence rule](conformance.md#the-crate-existence-rule).

## Renderer scope: GPU + portable software

> **Naming follows the upstream refactor.** A render-package reorg is landing upstream toward a `<subject>-<backend>` convention (e.g. `render-canvas → displayobject-canvas`). The Rust crate names below are **provisional working names**; when the refactor merges, the renderer crates are renamed to match the upstream subjects — `render-gl → displayobject-gl`, `render-wgpu → displayobject-wgpu`, and the software renderer as `displayobject-skia` — and the [rename table](conformance.md#renames) becomes the authoritative mapping. Treat `render-*` here as "the renderer for the corresponding upstream subject/backend."

Renderers are named by implementation technology (like `render-gl` / `render-wgpu`, never `render-gpu`), and fall in three tiers:

| Tier | Crates | Runs |
| --- | --- | --- |
| Portable GPU | `render-gl` (glow), `render-wgpu` (wgpu) | native + wasm |
| Portable software | `render-skia` (tiny-skia); optional `render-cairo` | native + wasm — rasterizes into a `flighthq-surface` buffer; on the web, one `putImageData`/frame, no per-primitive boundary crossings |
| Host-web only (browser-API-bound) | `render-canvas`, `render-dom` | TS/JS in `host-web`; **not** Rust crates |

`render-skia` is the in-box software-render path — the "Cairo 2.0" that restores software-render parity without emulating Canvas2D. Its `Pixmap` layout matches `flighthq-surface`'s RGBA buffer 1:1, so capture reads it with no GPU readback, and its output is **bit-deterministic across machines** — making it the conformance _reference_ the GPU backends are checked against, and the universal web no-GPU fallback. tiny-skia shares Skia's raster heritage with Chrome's Canvas2D, giving `rust:skia ~ ts:canvas` the best shot at structural conformance. CPU filters/effects reuse the existing `surface-filters` / `effects` / `filters` crates — no `filters-skia` / `effects-skia` needed; only shape/path/text rasterization goes through Skia.

`render-canvas` (Canvas2D, immediate-mode) and `render-dom` (DOM elements) are **not** ported: their substrate does not exist in the box (see the [existence rule](conformance.md#the-crate-existence-rule)). DOM rendering is never worth wasm (pure DOM management, no compute to accelerate, and a wasm version is strictly worse). A browser-Canvas2D path, if ever wanted, is a `host-web` JS concern (command-buffer + shim), and is largely obviated by `render-skia` + `putImageData`.

## Text

Text is a layered stack — itemize/bidi → **shape** → **layout** → **rasterize** — and the layers live in different places: Flight owns **layout** (`flighthq-text-layout`), shaping is a **first-class registerable seam** (`text-shaping`), and glyph **rasterization is shared with shape rendering** (tiny-skia). Correct text requires a full-glyph shaper (HarfBuzz / rustybuzz); without GSUB/GPOS, Arabic/Indic/etc. are broken and even Latin loses kerning and ligatures. The canonical native stack is a 1:1 port of the classic harfbuzz + cairo stack: **rustybuzz** (shape) + **ttf-parser** (font) + **tiny-skia** (raster) + **unicode-bidi** (itemize). The full design — the shaper seam, the two shaper tiers and how they pair with render backends, per-environment shapers, and the conformance posture — is in [text](text.md).

## Host layer

Same backend-seam pattern as TS: a `*Backend` trait in `flighthq-types` plus `set_*_backend`. The one flip from TS: TS's ambient default backend is web; Rust's ambient default is native/std. Capabilities that std can serve ship a **native default backend in-crate**, gated behind a `native` cargo feature (off for wasm): `filesystem` (`std::fs`), `storage` (file KV), `shell`, `device`/`platform`, `clipboard` (optional). These need no host.

`host-*` crates are the runtime-coupled, non-tree-shakable adapters that own the event loop / window / GPU surface / OS-GUI and raw input:

- **`flighthq-host-winit`** — winit + wgpu. Primary; the native production host.
- **`flighthq-host-sdl`** — SDL2 + wgpu. The alternative host; validates the seam is not winit-shaped.
- **`flighthq-host-web`** — wasm: canvas + wgpu surface, DOM input, and the web `*Backend` fills. Primarily the conformance instrument (see [Intent](#intent)).
- **`flighthq-capture`** — headless offscreen wgpu → PNG / fingerprint. The native conformance gate; needs no window and no browser.

All four drive the same `render-wgpu`. The render present seam is `set_wgpu_frame_target_view` (point the frame's color attachment at the surface/offscreen view, then `render_wgpu_background` → draw walk → `submit_wgpu_render_pass` → present) — the same code path in every host.

**Async/`Send` seam note.** Some `flighthq-types` backend traits return `Send` futures. Browser `JsFuture` / OPFS handles are `!Send` (single-threaded wasm). Resolve this in favor of the **native production** path: keep the seam native-clean (sync where native is sync) and let `host-web` bridge to `!Send` internally (thread-local executor or a wasm-local relaxation) — never contort the authoritative seam for the wasm instrument.

## Examples and functional-test source

Cargo prefers crate-local source, so the Rust port does **not** mirror the TS top-level `examples/` + `tests/functional/<name>/` layout, and does not co-locate Rust files next to the TS scenes (that fights both toolchains).

- **`flighthq-examples`** (to be built) — host-agnostic example _apps_. An example is a `build_scene` + frame-callback over a common run abstraction, so the same source runs windowed (winit/SDL), headless (`flighthq-capture`), or in the browser probe (`host-web`). This is the Rust analogue of TS `examples/` and the seam that makes "run an app manually" and "capture it for conformance" the same object.
- **`flighthq-functional`** — the home for conformance _scenes_ (the Rust analogue of `tests/functional/`).
- **Pair by name, not by location.** Rust scene `effect_grayscale` ↔ TS `tests/functional/effect-grayscale`, enforced by the conformance checker and recorded in the conformance map.

## Mixing

Mixing a Rust-backed crate into an otherwise-TS app crosses the JS↔wasm boundary at a _package seam_. That works only when the seam is **plain data** — which Flight's design already mandates (packed RGBA ints, value types, out-params, no wrapper objects or hidden runtime state). The architectural line:

- **Mixable (value-in / value-out leaves):** `surface` (operates on `ImageSource` pixel buffers — flat typed arrays, the ideal near-zero-copy boundary), `geometry` math, `path` tessellation, `filters`/`effects` as data descriptors, color/material math. A `surface-rs` NPM package would be the Rust `surface` crate → wasm, wrapped in a shim matching `@flighthq/surface`'s exported signatures. The conformance suite is what proves the shim is a faithful drop-in.
- **All-or-nothing (entity / runtime / graph):** `node`, `displayobject`, `sprite`, `render*`. These carry runtime identity and a shared object graph; you cannot split the scene graph across the boundary. These only make sense as part of a full Rust runtime.

The mixable set is also the best _first_ conformance target: deterministic, no GPU, headlessly fingerprint-able.

## Pointers

- [parity](parity.md) — the matrix differ: cells, runners, flags, comparison strategies.
- [conformance](conformance.md) — the conformance property, the bar, and the auditable divergence map.
- [text](text.md) — the text stack: the shaper seam, layout ownership, the rustybuzz + tiny-skia stack, and text conformance.
- [TS codebase map](../index.md) — the authoritative feature target and API philosophy.

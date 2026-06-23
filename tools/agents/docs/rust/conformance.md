# Conformance — Rust matches upstream TS

Conformance is a **property**, not a tool: the Rust crates faithfully implement the authoritative TS packages, such that they compose into a drop-in replacement. The TS packages are the specification; Rust is the implementation under test.

## The bar: behavior, not name-match

Because Rust is a production target (see [intent](index.md#intent)), conformance means **the behavior and the rendered output match**, not merely that a Rust test exists.

- **Floor — coverage.** Every TS exported function has a Rust test that exercises the corresponding function. This is what `scripts/parity.ts` tracks today by name-match (a Rust test whose name contains the snake*case function token). It proves a test \_mentions* the symbol, not that it agrees with TS. Useful as a tracker; insufficient as a gate.
- **Definition of done — assertion + visual.** The Rust unit test ports the TS test's _assertions_ (same inputs, same expected outputs), and the rendered output matches TS within the declared [parity](parity.md) tolerance for the relevant `gl` / `wgpu` cells. Name-match parity reaching 100% is not conformance; it is the point at which the real conformance work (porting assertions, closing visual diffs) is fully scoped.

## How conformance is measured

- **Unit conformance** — assertion-ported colocated tests, run with `cargo test -p <crate>`. One test file per source file, `describe`-equivalent order mirroring exports, same as the TS convention.
- **Visual conformance** — the [parity](parity.md) matrix's conformance-pairing strategy at the `gl` and `wgpu` cells: `flighthq-functional` (native, fingerprint vs stored TS baselines) and, where a web-only surface requires it, the browser parity runner (`ts:X ~ rwasm:X` in one page).
- **Coverage tracking** — `scripts/parity.ts` name-match accounting, reported per package with the gap list.

## Conformance map

The intentional TS↔Rust divergences. This is the auditable registry of what "1:1" deliberately is _not_ — every entry is a reviewed decision with a rationale, not drift. It currently lives as hardcoded sets in `scripts/parity.ts`; it should be promoted to a committed machine-readable manifest that both this doc and the tooling read. Until then, this table and `parity.ts` must be kept in sync.

### Renames (Rust catching up to the landed refactor)

The upstream render reorg **landed 2026-06-22** and changed the baseline:

- It adopted the `-gl` / `-wgpu` suffixes **natively**, so the former `-webgl`→`-gl` / `-webgpu`→`-wgpu` divergence is **gone** — TS and Rust now share backend suffixes. `render-gl`/`render-wgpu`, `filters-gl`/`filters-wgpu`, `effects-gl`/`effects-wgpu` map by identical name.
- It **split** the monolithic renderers (see [The render layering](#the-render-layering)): `render-gl`/`render-wgpu` are now subject-agnostic backend **cores**, and the per-subject leaf renderers moved to `displayobject-<backend>` and `scene-<backend>`.

Rust crates that must be renamed to match the new authoritative names:

| Current Rust crate | New name (TS authoritative) | Reason |
| --- | --- | --- |
| `world` | `scene` | TS renamed `world` → `scene` — the 3D scene graph. Drags in the 3D pipeline (`mesh`, `lighting`, `texture`, `camera`, `scene-gl`, `scene-wgpu`). |

Semantic trap (not a Rust rename — Rust had neither): TS's old `camera` (photo capture) is now **`webcam`**; the new **`camera`** package is the **3D camera** (projections / view-projection). Both now exist as crates — `webcam` as a platform seam, `camera` as a 3D-pipeline crate. Do not conflate.

Every other crate now maps by identical name (modulo the [excluded](#excluded--no-substrate-in-the-box) and [Rust-only](#rust-only-no-ts-counterpart) sets). Keep this section the single source of truth; `scripts/parity.ts` should read it, not hardcode it.

### The render layering

The refactor separates rendering into three layers; the Rust crates mirror it:

- **`render`** — backend-agnostic core: renderer registration, render state/queue, render-node data, the update pipeline, and the **backend draw contracts**.
- **`render-gl` / `render-wgpu`** — backend **cores**: render state, targets, shaders, draw, fullscreen/surface passes. Subject-agnostic GPU plumbing. (Rust's current `render-gl`/`render-wgpu` are monolithic and must be split so the leaf renderers move out.)
- **`displayobject-<backend>` / `scene-<backend>`** — per-subject **leaf renderers** that use a core. `displayobject-gl`/`displayobject-wgpu` draw the 2D leaves (bitmap, shape, sprite, text, tilemap, particles); `scene-gl`/`scene-wgpu` draw the 3D scene. `displayobject-canvas`/`displayobject-dom` are the browser-substrate backends — [excluded](#excluded--no-substrate-in-the-box); `displayobject-skia` is the Rust software backend.

### The crate existence rule

A TS package gets a Rust crate **iff its substrate exists in the box** — the native/portable Rust runtime. Two parts, both load-bearing:

- **Exclude only what has no substrate in the box.** The DOM tree, the Canvas2D context, and the Electron main process do not exist natively; a Rust crate for them would be an _emulator / compatibility shim_, which the port deliberately does not build. A package is excluded only when (a) its substrate is a browser/JS-host construct absent from the box, **and** (b) excluding it leaves no capability gap — either an in-box equivalent covers it, or it is genuinely N/A.
- **Engineering effort is never a reason to exclude a crate.** If the substrate exists in the box, the crate exists, however much work it is. Every missing-vs-TS crate is permanent cognitive load ("does this exist in Rust or only TS?"), which outweighs any effort saved.

The reconciling distinction: **a seam-with-sentinel is not an emulator.** A capability crate that exposes the real `*Backend` seam and returns a sentinel until a host fills it (the pattern `clipboard` / `dialog` / `screen` already use) is the genuine API awaiting a backend — included. Faking an absent substrate is an emulator — excluded.

### Excluded — no substrate in the box

These are the _only_ TS packages without a Rust crate. Each is excluded by the existence rule, and each leaves no capability gap.

| TS package | Substrate absent from the box | Capability gap? |
| --- | --- | --- |
| `displayobject-canvas` | the Canvas2D context (a browser API) | None — software rendering is covered by `displayobject-skia`. |
| `displayobject-dom` | the DOM tree | None — genuinely N/A; there is no DOM in the box to render to. |
| `filters-canvas`, `effects-canvas` | Canvas2D / CSS-filter strings | None — CPU filters/effects are covered by `surface-filters` / `effects` / `filters`. |
| `host-electron` | the Electron main process | None — every capability it backed exists as its own Rust crate seam; Rust hosts are `host-winit` / `host-sdl` / `host-web`. |

Everything else in the TS package set has a Rust crate. In particular `webcam`, `geolocation`, `haptics`, `share`, and `statusbar` are **in scope** (real device capabilities with a substrate in the box) and must exist as seam-plus-sentinel crates like the rest of the platform suite — they were previously dropped on effort grounds, which the existence rule forbids. They are crates **to add**. (`camera` is now the 3D-camera package, not photo capture — also in scope, in the 3D pipeline.)

### Rust-only (no TS counterpart)

| Rust crate | Role |
| --- | --- |
| `host-winit` | Primary native host (winit + wgpu). |
| `host-sdl` | Alternative native host (SDL3 + wgpu, the `sdl3` crate bundled). |
| `host-web` | Wasm conformance instrument (canvas + wgpu + web backends). |
| `capture` | Headless offscreen render → PNG / fingerprint; the native conformance gate. |
| `functional` | Conformance scene registry; the Rust analogue of `tests/functional/`. |
| `displayobject-skia` | Portable software display-object renderer (tiny-skia). The in-box software backend that replaces the role of `displayobject-canvas`; the deterministic conformance reference and the web no-GPU fallback. (Optional sibling `displayobject-cairo` if literal Cairo output is ever wanted.) |

### Validated functionally, not by unit name-match

GPU-backend crates produce shader output that is not meaningfully unit-testable by function name. This is the two backend cores (`render-gl`, `render-wgpu`), the GPU filter/effect backends (`filters-gl`, `filters-wgpu`, `effects-gl`, `effects-wgpu`), and the per-subject leaf renderers the reorg split out (`displayobject-gl`, `displayobject-wgpu`, `scene-gl`, `scene-wgpu`). Their conformance is **visual** — the parity matrix at the `gl`/`wgpu` cells. They are excluded from the name-match coverage denominator and reported separately.

### Web-relocated functions

Functions whose only implementation is a browser API live in `host-web`, not in native-core logic. The owning core crate holds the seam (`get_*_backend` / `set_*_backend`, which _are_ covered); the verbs are validated in the browser. This covers the platform-integration suite and app/process layer (`clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu`, `tray`, `shortcut`, `screen`, `storage`, `device`, `network`, `power`, `lifecycle`, `keyboard`, `sensors`, `media`, `app`, `application`, `protocol`, `updater`, `ipc`, `platform`) plus DOM-bound functions in shared packages (`create*FromDOM`/`Canvas`/`ImageBitmap`/`Blob`/`Base64`, `getAudioContext`, DOM input wiring). These are conformance work to be done in `host-web` and browser-validated, not native-core gaps.

## Resolved by the existence rule

Both prior open decisions are settled by the [crate existence rule](#the-crate-existence-rule):

- **Renderers.** Not "GPU-only" — **GPU + portable software.** `displayobject-gl` / `displayobject-wgpu` (GPU) plus `displayobject-skia` (software, the in-box substitute for the Canvas2D rendering capability), over the `render-gl` / `render-wgpu` backend cores. `displayobject-canvas` / `displayobject-dom` stay excluded because their _substrate_ is absent from the box, not because of effort, and the software capability is covered by `displayobject-skia`. DOM-tree rendering is genuinely N/A in the box.
- **Mobile capabilities.** In scope. `webcam` / `geolocation` / `haptics` / `share` / `statusbar` exist as seam-plus-sentinel crates (substrate exists on native devices; a future mobile host fills the backends). Omitting them would be an effort-based exclusion, which the rule forbids.

## Crate alignment status

The landed refactor opened a large alignment delta; the structural side of it is now **closed**. Every crate the refactor called for exists in `crates/` with a real implementation (not a stub). Grouped, in rough dependency order:

**Renamed (mechanical) — done:**

- `world` → `scene` — the 3D scene graph. The `scene-*` renderer names build on it.

**Refactored (split, mirroring TS) — done:**

- `render-gl` / `render-wgpu` are now subject-agnostic backend **cores**; the 2D leaf renderers live in `displayobject-gl` / `displayobject-wgpu`. See [The render layering](#the-render-layering).

**3D pipeline (value/math + GPU) — done:** `mesh` (vertex layouts, primitive builders, normals/tangents/bounds), `lighting` (light descriptors), `texture` (textures/samplers/cubemaps), `camera` (3D projections / view-projection), `scene-gl` / `scene-wgpu` (3D scene renderers).

**Display-object renderers — done:** `displayobject-gl` / `displayobject-wgpu` (2D leaf renderers split out of the former monoliths) and `displayobject-skia` (Rust software backend over tiny-skia; deterministic conformance reference + web no-GPU fallback; optional `displayobject-cairo` not built). See the [renderer taxonomy](index.md#renderer-scope-gpu--portable-software).

**Platform seams (sentinel defaults; host fills later) — done:** `webcam` (old `camera` capability), `geolocation`, `haptics`, `share`, `statusbar`.

**Still to add:**

- `text-shaping` — the shaper seam (`set_text_shaper`), shaped-run header types (in `flighthq-types`), the lightweight default shaper, and a registerable full-glyph shaper backend (rustybuzz) kept out of the base bundle. **TS-authoritative** — must land in TS (`@flighthq/text-shaping`) first, then port; it is not yet in `packages/` either, so the Rust crate is correctly deferred. See [text](text.md). Pulls in (when it lands) `ttf-parser`, `rustybuzz`, `unicode-bidi`; `tiny-skia` (used by `displayobject-skia`) and `ab_glyph` already build in the workspace.

The remaining conformance work is now **behavioral, not structural**: porting TS test assertions into the colocated Rust tests and closing visual diffs at the `gl`/`wgpu` cells (see [the bar](#the-bar-behavior-not-name-match)), not adding crates.

**Excluded** (no substrate in the box): `displayobject-canvas`, `displayobject-dom`, `filters-canvas`, `effects-canvas`, `host-electron`.

`scripts/parity.ts`'s `RENAMES`/`TS_ONLY`/`RUST_ONLY`/`GPU_CRATES`/`WEB_PACKAGES` sets are aligned with this map: `RENAMES` is empty (every mapped package is identity post-reorg), `TS_ONLY` is the [excluded](#excluded--no-substrate-in-the-box) set, `RUST_ONLY` adds `displayobject-skia`, `GPU_CRATES` includes the `displayobject-`/`scene-` leaf renderers, and `WEB_PACKAGES` lists `webcam` (not the 3D `camera`). Keep them in sync when this map changes.

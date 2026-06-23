# Conformance — Rust matches upstream TS

Conformance is a **property**, not a tool: the Rust crates faithfully implement the authoritative TS packages, such that they compose into a drop-in replacement. The TS packages are the specification; Rust is the implementation under test.

## The bar: behavior, not name-match

Because Rust is a production target (see [intent](index.md#intent)), conformance means **the behavior and the rendered output match**, not merely that a Rust test exists.

- **Floor — coverage.** Every TS exported function has a Rust test that exercises the corresponding function. This is what `scripts/rust-conformance.ts` tracks today by name-match (a Rust test whose name contains the snake*case function token). It proves a test \_mentions* the symbol, not that it agrees with TS. Useful as a tracker; insufficient as a gate.
- **Definition of done — assertion + visual.** The Rust unit test ports the TS test's _assertions_ (same inputs, same expected outputs), and the rendered output matches TS within the declared [parity](parity.md) tolerance for the relevant `gl` / `wgpu` cells. Name-match parity reaching 100% is not conformance; it is the point at which the real conformance work (porting assertions, closing visual diffs) is fully scoped.

## How conformance is measured

`scripts/rust-conformance.ts` (`npm run rust:conformance`) is the gate. It separates what a static check can decide from what it cannot, in three tiers:

- **Structural conformance — the hard pass/fail GATE.** Static and deterministic: (1) **package existence** — every TS package has a Rust crate (minus the [excluded](#excluded--no-substrate-in-the-box) set) and every crate maps to a TS package (minus [rust-only](#rust-only-no-ts-counterpart)); (2) **dependency edges** — every _real_ TS function dependency, derived from actual `import { fn } from '@flighthq/x'` **value** imports in TS source (not `package.json`, which carries declared-but-unused deps like the old `effects-gl → filters`; and not `import type`, which is the flighthq-types header routing), is carried through to the Rust crate, modulo the `FOLDABLE_DEPS` mechanical-translation targets (`entity`/`types`/`signals`/`geometry`) and the explicit `REVIEWED_DEP_EXCEPTIONS` allowlist. Each reported edge names the exact symbols it is about (e.g. `particles must depend on sprite — uses: reserveParticleEmitter`). This catches _relocation_ and _un-carried dependency_ drift — the class name-match coverage is blind to (the `surface`/`filters` miss). A new TS merge that moves a function or adds a real dependency Rust doesn't follow turns this RED; the exit code is nonzero on any structural violation. (A per-export-presence check is a planned addition; the edge check already surfaces relocation because the receiving package's import of a moved function appears as an un-carried edge.)
- **Unit conformance (coverage) — reported, not gated.** Assertion-ported colocated tests, run with `cargo test -p <crate>`; the script tracks name-match coverage per package. A low number is a behavioral-porting backlog, not a structural failure (it fails the gate only under `--strict`).
- **Visual conformance — not statically decidable.** The [parity](parity.md) matrix's conformance-pairing at the `gl`/`wgpu` cells: `flighthq-functional` (native, fingerprint vs stored TS baselines) and, where a web-only surface requires it, the browser parity runner. `rust-conformance.ts --functional` runs and summarizes it; a confirmed FAIL fails the gate.

**What can and cannot be encoded.** The structural skeleton — _which packages exist, what depends on what, and whether each TS export is present in the right crate_ — is fully gateable, and that is exactly the layer where the recent drift lived. **API shape** (value-vs-node, descriptor-vs-options) is only partially checkable statically — Rust's mechanical signature differences (`&mut`, `Option`, the arena) make a hard signature diff too noisy — so it is surfaced for review, not hard-gated. **Behavior** (same inputs → same outputs, same rendered pixels) is not statically decidable at all and remains the assertion-ported tests + the functional fingerprint gate.

## Conformance map

The intentional TS↔Rust divergences. This is the auditable registry of what "1:1" deliberately is _not_ — every entry is a reviewed decision with a rationale, not drift. It currently lives as hardcoded sets in `scripts/rust-conformance.ts`; it should be promoted to a committed machine-readable manifest that both this doc and the tooling read. Until then, this table and `rust-conformance.ts` must be kept in sync.

### Renames (Rust catching up to the landed refactor)

The upstream render reorg **landed 2026-06-22** and changed the baseline:

- It adopted the `-gl` / `-wgpu` suffixes **natively**, so the former `-webgl`→`-gl` / `-webgpu`→`-wgpu` divergence is **gone** — TS and Rust now share backend suffixes. `render-gl`/`render-wgpu`, `filters-gl`/`filters-wgpu`, `effects-gl`/`effects-wgpu` map by identical name.
- It **split** the monolithic renderers (see [The render layering](#the-render-layering)): `render-gl`/`render-wgpu` are now subject-agnostic backend **cores**, and the per-subject leaf renderers moved to `displayobject-<backend>` and `scene-<backend>`.

A second upstream merge **landed 2026-06-23** with a package-naming pass (dropped hyphens, regrouped filters/text) plus the text-shaping seam. All renames below have been **applied in Rust** — every mapped package is now identity; the table is the audit trail, not pending work:

| Former Rust crate | New name (TS authoritative) | Reason |
| --- | --- | --- |
| `world` | `scene` | TS renamed `world` → `scene` — the 3D scene graph (2026-06-22). Drags in the 3D pipeline (`mesh`, `lighting`, `texture`, `camera`, `scene-gl`, `scene-wgpu`). |
| `tween-easing` | `easing` | TS split easing to its own top-level `@flighthq/easing` (2026-06-23). |
| `resources-loader` | `loader` | TS renamed to `@flighthq/loader` (2026-06-23). |
| `text-input` | `textinput` | TS dropped the hyphen → `@flighthq/textinput` (2026-06-23). |
| `text-layout` | `textlayout` | TS dropped the hyphen → `@flighthq/textlayout` (2026-06-23). |
| `surface-filters` | `filters-surface` | TS regrouped under the `filters-*` family → `@flighthq/filters-surface` (2026-06-23). **Not a pure rename — see below.** |

**`surface` / `filters-surface` / `filters` re-layering (corrected 2026-06-23).** The `surface-filters` change was first applied as a mechanical rename, which was wrong: upstream _restructured_ the three packages, and the Rust port had the layering inverted. The corrected, TS-matching layering:

- **`surface`** owns the CPU pixel **operations** (`surfaceBlur`/`surfaceColorMatrix`/… → Rust `blur`/`color_matrix`/… modules). Deps: types (+geometry).
- **`filters-surface`** is a **thin bridge**: each `apply_*_filter_to_surface(out, …, filter)` maps a descriptor onto a `surface` op. Deps: `filters` + `surface` + types.
- **`filters`** is descriptors + blur math only. Deps: types (+geometry). It must **not** depend on `filters-surface`.

The Rust port previously put the pixel ops in `filters-surface` and the thin wrappers in `filters` (with `filters → filters-surface`, the reverse edge). Fixed by relocating the op modules into `flighthq-surface`, moving the `apply_*_filter_to_surface` wrappers into `flighthq-filters-surface`, and dropping the `filters → filters-surface` dependency. The relocated `surface` ops were then **renamed to the TS surface-op API** (2026-06-23): `bevel_surface`, `box_blur_surface`, `gaussian_blur_surface`, `color_matrix_surface`, `convolve_surface`, `displace_surface`, `median_surface`, `pixelate_surface`, `drop_shadow_surface`, `glow_surface`, `inner_glow_surface`, `inner_shadow_surface`, `sharpen_surface`, `gradient_bevel_surface`, `gradient_glow_surface` (from the prior `apply_surface_*_filter` names), and the op option structs dropped the `Filter` infix (`SurfaceBevelFilterOptions` → `SurfaceBevelOptions`, etc.) — so the surface op API is surface-native (`bevel_surface(out, scratch, source, &SurfaceBevelOptions)`), distinct from the descriptor-shaped `filters-surface` API (`apply_bevel_filter_to_surface(out, …, &BevelFilter)`). The op signatures already matched TS structurally (out/scratch/source/options, or primitives like `radius`/`block_size`), so this was a rename, not a rewrite.

Semantic trap (not a Rust rename — Rust had neither): TS's old `camera` (photo capture) is now **`webcam`**; the new **`camera`** package is the **3D camera** (projections / view-projection). Both now exist as crates — `webcam` as a platform seam, `camera` as a 3D-pipeline crate. Do not conflate.

Every other crate now maps by identical name (modulo the [excluded](#excluded--no-substrate-in-the-box) and [Rust-only](#rust-only-no-ts-counterpart) sets). Keep this section the single source of truth; `scripts/rust-conformance.ts` should read it, not hardcode it.

### Cross-package layering audit (2026-06-23)

A dependency-graph diff (TS `package.json` `@flighthq/*` deps vs Rust `Cargo.toml` `flighthq-*` deps) was run across all shared packages to catch _re-layerings_ (functions relocated between packages) that name-match parity cannot see — the class of miss that the `surface`/`filters-surface` case was. Findings:

- **`sdk` was missing `textshaper`** — fixed (added the crate to the barrel; `flighthq-textshaper` had been created but not re-exported).
- **`effects-gl` / `effects-wgpu` bloom did not reuse the filter Gaussian.** TS `applyBloomEffectTo{Gl,Wgpu}` call `applyGaussianBlurFilterTo{Gl,Wgpu}` from `filters-{gl,wgpu}` (a true sigma-based `⌈3σ⌉` exp-weighted blur); the Rust crates inlined a different fixed nine-tap kernel, so bloom output could not match TS. **`effects-gl` fixed** (now depends on `filters-gl` and calls `apply_gaussian_blur_filter_to_gl`). **`effects-wgpu` still pending**: the Rust `apply_gaussian_blur_filter_to_wgpu` requires a separate `WgpuFilterState` (a Rust-only API split; TS threads it through the render state), which does not cache cleanly into the effects pipeline without lifecycle plumbing, and there is no bloom functional scene to fingerprint-verify the result. Tracked follow-up.
- **Dead manifest deps removed** (no behavior change): `spritesheet → sprite`, `render-wgpu → node`/`path` were unused.

**Intentional value-type seam divergences (recorded, not bugs):**

- **`particles`** operates on the `ParticleEmitterData` value type (from `flighthq-types`) rather than the sprite `NodeId`, so it needs no `flighthq-sprite` dep even though TS `particles` imports `createParticleEmitter` from `@flighthq/sprite`. The emitter primitive itself does live in `flighthq-sprite` (matching TS). Minor: particles inlines its RNG instead of using `flighthq-math`'s `create_random_source`.
- **`spritesheet`** pushes bitmap/child node wiring to a caller `apply` callback (opaque `u64` target id) instead of depending on `displayobject`/`node`.
- **`timeline`** is decoupled from `displayobject`: `MovieClipData` lives in the caller's display-node arena entry. Consequence: there is **no `create_movie_clip` node constructor** (only `create_movie_clip_data`), unlike `displayobject`'s `create_bitmap`. TS `createMovieClip` (in `@flighthq/timeline`) _does_ create the node via `createDisplayObjectGeneric`. **Open decision:** align to TS (add `create_movie_clip(arena)` + a `timeline → displayobject` edge, no cycle) or keep the decoupling and document it as the canonical Rust seam.

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
| `filters-canvas`, `effects-canvas` | Canvas2D context | None — CPU filters/effects are covered by `filters-surface` / `effects` / `filters`. |
| `filters-css` | CSS filter strings (a browser-applied style) | None — CPU filter pixels are covered by `filters-surface`; there is no CSS engine in the box. |
| `textshaper-canvas` | Canvas2D `measureText` | None — the shaper SEAM (`textshaper`) is ported; the native shaper backend is HarfBuzz/rustybuzz, not Canvas. |
| `host-electron` | the Electron main process | None — every capability it backed exists as its own Rust crate seam; Rust hosts are `host-winit` / `host-sdl` / `host-web`. |

Everything else in the TS package set has a Rust crate. In particular `webcam`, `geolocation`, `haptics`, `share`, and `statusbar` are **in scope** (real device capabilities with a substrate in the box) and exist as seam-plus-sentinel crates like the rest of the platform suite. (`camera` is now the 3D-camera package, not photo capture — also in scope, in the 3D pipeline.)

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

**Text-shaping seam — done (2026-06-23):** `textshaper` ports the upstream `@flighthq/textshaper` seam — `get_text_shaper_backend` / `set_text_shaper_backend` / `shape_text` (sentinel `-1.0` when no backend) over the `TextShaperBackend` trait in `flighthq-types`. `textlayout`'s `get_text_layout_measure_provider` falls back to `shape_text` when a backend is registered, mirroring TS. The Canvas `measureText` backend (`textshaper-canvas`) is [excluded](#excluded--no-substrate-in-the-box) — browser substrate.

**Still to add:**

- A **full-glyph shaper backend** (`textshaper-harfbuzz`, rustybuzz) — required for any GPU/software text and correct international shaping (GSUB/GPOS); kept out of the base bundle. Pulls in `rustybuzz`, `ttf-parser`, `unicode-bidi`; `tiny-skia` (used by `displayobject-skia`) and `ab_glyph` already build in the workspace. See [text](text.md).

The remaining conformance work is otherwise **behavioral, not structural**: porting TS test assertions into the colocated Rust tests and closing visual diffs at the `gl`/`wgpu` cells (see [the bar](#the-bar-behavior-not-name-match)), not adding crates.

**Excluded** (no substrate in the box): `displayobject-canvas`, `displayobject-dom`, `filters-canvas`, `filters-css`, `effects-canvas`, `textshaper-canvas`, `host-electron`.

`scripts/rust-conformance.ts`'s `RENAMES`/`TS_ONLY`/`RUST_ONLY`/`GPU_CRATES`/`WEB_PACKAGES` sets are aligned with this map: `RENAMES` is empty (every mapped package is identity post-reorg), `TS_ONLY` is the [excluded](#excluded--no-substrate-in-the-box) set, `RUST_ONLY` adds `displayobject-skia`, `GPU_CRATES` includes the `displayobject-`/`scene-` leaf renderers, and `WEB_PACKAGES` lists `webcam` (not the 3D `camera`). Keep them in sync when this map changes.

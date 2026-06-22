# Conformance — Rust matches upstream TS

Conformance is a **property**, not a tool: the Rust crates faithfully implement the authoritative TS packages, such that they compose into a drop-in replacement. The TS packages are the specification; Rust is the implementation under test.

## The bar: behavior, not name-match

Because Rust is a production target (see [intent](index.md#intent)), conformance means **the behavior and the rendered output match**, not merely that a Rust test exists.

- **Floor — coverage.** Every TS exported function has a Rust test that exercises the corresponding function. This is what `scripts/parity.ts` tracks today by name-match (a Rust test whose name contains the snake_case function token). It proves a test _mentions_ the symbol, not that it agrees with TS. Useful as a tracker; insufficient as a gate.
- **Definition of done — assertion + visual.** The Rust unit test ports the TS test's _assertions_ (same inputs, same expected outputs), and the rendered output matches TS within the declared [parity](parity.md) tolerance for the relevant `gl` / `wgpu` cells. Name-match parity reaching 100% is not conformance; it is the point at which the real conformance work (porting assertions, closing visual diffs) is fully scoped.

## How conformance is measured

- **Unit conformance** — assertion-ported colocated tests, run with `cargo test -p <crate>`. One test file per source file, `describe`-equivalent order mirroring exports, same as the TS convention.
- **Visual conformance** — the [parity](parity.md) matrix's conformance-pairing strategy at the `gl` and `wgpu` cells: `flighthq-functional` (native, fingerprint vs stored TS baselines) and, where a web-only surface requires it, the browser parity runner (`ts:X ~ rwasm:X` in one page).
- **Coverage tracking** — `scripts/parity.ts` name-match accounting, reported per package with the gap list.

## Conformance map

The intentional TS↔Rust divergences. This is the auditable registry of what "1:1" deliberately is _not_ — every entry is a reviewed decision with a rationale, not drift. It currently lives as hardcoded sets in `scripts/parity.ts`; it should be promoted to a committed machine-readable manifest that both this doc and the tooling read. Until then, this table and `parity.ts` must be kept in sync.

### Renames

GPU backend crates are renamed from the TS `-webgl` / `-webgpu` suffixes to the Rust `-gl` / `-wgpu` suffixes (glow / wgpu).

| TS package       | Rust crate     |
| ---------------- | -------------- |
| `render-webgl`   | `render-gl`    |
| `render-webgpu`  | `render-wgpu`  |
| `filters-webgl`  | `filters-gl`   |
| `filters-webgpu` | `filters-wgpu` |
| `effects-webgl`  | `effects-gl`   |
| `effects-webgpu` | `effects-wgpu` |

> **Pending the upstream refactor.** A render-package reorg toward a `<subject>-<backend>` convention is landing upstream (`render-canvas → displayobject-canvas`, and likely `render-webgl → displayobject-webgl`, etc.). When it merges, this table is the place to record the new mapping — the Rust GPU/software renderers rename to follow the upstream subjects (`render-gl → displayobject-gl`, `render-wgpu → displayobject-wgpu`, software renderer as `displayobject-skia`). Until then the `render-*` names above are current. Keep this table the single source of truth for the mapping; `scripts/parity.ts` should read it, not hardcode it.

### The crate existence rule

A TS package gets a Rust crate **iff its substrate exists in the box** — the native/portable Rust runtime. Two parts, both load-bearing:

- **Exclude only what has no substrate in the box.** The DOM tree, the Canvas2D context, and the Electron main process do not exist natively; a Rust crate for them would be an _emulator / compatibility shim_, which the port deliberately does not build. A package is excluded only when (a) its substrate is a browser/JS-host construct absent from the box, **and** (b) excluding it leaves no capability gap — either an in-box equivalent covers it, or it is genuinely N/A.
- **Engineering effort is never a reason to exclude a crate.** If the substrate exists in the box, the crate exists, however much work it is. Every missing-vs-TS crate is permanent cognitive load ("does this exist in Rust or only TS?"), which outweighs any effort saved.

The reconciling distinction: **a seam-with-sentinel is not an emulator.** A capability crate that exposes the real `*Backend` seam and returns a sentinel until a host fills it (the pattern `clipboard` / `dialog` / `screen` already use) is the genuine API awaiting a backend — included. Faking an absent substrate is an emulator — excluded.

### Excluded — no substrate in the box

These are the _only_ TS packages without a Rust crate. Each is excluded by the existence rule, and each leaves no capability gap.

| TS package | Substrate absent from the box | Capability gap? |
| --- | --- | --- |
| `render-canvas` | the Canvas2D context (a browser API) | None — software rendering is covered by `render-skia`. |
| `render-dom` | the DOM tree | None — genuinely N/A; there is no DOM in the box to render to. |
| `filters-canvas`, `effects-canvas` | Canvas2D / CSS-filter strings | None — CPU filters/effects are covered by `surface-filters` / `effects` / `filters`. |
| `host-electron` | the Electron main process | None — every capability it backed exists as its own Rust crate seam; Rust hosts are `host-winit` / `host-sdl` / `host-web`. |

Everything else in the TS package set has a Rust crate. In particular `camera`, `geolocation`, `haptics`, `share`, and `statusbar` are **in scope** (real device capabilities with a substrate in the box) and must exist as seam-plus-sentinel crates like the rest of the platform suite — they were previously dropped on effort grounds, which the existence rule forbids. They are crates **to add**.

### Rust-only (no TS counterpart)

| Rust crate | Role |
| --- | --- |
| `host-winit` | Primary native host (winit + wgpu). |
| `host-sdl` | Alternative native host (SDL2 + wgpu). |
| `host-web` | Wasm conformance instrument (canvas + wgpu + web backends). |
| `capture` | Headless offscreen render → PNG / fingerprint; the native conformance gate. |
| `functional` | Conformance scene registry; the Rust analogue of `tests/functional/`. |
| `render-skia` | Portable software renderer (tiny-skia). The in-box software-render path that replaces the role of `render-canvas`; the deterministic conformance reference and the web no-GPU fallback. (Optional sibling `render-cairo` if literal Cairo output is ever wanted.) |

### Validated functionally, not by unit name-match

GPU-backend crates (`render-gl`, `render-wgpu`, `filters-gl`, `filters-wgpu`, `effects-gl`, `effects-wgpu`) produce shader output that is not meaningfully unit-testable by function name. Their conformance is **visual** — the parity matrix at the `gl`/`wgpu` cells. They are excluded from the name-match coverage denominator and reported separately.

### Web-relocated functions

Functions whose only implementation is a browser API live in `host-web`, not in native-core logic. The owning core crate holds the seam (`get_*_backend` / `set_*_backend`, which _are_ covered); the verbs are validated in the browser. This covers the platform-integration suite and app/process layer (`clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu`, `tray`, `shortcut`, `screen`, `storage`, `device`, `network`, `power`, `lifecycle`, `keyboard`, `sensors`, `media`, `app`, `application`, `protocol`, `updater`, `ipc`, `platform`) plus DOM-bound functions in shared packages (`create*FromDOM`/`Canvas`/`ImageBitmap`/`Blob`/`Base64`, `getAudioContext`, DOM input wiring). These are conformance work to be done in `host-web` and browser-validated, not native-core gaps.

## Resolved by the existence rule

Both prior open decisions are settled by the [crate existence rule](#the-crate-existence-rule):

- **Renderers.** Not "GPU-only" — **GPU + portable software.** `render-gl` / `render-wgpu` (GPU) plus `render-skia` (software, the in-box substitute for the Canvas2D rendering capability). `render-canvas` / `render-dom` stay excluded because their _substrate_ is absent from the box, not because of effort, and the software capability is covered by `render-skia`. DOM-tree rendering is genuinely N/A in the box.
- **Mobile capabilities.** In scope. `camera` / `geolocation` / `haptics` / `share` / `statusbar` exist as seam-plus-sentinel crates (substrate exists on native devices; a future mobile host fills the backends). Omitting them would be an effort-based exclusion, which the rule forbids.

## Crates to add

Implied by the rules and decisions, not yet present in `crates/`:

- `render-skia` — portable software renderer (tiny-skia). Provisional name; follows the upstream `<subject>-<backend>` rename (likely `displayobject-skia`). See the [renderer taxonomy](index.md#renderer-scope-gpu--portable-software).
- `text-shaping` — the shaper seam (`set_text_shaper`), shaped-run header types (in `flighthq-types`), and the lightweight default shaper; plus a registerable full-glyph shaper backend (rustybuzz) kept out of the base bundle. **TS-authoritative** — lands in TS (`@flighthq/text-shaping`) first, then ports. See [text](text.md).
- `camera`, `geolocation`, `haptics`, `share`, `statusbar` — platform-suite seams (sentinel defaults; host fills later).

New direct dependencies these pull in (all native, no system libs): `tiny-skia`, `ttf-parser`, `rustybuzz`, `unicode-bidi`. `tiny-skia` and `ab_glyph` already build transitively in the workspace.

`scripts/parity.ts`'s `TS_ONLY` set is now stale (it still lists the five platform crates and the canvas/dom renderers together); align it with the [excluded set](#excluded--no-substrate-in-the-box) when the tooling is repointed at this map.

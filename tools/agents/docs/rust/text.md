# Text stack

Text is a layered stack, and the layers belong in different places. Flight **owns layout**; shaping is a **first-class registerable seam**; rasterization is **shared with shape rendering**. Getting the layering right is what keeps text correct, tree-shakable, and conformant.

This is a TS-authoritative design: the shaper seam is a change to the upstream architecture (it improves TS's own GPU text and bundle story, see below), so it lands in TS first and ports to Rust. Designed, not yet built, as of 2026-06-22.

## The layers

| Layer | What it does | Where it lives | Status in Rust |
| --- | --- | --- | --- |
| Itemize / bidi | split text into runs by script, direction, font | `unicode-bidi` + a script-itemization step | absent |
| **Shape** | run → positioned glyphs (ids, advances, offsets, clusters) | the **shaper seam** (`text-shaping`) | absent |
| **Layout** | glyphs → lines, alignment, wrapping, selection | `flighthq-textlayout` — **owned by Flight** | present (algorithm), but fed by an unfilled seam |
| Rasterize | glyph outline → coverage bitmap / atlas | `tiny-skia` (shared with `displayobject-skia` shapes) | absent |

Because Flight owns layout, **do not adopt a crate that also does layout** (`cosmic-text`, `parley`, `fontdue`'s layout) — it would duplicate and fight `flighthq-textlayout`. Use crates that fill only the shape / metrics / raster seams.

## The shaper seam (`text-shaping`)

A shaper is `text run → shaped glyphs`. It **subsumes** the current width-only measure seam — width is just the sum of advances:

```
TextShaper = (text, font, opts) -> ShapedRun        // header type in @flighthq/types / flighthq-types

ShapedGlyph { glyphId, cluster, xAdvance, yAdvance, xOffset, yOffset }
ShapedRun   { glyphs: ShapedGlyph[], font, direction, script }

// width  = Σ xAdvance         → flighthq-textlayout consumes this
// glyphs = ids + positions    → the renderers rasterize these
// cluster                     → caret / selection hit-testing uses this
```

The existing `flighthq-textlayout` seam `set_text_layout_measure_provider` (today `TextMeasureFunction = Fn(&str, &Font) -> f32`, string→width) **evolves into `set_text_shaper`**. `text-layout` then consumes shaped runs, and `rich_text_query`'s selection — which currently sums per-character advances — becomes correct across ligatures and reordering because it has real clusters.

Registration follows the standard seam pattern: `registerTextShaper` / `set_text_shaper`, seam type in the header layer, owning package `text-shaping`. **No shaper is registered at module load** (import side-effect-free); the host/app opts in.

### Why a registerable seam, not a hardcoded dependency

A HarfBuzz-wasm build is ~1MB. It **must** be opt-in, or every Flight app pays for advanced shaping it may not use — a direct bundle-size-discipline concern. So the heavy shaper is a _registered backend_, not an import. The default stays lightweight; correctness-via-HarfBuzz is something the user turns on and pays for only then.

## Two tiers, and the tier ↔ render-backend relationship

There are two shaper tiers, and which one a scene needs depends on its render backend:

| Tier | Produces | Enables |
| --- | --- | --- |
| **Measure-only** (`measureText`) | advances / width; **no glyph ids** (the browser hides them) | layout + **Canvas-rendered** text (`fillText` reshapes internally) |
| **Full-glyph** (HarfBuzz / rustybuzz) | glyph ids + positions + clusters | layout + **GPU / software** text (you rasterize the glyphs yourself) |

So `measureText` + the canvas backend can render text with no real shaper. **Every GPU / software backend requires a full-glyph shaper** to obtain glyph ids to rasterize. This is true in TS too — TS's WebGL/WebGPU text needs the seam as much as Rust does, which is why the seam belongs in the authoritative design and not just in the Rust port.

You cannot do text _correctly_ without a full-glyph shaper: without GSUB/GPOS, Arabic / Indic / Thai / Hebrew-with-marks are broken (no joining, reordering, conjuncts, mark placement), and even Latin loses kerning (GPOS) and ligatures. Shaping is the floor for correctness, not a complex-script add-on.

## Canonical native stack — a 1:1 port of harfbuzz + cairo

| Classic stack | Rust crate | Role |
| --- | --- | --- |
| HarfBuzz | **rustybuzz** | Pure-Rust HarfBuzz port (GSUB/GPOS, most scripts). Deterministic, no FFI. The full-glyph shaper backend. |
| Cairo | **tiny-skia** | Software rasterizer; fills glyph outlines. Shared with `displayobject-skia` shape rendering. |
| (font access) | **ttf-parser** | Metrics + outlines; rustybuzz is built on it. Also backs the lightweight default shaper. |
| (bidi) | **unicode-bidi** + script itemization | Split into runs before shaping. |

Rasterize glyph outlines **through tiny-skia** (the same rasterizer as shapes) — so shapes and text share one rasterizer, maximizing internal determinism and adding no new raster dependency. GPU backends rasterize glyphs into a tiny-skia `Pixmap` atlas and upload it as a texture. `harfbuzz_rs` (C FFI) is the escape hatch only if AAT / `morx` (Apple tables rustybuzz doesn't fully cover) is ever required — otherwise rustybuzz keeps the pure-Rust, deterministic ethos.

## Per-environment shapers

| Environment | Default shaper | Opt-in full-glyph shaper |
| --- | --- | --- |
| TS (browser) | `measureText` | harfbuzz-wasm (a `text-shaping` backend / `host-web`) |
| Rust native | `ttf-parser` advances | **rustybuzz** |
| Rust wasm (`host-web`) | browser `measureText` (via `host-web`) | rustybuzz or harfbuzz-wasm |

## Conformance posture

- Text **never pixel-matches the browser** — a different rasterizer (tiny-skia vs the browser's) means `rust:text ~ ts:text` is **structural-only**, never pixel-exact. Set the text scene-category tolerance accordingly (see [parity](parity.md)); never loosen a global tolerance for text.
- **But shaping conforms.** Both sides are HarfBuzz (harfbuzz-wasm in TS, rustybuzz in Rust), so the shaped _geometry_ — glyph selection and positions — matches closely. Text positioning conforms structurally; only the rasterized pixels diverge.
- Pick **one** canonical shaper + rasterizer as the deterministic reference (reproducible across machines). Multiple rasterizers would make glyph pixels nondeterministic — text is the place to converge on a single engine, not run a true multi-impl matrix.

## Crates

- **`textshaper`** — **done (2026-06-23).** The shaper seam (`get_text_shaper_backend` / `set_text_shaper_backend` / `shape_text`, sentinel `-1.0`) over the `TextShaperBackend` trait in `flighthq-types`. This is the advances-only measure tier (matching upstream `@flighthq/textshaper`); `flighthq-textlayout`'s `get_text_layout_measure_provider` falls back to `shape_text` when a backend is registered. The Canvas `measureText` backend (`textshaper-canvas`) is excluded (browser substrate). Shaped-run cluster/glyph header types are deferred until the full-glyph backend needs them.
- A **full-glyph shaper backend** — _to add._ rustybuzz, as a registerable backend kept out of the base bundle. Either a `textshaper` cargo feature or a focused sibling crate (e.g. `textshaper-harfbuzz`), per the `-subpackage` neighbor-crate convention. This is what upgrades `shape_text` from advances-only to real `ShapedRun`s (ids, advances, offsets, clusters), which `flighthq-textlayout` then consumes for correct cluster-aware selection.

See the [conformance map](conformance.md#crate-alignment-status) for the full crate alignment status and the [renderer taxonomy](index.md#renderer-scope-gpu--portable-software) for where glyph rasterization plugs into each backend.

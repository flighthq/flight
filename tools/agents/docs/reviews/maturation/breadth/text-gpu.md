# New Package Spec: @flighthq/text-gpu

**Represents:** GPU glyph rendering — a shared glyph/SDF/MSDF atlas plus per-glyph quad batching so the `render-gl` and `render-wgpu` backends draw real shaped text from glyph runs instead of per-node Canvas2D `<canvas>` overlays uploaded as textures.

**Requested by:** text-typography, rendering-gpu

## Fits

Today GL/WGPU text is a fallback: `drawGlTextLabel` (and its WGPU twin) rasterizes each text node into its own Canvas2D `<canvas>`, uploads that as a texture, and draws one quad (`packages/displayobject-gl/src/glTextLabel.ts`). That works for Latin on a browser host but it is not real GPU text — there is no shared atlas, no glyph reuse across nodes, it cannot use a full-glyph shaper, and it has no substrate in native Rust where no Canvas2D context exists. Both breadth reviews name this exact hole ("GPU glyph atlas is absent", "GL/WGPU draw real text instead of a Canvas2D overlay").

This package is the **subject-agnostic GPU glyph substrate** that the per-backend display-object text leaves draw through. It sits one layer below `displayobject-gl` / `displayobject-wgpu`:

- **Depends on:** `@flighthq/types` (header types), `@flighthq/textshaper` (`shapeText` → `ShapedRun`, the source of glyph ids + positions), `@flighthq/textlayout` (line/run geometry it positions glyphs against), `@flighthq/geometry` (rect packing math, `out`-param helpers), `@flighthq/surface` (CPU rasterization target for the atlas page bitmap — the same value-typed pixel buffer the Rust `tiny-skia` path writes), and `@flighthq/render` (kind/registration plumbing, `RenderProxy2D`).
- **Depended on by:** `@flighthq/displayobject-gl` and `@flighthq/displayobject-wgpu` — their `glTextLabel` / `glRichText` / `wgpuTextLabel` / `wgpuRichText` leaves stop rasterizing canvases and instead acquire glyphs from the atlas and emit quads through this package. It does **not** depend on `displayobject-*` (avoids a cycle); the leaves depend on it.
- **Atlas-page upload is backend-specific** and lives behind a small seam, mirroring `createGlTexture` / `createWgpuTextureEntry`. The atlas itself (packing, glyph cache, eviction) is backend-agnostic and uploads its CPU page through a swappable `GlyphAtlasUploadBackend` (`getGlyphAtlasUploadBackend` / `setGlyphAtlasUploadBackend` / `createWebGlyphAtlasUploadBackend`), so the same atlas code serves GL, WGPU, and a headless capture path.
- **Glyph rasterization is a swappable seam too:** `GlyphRasterizerBackend` turns a glyph id + font + size into a coverage/SDF bitmap. The web default rasterizes outlines via Canvas2D `<canvas>`; the Rust default rasterizes through `tiny-skia` (shared with `displayobject-skia` shapes, per `rust/text.md`). This keeps glyph outlines off the `text-gpu` core and lets native produce deterministic glyph pixels.
- **Neighbor `-formats` package:** `@flighthq/text-gpu-formats` for **precomputed atlas importers** — load a baked BMFont (`.fnt`)/MSDF-atlas JSON + PNG page into a `GlyphAtlas` without a runtime rasterizer (the classic "ship a font atlas as an asset" path). Keeps file parsers out of the renderer cell.
- **Rust crate mirror:** `flighthq-text-gpu`, with leaf draw in `displayobject-gl` / `displayobject-wgpu` crates and the rasterizer backend defaulting to tiny-skia. `flighthq-text-gpu-formats` mirrors the importer. Conformance against text is **structural-only** (different rasterizers; never pixel-exact), per `rust/text.md`.

All types below are declared in `@flighthq/types` first (the header layer). The package is `"sideEffects": false`, single root `.` export, no top-level registration.

## Bronze

The minimum that makes GL/WGPU draw real shaped glyphs from a shared atlas — replacing the per-node canvas overlay for single-format `TextLabel`, monochrome alpha-coverage glyphs only.

Types in `@flighthq/types`:

- `GlyphKey` — `Readonly<{ glyphId: number; fontKey: string; pixelSize: number }>`: the atlas cache key (one rasterized glyph at one size). `fontKey` is the resolved font identity string.
- `GlyphAtlasEntry` — `Readonly<{ key: GlyphKey; u0; v0; u1; v1; width; height; bearingX; bearingY; page: number }>`: a packed glyph's atlas rectangle in normalized UVs plus pixel metrics.
- `GlyphAtlas` — entity: `Readonly<{ pageWidth; pageHeight; entries: ReadonlyMap<string, GlyphAtlasEntry>; pages: ReadonlyArray<GlyphAtlasPage>; rasterizationKind: GlyphRasterizationKind }>` with a paired opaque `GlyphAtlasRuntime` (the shelf/skyline packer state, dirty-page set, per-page CPU `ImageSource`, per-page GPU upload handle slot).
- `GlyphAtlasPage` — `Readonly<{ index: number; image: ImageSource; dirty: boolean }>`.
- `GlyphRasterizationKind` (`*Kind` string): `AlphaCoverageGlyphKind` (Bronze), reserved `SdfGlyphKind` / `MsdfGlyphKind` (Silver+).
- `GlyphRasterizerBackend` — `Readonly<{ rasterizeGlyph(out: ImageSource, glyphId: number, fontKey: string, pixelSize: number, kind: GlyphRasterizationKind): GlyphMetrics | null }>` (sentinel `null` for an unrasterizable/missing glyph → tofu handling later).
- `GlyphMetrics` — `Readonly<{ width; height; bearingX; bearingY; advance }>`.
- `GlyphAtlasUploadBackend` — `Readonly<{ uploadGlyphAtlasPage(state, atlas, pageIndex): void; destroyGlyphAtlasPage(state, atlas, pageIndex): void }>`.
- `GlyphQuad` — `Readonly<{ x0; y0; x1; y1; u0; v0; u1; v1; color: number }>`: one positioned glyph quad in field-local space (packed RGBA `color`).

Functions (free, alphabetized in source):

- `createGlyphAtlas(obj?: Partial<GlyphAtlas>): GlyphAtlas` — allocates an atlas with one empty page (default 1024×1024).
- `acquireGlyphAtlasEntry(atlas: GlyphAtlas, key: Readonly<GlyphKey>): GlyphAtlasEntry | null` — looks up, and on miss rasterizes via the registered `GlyphRasterizerBackend` and packs into a page (allocating a new page if full); marks the page dirty. Returns `null` if no rasterizer is registered or the glyph cannot be rasterized.
- `getGlyphAtlasEntry(atlas, key): GlyphAtlasEntry | null` — pure lookup, no rasterization (sentinel on miss).
- `buildGlyphQuadsFromShapedRun(out: GlyphQuad[], atlas, run: Readonly<ShapedRun>, originX: number, originY: number, color: number): number` — walks a shaped run's glyphs, acquires atlas entries, writes positioned quads into `out`, returns the count. The core "shaped run → drawable quads" step.
- `getGlyphAtlasRasterizerBackend()` / `setGlyphAtlasRasterizerBackend(backend | null)` / `createWebGlyphAtlasRasterizerBackend()` — the rasterizer seam (web default = Canvas2D outline fill).
- `getGlyphAtlasUploadBackend()` / `setGlyphAtlasUploadBackend(backend | null)` / `createWebGlyphAtlasUploadBackend()` — the page-upload seam.
- `disposeGlyphAtlas(atlas)` — drops CPU pages and detaches; `destroyGlyphAtlas(state, atlas)` — frees GPU page textures now (distinct verbs per house rules).

Backend glue (lands in the renderer leaves, not here, but enabled by this package): `displayobject-gl` `glTextLabel` and `displayobject-wgpu` `wgpuTextLabel` rewritten to call `buildGlyphQuadsFromShapedRun` + the existing sprite-batch quad path against the atlas texture, deleting the per-node `<canvas>` rasterization. A single GL/WGPU draw call per text run via the existing quad batch.

Effort: medium. The atlas + packer + the shaped-run→quad walk is the bulk; the GL/WGPU upload is a thin reuse of `createGlTexture`/`createWgpuTextureEntry`. **Ordering: Bronze hard-depends on a full-glyph shaper backend existing** (`textshaper-harfbuzz` / rustybuzz) — without glyph ids there is nothing to rasterize. The web Canvas2D rasterizer is the only Bronze rasterizer that has no other dependency, so it ships first.

## Silver

Competitive with a good GPU text library: SDF/MSDF for crisp scaling, multi-format `RichText`, dynamic atlas growth/eviction, and cross-backend consistency.

Types in `@flighthq/types`:

- `SdfGlyphEntry` extends `GlyphAtlasEntry` with `Readonly<{ spread: number; sdfPixelRange: number }>` (the distance-field spread used by the shader).
- `GlyphAtlasGrowthPolicy` — `Readonly<{ maxPages: number; pageWidth; pageHeight; evictionKind: GlyphAtlasEvictionKind }>`.
- `GlyphAtlasEvictionKind` (`*Kind`): `LruGlyphEvictionKind`, `NeverGlyphEvictionKind`.
- `GlyphBatch` — `Readonly<{ atlas: GlyphAtlas; quads: ReadonlyArray<GlyphQuad>; rasterizationKind: GlyphRasterizationKind }>`: a complete, drawable run-group with a stable runtime for incremental update.
- `GlyphAtlasStats` — `Readonly<{ pageCount; usedArea; glyphCount; evictionCount; uploadCount }>` for diagnostics/size budgeting.

Functions:

- `acquireSdfGlyphAtlasEntry(atlas, key, spread): SdfGlyphEntry | null` and an SDF/MSDF web rasterizer (`createWebSdfGlyphAtlasRasterizerBackend`) generating distance fields from outlines.
- `buildGlyphBatchFromTextLayout(out: GlyphBatch, atlas, layout: Readonly<TextLayoutResult>, originX, originY): GlyphBatch` — consumes the full layout (multi-run, multi-format, per-group color/format) so `RichText` renders through the atlas, not just single-format labels. Replaces `glRichText`/`wgpuRichText` canvas rasterization.
- `createGlyphBatch()` / `updateGlyphBatch(batch, ...)` — incremental rebuild keyed off the text content revision (the same `getNodeLocalContentRevision` gate the current code uses), so static text uploads/packs once.
- `getGlyphAtlasStats(atlas): GlyphAtlasStats`, `evictGlyphAtlasEntry(atlas, key): boolean`, `compactGlyphAtlas(atlas): void` (defragment pages).
- `setGlyphAtlasGrowthPolicy(atlas, policy)` — bounded multi-page atlas with LRU eviction when full.
- SDF shader programs surfaced to the leaves: `compileGlSdfGlyphProgram` / WGPU equivalent live in the renderer cores (`render-gl`/`render-wgpu`) but are driven by a `GlyphShaderKind` selection (`AlphaCoverageGlyphShaderKind` vs `SdfGlyphShaderKind`) chosen here so a node's atlas kind picks the right program.
- **Cross-backend consistency:** a parity functional scene (`tests/functional/text-gpu-*`) asserting GL and WGPU agree on glyph placement; structural-only tolerance against the Canvas backend and the Rust port (different rasterizer), per the conformance posture.
- Color & per-glyph tint: glyph `color` already packed RGBA; honor `ColorTransform`/alpha from the render proxy in the SDF shader (matches the existing material path).
- **Bidi/RTL-correct placement:** consume `ShapedRun.direction` + clusters so reordered runs draw in visual order — the atlas is glyph-id keyed, so RTL "just works" once the shaper provides reordered runs, but the quad-builder must honor run direction and offsets.

Effort: medium-high. MSDF generation and the SDF shader pair are the new substance; the layout-driven batch is a refactor of existing leaf code.

## Gold

Authoritative GPU text: color emoji, variable fonts, subpixel/hinting fidelity, full edge-case + error handling, performance, and 1:1 Rust parity.

Types in `@flighthq/types`:

- `ColorGlyphKind` (`*Kind`) + `ColorGlyphEntry` — RGBA atlas entries for COLR/CBDT/sbix color glyphs and emoji; `GlyphAtlasFormatKind` (`AlphaPageKind` vs `RgbaPageKind`) so the atlas can host both monochrome coverage and color pages.
- `GlyphVariationCoordinates` — `Readonly<{ axes: ReadonlyMap<string, number> }>` folded into `GlyphKey` so variable-font instances cache distinctly.
- `GlyphSubpixelKind` (`GrayscaleGlyphKind`, `LcdSubpixelGlyphKind`) for LCD subpixel coverage where the backend supports the dual-source/3-channel blend.
- `GlyphHintingKind`, `GlyphAtlasPadding` config for SDF bleed control.
- `MultiAtlasGlyphSource` — a fallback-chain wrapper so missing-glyph (tofu) resolution can pull from a secondary font atlas, with `TofuGlyphKind` as the explicit notdef entry.

Functions / capabilities:

- `acquireColorGlyphAtlasEntry(atlas, key): ColorGlyphEntry | null` + a color-emoji rasterizer backend (web: Canvas2D color glyph draw; Rust: tiny-skia/COLR). Mixed mono+color batching in one draw via per-quad `rasterizationKind`.
- `buildGlyphBatchFromShapedRuns(out, atlas, runs: ReadonlyArray<ShapedRun>, ...)` honoring variable-font coords and OpenType feature variants surfaced by the shaper.
- **Tofu/notdef path:** `resolveGlyphFallback` walks a `MultiAtlasGlyphSource`; guaranteed `.notdef` box for truly missing glyphs (never a silent gap).
- **Performance:** persistent-mapped/instanced glyph quad buffers, per-page upload coalescing (one upload per dirty page per frame), atlas page recycling pool (`acquireGlyphAtlasPage` / `releaseGlyphAtlasPage`), and a "static text" fast path that uploads quads once. `GlyphAtlasStats` wired into `npm run size`/diagnostics.
- **Error handling & sentinels:** every acquire returns `null` (no throw) on capacity exhaustion past `maxPages`, missing rasterizer, or unrasterizable glyph; throw only on programmer misuse (e.g. mismatched page format). Document atlas-thrash behavior (too many sizes → eviction churn) and expose stats to detect it.
- **WGPU compute path (optional):** SDF generation as a compute pass on WGPU where available (ties into the rendering-gpu review's "no WebGPU compute seam" gap), behind a kind so the fragment-pass fallback stays default.
- **Signals (opt-in):** `enableGlyphAtlasSignals(atlas)` exposing `onGlyphAtlasPageAdded` / `onGlyphAtlasEvicted` / `onGlyphAtlasGrew` for tooling and budget alarms — only enabled when a caller opts in.
- **Tests & docs:** exhaustive unit tests (packing, eviction, alias-safe out-params, multi-page growth, RTL placement, tofu), functional scenes covering Latin/Arabic/Indic/CJK/emoji across GL+WGPU, and a `text-gpu` skill doc. Full Rust `flighthq-text-gpu` parity with tiny-skia rasterizer and rustybuzz-fed runs; structural conformance baselines committed.
- **`@flighthq/text-gpu-formats`** matured: BMFont, MSDF-atlas (msdfgen JSON), and Distance-field-font (DFF) importers; export/bake of a runtime-built atlas to a shippable asset (`exportGlyphAtlasToImage` + JSON sidecar) so apps can precompute atlases offline.

Effort: high. Color emoji + variable fonts + the Rust tiny-skia parity are each substantial; the compute SDF path is optional polish.

## Boundaries

What stays out / lives in neighbors:

- **Shaping** (run → glyph ids/advances/offsets/clusters) is **not** here — it is `@flighthq/textshaper` + the full-glyph backend (`textshaper-harfbuzz` / rustybuzz). This package consumes `ShapedRun`; it never reshapes.
- **Layout** (lines, wrapping, alignment, selection geometry, hit-testing) stays in `@flighthq/textlayout`. This package positions glyph quads against an already-computed `TextLayoutResult`; it does no line breaking.
- **Bidi/itemization** (UAX #9) is upstream of the shaper, not here; this package only honors the `direction` a `ShapedRun` already carries.
- **The text display objects** (`TextLabel`, `RichText`, `NativeText`) and their entity/runtime live in `@flighthq/text`. This package has no display-object types; the `displayobject-gl`/`-wgpu` leaves bridge them to the atlas.
- **Canvas2D / DOM text** stay in `displayobject-canvas` / `displayobject-dom` (they reshape via `fillText` and need no atlas). `text-gpu` is GL/WGPU/software-only — there is no Rust `displayobject-canvas`.
- **Generic textures, render targets, samplers** stay in `render-gl`/`render-wgpu`; this package only adds the glyph-atlas concept and its upload seam over them.
- **Font loading / matching / fallback chains / variable-font axis discovery** belong to `@flighthq/resources` (and a future `@flighthq/font`). This package consumes a resolved `fontKey` + variation coords; it does not load or match fonts.
- **CPU pixel ops** (the atlas page is an `ImageSource`) reuse `@flighthq/surface`; no pixel primitives are reinvented here.
- **Filters/effects on text** (glow, drop-shadow) stay in `filters-*`/`effects-*` applied to the rendered result — not baked into the atlas.

## Open design questions

- **Atlas ownership & sharing scope.** One global atlas per render state, or per-font, or per text node? A shared per-state atlas maximizes glyph reuse (the whole point over the canvas-per-node status quo) but needs eviction; per-node defeats the purpose. Leaning: one atlas per render state, keyed in the GL/WGPU runtime, sized by policy.
- **SDF vs alpha-coverage as the Bronze default.** Alpha coverage is simpler and pixel-closer to Canvas (better conformance) but blurs when scaled; SDF scales crisply but never pixel-matches and needs a shader. Proposal: alpha-coverage Bronze, SDF opt-in Silver — but if GPU text is mostly used scaled/animated, SDF-first may be the better golden path.
- **Where the SDF/glyph shader programs live.** In `render-gl`/`render-wgpu` cores (consistent with material shaders) selected by a `GlyphShaderKind` here, vs owned by this package. Cores keep all program compilation in one place; this package keeps the shader source. Decide which package owns the WGSL/GLSL text shader text.
- **Rasterizer determinism across web and native.** Web Canvas2D outline fill vs Rust tiny-skia will not pixel-match (already accepted as structural-only). Should the web default also offer a wasm tiny-skia rasterizer for closer web↔native conformance, at a bundle cost? Or is structural-only sufficient forever?
- **Pixel-ratio / size buckets.** The current code re-rasterizes per `pixelRatio`. With a glyph atlas, do we bucket sizes (snap to integer px to bound atlas entries) or rasterize every exact size (more crisp, more thrash)? SDF sidesteps this by caching one size — another argument for SDF-first.
- **`text-gpu-formats` baked-atlas vs runtime rasterizer coexistence.** When an app ships a precomputed MSDF atlas, runtime glyph misses (a codepoint not in the bake) need a policy: tofu, fall back to the runtime rasterizer, or error. Define the precedence.
- **Color-glyph page format coupling.** Hosting RGBA color pages alongside alpha pages in one `GlyphAtlas` complicates packing and the shader. Separate color atlas vs unified multi-format atlas is a Gold-era decision worth settling before the Silver atlas types harden.

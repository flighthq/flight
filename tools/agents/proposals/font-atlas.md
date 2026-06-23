---
id: font-atlas
title: '@flighthq/font-atlas'
type: new-package
target: font-atlas
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/font-atlas.md
  - tools/agents/docs/reviews/breadth/asset-pipeline.md
  - tools/agents/docs/reviews/breadth/text-typography.md
depends_on: []
updated: 2026-06-23
---

## Summary

Glyph-atlas generation/loading for GPU text — SDF/MSDF rasterization, BMFont/`.fnt` import, dynamic atlas growth, and per-glyph metrics — feeding the GPU text renderers.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that turns "GL text is a Canvas2D overlay" into "GPU backends draw real text from a glyph atlas." One rasterization mode (alpha coverage), a fixed codepoint set, and a straight path to quad UVs.

- **Types in `@flighthq/types`:**
  - `GlyphAtlas` (Entity) + `GlyphAtlasRuntime` — the atlas: one page `ImageResource`, an entry map keyed by glyph key, the backing `AtlasPacker`, `width`/`height`, `pixelRatio`, `padding`, `kind`.
  - `GlyphAtlasEntry` — `{ glyphKey: number; pageIndex: number; atlasX: number; atlasY: number; atlasWidth: number; atlasHeight: number; metrics: GlyphMetrics }` (one glyph's location in the page; `atlas*` is the packed rect).
  - `GlyphMetrics` — `{ advance: number; bearingX: number; bearingY: number; width: number; height: number }` (the pen-to-quad geometry for one glyph at the atlas's reference size).
  - `GlyphAtlasKind` — string `*Kind`; Bronze ships `'CoverageGlyphAtlas'` (8-bit alpha coverage, the Canvas-rasterizable mode).
  - `FontAtlasRasterizerBackend` — the seam: `rasterizeGlyphCoverage(request: Readonly<GlyphRasterRequest>, out: Surface): GlyphMetrics | null` (raster one glyph's coverage into `out`, return its metrics; `null` if the glyph is absent/tofu).
  - `GlyphRasterRequest` — `{ fontFamily: string; fontSize: number; glyphKey: number; codepoint: number; bold: boolean; italic: boolean }` (a measure-tier request keyed by codepoint; `glyphKey === codepoint` at Bronze, becomes a real glyph id with the shaper).
- **`@flighthq/font-atlas`:**
  - `createGlyphAtlas(obj?: Partial<GlyphAtlas>): GlyphAtlas` — constructor with sane defaults (one 512×512 coverage page, padding 1).
  - `getFontAtlasRasterizerBackend()` / `setFontAtlasRasterizerBackend(backend | null)` / `createWebFontAtlasRasterizerBackend()` — the swappable seam; the web backend uses an offscreen Canvas2D `fillText` + `getImageData` coverage read.
  - `ensureGlyphAtlasEntry(atlas: GlyphAtlas, request: Readonly<GlyphRasterRequest>): GlyphAtlasEntry | null` — the workhorse: look up by `glyphKey`; if absent, rasterize via the backend, pack via the `AtlasPacker`, composite into the page `Surface`, and record the entry. Returns `null` on tofu/overflow (sentinel, no throw). Lazily allocates only on cache miss.
  - `getGlyphAtlasEntry(atlas: Readonly<GlyphAtlas>, glyphKey: number): GlyphAtlasEntry | null` — pure lookup, no rasterization.
  - `getGlyphAtlasUV(atlas: Readonly<GlyphAtlas>, entry: Readonly<GlyphAtlasEntry>, out: Rectangle): void` — `out`-param normalized UV rect (atlas px → 0..1), alias-safe; the value the GPU quad samples.
  - `getGlyphAtlasPageImage(atlas: Readonly<GlyphAtlas>, pageIndex: number): ImageResource | null` — the page the renderer uploads as a texture.
  - `prewarmGlyphAtlas(atlas: GlyphAtlas, codepoints: Readonly<number[]>, request: Readonly<GlyphRasterRequest>): number` — batch-ensure a known set (e.g. ASCII); returns the count successfully added.
  - `disposeGlyphAtlas(atlas: GlyphAtlas): void` — detach signals / drop entry maps to GC (no non-GC resource owned by the CPU atlas; the _texture_ is the renderer's to `destroy*`).
- **Renderer upload (in the render packages, listed here for completeness):** `displayobject-gl`/`-wgpu` upload `getGlyphAtlasPageImage` through the existing `bindGlTexture`/`createWgpuTextureEntry` seam and sample the `getGlyphAtlasUV` rect — replacing the Canvas2D text overlay.
- **Effort:** medium. The Canvas2D coverage rasterizer + packer glue + UV math is the bulk; this is the 80/20 that unblocks real GPU text for Latin at a fixed atlas size.

### Silver

Competitive with msdf-atlas-gen / Hiero / fontstash: SDF + MSDF modes, dynamic multi-page growth, BMFont import, kerning, and cross-backend consistency.

- **Types in `@flighthq/types`:**
  - Extend `GlyphAtlasKind`: `'SdfGlyphAtlas'` (single-channel signed distance field), `'MsdfGlyphAtlas'` (multi-channel SDF), `'MtsdfGlyphAtlas'` (MSDF + true SDF in the alpha channel for crisp edges + soft effects).
  - `GlyphAtlasPage` — `{ index: number; image: ImageResource; packer: AtlasPacker }` so a `GlyphAtlas` holds `pages: ReadonlyArray<GlyphAtlasPage>` and grows by adding pages.
  - `SdfGenerationOptions` — `{ range: number; angleThreshold: number; scale: number; edgeColoring: SdfEdgeColoringKind }` (the msdfgen knobs).
  - `SdfEdgeColoringKind` — `'Simple' | 'InkTrap' | 'Distance'` string kinds.
  - `GlyphKerningPair` — `{ leftGlyphKey: number; rightGlyphKey: number; adjustment: number }`.
  - `BitmapFontDescriptor` — the parsed BMFont/msdf layout: `{ pages: ReadonlyArray<BitmapFontPage>; glyphs: ReadonlyArray<GlyphAtlasEntry>; kerning: ReadonlyArray<GlyphKerningPair>; lineHeight: number; baseline: number; size: number; kind: GlyphAtlasKind }` — the value-typed, pre-baked atlas a `-formats` parser yields.
  - Extend `FontAtlasRasterizerBackend` with `getGlyphOutline(request): GlyphOutline | null` (path contours for SDF generation; the Canvas tier returns `null` and only supports coverage).
  - `GlyphOutline` — `{ contours: ReadonlyArray<GlyphContour>; advance; bounds: Rectangle }` (plain data: contours of quadratic/cubic segments).
- **`@flighthq/font-atlas`:**
  - `generateSdfGlyph(outline: Readonly<GlyphOutline>, options: Readonly<SdfGenerationOptions>, out: Surface): GlyphMetrics` — pure-CPU SDF rasterization of one glyph outline.
  - `generateMsdfGlyph(outline, options, out): GlyphMetrics` — the multi-channel variant (edge-coloring + per-channel distance).
  - `createGlyphAtlasFromBitmapFont(descriptor: Readonly<BitmapFontDescriptor>, pageImages: Readonly<ImageResource[]>): GlyphAtlas` — build a ready-to-use atlas from a pre-baked BMFont/msdf import (the artist-tool path; no runtime rasterization).
  - `growGlyphAtlas(atlas: GlyphAtlas): GlyphAtlasPage | null` — add a page when the active one overflows (delegates to `AtlasPacker` auto-grow); fires `onFontAtlasGrow`.
  - `getGlyphKerning(atlas: Readonly<GlyphAtlas>, leftGlyphKey: number, rightGlyphKey: number): number` — kerning lookup (0 when none).
  - `getGlyphAtlasQuad(atlas, entry, penX, penY, out: GlyphQuad): void` — `out`-param quad geometry (positions + UVs) from pen position + metrics + entry, alias-safe — the single call a text renderer makes per glyph.
  - `measureGlyphAtlasRun(atlas, glyphKeys: Readonly<number[]>, out: Rectangle): void` — run bounds from cached metrics + kerning.
  - `repackGlyphAtlas(atlas: GlyphAtlas): boolean` — defragment after eviction (returns `false` if nothing to do); fires `onFontAtlasRepack`.
  - `enableFontAtlasSignals(atlas)` / `disableFontAtlasSignals(atlas)` — the `onFontAtlasGrow` / `onFontAtlasRepack` / `onFontAtlasPageAdded` group.
- **`@flighthq/font-atlas-formats` (neighbor):**
  - `parseBitmapFontText(text: string): BitmapFontDescriptor | null` (AngelCode `.fnt` text), `parseBitmapFontXml(xml: string): BitmapFontDescriptor | null`, `parseBitmapFontBinary(buffer): BitmapFontDescriptor | null` (the three BMFont encodings).
  - `parseMsdfAtlasJson(json: string): BitmapFontDescriptor | null` (msdf-atlas-gen / msdfgen layout).
  - `detectBitmapFontFormat(buffer): BitmapFontFormatKind | null` — magic/heuristic sniff.
  - `loadBitmapFontFromUrl(fntUrl, pageBaseUrl?): Promise<GlyphAtlas>` — fetch descriptor + page images, build a `GlyphAtlas` (parallels `loadTextureAtlasFromUrl`).
- **Cross-backend consistency:** SDF/MSDF generation is CPU-only and identical across backends; the page `Surface`/`ImageResource` is uploaded the same way by `displayobject-gl`/`-wgpu`. The shader-side distance-to-alpha math (`screenPxRange`) is documented as the one convention all backends share, so `gl` and `wgpu` text match.
- **Effort:** large. MSDF generation (edge coloring + per-channel distance + overlap correction) is the heavy, fiddly item; BMFont's three encodings and multi-page growth are bounded. This is the tier that makes the package "use it in production for scalable, effect-friendly GPU text."

### Gold

The authoritative reference: every glyph-atlas mode, online dynamic atlasing with eviction, variable fonts / color glyphs, full edge-case + error handling, exhaustive tests, docs, and 1:1 Rust parity.

- **Types in `@flighthq/types`:**
  - `GlyphAtlasKind` exhaustive: add `'ColorGlyphAtlas'` (COLR/CBDT/sbix color-emoji RGBA bitmaps — no SDF), `'BitmapStrikeGlyphAtlas'` (embedded EBDT/CBLC strikes), and a per-entry `colorChannels` flag so a mixed atlas can hold both coverage and color pages.
  - `GlyphAtlasEvictionKind` — `'Lru' | 'Lfu' | 'Manual'` for the online atlas.
  - `GlyphAtlasStats` — `{ entryCount; pageCount; occupancy; rasterCount; evictCount; growCount; fragmentation }`.
  - `GlyphAtlasKey` helper contract — the canonical `(fontId, glyphId, subpixelBucket, sizeBucket, kind)` packing used as `glyphKey`, so subpixel-positioned and multi-size glyphs coexist deterministically.
  - `VariableFontAxis` / `GlyphRasterRequest.variationAxes` — variable-font axis coordinates (`wght`/`wdth`/`slnt`/custom) so a single family rasterizes any instance.
  - `FontAtlasIssue` open contract (font-missing, glyph-missing/tofu, page-overflow, rasterizer-missing, outline-unavailable) for structured non-throwing diagnostics.
  - `enableFontAtlasSignals` payloads extended with `onFontAtlasGlyphEvicted` and `onFontAtlasTextureInvalidated` (the precise dirty-rect a renderer must re-upload).
- **`@flighthq/font-atlas`:**
  - **Online dynamic atlas with eviction:** `acquireGlyphAtlasEntry(atlas, request, out: GlyphAtlasEntry): boolean` / `releaseGlyphAtlasEntry(atlas, glyphKey)` paired pool brackets; `setGlyphAtlasEvictionPolicy(atlas, kind)`; eviction reuses freed rects via the online `AtlasPacker` and fires `onFontAtlasGlyphEvicted`. Steady-state zero-allocation: hot-path quad/UV via `out`-params + `@flighthq/geometry` pools.
  - **Dirty-rect upload:** `getGlyphAtlasDirtyRegion(atlas, pageIndex, out: Rectangle): boolean` — the minimal sub-rect added since last upload, so the renderer does `texSubImage2D` instead of re-uploading the page; `markGlyphAtlasPageClean(atlas, pageIndex)`.
  - **Subpixel + hinting:** `getGlyphAtlasSubpixelBucket(penX): number` and a documented subpixel-bucket convention (N horizontal phases) so kerned text is crisp; optional `snapGlyphToPixelGrid` for the no-subpixel path.
  - **Color & bitmap glyphs:** `ensureColorGlyphAtlasEntry(atlas, request)` for COLR/CBDT/sbix, routed to an RGBA page; `selectGlyphAtlasMode(font, codepoint): GlyphAtlasKind` picks coverage/SDF/color per glyph (emoji → color, text → SDF).
  - **Variable fonts:** `ensureGlyphAtlasEntry` honors `variationAxes`; `getFontVariationAxes(fontFamily): ReadonlyArray<VariableFontAxis> | null` via the backend.
  - **Quality / stats / diagnostics:** `getGlyphAtlasStats(atlas, out): void`, `validateGlyphAtlas(atlas): FontAtlasIssue | null`, `trimGlyphAtlas(atlas)` (minimal bounding page for a build-time bake), `getGlyphAtlasByteSize(atlas): number`.
  - **Full SDF feature set:** overlap-correction, error-correction pass (msdfgen's artifact removal), per-glyph `range`/`scale` autoselection, and `getSdfScreenPxRange(atlas, fontSize): number` so the renderer's distance-to-alpha is exact at any scale.
  - **Edge cases:** zero-size/empty glyphs (space → metrics, no raster), single-oversized glyph (reported via `FontAtlasIssue`, never an infinite grow loop), tofu/`.notdef` fallback, missing rasterizer backend (sentinel, not throw), page-cap exhaustion, duplicate keys, subpixel-bucket vs eviction interaction.
- **`@flighthq/font-atlas-formats`:**
  - **Writers / round-trip** (the `*-formats` parse+serialize maturity signal): `serializeBitmapFontText`, `serializeBitmapFontBinary`, `serializeMsdfAtlasJson`, and `bakeGlyphAtlasToBitmapFont(atlas): { descriptor; pageImages }` — so the SDK can _produce_ a baked atlas for build pipelines, not only consume one.
  - Hiero and BMFont-`info`/`common`/`distanceField` block fidelity; channel-packing metadata (MSDF in RGB, AA in A).
- **Tests:** colocated `*.test.ts` per file; golden fingerprint vectors over a canonical font + codepoint set so SDF/MSDF generation changes are visible; `out`-aliasing tests for every `out`-param fn; sentinel/`FontAtlasIssue` paths asserted; a functional scene rendering the same atlas across `displayobject-gl`/`-wgpu`/`displayobject-skia` to lock cross-backend agreement.
- **Rust parity:** `flighthq-font-atlas` (+ `flighthq-font-atlas-formats`) is 1:1 conformant — rasterizer over `ttf-parser` + tiny-skia, the same SDF/MSDF transform (bit-deterministic page output), same packer (`flighthq-atlas-packer`), same metrics. Page-bitmap output is the conformance reference the GPU backends are checked against (the `displayobject-skia` text path consumes the coverage page directly). Committed conformance scenes paired by name (`text_glyph_atlas_msdf`, `text_bitmap_font_import`, …); intentional TS↔Rust divergences (rasterizer vendor AA differences) recorded in the divergence map.
- **Docs:** the `glyphKey` packing convention, the `screenPxRange` distance-to-alpha contract every backend shares, the coverage-vs-SDF-vs-color mode selection, and the online-vs-baked decision.
- **Effort:** very large. Online eviction + dirty-rect upload, color/variable fonts, and the writer side are the long tail. Order Gold after Silver's SDF/MSDF + BMFont path is proven on both GPU backends.

## Boundaries

- **Shaping stays in `@flighthq/textshaper`.** `font-atlas` consumes glyph ids/advances/clusters; it never resolves GSUB/GPOS, bidi, or clusters. The full-glyph shaper (HarfBuzz / rustybuzz) is the upstream producer of the `glyphKey` ids this atlas caches.
- **Layout stays in `@flighthq/textlayout`.** Line breaking, wrapping, alignment, and run positioning are not here. `font-atlas` answers "where is glyph G in the page and what is its quad" — `textlayout` decides where each glyph sits on the line.
- **Rectangle packing stays in `@flighthq/atlas-packer`.** `font-atlas` is a _consumer_ of the online `AtlasPacker`; it does not re-implement MaxRects/Skyline. The packer manages space within a page; `font-atlas` manages which glyphs are resident.
- **GPU texture handle ownership stays in the renderers.** `font-atlas` produces a CPU page `ImageResource`/`Surface` and the UV/quad/dirty-rect data; `WebGLTexture`/`GPUTexture` creation, `texSubImage2D` upload, and the text shader live in `displayobject-gl`/`-wgpu` over the existing `bindGlTexture`/`createWgpuTextureEntry` seam. `destroy*` of the texture is the renderer's.
- **Uncompressed/compressed image decode stays out.** Loading a pre-baked atlas _page PNG_ uses the normal `@flighthq/resources` image loaders (and the requested `image-codec`/`texture-formats` seams for non-DOM/native decode). `font-atlas` does not decode container formats; it consumes decoded `ImageResource` pages.
- **Font loading / family matching / fallback stays in `@flighthq/resources` (and a future `@flighthq/font`).** `font-atlas` takes a resolved `fontFamily` + variation axes; it does not own family/weight/style matching, codepoint-coverage queries, or the fallback chain. Tofu handling here is "report the glyph is missing," not "find a covering font."
- **Text display objects / input stay in `@flighthq/text` / `@flighthq/textinput`.** This package has no entity that appears in the scene graph; it is infrastructure the GPU text path attaches to a renderer, not a display object.
- **Effects/filters stay out.** Glow/outline/soft-shadow on SDF text is a _shader_ concern in the text renderer (the SDF page enables it); `font-atlas` only guarantees the distance field and `screenPxRange` are correct.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **`glyphKey` ownership and packing.** Is the canonical `(fontId, glyphId, subpixelBucket, sizeBucket, kind)` packing defined here, in `@flighthq/types`, or co-owned with `textshaper` (which produces the glyph ids)? It must be one stable convention both packages agree on, mirrored in Rust. Recommendation: define the packing in `@flighthq/types` as the header, since both `textshaper` and `font-atlas` key against it.
- **Shaper coupling at Bronze.** Bronze keys by codepoint (`glyphKey === codepoint`) so the atlas is usable on the Canvas/measure tier before the full-glyph shaper lands. Is a codepoint-keyed atlas an acceptable interim, or does that bake in a convention that fights the shaper's glyph-id keys later? Recommendation: ship codepoint-keyed Bronze but reserve the upper key bits for the `fontId`/`kind` fields so the transition is additive.
- **Where SDF generation runs vs. the rasterizer seam.** Coverage rasterization is host-bound (Canvas2D / ttf-parser+skia) and behind the backend seam; the SDF/MSDF _transform_ is pure CPU and in-package. But MSDF needs glyph **outlines**, which the Canvas tier cannot provide — so SDF modes require the full (outline-capable) backend. Should the package expose this as a hard capability gate (`hasFontAtlasOutlineSupport()`), or silently fall back to coverage? Recommendation: explicit capability query + sentinel, no silent downgrade.
- **One atlas per (font,size,mode) vs. one shared multi-page atlas.** SDF text scales from a single size, so an SDF atlas can be size-independent; a coverage/bitmap atlas needs a page per size bucket. Does a `GlyphAtlas` hold a single mode, or can it mix coverage + SDF + color pages (as Gold's `colorChannels` flag implies)? Recommendation: single-mode atlas as the simple default, mixed-mode as a Gold capability behind the per-entry flag.
- **`screenPxRange` / distance-to-alpha contract location.** The shader math that turns the distance field into coverage lives in the renderers, but the `range` it depends on is baked by `font-atlas`. Is `getSdfScreenPxRange` the authoritative source the shaders must call, and is that contract documented in `@flighthq/types` so `gl`/`wgpu`/`skia` cannot drift? Recommendation: yes — make it a typed, documented seam, not a per-renderer constant.
- **Color-emoji scope.** COLR/CBDT/sbix/variable-COLR are a large, format-heavy subsystem. Is full color-glyph support in scope for Gold here, or does it warrant its own neighbor (`font-atlas-color`) so the SDF core stays light? Recommendation: keep COLRv0 + CBDT in Gold; defer COLRv1 gradients/transforms to a question for a dedicated cell.
- **Eviction trigger ownership.** When a future asset-cache or the text renderer needs to evict glyphs, who drives it — the renderer (frame-budget aware), the atlas (occupancy aware), or a signal? Mirrors the same question in `atlas-packer`/asset-cache; surface as a cross-package decision rather than fixing it here.

## Agent brief

> Create `@flighthq/font-atlas` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

# New Package Spec: @flighthq/textshaper-harfbuzz

**Represents:** The full-glyph text-shaper backend — a HarfBuzz-class shaper (HarfBuzz-wasm on web, rustybuzz in the Rust port) that implements `TextShaperBackend` at full strength: positioned glyphs (ids, advances, offsets, clusters), GSUB/GPOS feature application, and complex-script support (Arabic/Indic/Thai/Hebrew), upgrading `shapeText` from advances-only width to real `ShapedRun`s and thereby unblocking GPU/software text and correct international typography.

**Requested by:** text-typography

## Fits

- **Position.** A registerable backend that fills the existing `@flighthq/textshaper` seam. Today only `@flighthq/textshaper-canvas` (advances-only, `measureText`) implements `TextShaperBackend`; this is the heavy, opt-in second backend that produces real glyph runs. It is the `textshaper-canvas` sibling, exactly as `displayobject-skia` is the software renderer behind the render seam: same seam, richer backend. It sits below `@flighthq/textlayout` (which consumes shaped runs) and below the GPU text path in `displayobject-gl` / `displayobject-wgpu` (which rasterize the glyph ids it returns).
- **Dependencies.** `@flighthq/types` (header layer; the `ShapedRun`/`ShapedGlyph` and feature/axis types live there), and the seam package `@flighthq/textshaper` only for shape-time wiring if needed — but it should **not** import `@flighthq/textshaper`'s registration functions at module load (import side-effect-free). It must **not** depend on `@flighthq/textlayout`, `@flighthq/text`, or any renderer — those depend on the shaped output, not the reverse. The actual HarfBuzz engine is a vendored/dynamically-loaded wasm asset, not a normal npm dependency pulled into every bundle.
- **Backend seam.** Singleton `set*Backend` shape, matching the existing `textshaper` seam (`getTextShaperBackend` / `setTextShaperBackend`). This package exports a `createHarfBuzzTextShaperBackend(...)` constructor returning a `TextShaperBackend`; the host calls `setTextShaperBackend(createHarfBuzzTextShaperBackend(...))` to swap the canvas default for HarfBuzz. No top-level registration, no global mutation on import — the ~1MB wasm cost is paid only when the app opts in (a direct bundle-size-discipline requirement: see [bundle size](../../bundle-size.md) and [rust/text](../../rust/text.md)).
- **Neighbor packages.** `@flighthq/textshaper` (the seam), `@flighthq/textshaper-canvas` (the measure-only sibling backend). A future `@flighthq/font` (font matching / fallback / variable-axis selection) would feed this backend the resolved face + axis values; until it exists, this package consumes `@flighthq/types`' `Font`/`FontResource` directly. Glyph **rasterization** is not here — it lives with the renderers (tiny-skia in Rust, the per-backend atlas in GL/WGPU).
- **Rust crate.** `flighthq-textshaper-harfbuzz` — backed by **rustybuzz** (pure-Rust HarfBuzz port: GSUB/GPOS, most scripts, deterministic, no FFI) over **ttf-parser** for face access. `harfbuzz_rs` (C FFI) is the documented escape hatch only if AAT/`morx` coverage is ever required. Per the [rust/text](../../rust/text.md) canonical stack, rustybuzz is the chosen full-glyph tier; it is the conformance reference paired with harfbuzz-wasm on the TS side, so shaped _geometry_ (glyph selection + positions) conforms closely even though rasterized pixels never pixel-match the browser.

## Bronze

The minimum genuinely-useful full-glyph shaper: a registerable HarfBuzz backend that returns real positioned glyphs for Latin + at least one complex script, so GPU/software text has glyph ids to rasterize and kerning/ligatures finally work. This is the single highest-priority text gap.

- **Types in `@flighthq/types`** (header first — these promote the shaper seam from advances-only to glyph-bearing):
  - `ShapedGlyph` — `{ readonly glyphId: number; readonly cluster: number; readonly xAdvance: number; readonly yAdvance: number; readonly xOffset: number; readonly yOffset: number }` (positions in font units or px per a documented convention; `cluster` is the source string byte/char index for selection).
  - `ShapedRun` — `{ readonly glyphs: ReadonlyArray<ShapedGlyph>; readonly font: string; readonly direction: TextDirection; readonly script: string }`.
  - `TextDirection` — `'ltr' | 'rtl'` (string-valued; the bidi package will reuse it).
  - Extend `TextShaperBackend` with an **optional** glyph method so advances-only callers are unaffected: `shapeRun?(text: string, format: Readonly<TextFormat>): ShapedRun | null`. `measureText` stays required (width = Σ `xAdvance` of `shapeRun` for backends that implement it).
- **Seam additions in `@flighthq/textshaper`** (the seam, not this package):
  - `shapeTextRun(text: string, format: Readonly<TextFormat>): ShapedRun | null` — dispatches to the active backend's `shapeRun`; returns `null` when no backend is registered or the backend is measure-only (sentinel, not throw). `shapeText` (width) keeps working for both tiers.
- **This package (`@flighthq/textshaper-harfbuzz`):**
  - `createHarfBuzzTextShaperBackend(options: Readonly<HarfBuzzTextShaperOptions>): TextShaperBackend` — returns a backend implementing both `measureText` and `shapeRun`. Allocation is explicit (`create*`).
  - `HarfBuzzTextShaperOptions` (in `@flighthq/types`) — Bronze: `{ getFontData(font: string): Readonly<Uint8Array> | null }` (caller supplies font bytes; this package does not load fonts) plus the wasm module/locator hook (`wasmBinary?` / `instantiate?`) so the host controls how the ~1MB asset is fetched.
  - `destroyHarfBuzzTextShaperBackend(backend): void` — frees the wasm face/buffer handles (a non-GC resource → `destroy*`, per the teardown-verb rule).
- **Capabilities:** Latin shaping with real glyph ids + GPOS kerning + GSUB ligatures; one RTL/complex script proven end to end (Arabic joining + reordering) to validate the seam carries clusters/direction correctly.
- **Tests:** colocated `*.test.ts`; a committed test font, assert glyph ids/advances/clusters for a known Latin string, a kerned pair, a ligature (`fi`), and an Arabic word (cluster order + glyph count). Backend returns `null` from `shapeRun` only on misuse, not on unsupported script (it shapes with notdef/tofu instead).
- **Rust:** `flighthq-textshaper-harfbuzz` over rustybuzz + ttf-parser; `shape_run` returning `ShapedRun`; same committed-font assertions. Conformance: shape the same string in harfbuzz-wasm (TS) and rustybuzz (Rust), compare glyph ids + positions structurally (not pixels) per the text scene-category tolerance.

## Silver

Competitive with a production HarfBuzz integration: feature control, variable fonts, the full common-script set, language/script tagging, and the cluster-aware selection that makes `textlayout` correct.

- **Types (`@flighthq/types`):**
  - `OpenTypeFeature` — `{ readonly tag: string; readonly value: number; readonly start?: number; readonly end?: number }` (e.g. `{ tag: 'liga', value: 0 }` to disable ligatures, `'smcp'`, `'ss01'`, `'tnum'`). Range fields let features apply to substrings.
  - `VariableFontAxis` — `{ readonly tag: string; readonly value: number }` (`'wght'`, `'wdth'`, `'slnt'`, `'opsz'`, custom axes).
  - `TextShapingOptions` — `{ readonly features?: ReadonlyArray<OpenTypeFeature>; readonly axes?: ReadonlyArray<VariableFontAxis>; readonly language?: string; readonly script?: string; readonly direction?: TextDirection }` (BCP-47 language, ISO-15924 script; explicit overrides for the itemizer's auto-detection).
  - Overload `TextShaperBackend.shapeRun?(text, format, options?: Readonly<TextShapingOptions>)` and the seam `shapeTextRun(text, format, options?)`.
  - `ShapedRunMetrics` — `{ readonly ascent: number; readonly descent: number; readonly lineGap: number; readonly width: number }` so layout reads vertical metrics from the shaper, not a separate path.
- **Seam additions (`@flighthq/textshaper`):**
  - `shapeTextRunInto(out: ShapedRun, text, format, options?): ShapedRun | null` — caller-owned/reused run for hot reshaping loops (explicit-allocation `out` variant; glyph array grown in place).
  - `getShapedRunMetrics(run: Readonly<ShapedRun>, format): ShapedRunMetrics` and `getShapedRunWidth(run): number` (Σ `xAdvance`).
  - `getTextShaperFeatureSupport(tag: string): boolean` / `getTextShaperAxisSupport(font, tag): boolean` — capability queries before requesting a feature/axis.
- **This package:**
  - HarfBuzz feature application (`features`) and named/arbitrary variable-font instances (`axes`) wired through.
  - Explicit `language`/`script` tagging plus an internal script auto-detection fallback when the itemizer does not supply one.
  - Full common-script coverage exercised: Arabic, Hebrew, Devanagari/Indic conjuncts, Thai, plus Latin/Cyrillic/Greek with marks — each with a committed shaping assertion.
  - A reusable per-face cache (`createHarfBuzzFaceCache()` / `disposeHarfBuzzFaceCache(cache)`) so repeated shaping of the same font does not re-parse the face; passed in via `HarfBuzzTextShaperOptions.faceCache`.
- **`textlayout` integration (in `@flighthq/textlayout`, not here):** `set_text_layout_measure_provider`'s successor consumes `shapeTextRun`; `rich_text_query` selection becomes cluster-correct across ligatures and reordering (the review's "selection splits graphemes/ligatures" gap). This package only supplies the runs.
- **Signals (opt-in):** `enableTextShaperSignals()` exposing a "wasm-backend-ready / load-failed" signal group, since wasm load is async — only paid for when enabled, owned by the seam/this package.
- **Rust parity:** rustybuzz feature + variation-axis APIs, language/script tagging, face cache, `shape_run_into`, metrics. Recorded in the conformance map; per-script shaped-geometry comparison as cells in the parity matrix (`rust:harfbuzz` vs `ts:harfbuzz`).

## Gold

Authoritative: every script/quirk HarfBuzz supports, fallback and itemization integration, color/emoji glyph data, performance, exhaustive error and edge handling, docs, and 1:1 Rust parity — nothing a shaping expert would find missing.

- **Itemization + bidi integration (types in `@flighthq/types`):**
  - `ShapedParagraph` — `{ readonly runs: ReadonlyArray<ShapedRun>; readonly direction: TextDirection; readonly levels: ReadonlyArray<number> }` (per-run resolved embedding levels, reordered for display).
  - `shapeTextParagraph(text, format, options?): ShapedParagraph | null` — itemizes by script/direction/font, runs bidi (UAX #9) to resolve levels and reorder, shapes each run, mirrors brackets. (Bidi resolution proper belongs in a `@flighthq/textbidi` neighbor; this consumes it. If `textbidi` is not built, the function is the integration point.)
  - Grapheme-cluster awareness (UAX #29) surfaced so caret/selection never splits a cluster: `getShapedRunClusterBoundaries(run): ReadonlyArray<number>`.
- **Font fallback (driven by `@flighthq/font`, consumed here):** when a run contains codepoints the primary face lacks, shape the covered span, then re-shape the uncovered span against the fallback chain — `ShapedRun.font` already records which face each run resolved to. `shapeTextRunWithFallback(text, format, fallbackChain, options?)`.
- **Color & emoji glyphs (types in `@flighthq/types`):**
  - `ShapedGlyph` gains optional `paletteIndex` / layer data for COLR/CPAL; `getShapedGlyphColorLayers(font, glyphId): ReadonlyArray<ColorGlyphLayer> | null` for COLRv0/v1, plus CBDT/sbix bitmap-emoji glyph references. ZWJ emoji sequences and skin-tone modifiers shape to single glyph clusters.
- **Performance:** `shapeTextRunInto` everywhere on the hot path; a shaping plan cache keyed by `(face, script, language, features)` so repeated runs skip plan construction; pooled HarfBuzz buffers (`acquireHarfBuzzBuffer`/`releaseHarfBuzzBuffer`); wasm-SIMD build of HarfBuzz where available; a documented per-frame allocation budget and committed benchmarks.
- **Error model:** non-throwing — `getLastTextShaperError(): TextShaperError | null` (a value) and `TextShaperErrorKind` (`'wasm-load-failed' | 'invalid-font' | 'unsupported-feature'`). Public functions still return sentinels (`null`); unsupported scripts shape to `.notdef` (tofu) rather than failing, and missing-glyph runs are detectable (`hasShapedRunMissingGlyphs(run): boolean`).
- **Docs:** a package doc covering the two shaper tiers and when each is required, the glyph-position/units convention, the cluster model and how `textlayout` selection consumes it, the ~1MB opt-in cost and how to lazy-load it, the feature/axis API, and the structural-not-pixel conformance posture for text.
- **Rust 1:1:** rustybuzz at full strength — features, variations, all scripts, COLR/bitmap emoji (where rustybuzz/`ttf-parser` expose it; AAT/`morx` gaps and the `harfbuzz_rs` escape hatch recorded in the [divergence map](../../rust/conformance.md)), fallback, the shaping-plan + buffer pools. Chosen as the single canonical deterministic shaper across machines (per [rust/text](../../rust/text.md)); full conformance entries comparing shaped geometry against harfbuzz-wasm cell-by-cell.

## Boundaries

- **Rasterization stays with the renderers.** This package returns glyph **ids + positions**, never bitmaps. Filling glyph outlines into a coverage bitmap / atlas is tiny-skia (shared with `displayobject-skia` shapes) and the per-backend GPU atlas in `displayobject-gl`/`-wgpu`. The shaper is the geometry layer, not the pixel layer.
- **Layout stays in `@flighthq/textlayout`.** Lines, wrapping, alignment, justify, tab stops, line breaking (UAX #14), selection rectangles — all consume `ShapedRun`s but are owned by `textlayout`. Do not adopt a shaper crate that also lays out (cosmic-text, parley, fontdue layout); it would fight Flight-owned layout.
- **Bidi/itemization belongs in a `@flighthq/textbidi` neighbor.** UAX #9 resolution, bracket mirroring, and script/direction segmentation are their own cell. Gold _consumes_ bidi to build `ShapedParagraph`; it does not own the algorithm.
- **Font loading/matching/fallback belongs in `@flighthq/font` (and `@flighthq/resources`).** Family/weight/style/stretch matching, fallback chains, codepoint coverage, variable-axis resolution, and `.notdef` policy live there. This package takes resolved font bytes + axis values and shapes; it does not decide _which_ font.
- **The measure-only tier stays in `@flighthq/textshaper-canvas`.** Canvas-rendered text (`fillText` reshapes internally) needs no glyph ids; that lightweight default is the canvas backend's job. This package is only the heavy tier, opt-in.
- **The seam stays in `@flighthq/textshaper`.** `getTextShaperBackend`/`setTextShaperBackend`/`shapeText`/`shapeTextRun` are the seam's API; this package only provides a backend instance to register. The shared `ShapedRun`/`ShapedGlyph` types live in `@flighthq/types`, not here.
- **No DOM dependency.** HarfBuzz-wasm + caller-supplied font bytes; nothing touches `document`/`canvas`. The web specificity (how the wasm asset is fetched) is a host-supplied locator hook, keeping core and Rust crate DOM-free.

## Open design questions

- **Position units: font units vs pixels.** Should `ShapedGlyph` advances/offsets be in font design units (caller scales by `size`/`unitsPerEm`) or pre-scaled to pixels at the requested `size`? Font units are more faithful and let one shaping result serve multiple sizes; pixels are simpler for `textlayout`. Pick one SDK-wide and document it on `ShapedGlyph`.
- **Backend interface growth vs a second interface.** Bronze adds optional `shapeRun?` to `TextShaperBackend`. Is one growing interface (measure-only backends leave `shapeRun` undefined) right, or should full-glyph be a distinct `GlyphShaperBackend` the seam detects? The optional-method path keeps one seam and one registry; confirm against the seam's intent.
- **wasm asset delivery.** How does the ~1MB HarfBuzz-wasm reach the backend — bundled and base64'd (bad for tree-shaking), fetched from a URL the host configures, or fully host-injected via `instantiate`? The locator hook in `HarfBuzzTextShaperOptions` defers this to the host, but the recommended default for examples needs deciding (and must not regress the base bundle).
- **Where bidi runs.** `shapeTextParagraph` (Gold) needs resolved embedding levels. Does this package call into `@flighthq/textbidi`, or does `textlayout` do bidi and feed pre-itemized runs to `shapeTextRun`? Cleanest is: `textbidi` resolves → `textlayout` itemizes → calls `shapeTextRun` per run; then `shapeTextParagraph` is a convenience that may not belong here at all.
- **Variable-font instance caching.** Each `axes` combination is effectively a distinct face for shaping-plan purposes. Does the face cache key on `(font, axes)`, and how is the cache invalidated/bounded? Affects the cache API in Silver.
- **Color-emoji output shape.** COLRv1 (gradients, transforms) is rich; should the shaper return layer/paint data, or only flag color glyphs and leave the renderer to read COLR? The `getShapedGlyphColorLayers` shape vs a renderer-side reader changes which package owns the OpenType color tables.
- **AAT/`morx` coverage.** rustybuzz does not fully cover Apple's AAT tables; harfbuzz-wasm does. This is a potential Rust↔TS divergence for AAT-only fonts. Decide whether AAT is a Gold target (via the `harfbuzz_rs` FFI escape hatch) or a documented web-only divergence in the conformance map.

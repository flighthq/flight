---
id: textshaper
title: '@flighthq/textshaper'
type: depth
target: textshaper
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/textshaper.md
  - tools/agents/docs/reviews/depth/textshaper.md
depends_on: []
updated: 2026-06-23
---

## Summary

stub — completeness 18/100 (a correct, well-shaped registration seam that _measures_ rather than _shapes_; the depth gap is policy — the advances-only "measure tier" the text design doc owns — not oversight).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The first genuinely useful version: give every non-Canvas renderer a way to obtain glyph ids and positions, and make caret/selection correct across ligatures. This is the 20% that unblocks the 80% — GPU/software text rendering and correct hit-testing — without yet chasing complex-script perfection.

Header types first (in `@flighthq/types`, new files mirroring filename = type name):

- `ShapedGlyph` — `Readonly` data: `glyphId: number`, `cluster: number`, `xAdvance: number`, `yAdvance: number`, `xOffset: number`, `yOffset: number`.
- `ShapedRun` — `glyphs: readonly ShapedGlyph[]`, `font: Font`, `direction: TextDirectionKind`, `script: string` (ISO 15924 tag, e.g. `'Latn'`), plus run-level `advanceWidth: number` and `glyphCount: number`.
- `TextDirectionKind` — `*Kind` string identifiers: `'LeftToRight' | 'RightToLeft' | 'TopToBottom'` (string-kind model, not a closed union baked into the seam).
- `TextShaperOptions` — `Readonly`: `direction?: TextDirectionKind`, `script?: string`, `language?: string`. Optional today; the seam reads sentinels (auto-detect) when absent.

Extend the backend contract and free functions:

- `TextShaperBackend.shapeRun?: (text, format, options?) => ShapedRun | null` — optional method so existing measure-only backends (`textshaper-canvas`) stay valid; returns `null` when the backend cannot produce glyph ids (the Canvas floor — browser hides them).
- `shapeTextRun(text, format, options?): ShapedRun | null` free function alongside `shapeText`. Returns `null` when no backend is registered _or_ the backend is measure-only; callers distinguish "no glyphs available" from a real empty run via `null` vs an empty-`glyphs` run.
- Keep `shapeText` (advances-only, `-1` sentinel) untouched — it remains the lightweight layout path.

Explicit allocation + reuse:

- `createShapedRun(): ShapedRun` and `clearShapedRun(out): void` so a backend can allocate or reuse buffers explicitly; `shapeTextRunInto(text, format, out, options?): boolean` out-param variant for hot loops (returns `false` on failure, no allocation of the run shell).

Land the planned full-glyph neighbor (the dependency-carrying parser/shaper, named per the `-formats`/host-backend convention):

- `@flighthq/textshaper-harfbuzz` — harfbuzz-wasm backend exposing `createHarfBuzzTextShaperBackend(wasm): TextShaperBackend` (consumer passes the wasm module explicitly, like `host-electron`'s injected `electron`), implementing both `measureText` and `shapeRun`. Not re-exported from `@flighthq/sdk`; opt-in so the ~1MB wasm stays off the default bundle.

### Silver

Competitive and solid — what a well-regarded shaping library offers for professional use: real font features, font metrics, complex scripts, and cross-backend consistency between the canvas, harfbuzz, and Rust paths.

Font metrics path (header types in `@flighthq/types`, accessors here):

- `FontMetrics` — `Readonly`: `ascent`, `descent`, `lineGap`, `xHeight`, `capHeight`, `unitsPerEm`, `underlinePosition`, `underlineThickness`. (Pixel-scaled; backends derive from font units × size.)
- `GlyphExtents` — `Readonly`: `xBearing`, `yBearing`, `width`, `height` (per-glyph bounding box for atlas packing).
- `TextShaperBackend.getFontMetrics?: (format) => FontMetrics | null` and `getGlyphExtents?: (glyphId, format) => GlyphExtents | null`.
- `getFontMetrics(format): FontMetrics | null` and `getGlyphExtents(glyphId, format): GlyphExtents | null` free functions, with `getFontMetricsInto`/`getGlyphExtentsInto` out-param variants.
- `getFontUnitScale(format): number` helper (font-unit↔pixel scaling), sentinel `-1` when no backend.

OpenType features (the kerning/ligature/alternates surface):

- `TextFeature` — `Readonly`: `tag: string` (4-char OpenType tag, `'liga'`, `'kern'`, `'smcp'`, `'ss01'`...), `value: number` (0/1 toggle or numeric), optional `start`/`end` cluster range.
- Add `features?: readonly TextFeature[]` to `TextShaperOptions`. Backends apply GSUB/GPOS accordingly; Canvas backend ignores unsupported tags (returns advances-only).
- Named common-tag constants for grepability (`TextFeatureKerning = 'kern'`, `TextFeatureLigatures = 'liga'`, etc.) without forcing a closed enum.

Complex scripts and itemization handoff:

- `itemizeText(text, format): readonly TextItem[]` — split a string into runs by script + direction + (optional) font, returning `TextItem { start, end, script, direction }`. Lives here because shaping consumes it; `TextItem` is a header type. Backend-provided where the backend can (harfbuzz/ICU); a built-in Unicode-property fallback covers Latin/RTL detection.
- Through the full-glyph backend: correct Arabic joining, Indic/Thai reordering and conjuncts, Hebrew/diacritic mark placement — exercised by conformance tests, not new API surface (it falls out of `shapeRun` once features + itemization feed it).
- `shapeTextRuns(text, format, options?): readonly ShapedRun[]` convenience that itemizes then shapes each run.

Vertical text + caching:

- `yAdvance` already in `ShapedGlyph`; add `TextDirectionKind` `'TopToBottom'` handling end-to-end and a `verticalMetrics?` field on `FontMetrics`.
- `createTextShaperCache(): TextShaperCache` + `shapeTextRunCached(cache, text, format, options?): ShapedRun | null` + `clearTextShaperCache(cache)` / `disposeTextShaperCache(cache)` — explicit, caller-owned shaping cache (no hidden global). Keyed by `(text, format identity, options)`.

Cross-backend consistency:

- A shared spec/test fixture set so `textshaper-canvas`, `textshaper-harfbuzz`, and the Rust `flighthq-textshaper` produce structurally-matching `ShapedRun`s for the same input (advances within tolerance; identical cluster maps). Documented in the conformance map.

### Gold

Authoritative / AAA — the canonical reference for shaping in this domain. Nothing a HarfBuzz expert would find missing.

Variable fonts and full OpenType reach:

- `FontVariation` — `Readonly`: `axis: string` (`'wght'`, `'wdth'`, `'slnt'`, `'opsz'`, `'ital'`...), `value: number`. Add `variations?: readonly FontVariation[]` to `TextShaperOptions`; named axis constants (`FontVariationWeight = 'wght'`...).
- `getFontVariationAxes(format): readonly FontVariationAxis[]` — enumerate axes with `min`/`default`/`max`/`name`.
- Full feature interrogation: `getFontFeatures(format): readonly string[]` (available GSUB/GPOS tags), `getFontScripts(format)`, `getFontLanguages(format, script)`.
- Named glyph access: `getGlyphIndexForChar(codePoint, format): number` (sentinel `-1`), `getGlyphName(glyphId, format): string`, `getCharForGlyph(...)` for fallback/debug.

Cluster, fallback, and editing correctness (the editing-grade surface `textinput`/`richTextQuery` need):

- `getClusterForIndex(run, stringIndex): number` and `getIndexRangeForCluster(run, cluster): readonly [number, number]` — cluster↔string-index navigation for caret movement, selection, grapheme-aware editing (replacing per-character advance summing in `richTextQuery`).
- `getCaretPositionsForRun(run, out): number[]` — grapheme-aware caret x-positions across ligatures/reordering.
- Font fallback: `FontFallbackBackend` seam (`get*`/`set*`/`createWeb*`) — resolve missing glyphs (`.notdef`) against a fallback chain; `shapeRun` emits `font` per sub-run after fallback. Header type `ShapedRun` already carries `font`; add `isNotdefGlyph(glyph): boolean`.

Performance:

- Glyph-buffer pooling: `acquireShapedRun()` / `releaseShapedRun(run)` paired pool brackets; sub-buffer reuse for `glyphs` arrays so steady-state shaping allocates nothing.
- Incremental reshape API: `reshapeTextRun(prevRun, edit, out)` that reuses unaffected clusters on small edits (the typing-into-a-paragraph case).
- Atlas-oriented batch path: `getGlyphExtentsBatch(glyphIds, format, out)` for one-call atlas sizing.

Signals (opt-in group, owned here):

- `enableTextShaperSignals()` + a `TextShaperSignals` entity (`onBackendChanged`, `onFontFallback`) for hosts that hot-swap shapers or want to observe fallback. Off by default (cost assumed only on `enable*`).

Tests, docs, and Rust parity:

- Exhaustive colocated tests per exported function (the `exports:check` gate), including out-param alias cases and the unregistered/measure-only/full-glyph backend matrix.
- A functional text scene proving GPU/software glyph rendering matches the shaped geometry across backends (structural-only tolerance per the text conformance posture — text never pixel-matches the browser).
- 1:1 `flighthq-textshaper` Rust crate parity: `shape_text_run`, `ShapedRun`/`ShapedGlyph`, `get_font_metrics`, feature/variation options, and the `flighthq-textshaper-harfbuzz` (rustybuzz) sibling. Both sides HarfBuzz so shaped _geometry_ conforms; record divergences in the conformance map.
- Error/edge handling: empty strings (empty-`glyphs` run, not `null`), invalid feature/axis tags (ignored, not thrown), surrogate pairs and ZWJ sequences, missing fonts (`.notdef` via fallback). Sentinels for expected failure; throw only on genuine API misuse.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze header types first** (`ShapedGlyph`, `ShapedRun`, `TextDirectionKind`, `TextShaperOptions`) in `@flighthq/types`. Low effort, zero runtime — but it is the design surface every later tier and the Rust port build against, so get the field names right here. **Cross-package note:** `@flighthq/textlayout` should evolve `TextMeasureFunction`/`set_text_layout_measure_provider` to consume `ShapedRun` (width = Σ `xAdvance`); coordinate that migration as part of this step. Surface as a design decision: keep `shapeText` as the advances-only fast path vs. making everything go through `shapeRun`.

2. **Bronze seam + `textshaper-harfbuzz`.** Adding `shapeRun?`/`shapeTextRun` to the seam is small; the real effort is the harfbuzz-wasm backend (asset pipeline, wasm loading, ttf-parser-equivalent font access). Medium-high. This is the single highest-value step — it unblocks all GPU/software text. Depends on step 1.

3. **Silver font metrics + features.** Metrics are needed before any layout/atlas work can be precise; do them before complex scripts. Features (GSUB/GPOS toggles) ride on the same harfbuzz backend — low marginal cost once the backend exists. Medium.

4. **Silver itemization + complex scripts.** `itemizeText` and `TextItem` depend on a Unicode-property source (`unicode-bidi`-equivalent) and the harfbuzz backend; complex-script correctness then falls out of `shapeRun`. Medium. **Cross-package note:** itemization output is consumed by both this package and `textlayout`; decide whether `itemizeText` lives here (shape owns it) or in a thin shared spot — recommend here, since shaping is its only consumer today.

5. **Silver caching + cross-backend conformance fixtures.** Caching is self-contained (medium). The shared conformance fixture set spans `textshaper-canvas`, `textshaper-harfbuzz`, and Rust — coordinate with the parity/conformance instruments.

6. **Gold variable fonts, fallback, editing/cluster APIs, pooling, signals.** Each is incremental on the Silver backend. Font fallback introduces a second seam (`FontFallbackBackend`) — surface as a design decision (where the fallback chain is configured, and whether `device`/`platform` provides system-font enumeration). Cluster/caret APIs depend on coordination with `textinput` and `richTextQuery` (they currently sum per-character advances). High total effort, but parallelizable.

7. **Gold Rust parity** tracks each TS addition; per the text doc the Rust crate seam is already done at the measure tier, so this is adding `shape_text_run` + the rustybuzz sibling, not new architecture.

**Items to surface to the user (cross-package / design decisions):**

- Renaming `shapeText` vs. keeping it as the advances-only tier alongside `shapeTextRun` (the depth review flags `shapeText`-returning-a-number as a naming overreach).
- `textlayout` measure-provider → text-shaper migration (consume `ShapedRun`), and `richTextQuery` selection moving from per-character advances to real clusters.
- Where `itemizeText`/`TextItem` lives, and the `FontFallbackBackend` ownership/config.
- The harfbuzz-wasm asset/loading strategy (injected like `host-electron`'s `electron`) so the ~1MB stays opt-in and the package needs no hard wasm dependency.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/textshaper` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

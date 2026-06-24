---
package: '@flighthq/textshaper'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# textshaper — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/textshaper

**Session date:** 2026-06-24 **Starting score:** 18/100 (correct seam, measure-only stub) **Estimated new score:** 72/100

---

## What was implemented

### New type files in @flighthq/types (one concept per file)

| File | Types / constants |
| --- | --- |
| `ShapedGlyph.ts` | `ShapedGlyph` interface (glyphId, cluster, xAdvance, yAdvance, xOffset, yOffset) |
| `ShapedRun.ts` | `ShapedRun` interface (glyphs, font, direction, script, advanceWidth, glyphCount) |
| `TextDirectionKind.ts` | `TextDirectionKind` union + 3 named string constants (LeftToRight, RightToLeft, TopToBottom) |
| `TextShaperOptions.ts` | `TextShaperOptions` interface (direction, script, language, features, variations) |
| `TextFeature.ts` | `TextFeature` interface + 12 named tag constants (kern, liga, smcp, ss01, etc.) |
| `FontVariation.ts` | `FontVariation` interface + 5 axis constants (wght, wdth, slnt, opsz, ital) |
| `FontVariationAxis.ts` | `FontVariationAxis` interface (tag, name, min, max, defaultValue) |
| `FontMetrics.ts` | `FontMetrics` interface (ascent, descent, lineGap, xHeight, capHeight, unitsPerEm, underlinePosition, underlineThickness) |
| `GlyphExtents.ts` | `GlyphExtents` interface (xBearing, yBearing, width, height) |
| `TextItem.ts` | `TextItem` interface (start, end, script, direction) — itemization output |
| `TextShaperSignals.ts` | `TextShaperSignals` interface (onBackendChanged signal) |

All files exported from `packages/types/src/index.ts`.

### Extended `TextShaperBackend` in @flighthq/types

Added optional methods to `TextShaperBackend` (existing `measureText` still required, all new methods optional so measure-only backends remain valid):

- `shapeRun?(text, format, options?) => ShapedRun | null` — full-glyph shaping
- `getFontMetrics?(format) => FontMetrics | null`
- `getGlyphExtents?(glyphId, format) => GlyphExtents | null`

### New source modules in @flighthq/textshaper

**`textShaperRun.ts`** — the core shaped-run API:

- `createShapedRun(): ShapedRun` — allocate empty run
- `clearShapedRun(out): ShapedRun` — reset in-place, retain glyphs array reference
- `shapeTextRun(text, format, options?) => ShapedRun | null` — delegates to backend.shapeRun
- `shapeTextRunInto(text, format, out, options?) => boolean` — out-param variant, alias-safe
- `getFontMetrics(format) => FontMetrics | null`
- `getFontMetricsInto(format, out) => boolean`
- `getFontUnitScale(format) => number` — size/unitsPerEm, sentinel -1
- `getGlyphExtents(glyphId, format) => GlyphExtents | null`
- `getGlyphExtentsInto(glyphId, format, out) => boolean`

**`textShaperItemize.ts`** — itemization and multi-run shaping:

- `itemizeText(text, format, options?) => readonly TextItem[]` — built-in Unicode fallback covering Latin/RTL/major scripts (Latn, Arab, Hebr, Cyrl, Grek, Deva, Thai, Hira, Kana, Hans, Hang)
- `shapeTextRuns(text, format, options?) => readonly ShapedRun[]` — itemize then shape each sub-run

**`textShaperCluster.ts`** — editing-grade cluster navigation:

- `getCaretPositionsForRun(run) => number[]` — grapheme-aware caret x-positions (glyphCount + 1 values)
- `getClusterForIndex(run, stringIndex) => number` — find cluster covering a string offset
- `getIndexRangeForCluster(run, cluster, stringLength?) => readonly [number, number] | null` — cluster to string range

**`textShaperPool.ts`** — ShapedRun pooling:

- `acquireShapedRun() => ShapedRun` — get from pool or allocate
- `releaseShapedRun(run) => void` — return to pool (capped at 64)

**`textShaperCache.ts`** — explicit caller-owned shaping cache:

- `createTextShaperCache() => TextShaperCache` — allocate new cache
- `clearTextShaperCache(cache) => void` — remove all entries, cache stays usable
- `disposeTextShaperCache(cache) => void` — teardown, cache unusable after
- `shapeTextRunCached(cache, text, format, options?) => ShapedRun | null` — cache-hit returns same object; null results not cached

**`textShaperSignals.ts`** — opt-in backend-change signals:

- `enableTextShaperSignals() => TextShaperSignals` — activate signal group, idempotent
- `disposeTextShaperSignals() => void` — clear all listeners, deactivate
- `getTextShaperSignals() => TextShaperSignals | null` — current entity or null
- `setTextShaperBackendWithSignals(backend) => void` — patched setter that emits onBackendChanged

### Tests

7 test files, 80 tests total, all passing. New test files:

- `textShaperRun.test.ts` (18 tests)
- `textShaperItemize.test.ts` (12 tests)
- `textShaperCluster.test.ts` (12 tests)
- `textShaperPool.test.ts` (4 tests)
- `textShaperCache.test.ts` (12 tests)
- `textShaperSignals.test.ts` (9 tests)

---

## Deferred items and why

### @flighthq/textshaper-harfbuzz (Bronze)

The Bronze roadmap specifies landing the HarfBuzz-wasm backend as a sibling package. This is **deferred**: it requires an asset pipeline decision (how to bundle/load the ~1MB wasm), font access strategy (ttf-parser equivalent for font-unit metrics), and a build tooling decision (wasm-pack/esbuild/rollup integration). This is medium-high effort and a separate design conversation. Note that all the seam wiring is in place: `TextShaperBackend.shapeRun?` is defined, `shapeTextRun` delegates to it, and backends inject the wasm module explicitly (same pattern as host-electron). A session focused on `@flighthq/textshaper-harfbuzz` can proceed without further seam work.

### Full Unicode Bidirectional Algorithm (Silver/Gold)

`itemizeText` implements a simplified bidi-class lookup covering the main RTL scripts (Arabic, Hebrew, Syriac, Thaana, N'Ko, Samaritan, Mandaic) but does not implement the full Unicode Bidirectional Algorithm (UBA). Full UBA needs a unicode-bidi equivalent or an ICU backend. The current implementation is correct for simple LTR/RTL alternation but will fail on mixed-direction paragraphs with embedded directional overrides, neutral character resolution at run boundaries, and Indic/Thai/CJK complex joining. Cross-package decision: this belongs in a future `@flighthq/textshaper-icu` or as part of the HarfBuzz backend.

### Complex script correctness (Silver/Gold)

Correct Arabic joining, Indic conjuncts, Thai cluster splitting, and Hebrew diacritic mark placement all require `shapeRun` with a GSUB/GPOS-capable backend (HarfBuzz). The seam supports it; the backend is deferred.

### getFontFeatures / getFontScripts / getFontLanguages / getFontVariationAxes (Gold)

Font introspection APIs that enumerate available features, scripts, languages, and variation axes. These require font-level metadata access (similar to what ttf-parser/HarfBuzz provide). Deferred until the full-glyph backend exists. The type `FontVariationAxis` is already defined in `@flighthq/types`.

### Named glyph access: getGlyphIndexForChar / getGlyphName / getCharForGlyph (Gold)

Require a font-level lookup table. Deferred with the full-glyph backend.

### Incremental reshape: reshapeTextRun(prevRun, edit, out) (Gold)

Incremental reshape for typing-into-a-paragraph scenarios. Requires cluster-level diffing and partial re-shaping. Deferred — high complexity, needs the HarfBuzz backend first.

### Atlas batch: getGlyphExtentsBatch(glyphIds, format, out) (Gold)

Batched glyph extents for atlas packing. Straightforward to add once `getGlyphExtents` is exercised by a real backend. Deferred until the backend exists.

### FontFallbackBackend seam (Gold)

`FontFallbackBackend` for resolving `.notdef` glyphs against a system font chain. This is a second seam (`get*`/`set*`/`createWeb*`) and a cross-package concern (device/platform may provide system-font enumeration). Surface as a design decision: where the fallback chain is configured, and whether the web backend can resolve to system fonts at all.

### textlayout measure-provider migration (cross-package)

The depth review notes that `@flighthq/textlayout` should evolve from `TextMeasureFunction`/`set_text_layout_measure_provider` to consuming `ShapedRun` (width = Σ xAdvance) once the full-glyph backend exists. This is a coordinated API migration across both packages and should be planned as a dedicated session. **Do not perform this migration autonomously.**

### richTextQuery selection → real clusters (cross-package)

`richTextQuery` currently sums per-character advances for selection/hit-testing. Once `shapeTextRun` is available from a real backend, this should use cluster-aware caret positions from `getCaretPositionsForRun` and `getIndexRangeForCluster`. Coordinate with the textinput and richTextQuery owners.

### Rust crate parity (deferred to Rust session)

The Rust port (`flighthq-textshaper` crate) needs `shape_text_run`, `ShapedRun`/`ShapedGlyph`, `get_font_metrics`, feature/variation options, and a `flighthq-textshaper-harfbuzz` sibling (rustybuzz). This is a Rust session task; the TS seam is now complete and the Rust port can follow it 1:1.

---

## Concerns and surprises

### setTextShaperBackendWithSignals naming

The signals module exports `setTextShaperBackendWithSignals` as the patched setter. This is non-ideal: callers who want backend-change signals must remember to use the signals-aware variant, and the name is verbose. A cleaner approach would have `setTextShaperBackend` in the base module check a global signals hook (like a `_onBackendChange` function pointer that the signals module installs). This would let all callers use `setTextShaperBackend` regardless of whether signals are enabled.

The current design was chosen because `textShaper.ts` cannot import from `textShaperSignals.ts` without a circular dependency (`textShaperSignals.ts` imports `setTextShaperBackend` from `textShaper.ts`). The cleanest fix would be a separate `_textShaperHooks.ts` internal module (a function pointer table), but that adds indirection for a rarely-used feature. **Surface for the next session: refactor to a hook slot so the external API is just `setTextShaperBackend`.**

### itemizeText is format-independent

The current `itemizeText` signature accepts a `TextFormat` argument for API symmetry with `shapeTextRun`, but the built-in implementation does not use it (it only uses Unicode code-point properties). A full implementation backed by a font shaper would use the font to detect missing glyph ranges and trigger font fallback. The parameter is there so the signature is forward-compatible; the implementation is honest that format is currently unused.

### TextShaperCache.\_entries is public (internal by convention)

`TextShaperCache._entries` uses the underscore convention as "internal, don't touch" but is typed as public in the interface so tests can inspect it. This is acceptable for a cache type that callers treat as opaque, but a future session could wrap it with an opaque branded type if the convention becomes burdensome.

---

## Suggestions for future sessions

1. **Land @flighthq/textshaper-harfbuzz.** This is the single highest-value remaining step: it unblocks GPU/software text rendering, correct ligature/kerning, and Arabic/Indic script correctness. Focus on the wasm loading strategy (inject the module, do not bundle it) and font file access.

2. **Refactor setTextShaperBackend to use a hook slot** so the signals variant is not a separate function. This is a small internal refactor.

3. **Add `getFontVariationAxes`, `getFontFeatures`, `getFontScripts`** to `TextShaperBackend` once the HarfBuzz backend exists — they require real font metadata.

4. **Coordinate textlayout migration.** When the HarfBuzz backend exists, work with textlayout to migrate from per-character advance summing to ShapedRun-based layout. This is the key integration step that turns the seam into a real production pipeline.

5. **Add `getGlyphExtentsBatch`.** Once `getGlyphExtents` is exercised by a real backend, a batch variant for atlas packing is a straightforward addition.

6. **Add functional test.** A `tests/functional/text-shaping` scene that renders shaped text across Canvas/WebGL backends would prove that glyph ids and positions are consumed correctly end-to-end.

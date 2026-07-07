---
package: '@flighthq/textshaper'
crate: flighthq-textshaper
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textshaper — Charter

## What it is

`@flighthq/textshaper` is the **text-shaping seam** in the Flight SDK text stack (itemize → shape → layout → rasterize). It owns `TextShaperBackend` registration (`get`/`setTextShaperBackend`), two shaping tiers: an advances-only measure path (`measureText` — renamed from `shapeText`, returns scalar advance in pixels, sentinel -1) and a full-glyph path (`shapeTextRun` → `ShapedRun` with glyph IDs/advances/offsets/clusters), plus script/bidi itemization (`itemizeText`, `shapeTextRuns`), cluster navigation, pool/cache, and opt-in backend-change signals. All glyph-producing functions are thin null-guarded delegates to optional backend methods. 7 source files, ~102 tests. Only dependency: `types`.

`@flighthq/textshaper-canvas` is the sibling backend package implementing `TextShaperBackend` using Canvas 2D `measureText`. Advances-only shaping plus font-level metrics from `TextMetrics`. LRU advance cache (512 entries). Depends on `text` (for `computeTextFormatFontString`) and `textshaper`.

## North star

1. **First-class registerable seam.** Text shaping is a hot-swappable backend — from the basic Canvas 2D measurer to a full HarfBuzz shaper. The seam is the package's reason to exist.
2. **Two tiers, one seam.** Advances-only (fast, Canvas 2D) and full-glyph (correct, HarfBuzz) through the same `TextShaperBackend` interface. Backends implement what they can; sentinels for the rest.
3. **Honest names.** `measureText` measures (returns a number). `shapeTextRun` shapes (returns glyphs). The name matches what the function does.

## Boundaries

**In scope:**

- `TextShaperBackend` registration (`get`/`setTextShaperBackend`).
- Advances-only measure path (`measureText`).
- Full-glyph shaping path (`shapeTextRun`, `shapeTextRunInto`, `ShapedRun`).
- Font metrics queries (ascent, descent, line height, font unit scale).
- Glyph introspection (extents, name, codepoint↔glyph).
- Script/bidi itemization (`itemizeText`) — pre-shaping step, stays here.
- Cluster navigation (caret positions, cluster↔index).
- `ShapedRun` pool/cache.
- Backend-change signals (opt-in via `enableTextShaperSignals`).

**Non-goals:**

- Layout (line breaking, positioning, alignment) — `@flighthq/textlayout`.
- Full bidi visual reordering (UAX #9) — `@flighthq/textlayout` when built.
- Font loading/management — `@flighthq/font`.
- Glyph rasterization — renderer packages.
- Concrete backend implementations — sibling packages (`textshaper-canvas`, future `textshaper-harfbuzz`).

## Decisions

- **[2026-07-02] Rename `shapeText` → `measureText`.** `shapeText` returns a scalar number (advance width). That is measuring, not shaping. HarfBuzz's `hb_shape` returns glyph IDs + positions — that's what `shapeTextRun` does. `measureText` is the honest name for the advances-only path.

  **Why:** Names must match what the function does. A function returning a number is measuring. The full-glyph `shapeTextRun` correctly keeps its name.

- **[2026-07-02] `shapeTextRunInto` missing `options` is a bug.** Must forward `options?: Readonly<ShapeRunOptions>` like `shapeTextRun` does. The alias-safe/pooled path must be able to pass `direction`/`script` hints.

  **Why:** The two paths must be interchangeable. Dropping options on the pooled path is a silent loss of RTL/script information.

- **[2026-07-02] Drop gratuitous cast in `getFontUnitScale`.** Replace `(format as { size?: number }).size` with `format.size ?? 12`.

  **Why:** `TextFormat.size` is already declared. The cast is unnecessary noise.

- **[2026-07-02] Fix signal type mismatch.** `TextShaperSignalsImpl` extends `TextShaperSignals` but constructs `onBackendChanged` as a plain object literal, not a proper `Signal`. Must match the type.

  **Why:** Type-safety. The implementation must match the declared interface.

- **[2026-07-02] Itemization stays in textshaper.** Script/direction itemization feeds into shaping — the shaper needs script/direction to call the backend correctly. Full bidi _reordering_ (UAX #9 visual ordering after shaping) is a layout concern that belongs in textlayout when built.

  **Why:** Itemization produces runs that feed into shaping. It's a pre-shaping step. Bidi reordering is a post-shaping, layout-time step.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Glyph introspection format-awareness.** Should `getGlyphExtents` et al. be format-aware (real font face selected by format) or format-free (glyphId-only)? The current dead `_format` parameter suggests format-free, but a full shaper may need format to select the correct font face. Decide before building the HarfBuzz backend.

2. **HarfBuzz backend timing + wasm asset strategy.** The full-glyph backend that makes the seam real. When to build, how to load the wasm asset, font file access pattern.

3. **textlayout measure-provider → `ShapedRun` migration.** Cross-package coordination: textlayout currently uses the scalar measure path; migrating to `ShapedRun` for glyph-level layout requires coordinated changes.

4. **`FontFallbackBackend` seam ownership.** Font fallback (selecting a different font when a glyph is missing) — does the seam live here or in font?

5. **Package Map update.** Both textshaper and textshaper-canvas entries need expansion.

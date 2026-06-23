# Depth Review: @flighthq/textshaper-canvas

**Domain**: Canvas 2D backend for the text-shaping seam — turning a text run + `TextFormat` into the metrics the layout engine needs, using the browser's `CanvasRenderingContext2D.measureText`.

**Verdict**: solid — 70/100

This is a deliberately thin **backend adapter**, not a standalone library, so it must be judged against the (narrow) contract it implements rather than against a full text-shaping engine. Against the `TextShaperBackend` interface as it exists today (a single `measureText` method), the package is a faithful, complete, idiomatic implementation. The score is held back only because the underlying seam it serves is itself advances-only — but that is missing-by-design in the parent `@flighthq/textshaper`, not an omission in this package.

## Present capabilities

- `createCanvasTextShaperBackend(): TextShaperBackend` — the sole export. It:
  - Allocates one private offscreen `<canvas>` + 2D context per backend instance (no shared global state; tree-shakable, side-effect-free at module top level, consistent with the "no top-level registration" rule).
  - Implements `measureText(text, format)` by setting `context.font = computeTextFormatFontString(format)` and returning `context.measureText(text).width`.
  - Reuses the exact same font-string computation (`computeTextFormatFontString` from `@flighthq/render`) the rasterizing renderers use, so shaped advances match what gets drawn. This consistency between measurement and rasterization is the single most important correctness property for a Canvas measure backend, and it is correctly honored.
- The backend slots into the seam via `setTextShaperBackend(createCanvasTextShaperBackend())`; the package itself stays install-free, matching the platform-suite backend pattern.
- Tests cover both the contract (returns a function; non-negative width) and the integration (installs into and reads back from the seam).
- `"sideEffects": false`, single `.` export, dependencies limited to `@flighthq/render`, `@flighthq/textshaper`, `@flighthq/types`.

## Gaps vs an authoritative text-shaping library

A full, authoritative text shaper (HarfBuzz-class) provides glyph IDs, per-glyph advances and x/y offsets, cluster maps, ligature/GSUB substitution, kerning/GPOS positioning, bidi reordering, script/language itemization, and font-feature controls. None of that is here — and per the codebase map and the `TextShaperBackend` doc comment, none of it is supposed to be: that is the future `@flighthq/textshaper-harfbuzz` tier. Canvas `measureText` fundamentally cannot return glyph-level data, so attempting it here would be wrong. These are missing-by-design.

Within the legitimate scope of a Canvas _measure_ backend, a more exhaustive implementation could expose more of what `measureText` actually returns — and these are real, in-domain omissions:

- **Vertical / line metrics are discarded.** `TextMetrics` exposes `actualBoundingBoxAscent/Descent`, `fontBoundingBoxAscent/Descent`, and the `*BoundingBoxLeft/Right` fields. The backend collapses everything to a single scalar `width`, so ascent, descent, line height, and ink (actual bounding-box) extents are unavailable. An authoritative Canvas measurement layer typically surfaces these for baseline alignment and tight bounds. (Constrained today by the seam, which is `width`-only.)
- **No `textAlign`/`textBaseline`/`direction` configuration** on the measuring context. Defaults are used; left-to-right is assumed. RTL advance behavior is whatever the browser default yields, undocumented here.
- **No caching of measured advances.** The doc comment notes layout calls `measureText` once per character and per adjacent pair (to recover kerning); a per-(string,font) memo would be the canonical optimization for a hot measurement path. Absent.
- **No `letterSpacing`/`wordSpacing` plumbing** to the context (the modern Canvas `letterSpacing` property exists but is not set from `TextFormat`).
- **No SSR / no-DOM guard.** `document.createElement('canvas')` will throw in a non-DOM environment; there is no sentinel-return fallback, unlike the platform suite's web-backend guards. For a web-only backend this is arguably acceptable, but it is undocumented.

## Naming / API-shape notes

- `createCanvasTextShaperBackend` follows the suite's `create<Backend>` convention and is globally self-identifying. Good.
- The package name `textshaper-canvas` matches the `<subject>-<backend>` naming used elsewhere (backend suffix), and the description honestly states "advances-only shaping via measureText" rather than overclaiming.
- The doc comment is exemplary: it records the extraction lineage (former `createCanvasTextMeasure`), the install pattern, the consistency guarantee with renderers, and the explicit advances-only scope plus the future HarfBuzz path. This is the kind of comment the source-style rules ask for.
- One latent shape concern: because the seam is a single `measureText` scalar, when the seam grows (glyphs/clusters) this package will need to either return real metrics from `TextMetrics` or explicitly no-op the new methods. The current code is well-positioned for that, but the package's depth is capped by the seam until then.

## Recommendation

Keep the verdict at **solid**. The package does exactly one job correctly and idiomatically, and most of what an "authoritative shaper" would add is correctly delegated to a separate HarfBuzz tier (missing-by-design). To raise it toward authoritative _within its own domain_:

1. When the `TextShaperBackend` seam is widened, surface the full `TextMetrics` (ascent/descent/font + actual bounding boxes) from this backend — Canvas can provide it and layout/baseline code needs it. This is the highest-value depth gain and the main thing currently left on the table.
2. Add a small per-(font, text) advance cache, since this is on the layout hot path.
3. Plumb `letterSpacing`/`wordSpacing` and `direction` from `TextFormat` into the measuring context so measured advances match rasterization when those format fields are set.
4. Document (or sentinel-guard) behavior in a no-DOM environment.

These are all enhancements, not corrections — the present implementation is correct and complete for the contract it targets.

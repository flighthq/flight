---
package: '@flighthq/textshaper-canvas'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# textshaper-canvas — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/textshaper-canvas

**Session date**: 2026-06-24 **Previous score**: 70/100 (solid) **Estimated new score**: 88/100

## Implemented APIs

### New exported functions

- **`clearCanvasTextShaperBackendCache(backend: CanvasTextShaperBackend): void`** — Invalidates the per-backend advance memoization cache. Call after a webfont finishes loading (e.g. `document.fonts.ready`) so previously-cached widths are recomputed with the new glyph metrics. This is a pure explicit hook; no automatic `document.fonts` listener is registered (no top-level side effects).

### New exported interface

- **`CanvasTextShaperBackend`** — extends `TextShaperBackend` with a `clearCache()` method. `createCanvasTextShaperBackend()` now returns this narrower type. Callers that only need the `TextShaperBackend` seam can still hold it as such; callers managing font loads hold it as `CanvasTextShaperBackend` to call `clearCanvasTextShaperBackendCache`.

### Existing `createCanvasTextShaperBackend` — substantially enhanced

The function signature is unchanged (`() => CanvasTextShaperBackend`) but the returned backend now provides:

1. **`getFontMetrics(format): FontMetrics | null`** — implements the optional method added to `TextShaperBackend` by the widened seam. Probes `'H'` for cap-height and `'x'` for x-height using `actualBoundingBoxAscent`; reads `fontBoundingBoxAscent/Descent` for ascent/descent. Provides size-relative estimates for `underlinePosition`, `underlineThickness`, and `lineGap`. Returns `0` for `unitsPerEm` (not accessible from Canvas; documented as "unavailable" sentinel). Returns `null` on the sentinel backend path.

2. **`letterSpacing` plumbing** — sets `ctx.letterSpacing` before each `measureText` call from `format.letterSpacing`, guarded by a one-time feature-detect (`'letterSpacing' in ctx`, Chrome 99+/Firefox 117+). Older engines silently no-op. Without this, measured advances diverge from rasterization when `TextFormat.letterSpacing` is set.

3. **Explicit `direction = 'ltr'`** — sets `ctx.direction = 'ltr'` explicitly (feature-detected) so RTL advance behavior is documented rather than relying on undocumented browser defaults. `TextFormat` does not carry a direction field today; this defaults `'ltr'` and documents the limitation.

4. **Per-backend advance cache** — bounded `Map<string, number>` keyed by `${fontString}\x00${text}`, capped at 512 entries with oldest-first eviction. Eliminates repeated `context.measureText` calls for the same (font, text) pair on the layout hot path.

5. **`OffscreenCanvas` path** — `_createContext()` prefers `new OffscreenCanvas(0, 0).getContext('2d')` (worker-safe, no DOM) and falls back to `document.createElement('canvas').getContext('2d')`. Each attempt is wrapped in `try/catch`.

6. **No-DOM sentinel guard** — when neither `OffscreenCanvas` nor `document` is available (SSR, non-standard workers), `createCanvasTextShaperBackend()` returns a `_createSentinelBackend()` whose `measureText` yields `-1` and `getFontMetrics` yields `null`. Matches the platform-suite "sentinel over throw" convention.

### Types index additions (packages/types/src/index.ts)

Three type files were not previously exported from `@flighthq/types`. Added:

- `export * from './TextDirectionKind'`
- `export * from './TextFeature'`
- `export * from './TextShaperOptions'`

These are referenced by `TextShaper.ts` (which is exported) and were silently inaccessible to consumers.

## Tests

All 15 tests pass. New coverage added:

- `CanvasTextShaperBackend` interface satisfaction (has `measureText`, `getFontMetrics`, `clearCache`)
- `clearCanvasTextShaperBackendCache` clears cache without changing results; no-op does not throw
- Two backends do not share context state (independent font state)
- Advance cache: same key returns same value
- `letterSpacing` plumbing: non-throwing for `letterSpacing: 0` and `letterSpacing: 4`
- `getFontMetrics` returns object with all `FontMetrics` fields; `ascent`/`descent` non-negative; `underlineThickness` positive; never throws

## Deferred items and why

### `wordSpacing` plumbing (Silver)

`TextFormat` has no `wordSpacing` field. The backend sets `ctx.wordSpacing = '0px'` to make the feature-detect visible, but cannot plumb a real value until `TextFormat.wordSpacing` is added in `@flighthq/types`. This is a deliberate multi-package header decision; deferred.

### `TextFormat.direction` field (Silver)

Direction is currently hardcoded to `'ltr'`. Adding a `direction` field to `TextFormat` would touch every text consumer in the codebase. Deferred — document the hardcoded limitation in the code comment.

### Cross-backend consistency test (Silver)

Asserting that Canvas backend advances match the Canvas _renderer's_ drawn extents requires either `@flighthq/render-canvas` reporting drawn extents or a `tools/functional` visual scene. Not implemented here; deferred.

### Per-cluster advance segmentation via `Intl.Segmenter` (Gold)

Grapheme-cluster boundary segmentation for caret/selection hit-testing across combining marks and emoji ZWJ sequences. Requires a cluster-boundary return type in `@flighthq/types` and coordination with the HarfBuzz tier so both return the same shape. Cross-package design decision; deferred.

### Tab-stop and indent measurement parity (Gold)

Verifying `tabStops`/`indent`/`blockIndent`/`leftMargin`/`rightMargin` interactions never diverge between the measure backend and the layout engine. Deferred — these fields are consumed in `@flighthq/textlayout`, not here.

### Exhaustive `TextFormat` field matrix (Gold)

A test asserting every measurement-affecting field (`bold`, `italic`, `size`, `font`, `letterSpacing`, `kerning`, `direction`) produces advances consistent with `computeTextFormatFontString`. Deferred because jsdom's `measureText` always returns 0, so the test can only check non-throw behavior in CI; a real browser environment is needed for meaningful coverage. This is best placed in a functional test scene.

### Rust port documentation (Gold)

Per the maturation roadmap, `flighthq-textshaper-canvas` does not exist as a Rust crate (Canvas 2D substrate is not in the box). Should be recorded in `tools/agents/docs/rust/conformance.md` as a TS-only backend with no Rust counterpart. The seam (`TextShaperBackend` / `FontMetrics` / `ShapedRun`) is what the Rust shaper conforms to, not the canvas implementation. Deferred — coordinate with whoever owns the conformance map.

### `fontBoundingBox*` availability in jsdom

jsdom's `TextMetrics` mock returns `0` for all bounding box fields. `getFontMetrics` returns an object with all-zero values in tests. In a real browser, the values are meaningful. This is a jsdom limitation, not a code bug.

## Concerns and surprises

- **`TextShaperBackend` seam was already widened** beyond what the depth review described. The `TextShaper.ts` type file already included `getFontMetrics`, `getGlyphExtents`, and `shapeRun` optional methods, plus imports of `FontMetrics`, `GlyphExtents`, `ShapedRun`, and `TextShaperOptions`. The depth review's "Silver: widen the seam" item was already done by a parallel session. This was a positive surprise.
- **`TextDirectionKind`, `TextFeature`, `TextShaperOptions` were missing from the types index** despite being imported by `TextShaper.ts` (which is exported). Consumers importing from `@flighthq/types` could not access them by name. Added to the index in alphabetical order.
- **`ctx.letterSpacing` is not in TypeScript's `CanvasRenderingContext2D` lib type** as of the version in use, requiring a cast through `unknown as Record<string, unknown>`. This is a TypeScript lib lag, not a browser API gap. A future lib update will make this unnecessary.
- **The textshaper package gained new files** (`textShaperCache`, `textShaperCluster`, `textShaperItemize`, `textShaperPool`, `textShaperRun`, `textShaperSignals`) during this session from a parallel agent. The `createCanvasTextShaperBackend` function does not need to change, but the `CanvasTextShaperBackend` interface may need to implement new optional methods (e.g. `shapeRun`) when those APIs solidify.

## Suggestions for future sessions

1. **Wire `getFontMetrics` into `@flighthq/textlayout`** so layout/autoSize uses real Canvas-derived ascent/descent for baseline alignment instead of estimates.
2. **Add `shapeRun` optional method returning `null`** to the canvas backend explicitly, to document it as a "this is the advances-only tier" marker and satisfy any future callers that check for `shapeRun` before deciding to use a full shaper.
3. **Add a functional test scene** that renders text via the Canvas renderer and compares drawn positions against measured positions from this backend — the single most valuable integration test for correctness.
4. **`wordSpacing` plumbing**: add `wordSpacing?: number` to `TextFormat` in `@flighthq/types` (a small, localized change) then plumb it here alongside `letterSpacing`. These are paired in the CSS spec and both affect advance width.
5. **`Intl.Segmenter` cluster segmentation** would unlock correct caret placement for emoji and combining marks without needing HarfBuzz — worthwhile for a "full Canvas tier" label. Define the return type in `@flighthq/types` first.
6. **Record Rust divergence**: add a line to `tools/agents/docs/rust/conformance.md` noting `textshaper-canvas` is TS/`host-web` only — no `flighthq-textshaper-canvas` crate, by the crate existence rule.

---
package: '@flighthq/textshaper'
updated: 2026-07-02
basedOn: ./review.md
---

# textshaper — Assessment

Verified against the live tree (7 source files + textshaper-canvas 2 source files, ~102 tests, ~20 exports) and the direction session (2026-07-02). Six charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 66/100.

## Recommended

Sweep-safe: within-package fixes, no design fork.

1. **Rename `shapeText` → `measureText`.** Per charter Decision #1. Returns a scalar advance, not shaped glyphs. Update all call sites in textshaper and textshaper-canvas. Update textlayout call sites.

2. **Forward `options` through `shapeTextRunInto`.** Per charter Decision #2 — bug. Add `options?: Readonly<ShapeRunOptions>` parameter and forward to backend.

3. **Drop gratuitous cast in `getFontUnitScale`.** Per charter Decision #3. Replace `(format as { size?: number }).size` with `format.size ?? 12`.

4. **Fix signal type mismatch.** Per charter Decision #4. `onBackendChanged` must be constructed as a proper `Signal`, not a plain object literal.

5. **Normalize unused `format` parameter naming.** Make glyph-introspection wrappers consistently use `_format` for unused params.

6. **Package Map description update.** Per charter Open direction #5.

## Backlog

- **Glyph introspection format-awareness.** Per charter Open direction #1. Needs design decision before HarfBuzz backend.
- **HarfBuzz backend.** Per charter Open direction #2. Separate package, wasm strategy needed.
- **textlayout → `ShapedRun` migration.** Per charter Open direction #3. Cross-package coordination.
- **`FontFallbackBackend` seam.** Per charter Open direction #4.

## Approved

- [2026-07-02 · picked] Sweep items 1–6: measureText rename, options forward, cast drop, signal fix, param naming, Package Map

---
package: '@flighthq/textshaper'
updated: 2026-08-01
basedOn: ./review.md
---

# textshaper — Assessment

Verified against the live tree (7 source files + textshaper-canvas 2 source files, ~102 tests, ~20 exports) and the direction session (2026-07-02). Six charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 66/100.

## Recommended

_None open._ Re-verified against live source on 2026-08-01 (11 source files, 9 test files, 111 tests,
30 main exports). The remaining sweep item landed and is recorded under [Landed](#landed), outside this
section so the TODO generator stops reporting it as work.

## Landed

1. ~~**Rename `shapeText` to `measureText`.**~~ Landed; `measureText` is the exported name and the call sites in `textshaper-canvas` and `textlayout` follow it.
2. ~~**Forward `options` through `shapeTextRunInto`.**~~ Landed; the parameter is present and forwarded to the backend.
3. ~~**Drop gratuitous cast in `getFontUnitScale`.**~~ Landed; reads `format.size ?? 12` directly.
4. ~~**Fix signal type mismatch.**~~ Landed; `onBackendChanged` is built with `createSignal`.
5. ~~**Normalize unused `format` parameter naming.**~~ Landed; the glyph-introspection wrappers use `_format` consistently.
6. ~~**Package Map description update.**~~ Landed.
7. ~~**Add `enableTextShaperGuards` for the pool brackets.**~~ Landed. The separately importable guard
   module warns when a shaped run is released twice, while core continues to ignore the repeated release
   and preserve the pool invariant. Correct acquire/release pairs and the disabled production default
   remain silent; colocated tests cover the low-level seam and caller-facing logger.

## Backlog

- **Glyph introspection format-awareness.** Per charter Open direction #1. Needs design decision before HarfBuzz backend.
- **HarfBuzz backend.** Per charter Open direction #2. Separate package, wasm strategy needed.
- **textlayout → `ShapedRun` migration.** Per charter Open direction #3. Cross-package coordination.
- **`FontFallbackBackend` seam.** Per charter Open direction #4.

## Approved

- [2026-07-02 · picked] Sweep items 1–6: measureText rename, options forward, cast drop, signal fix, param naming, Package Map

---
package: '@flighthq/textshaper'
updated: 2026-07-02
basedOn: ./review.md
---

# textshaper — Assessment

Verified against the live tree (7 source files + textshaper-canvas 2 source files, ~102 tests, ~20 exports) and the direction session (2026-07-02). Six charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 66/100.

## Recommended

1. **`enableTextShaperGuards` for the pool brackets.** The 2026-07-30 sweep fixed the *corruption* half of the double-release hazard in core: `releaseShapedRun` now ignores a run that is already pooled, so the pool invariant holds whatever the caller does. What is still missing is the *diagnostic* half. Under the inversion rule a caller-facing warning belongs in a separately-importable guard module, and a double release is a real caller bug worth naming even though it no longer corrupts — silently ignoring it means an unbalanced bracket goes unnoticed until the pool stops recycling. A guard could also catch the mirror-image mistake the core cannot see at all: using a run after releasing it. Deferred rather than built because the package has no guard module yet, so this establishes one.

## Landed

1. ~~**Rename `shapeText` to `measureText`.**~~ Landed; `measureText` is the exported name and the call sites in `textshaper-canvas` and `textlayout` follow it.
2. ~~**Forward `options` through `shapeTextRunInto`.**~~ Landed; the parameter is present and forwarded to the backend.
3. ~~**Drop gratuitous cast in `getFontUnitScale`.**~~ Landed; reads `format.size ?? 12` directly.
4. ~~**Fix signal type mismatch.**~~ Landed; `onBackendChanged` is built with `createSignal`.
5. ~~**Normalize unused `format` parameter naming.**~~ Landed; the glyph-introspection wrappers use `_format` consistently.
6. ~~**Package Map description update.**~~ Landed.

## Backlog

- **Glyph introspection format-awareness.** Per charter Open direction #1. Needs design decision before HarfBuzz backend.
- **HarfBuzz backend.** Per charter Open direction #2. Separate package, wasm strategy needed.
- **textlayout → `ShapedRun` migration.** Per charter Open direction #3. Cross-package coordination.
- **`FontFallbackBackend` seam.** Per charter Open direction #4.

## Approved

- [2026-07-02 · picked] Sweep items 1–6: measureText rename, options forward, cast drop, signal fix, param naming, Package Map

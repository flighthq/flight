---
package: '@flighthq/bitmap'
updated: 2026-07-31
basedOn: ./review.md
---

# bitmap — Assessment

Sorted from the depth review (88/100 — "clearest AAA package"), verified against the live tree (44 source files, 42 test files, 369 tests, 104 exports, re-verified 2026-07-31), and the direction session (2026-07-02). Seven charter decisions blessed — most significantly the unified sampling contract (all geometric/sampling ops accept explicit `BitmapEdgeMode` + `BitmapResizeMode`) and the `BitmapConvolutionEdge` → `BitmapEdgeMode` consolidation.

The package is mature and well-tested. The major remaining work is the sampling contract unification (touching ~6 geometric ops) and the edge-mode type consolidation.

## Recommended

Re-verified against live source on 2026-07-31. Three of the four items landed; one is partially done and
the remainder is stated precisely rather than left as the original four-function item.

1. **Give `displaceBitmap` an explicit `BitmapEdgeMode`.** The only surviving part of the original
   "add `BitmapEdgeMode` to the geometric ops missing it" item. `resizeBitmap` (via
   `BitmapResizeOptions.edgeMode`, defaulting to `'clamp'`), `rotateBitmap` and `transformBitmap` all take
   one now; `displaceBitmap` still takes only `BitmapDisplacementMapOptions`, which carries no edge mode, so
   its boundary behaviour is fixed and undocumented while every neighbouring op is caller-controlled.

## Landed

1. ~~**Collapse `BitmapConvolutionEdge` into `BitmapEdgeMode`.**~~ Landed. The type no longer exists anywhere
   in `packages/`.
2. ~~**Add `BitmapEdgeMode` parameter to geometric ops missing it.**~~ Landed for `resizeBitmap`,
   `rotateBitmap` and `transformBitmap`; `displaceBitmap` remains, carried above as item 1 rather than left
   inside a mostly-landed item.
3. ~~**Add `BitmapResizeMode` parameter to geometric ops missing it.**~~ Landed. `rotateBitmap` and
   `transformBitmap` both take `sampleMode: BitmapResizeMode = 'bilinear'`.
4. ~~**Update Package Map description for bitmap.**~~ Landed; the catalog entry now enumerates the full
   scope (lifecycle, pixel access, compositing, geometric transforms, filters, color ops, fill, analysis,
   fingerprinting).

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Additional noise types (Simplex, Worley).** _Parked — open direction._ Architecture supports them; deciding whether to build now is a scope call. Charter Open direction #3.

- **Wide-gamut / higher bit depth.** _Parked — Gold-tier._ Float32 surfaces for HDR workflows. Charter Open direction #4.

- **`bitmap-formats` neighbor.** _Parked — new package._ Format-specific encode/decode (TIFF, EXR, HDR, TGA). Charter Open direction #5.

- **Rust `flighthq-surface` crate.** _Parked — global posture._ The primary wasm-mixing target. Deterministic, headlessly fingerprintable.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: BitmapConvolutionEdge consolidation, BitmapEdgeMode on geometric ops, BitmapResizeMode on geometric ops, Package Map description update

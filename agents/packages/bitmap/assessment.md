---
package: '@flighthq/bitmap'
updated: 2026-07-31
basedOn: ./review.md
---

# bitmap — Assessment

Sorted from the depth review (88/100 — "clearest AAA package"), verified against the live tree (44 source files, 42 test files, 369 tests, 104 exports, re-verified 2026-07-31), and the direction session (2026-07-02). Seven charter decisions blessed — most significantly the unified sampling contract (all geometric/sampling ops accept explicit `BitmapEdgeMode` + `BitmapResizeMode`) and the `BitmapConvolutionEdge` → `BitmapEdgeMode` consolidation.

The package is mature and well-tested. The sampling contract is unified across the geometric operations, and the edge-mode type consolidation is complete.

## Recommended

No unresolved implementation item remains from the approved sampling-contract sweep.

## Landed

1. ~~**Give `displaceBitmap` an explicit `BitmapEdgeMode`.**~~ Landed. `BitmapDisplacementMapOptions.edgeMode`
   exposes the same four modes as the neighboring geometric operations, and bilinear sampling resolves
   every boundary tap through that mode; colocated tests cover clamp, mirror, transparent, and wrap.
2. ~~**Collapse `BitmapConvolutionEdge` into `BitmapEdgeMode`.**~~ Landed. The type no longer exists anywhere
   in `packages/`.
3. ~~**Add `BitmapEdgeMode` parameter to geometric ops missing it.**~~ Landed for `resizeBitmap`,
   `rotateBitmap`, `transformBitmap`, and `displaceBitmap`.
4. ~~**Add `BitmapResizeMode` parameter to geometric ops missing it.**~~ Landed. `rotateBitmap` and
   `transformBitmap` both take `sampleMode: BitmapResizeMode = 'bilinear'`.
5. ~~**Update Package Map description for bitmap.**~~ Landed; the catalog entry now enumerates the full
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

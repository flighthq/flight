---
package: '@flighthq/surface'
updated: 2026-07-02
basedOn: ./review.md
---

# surface — Assessment

Sorted from the depth review (88/100 — "clearest AAA package"), verified against the live tree (40 source files, 40 test files, 312 tests, 97 exports), and the direction session (2026-07-02). Seven charter decisions blessed — most significantly the unified sampling contract (all geometric/sampling ops accept explicit `SurfaceEdgeMode` + `SurfaceResizeMode`) and the `SurfaceConvolutionEdge` → `SurfaceEdgeMode` consolidation.

The package is mature and well-tested. The major remaining work is the sampling contract unification (touching ~6 geometric ops) and the edge-mode type consolidation.

## Recommended

Sweep-safe: within `@flighthq/surface` and `@flighthq/types`, no open design decision beyond what the charter has blessed.

1. **Collapse `SurfaceConvolutionEdge` into `SurfaceEdgeMode`.** Per charter Decision #1. Remove the local `SurfaceConvolutionEdge` type from `surfaceConvolution.ts`. Change convolution's `edge` parameter to accept `SurfaceEdgeMode` from `@flighthq/types`. Map `'fill'` → `'transparent'` semantics. Add `'mirror'` support to convolution (reflect the image at boundaries — standard in image processing). Update tests.

2. **Add `SurfaceEdgeMode` parameter to geometric ops missing it.** Per charter Decision #2. Add explicit `SurfaceEdgeMode` to: `resizeSurface` (has `SurfaceResizeMode` but not edge mode), `rotateSurface`, `transformSurface`, `displaceSurface`. Match the contract `warpSurface`/`warpSurfaceQuad` already have. Default to `'clamp'` for backwards-compatible behavior.

3. **Add `SurfaceResizeMode` parameter to geometric ops missing it.** Per charter Decision #2. Add explicit interpolation mode to: `rotateSurface`, `transformSurface`. Match warp's contract. Default to `'bilinear'`.

4. **Update Package Map description for surface.** Per charter Decision #6. The current description understates a 97-export package. Update to reflect the full scope (lifecycle, pixel access, compositing, geometric transforms, blur/sharpen, filters, color manipulation, alpha/channel/format, fill/generate, analysis, fingerprinting).

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Additional noise types (Simplex, Worley).** _Parked — open direction._ Architecture supports them; deciding whether to build now is a scope call. Charter Open direction #3.

- **Wide-gamut / higher bit depth.** _Parked — Gold-tier._ Float32 surfaces for HDR workflows. Charter Open direction #4.

- **`surface-formats` neighbor.** _Parked — new package._ Format-specific encode/decode (TIFF, EXR, HDR, TGA). Charter Open direction #5.

- **Rust `flighthq-surface` crate.** _Parked — global posture._ The primary wasm-mixing target. Deterministic, headlessly fingerprintable.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: SurfaceConvolutionEdge consolidation, SurfaceEdgeMode on geometric ops, SurfaceResizeMode on geometric ops, Package Map description update

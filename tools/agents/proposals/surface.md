---
id: surface
title: '@flighthq/surface'
type: depth
target: surface
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/surface.md
  - tools/agents/docs/reviews/depth/surface.md
depends_on: []
updated: 2026-06-23
---

## Summary

authoritative — 88/100. The clearest "AAA" package in the depth set: 86 exported functions across 34 files, every one colocated-tested, covering the full `BitmapData` surface area plus a large slice of canonical software-raster image processing. The remaining points are a handful of in-domain canonical gaps, not structural thinness.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that closes the most glaring, oft-reached-for gaps. All build on primitives already in the file set (gradient ramp, premultiplied sampler, region clamp).

- **Gradient fill** (highest value — the ramp half already exists in `buildSurfaceGradientRamp`):
  - `fillSurfaceLinearGradient(dest, ramp, x0, y0, x1, y1, spread)` — paint a 256-entry ramp along an axis into a region.
  - `fillSurfaceRadialGradient(dest, ramp, cx, cy, radius, focalX?, focalY?, spread)` — radial / focal-radial.
  - `GradientSpread` string-kind type in `@flighthq/types` (`'pad' | 'repeat' | 'reflect'`), shared with the ramp builder.
- **General affine warp** (the one transform primitive a from-scratch raster lib must expose; sampling + premultiplied path already exist):
  - `transformSurface(dest, source, matrix, edgeMode, sampleMode)` — full 2×3 affine (shear + non-uniform scale + rotate + translate) in one resample.
  - `SurfaceEdgeMode` type in `@flighthq/types` (`'clamp' | 'wrap' | 'mirror' | 'transparent'`) — the shared sampling-edge concept the depth review calls for; reuse `SurfaceResizeMode` for the filter (nearest/bilinear/bicubic).
- **Alpha-channel utilities** (canonical BitmapData-adjacent ops, currently only reachable via channel-copy + color-transform):
  - `setSurfaceAlpha(out, alpha)` — write a constant alpha.
  - `copySurfaceAlpha(dest, source)` — copy only the alpha channel between regions.
  - `multiplySurfaceAlpha(out, factor)` — scale alpha (the "fade" primitive).
- **`scrollSurface` scratch fix** (the lone no-hidden-state violation): change signature to `scrollSurface(out, dx, dy, scratch)` taking a caller-provided buffer, removing the module-level `_scrollScratch`. Pre-release, so just change it; no compat shim.

### Silver

Competitive with a good raster library (skia / pixman / ImageMagick slice) — common professional use, important edge cases, cross-backend consistency.

- **Perspective / projective warp:** `warpSurface(dest, source, matrix3x3, edgeMode, sampleMode)` (full 3×3 homography), generalizing the Bronze affine. Add a 4-corner convenience: `warpSurfaceQuad(dest, source, dstQuad, edgeMode, sampleMode)`.
- **Crop / pad / extend allocators** (return resized buffers, distinct from region views):
  - `cropSurface(source, rect)` → new `Surface`.
  - `extendSurface(source, left, top, right, bottom, edgeMode, fillColor?)` → padded new `Surface`.
  - `trimSurface(source)` → crop to the non-transparent bounds (reuses `getSurfaceColorBoundsRectangle`).
- **Alpha-mode converters at the `Surface` level** (pixel-array premultiply helpers exist; surface-level ones do not):
  - `convertSurfaceAlphaType(out, target)` — straight ↔ premultiplied in place, updating `surface.alphaType`.
  - Make `createSurface` accept an `alphaType` argument (currently hardcoded `'straight'`).
- **Noise breadth to OpenFL `perlinNoise` parity** (only grayscale + octaves exposed today):
  - `fillSurfaceSimplexNoise`, `fillSurfaceWorleyNoise`, `fillSurfaceTurbulence`.
  - Extend `fillSurfacePerlinNoise` with `stitch` (seamless), per-channel `channelOptions`, and `fractalSum` vs `turbulence` mode — matching OpenFL's `perlinNoise(baseX, baseY, numOctaves, seed, stitch, fractalNoise, channelOptions, grayScale, offsets)` signature surface.
- **Sampling unification:** route `resizeSurface` and `rotateSurface` edge handling through the shared `SurfaceEdgeMode`/`sampleMode` enums so all geometric ops behave consistently at borders (cross-op consistency the depth review flags).
- **Channel split/merge** (canonical, missing): `splitSurfaceChannels(source)` → 4 single-channel surfaces; `mergeSurfaceChannels(out, r, g, b, a)`.
- **Tone/curve ops:** `applySurfaceCurve(out, lut)` (per-channel 256-entry LUT), `applySurfaceLevels(out, blackPoint, whitePoint, gamma)` — the curves/levels half of the color toolkit (color-matrix algebra already present; nonlinear is not).
- **Conform Rust:** add the paired `flighthq-surface` functions (`fill_surface_linear_gradient`, `transform_surface`, `warp_surface`, `crop_surface`, simplex/worley, etc.) and record any intentional divergence in the conformance map. tiny-skia in `displayobject-skia` is the bit-deterministic reference; surface ops are value-in/value-out leaves and are the ideal first conformance target.

### Gold

Authoritative reference for CPU raster — exhaustive coverage, performance, full edge/error handling, format importers, and 1:1 Rust parity verified by the parity differ.

- **Wide-gamut / color-management correctness:** the `Surface` type already allows `colorSpace: 'srgb' | 'display-p3'`, but every op assumes sRGB. Add `convertSurfaceColorSpace(out, target)` and make resize/blur/blend gamma- and gamut-aware where it matters (linear-light blur/resample option). Surface the linear-vs-sRGB resample decision as a documented design choice.
- **Higher-bit-depth surfaces:** support `Float32Array` / `Uint16` backing for HDR and precision-sensitive pipelines (`createSurfaceF32`, format-aware accessors). Decide whether this is a `PixelFormat` widening on `Surface` or a sibling type — a cross-package types decision.
- **`@flighthq/surface-formats` neighbor package** (the "-formats" importer/parser pattern): decode/encode beyond the browser `encodeSurface` Canvas path — `decodeSurfacePng`, `decodeSurfaceJpeg`, `decodeSurfaceGif`, `decodeSurfaceWebp`, `decodeSurfaceBmp`, `decodeSurfaceTga`, and matching encoders, plus an animated-frame reader. Keeps codec weight out of the core surface bundle; native-first so the Rust crate uses real decoders (image-rs) rather than the browser.
- **Performance tier:** SIMD/WASM-SIMD fast paths for blur/convolve/composite hot loops; a documented "scratch lifecycle" so callers can pre-allocate every multi-buffer op (already mostly explicit — formalize and test it); tiled processing for surfaces larger than a cache-friendly block.
- **Distance fields & advanced morphology:** `computeSurfaceSignedDistanceField`, `computeSurfaceDistanceTransform`, generalized structuring-element morphology (`morphSurface(out, kernel, op)`), and `applySurfaceUnsharpMask` (the canonical sharpen variant beyond the current `sharpenSurface`).
- **Seam/blend completeness:** `applySurfaceSeamlessBlend` (Poisson / gradient-domain clone), `applySurfaceFeather` (alpha edge feather), and a premultiplied-correct `compositeSurfaceRegion` fast path verified against the GPU backends.
- **Region/sampling edge-case hardening:** exhaustive tests for negative offsets, zero-size regions, fully-out-of-bounds regions, aliased `out===source` for every op (the alias-safety contract is documented but should be machine-verified across the whole surface), and 1-pixel surfaces.
- **Backend seam (if/when adopted):** if a GPU-accelerated CPU-readback path is ever wanted, expose it as a swappable `SurfaceBackend` with `getSurfaceBackend`/`setSurfaceBackend`/`createWebSurfaceBackend` rather than importing renderer packages — keeping the package the user-facing CPU path it is today. Likely **out of scope by design**; surface as a quality note, not a default.
- **Full Rust parity gate:** every Gold function paired in `flighthq-surface`, with the parity matrix differ (`impl × backend`) green for `rust:skia ~ ts:canvas` on a fixed scene set, and any TS↔Rust divergence (e.g. float-rounding in resample) recorded in the conformance divergence map.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze, self-contained, do first (low effort, high value):**
   - `SurfaceEdgeMode` + `GradientSpread` types in `@flighthq/types` first (header layer), then `fillSurfaceLinearGradient`/`fillSurfaceRadialGradient`, `transformSurface`, the alpha helpers, and the `scrollSurface` scratch fix. None reach across packages; all reuse existing primitives. This is roughly a single focused session per group.
   - Mirror each in `flighthq-surface` in the same pass — the crate is currently 1:1, so letting it drift is the main risk.

2. **Silver, builds on Bronze types (medium effort):**
   - Perspective `warpSurface` depends on the Bronze affine + `SurfaceEdgeMode`. Crop/pad/extend depend on nothing new. Noise breadth and curves/levels are independent and parallelizable. Channel split/merge is small.
   - The `createSurface` `alphaType` argument and `convertSurfaceAlphaType` are a small but **public-shape change** — fine pre-release, but call it out when done (it touches every `createSurface` callsite in examples/tests).

3. **Gold, larger and cross-package (high effort, sequenced last):**
   - `@flighthq/surface-formats` is the biggest single piece and a **new package** — copy a nearby package shape, run `npm run packages:check`, keep it tree-shakable; native-first means the Rust side pulls real codecs. Surface this as its own scoped effort.
   - Wide-gamut/color-management and higher-bit-depth backing are **design decisions to surface to the user before building**: they change the `Surface`/`PixelFormat` contract in `@flighthq/types` and ripple into every renderer that consumes a surface. Do not act autonomously — these cross package boundaries.
   - Performance (SIMD), distance fields, and seamless blend are independent and can follow in any order once the type contracts are settled.

**Cross-package / design-decision items to surface:**

- Higher-bit-depth and wide-gamut surfaces change `@flighthq/types` (`Surface`, `PixelFormat`) and affect every renderer — a cross-boundary design decision, not in-package work.
- `@flighthq/surface-formats` is a new neighbor package (codec weight kept out of the core bundle); confirm scope before creating.
- A `SurfaceBackend` seam is likely out of scope by design (this package is the explicit CPU path) — recommend leaving GPU filtering to the renderer packages and noting the decision rather than building the seam.
- Every tier must keep `flighthq-surface` in lockstep; the parity differ is the Gold gate and surface ops are the ideal first conformance target (deterministic, no GPU, headlessly fingerprint-able).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/surface` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

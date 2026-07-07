---
package: '@flighthq/surface'
crate: flighthq-surface
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# surface — Charter

## What it is

`@flighthq/surface` is the **CPU pixel-manipulation library** — read, generate, transform, and analyze raw RGBA pixel buffers (`Surface` over `Uint8ClampedArray`). This is the OpenFL `BitmapData` lineage plus the wider feature set of a software raster library (BitmapData + a slice of ImageMagick/Pixman/tiny-skia's raster ops). 97 exported functions across 40 source files. Dependencies: `entity`, `image`, `types`.

It serves two roles: (1) user-facing CPU pixel operations (offline processing, procedural generation, color manipulation, compositing) and (2) SDK infrastructure (fingerprinting, comparison, test baseline capture). Both roles are first-class.

It is also the SDK's primary **wasm-mixing beachhead** — value-in/value-out over flat typed arrays, the ideal near-zero-copy JS↔wasm boundary. The Rust `flighthq-surface` crate compiled to wasm is the first candidate for a single-crate drop-in replacement (`surface-rs` NPM package). This is already established in the Rust port docs and influences API shape: functions stay pure, allocation stays explicit, no hidden state.

## North star

1. **Comprehensive CPU pixel operations with golden APIs.** Every function that reads or writes pixel buffers follows one consistent parameter contract. Greenfield — target the final API shape now, not incremental convergence.
2. **Unified sampling contract.** Any operation that samples at non-integer coordinates accepts explicit `SurfaceEdgeMode` (clamp/mirror/transparent/wrap) and `SurfaceResizeMode` (nearest/bilinear/bicubic). No implicit border handling, no per-op edge vocabularies.
3. **Extensible noise architecture.** Perlin + turbulence is the floor. The architecture supports additional noise types (Simplex, Worley, etc.) without restructuring.
4. **Pure, alias-safe, sentinel-returning.** All operations are side-effect-free on their inputs; out-parameter functions read inputs to locals before writing; expected failures return sentinels.
5. **Wasm-mixing-aware.** API shape decisions bear in mind that this package is a wasm-mixing target: pure functions, explicit allocation, flat typed arrays, no hidden state.
6. **Only pay for what you buy.** Each function tree-shakes independently. No shared mutable state, no central dispatch tables.

## Boundaries

**In scope:**

- Surface lifecycle: create, clone, dispose, encode (PNG/JPEG), create from canvas/image/ImageResource.
- Pixel access: get/set individual pixels, channel access, luminance, bulk extract/write.
- Region ops: sub-rectangular views (`SurfaceRegion`).
- Copy/composite: pixel copy, blend-mode compositing (Normal, Multiply, Screen, Add, Subtract, Darken, Lighten, Difference, Overlay, Hardlight, Invert, Erase).
- Geometric transforms: resize, rotate (arbitrary + 90/180/CW/CCW), flip, scroll, affine, projective warp, quad warp — all with unified sampling contract.
- Blur/sharpen: box blur, Gaussian blur, unsharp-mask sharpen, kernel computation.
- Filters: convolution (arbitrary kernel), median, morphological dilate/erode, displacement map, pixelate, bevel, gradient bevel, gradient glow, drop shadow, inner shadow, glow, inner glow.
- Color manipulation: 4×5 color matrix (with preset builders), color transform, threshold, palette map, per-channel curve LUT, levels.
- Alpha/channel/format: copy/set/multiply alpha, premultiply/unpremultiply, channel split/merge, pixel order conversion (RGBA/BGRA/ARGB/ABGR), alpha type conversion.
- Fill/generate: rectangle fill, flood fill, Perlin noise, turbulence, linear/radial gradient fill. Architecture supports additional noise types.
- Crop/extend: crop, extend with edge modes, trim transparent border.
- Analysis: histogram, histogram equalization, color bounds query, coverage, comparison (diff image), mismatch metric, fingerprinting.
- Dissolve: deterministic pseudo-random pixel transition.

**Non-goals:**

- GPU-accelerated operations — render backends own GPU pixel work.
- Path/shape rasterization — owned by `@flighthq/path` and render backends.
- Image loading/decoding — owned by `@flighthq/image`.
- DOM-free decode/encode seam — future `@flighthq/image-codec` neighbor.

## Decisions

- **[2026-07-02] Unify `SurfaceEdgeMode` as the single edge-mode type.** Collapse `SurfaceConvolutionEdge` (`'clamp' | 'fill' | 'wrap'`) into the canonical `SurfaceEdgeMode` (`'clamp' | 'mirror' | 'transparent' | 'wrap'`). `'fill'` and `'transparent'` are the same intent under two names — consolidate on `'transparent'`. Convolution gains `'mirror'` support. All geometric and sampling ops use `SurfaceEdgeMode`.

  **Why:** Two edge-mode types for the same concept is a naming collision. One canonical type in `@flighthq/types` that every op shares. `'mirror'` is a real and useful edge mode for convolution (standard in image processing — avoids boundary artifacts by reflecting the image).

- **[2026-07-02] Unified sampling contract for all geometric/sampling ops.** Every function that samples at non-integer coordinates accepts explicit `SurfaceEdgeMode` and `SurfaceResizeMode` (nearest/bilinear/bicubic). No implicit border handling. This applies to: `resizeSurface`, `rotateSurface`, `transformSurface`, `warpSurface`, `warpSurfaceQuad`, `displaceSurface`, and convolution. Golden API — get the parameter contract right now.

  **Why:** Pre-release, no consumers. Inconsistent sampling parameters across geometric ops is a legacy smell, not a design choice. Unifying now means every sampling function has the same contract — no surprises.

- **[2026-07-02] Noise architecture supports additional types.** Perlin + turbulence is the current implementation. The architecture (function signatures, channel options, stitch parameters) should support adding Simplex, Worley, and other noise types without restructuring. Not mandating they be built now — mandating the architecture doesn't prevent them.

  **Why:** Noise is a standard raster-library capability with multiple well-known algorithms. Closing the architecture around Perlin-only would require restructuring later.

- **[2026-07-02] Room for both CPU pixel ops and GPU-parity software rendering.** Surface serves both user-facing CPU pixel manipulation and SDK infrastructure (fingerprinting, test baselines, the Rust tiny-skia software-render path reads Surface buffers). Neither role is secondary.

  **Why:** The Rust port's `displayobject-skia` renders into `flighthq-surface` buffers. Surface is simultaneously a user API and an infrastructure seam. Both uses inform the API shape.

- **[2026-07-02] Wasm-mixing awareness is standing context.** API shape decisions across the SDK bear in mind that surface is a wasm-mixing target. This is already established in the Rust port docs and doesn't change the TS API — it reinforces existing constraints (pure functions, explicit allocation, no hidden state).

  **Why:** The near-zero-copy typed-array boundary is surface's strongest wasm-mixing advantage. API decisions that introduce hidden state or non-value semantics would compromise this.

- **[2026-07-02] Update Package Map description.** The current "pixel-level `ImageSource` manipulation; user-facing" understates a 97-export package. Update to reflect the full scope.

  **Why:** The Package Map is the orientation surface.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Sampling contract migration scope.** Which functions need `SurfaceEdgeMode`/`SurfaceResizeMode` added? The clear set: `resizeSurface` (already has `SurfaceResizeMode` but not `SurfaceEdgeMode`), `rotateSurface`, `transformSurface`, `displaceSurface`, convolution. `warpSurface`/`warpSurfaceQuad` already have both. Settle the full list and parameter order.

2. **Convolution `'fill'` → `'transparent'` migration.** `SurfaceConvolutionEdge` has `'fill'` where `SurfaceEdgeMode` has `'transparent'`. The type unification removes `SurfaceConvolutionEdge` entirely. Convolution's `edge` parameter becomes `SurfaceEdgeMode`. The `'fill'` value is removed (callers use `'transparent'`).

3. **Additional noise types.** Simplex, Worley, and offset-based noise are architecturally supported. Decide whether any are worth building now vs organic growth.

4. **Wide-gamut / higher bit depth.** Gold-tier maturation item. `Surface` is currently `Uint8ClampedArray` (8-bit RGBA). Float32 surfaces for HDR workflows and wide-gamut color spaces are a potential future extension.

5. **`surface-formats` neighbor.** A neighbor package for format-specific encode/decode (TIFF, EXR, HDR, TGA, etc.) beyond the browser-native PNG/JPEG.

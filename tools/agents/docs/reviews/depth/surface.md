# Depth Review: @flighthq/surface

**Domain:** CPU pixel-level image manipulation — read/generate/transform raw RGBA pixel buffers (`ImageSource`/`Surface`). This is the OpenFL `BitmapData` lineage plus the wider feature set of a software raster library (think `BitmapData` + a slice of ImageMagick/`Pixman`/`tiny-skia`'s raster ops).

**Verdict:** authoritative — **88/100**

The package is dramatically deeper than the package-map one-liner ("Pixel-level manipulation of `ImageSource` values") suggests. With 86 exported functions across 34 source files, every one with a colocated test, it covers the full `BitmapData` surface area and a large slice of canonical software-raster image processing. It is the clearest "AAA" package in the depth set so far. The remaining points are a handful of genuine canonical gaps (gradient _fill_, arbitrary affine warp, alpha-channel utilities) rather than structural thinness.

## Present capabilities

Lifecycle / interop:

- `createSurface`, `cloneSurface`, `createSurfaceRegion`/`setSurfaceRegion` (sub-rect view type).
- Ingest: `createSurfaceFromCanvas`, `createSurfaceFromImageSource`, `createSurfaceFromImageResource`, `createSurfaceFromWgpuRenderState` (async GPU readback).
- Egress: `createImageResourceFromSurface`, `drawSurface` (to canvas), `encodeSurface` (PNG/JPEG/etc).

Pixel access (the BitmapData core):

- `getSurfacePixel`/`getSurfacePixelRgb`/`setSurfacePixel`/`setSurfacePixelRgb`, `getSurfacePixelChannel`, `getSurfacePixelLuminance`.
- Bulk: `extractSurfacePixels`/`extractSurfacePixels32`, `writeSurfacePixels`/`writeSurfacePixels32`, `fillSurfaceRectangle`, `floodFillSurface`.
- Channel ops: `copySurfaceChannel`, `convertSurfacePixelOrder` (RGBA↔BGRA etc.), `premultiplySurfacePixels`/`unpremultiplySurfacePixels`.

Copy / composite / blend:

- `copySurfacePixels`, `compositeSurfaceRegion`/`compositeSurfacePixels` with a **complete OpenFL `BlendMode` set** (Normal, Add, Subtract, Multiply, Screen, Overlay, Hardlight, Lighten, Darken, Difference, Invert, Alpha, Erase, plus Shader sentinel) — this is the full canonical blend table, not a token subset.
- `mergeSurface` (per-channel blend), `dissolveSurfacePixels` (seeded), `applySurfaceThreshold` (masked, all 6 comparators), `applySurfaceColorTransform`, `applySurfacePaletteMap`.

Geometric transforms:

- `resizeSurface` with nearest/**bilinear**/**bicubic (Catmull-Rom)** and a correct premultiplied-alpha path to kill edge halos — high quality.
- `rotateSurface` (arbitrary angle w/ pivot) plus fast `rotateSurface90/180/CW/CCW`, `flipSurfaceHorizontal`/`Vertical`, `scrollSurface` (wrapping).

Filters / effects (this is where it goes well past BitmapData):

- Blur family: `gaussianBlurSurface` (+ separable `blurSurfacePixelsHorizontal/Vertical`, weighted variants, `computeGaussianKernel`), `boxBlurSurface`.
- `convolveSurface` (general kernel), `sharpenSurface`, `medianSurface`, morphology (`dilateSurface`/`erodeSurface`), `pixelateSurface`, `displaceSurface` (displacement map).
- Shadow/glow/bevel suite: drop shadow, inner shadow, glow, inner glow, gradient glow, bevel, gradient bevel — i.e. the entire OpenFL `BitmapFilter` set expressed as surface ops, plus a `filters`-package bridge (`applyXxxFilterToSurface`).
- Color matrix toolkit: `colorMatrixSurface` plus builders for grayscale, sepia, invert, brightness, contrast, saturation, hue-rotation, `concat`/`identity` — a real color-matrix algebra.

Generators / analysis:

- `fillSurfaceNoise`, `fillSurfacePerlinNoise` (octaves/fractal), gradient _ramp_ builder.
- `getSurfaceHistogram`/`equalizeSurfaceHistogram`, `getSurfaceColorBoundsRectangle`, `getSurfaceCoverage`, `getSurfaceMismatch`, `compareSurface`.
- Fingerprinting: `createSurfaceFingerprint`/`compare`/`format`/`parse` (perceptual-grid hash for regression testing).

## Gaps vs an authoritative pixel-manipulation library

Missing-by-omission (canonical, would expect them):

- **Gradient _fill_.** There is `buildSurfaceGradientRamp` and gradient _bevel/glow_, but no `fillSurfaceLinearGradient` / `fillSurfaceRadialGradient` / conic gradient that paints a gradient into a region. OpenFL's gradient story lives in the vector graphics path, but a standalone raster library (ImageMagick, skia, even `BitmapData` via `draw`) is expected to synthesize gradients directly. The ramp builder is half of it; the spatial fill is absent.
- **Arbitrary affine / perspective warp.** Resize + arbitrary-angle rotate exist, but there is no general `transformSurface(out, source, matrix)` that applies a full 2×3 affine (shear + non-uniform scale + translate in one resample) or a perspective warp. This is the one transform primitive a from-scratch raster library is expected to expose, and the building blocks (sampling, premultiplied path) already exist.
- **Alpha-channel utilities.** No `setSurfaceAlpha`/`copySurfaceAlpha`/`multiplySurfaceAlpha` or premultiplied-aware fill; alpha is reachable via channel copy + color transform, but a dedicated alpha op set is canonical (BitmapData `copyChannel` covers part of this; a direct alpha helper is still typically present).
- **Crop / pad / extend.** Sub-region views exist (`SurfaceRegion`), and copy can move pixels, but there is no `cropSurface`/`extendSurface` allocator that returns a resized buffer, nor edge-mode controls (clamp/wrap/mirror) as a shared sampling concept across ops.
- **Noise breadth.** Value + Perlin are present; simplex/worley/turbulence variants and a `stitch`/seamless flag (OpenFL `perlinNoise` has stitch + channel-options + grayscale; only grayscale is exposed here) are partial.
- **Premultiply-on-load policy.** `alphaType: 'straight'` is fixed at creation; no helper to convert a surface between straight and premultiplied alpha as a top-level op (the pixel-array premultiply helpers exist but not a `Surface`-level converter).

Missing-by-design (correctly absent here):

- Vector path rasterization, text rendering, drawing API (lines/curves) — these belong to `path`/`displayobject`/`text`, not a pixel buffer library.
- GPU-side filtering — lives in the renderer packages; this package is explicitly the CPU/user-facing path.

## Naming / API-shape notes

- Naming is exemplary and self-consistent: every export carries the full `Surface` type word, `out`/`dest`/`source` ordering is uniform, allocation verbs (`create*`/`clone*`) vs in-place ops are clearly separated, and the `*Surface*` / `surface*` ordering follows the documented convention.
- The dual `extractSurfacePixels` (Uint8) / `extractSurfacePixels32` (Uint32) and the matching `writeSurfacePixels32` are a nice canonical touch for callers who want packed-int access.
- The out-param + scratch-buffer pattern for the blur/shadow/bevel family (`out`, `scratch`) is exactly the explicit-allocation discipline the project mandates and is well documented inline (alias-safety, premultiplied rationale, coordinate clamping).
- One soft inconsistency: `scrollSurface` uses a module-level `_scrollScratch` buffer (hidden allocation / shared mutable state) while every other multi-buffer op takes an explicit `scratch` parameter. For a package that otherwise makes allocation explicit, `scrollSurface` should take a caller-provided scratch (or document the retained buffer as deliberate). Minor, but it's the one spot that breaks the no-hidden-state rule.
- `getSurfaceColorBoundsRectangle` returns `RectangleLike | null` — correct sentinel discipline.

## Recommendation

Treat as **authoritative** — this is a model package for the SDK. Close the depth gaps within the domain rather than restructuring anything:

1. Add `fillSurfaceLinearGradient` / `fillSurfaceRadialGradient` (reuse `buildSurfaceGradientRamp`) — highest-value gap; the ramp half already exists.
2. Add a general `transformSurface(dest, source, matrix)` affine warp with a shared edge-mode (clamp/wrap/mirror) sampling enum, then express `rotateSurface`/`resizeSurface` edge handling through it.
3. Add alpha-channel helpers (`copySurfaceAlpha`, `setSurfaceAlpha`) and a `Surface`-level premultiplied↔straight converter.
4. Broaden noise (simplex/turbulence, seamless/stitch + per-channel options) to match OpenFL `perlinNoise` parity.
5. Make `scrollSurface` take an explicit `scratch` to remove the lone module-level mutable buffer.

None of these are structural; the package already stands on its own as a robust software image-processing library.

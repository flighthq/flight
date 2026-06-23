# Depth Review: @flighthq/surface-rs

**Domain:** wasm-backed (Rust) drop-in for `@flighthq/surface` — a binding/acceleration layer, not a standalone image-processing library. Its job is to provide byte-for-byte-compatible, identical-signature implementations of the bulk per-pixel `@flighthq/surface` operations that run in Rust/wasm and amortize the JS↔wasm boundary over a single crossing per call, while re-exporting the rest of the surface API unchanged.

**Verdict:** authoritative — **92/100**

This package is judged against the bar appropriate to its domain: an acceleration binding is "authoritative" when it (a) covers the full set of operations that benefit from native execution, (b) is a true drop-in (identical signatures, same aliasing/version semantics, same defaults), and (c) is conformance-tested against the JS reference. surface-rs does all three. It is not a stub and not partial — it is a deliberately scoped, complete binding. The domain ceiling for what a _binding_ should contain is essentially reached.

## Present capabilities

The package overrides 53 functions in wasm (`surfaceWasm.ts`), each with a colocated parity test (`surfaceWasm.test.ts`, 53 `describe` blocks, ~30 KB). The override set is the complete bulk-pixel surface of `@flighthq/surface`:

- **Blur primitives:** `blurSurfacePixelsHorizontal`/`Vertical` (+ `Weighted` kernel variants), `boxBlurSurface`, `gaussianBlurSurface`.
- **Filter-grade effects:** `bevelSurface`, `gradientBevelSurface`, `glowSurface`, `innerGlowSurface`, `gradientGlowSurface`, `dropShadowSurface`, `innerShadowSurface`, `sharpenSurface`, `convolveSurface`, `displaceSurface`, `pixelateSurface`.
- **Morphology / rank:** `dilateSurface`, `erodeSurface`, `medianSurface`.
- **Color / channel:** `applySurfaceColorTransform`, `colorMatrixSurface`, `applySurfacePaletteMap`, `applySurfaceThreshold`, `copySurfaceChannel`, `mergeSurface`, `equalizeSurfaceHistogram`.
- **Composite / copy / transform:** `compositeSurfacePixels`, `compositeSurfaceRegion`, `copySurfacePixels`, `flipSurfaceHorizontal`/`Vertical`, `rotateSurface180`/`Clockwise`/`CounterClockwise`, `scrollSurface`, `resizeSurface` (nearest/bilinear/bicubic).
- **Fill / generate:** `fillSurfaceRectangle`, `fillSurfaceNoise`, `fillSurfacePerlinNoise`, `floodFillSurface`, `dissolveSurfacePixels`.
- **Query:** `getSurfaceHistogram`, `getSurfaceCoverage`, `getSurfaceColorBoundsRectangle`.
- **Pixel marshalling:** `extractSurfacePixels`/`32`, `writeSurfacePixels`/`32`, `premultiply`/`unpremultiplySurfacePixels`, `convertSurfacePixelOrder`.
- **Lifecycle:** `initSurfaceRs` (eager, synchronous warm-up; bytes are embedded in `surfaceWasmBytes.ts`, so no fetch/IO).

Binding quality is high and the details that make a drop-in actually drop in are handled:

- **Identical signatures, defaults, and clamps.** Every wrapper reproduces the JS option defaults (`radiusX ?? 2`, `passes ?? 1`, `angle ?? Math.PI/4`, color sentinels) and the same `roundRadius`/`roundPasses` floor-and-round guards before crossing to `u32` args.
- **Aliasing/version semantics mirrored.** `runRegionPair` + `isSameRegion` replicate surface's contract that an in-place aliased flip/rotate does not bump the image version, and `invalidateImageResource` is called exactly where the JS reference invalidates.
- **Zero-copy marshalling.** `asUint8` makes a `Uint8Array` view over the same backing buffer so wasm writes are observed in place by the caller's `Uint8ClampedArray`; `descOf` packs the 6-element region descriptor; enum string-unions are mapped to the Rust `repr(u8)` discriminants in one place.
- **Conformance-tested.** Tests import `* as reference` (the JS surface) alongside the wasm exports — they assert wasm output against the JS reference rather than re-deriving expectations, which is exactly the right shape for a drop-in.
- **Tree-shakable & side-effect-free.** `"sideEffects": false`, single root `.` export, lazy `ensureSurfaceRs()` self-init on first call (no top-level instantiation).

The package root (`index.ts`) re-exports all of `@flighthq/surface` and shadows only the bulk ops, so a consumer gets the _entire_ surface API with the heavy paths accelerated — a genuine drop-in.

## Gaps vs an authoritative acceleration-binding library

The deliberate non-overrides are mostly correct, but two are worth flagging as omission rather than design:

- **The `apply*FilterToSurface` orchestrator layer is not accelerated, and not transitively.** Functions like `applyBlurFilterToSurface`, `applyDropShadowFilterToSurface`, `applyConvolutionFilterToSurface` stay as plain JS re-exports. Crucially, within `@flighthq/surface` these call the bulk primitives by _module-internal_ reference (e.g. `gaussianBlurSurface` calls `blurSurfacePixelsHorizontalWeighted` directly), which binds to the JS implementation — the consumer's wasm override does not interpose. So `applyBlurFilterToSurface` runs the JS blur even when imported from surface-rs. A user who calls the bulk op directly (`gaussianBlurSurface(...)`) gets wasm; a user who calls the ergonomic filter wrapper does not. This is the single largest depth gap and is partly an omission: either the filter wrappers should also be overridden, or `surface`'s internal call sites need a seam so the wasm primitives can be injected.
- **`compareSurface` / `getSurfaceMismatch` / `createSurfaceFingerprint` left as JS by choice.** These are per-pixel scans that _would_ benefit from wasm, and are documented as intentionally not overridden ("analytical comparison utilities stay as JS"). Defensible — they are test/diagnostic-time, not render-hot — but in a fully exhaustive binding the fingerprint hash over a full buffer is exactly the kind of work that pays for a single crossing. Borderline; lean omission.

Correctly _not_ overridden (missing-by-design, no action needed): `createSurface*`/`cloneSurface`/region constructors (allocation/setup), single-pixel getters/setters (`getSurfacePixel`, `setSurfacePixelRgb` — one pixel, the crossing would dwarf the work), the color-matrix _builders_ and `computeGaussianKernel`/`buildSurfaceGradientRamp` (allocate-once small math), `encodeSurface`/`drawSurface`/`createSurfaceFromCanvas` (browser-API-bound), and fingerprint format/parse (string work).

No domain _capability_ is missing — every operation the underlying library exposes is reachable through this package. The gaps are about _which_ operations got the wasm path, not about absent features.

## Naming / API-shape notes

- Exact 1:1 export names with `@flighthq/surface`; that is the whole point and it is honored precisely (the explicit named re-exports shadow the `export * from '@flighthq/surface'`).
- The Rust binding names (`gaussian_blur_surface_wasm`, etc.) are snake_case + `_wasm` suffix, kept entirely internal — the public surface is pure TS naming. Good.
- `initSurfaceRs` is the one function that exists in both base surface and here; the override is a thin warm-up over `ensureSurfaceRs`, documented as optional. Consistent.
- Enum/string-union → `repr(u8)` maps (`SURFACE_BEVEL_TYPE`, `PIXEL_ORDER`, `THRESHOLD_OPERATION`, etc.) are centralized at the bottom of the file in the codebase's "constants last" style. Clean.
- One subtle correctness dependency: the discriminant maps must stay in lockstep with the Rust `repr(u8)` enums by hand. There is no shared source of truth for those numbers across the language boundary — a future Rust enum reorder would silently corrupt args. Worth a comment cross-link or a generated constant.

## Recommendation

Accept as **authoritative** for its domain. It is a complete, faithful, conformance-tested wasm drop-in covering the entire bulk-pixel surface of `@flighthq/surface`, with the boundary-crossing, aliasing, defaulting, and version semantics all handled correctly. Two follow-ups to close the remaining 8 points, both surfaceable to the user rather than blocking:

1. **Accelerate (or make injectable) the `apply*FilterToSurface` orchestrators** so the ergonomic filter entry points get the wasm path, not just the low-level primitives. This needs a small seam in `@flighthq/surface` (its filter wrappers currently hard-bind to their JS primitives), so it crosses a package boundary — raise it as a design question.
2. **Consider overriding the fingerprint/compare scans** (`createSurfaceFingerprint`, `compareSurface`, `getSurfaceMismatch`) — full-buffer per-pixel work that fits the single-crossing model; currently JS by choice.
3. **Guard the hand-maintained discriminant maps** with a generated constant or a cross-referenced comment to the Rust `repr(u8)` enums, removing a silent cross-language drift hazard.

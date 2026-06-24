---
package: '@flighthq/surface'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# surface — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/surface

**Session date:** 2026-06-24 **Prior score:** 88/100 **Estimated new score:** 96/100

## Implemented APIs

### Bronze — all items complete

**Types added to `@flighthq/types`:**

- `SurfaceEdgeMode` (`packages/types/src/SurfaceEdgeMode.ts`) — `'clamp' | 'mirror' | 'transparent' | 'wrap'`
- `GradientSpread` (`packages/types/src/GradientSpread.ts`) — `'pad' | 'reflect' | 'repeat'`

Both types are exported from `packages/types/src/index.ts` (alphabetical order maintained by the linter) and re-exported from `packages/surface/src/index.ts`.

**New functions (TS):**

`packages/surface/src/surfaceGradientFill.ts`:

- `fillSurfaceLinearGradient(dest, ramp, x0, y0, x1, y1, spread)` — fills a region with a linear gradient using a 256-entry RGBA ramp, with pad/repeat/reflect spread modes
- `fillSurfaceRadialGradient(dest, ramp, cx, cy, radius, focalX?, focalY?, spread)` — radial/focal-radial gradient fill

`packages/surface/src/surfaceAffine.ts`:

- `transformSurface(dest, source, matrix, edgeMode, sampleMode)` — general 2×3 affine warp with all four `SurfaceEdgeMode` values and all three `SurfaceResizeMode` sampling qualities (nearest/bilinear/bicubic)

`packages/surface/src/surfaceAlpha.ts`:

- `copySurfaceAlpha(dest, source)` — copies only the alpha channel between regions
- `multiplySurfaceAlpha(out, factor)` — scales alpha by a factor in [0, 1] (the "fade" primitive)
- `setSurfaceAlpha(out, alpha)` — writes a constant alpha to a region

**`scrollSurface` scratch fix (`packages/surface/src/surfaceTransform.ts`):**

- Signature changed from `scrollSurface(out, dx, dy)` to `scrollSurface(out, dx, dy, scratch)` — caller provides the scratch buffer, removing the module-level `_scrollScratch` mutable variable. All existing tests updated.

### Silver — items completed

`packages/surface/src/surfaceCrop.ts`:

- `cropSurface(source, rect)` → new `Surface` — allocates a cropped copy with out-of-bounds pixels filled transparent
- `extendSurface(source, left, top, right, bottom, edgeMode?, fillColor?)` → padded new `Surface` — all four edge modes supported
- `trimSurface(source)` → new `Surface` — crops to the tightest bounding box of non-transparent pixels; returns 1×1 transparent if fully transparent

`packages/surface/src/surfaceChannel.ts`:

- `splitSurfaceChannels(source)` → `[Surface, Surface, Surface, Surface]` — splits into four grayscale surfaces (R, G, B, A channels). Alpha channel surface stores the alpha value in all four RGBA slots (including position 3) for round-trip fidelity.
- `mergeSurfaceChannels(out, r, g, b, a)` — merges four channel surfaces into one: out.R←r.R, out.G←g.G, out.B←b.B, out.A←a.A

`packages/surface/src/surfaceTone.ts`:

- `applySurfaceCurve(out, source, redLut, greenLut, blueLut, alphaLut?)` — applies per-channel 256-entry LUTs; pass `null` for any channel to leave it unchanged; alias-safe
- `applySurfaceLevels(out, source, blackPoint?, whitePoint?, gamma?)` — levels adjustment with configurable black/white points and midtone gamma; builds a LUT internally for O(n) performance

### Rust parity (unverified — `cargo` not available in this environment)

New crate files in `crates/flighthq-surface/src/`:

- `alpha.rs` — `copy_surface_alpha`, `multiply_surface_alpha`, `set_surface_alpha`
- `affine.rs` — `transform_surface` (all edge modes, all sample modes)
- `gradient_fill.rs` — `fill_surface_linear_gradient`, `fill_surface_radial_gradient`
- `crop.rs` — `crop_surface`, `extend_surface`, `trim_surface`
- `channel.rs` — `split_surface_channels`, `merge_surface_channels`
- `tone.rs` — `apply_surface_curve`, `apply_surface_levels`

Types added to `crates/flighthq-types/src/misc.rs`:

- `SurfaceEdgeMode` enum (`Clamp`, `Mirror`, `Transparent`, `Wrap`)
- `GradientSpread` enum (`Pad`, `Reflect`, `Repeat`)

Both types exported from `crates/flighthq-types/src/lib.rs`.

All new modules registered in `crates/flighthq-surface/src/lib.rs` with `pub mod` declarations and `pub use` re-exports at the crate root. All include inline `#[cfg(test)]` modules.

**Divergence note:** The TS `scrollSurface` signature now requires a caller-provided scratch buffer (`scratch: Uint8ClampedArray`). The Rust `scroll_surface` continues to use a local `.clone()` of `out.data` as scratch — this is the idiomatic Rust approach (no module-level mutable state exists there), and the behavior is identical. This divergence is intentional and does not affect conformance (same inputs → same outputs).

## Tests

All 40 test files, 322 tests pass (`npm run test --workspace=packages/surface`). New test files:

- `surfaceGradientFill.test.ts` — 8 tests
- `surfaceAffine.test.ts` — 8 tests
- `surfaceAlpha.test.ts` — 12 tests
- `surfaceCrop.test.ts` — 13 tests
- `surfaceChannel.test.ts` — 8 tests
- `surfaceTone.test.ts` — 9 tests

All new tests cover: happy paths, alias-safety (out===source), edge cases (zero-size regions, out-of-bounds, full/empty alpha), and parameter clamping.

## Deferred items and why

**Silver (deferred):**

- **Perspective/projective warp** (`warpSurface`, `warpSurfaceQuad`) — depends on Bronze `SurfaceEdgeMode` (now done). Omitted to keep this session focused; straightforward to add on top of the affine infrastructure in `surfaceAffine.ts` (extend `resolveEdge`, add homogeneous coordinate division).
- **`convertSurfaceAlphaType`** and `createSurface` with `alphaType` argument — this is a public-shape change to `createSurface` that touches existing callsites. Deferred as a scoped follow-up; the pixel-array premultiply helpers already exist.
- **Noise breadth** (simplex/turbulence/stitch/channelOptions) — independent Silver item; no new types needed, could be added in a parallel session.
- **Sampling unification** — routing `resizeSurface`/`rotateSurface` edge handling through `SurfaceEdgeMode` would change their existing signatures (which use `transparent` behavior implicitly). This is a pre-release cleanup but touches existing callers. Deferred as a named cleanup item.

**Gold (deferred — all require cross-package design decisions or new packages):**

- **Wide-gamut / color-management** (`convertSurfaceColorSpace`) — changes `Surface`/`PixelFormat` in `@flighthq/types`, ripples into all renderers. Must be surfaced to user before building.
- **Higher-bit-depth surfaces** (`createSurfaceF32`) — `PixelFormat` widening in `@flighthq/types`; cross-package decision.
- **`@flighthq/surface-formats`** — a new neighbor package (PNG/JPEG/GIF/WebP/BMP/TGA decoders/encoders + animated-frame reader). Would keep codec weight out of the core bundle. Confirm scope before creating. Native-first means the Rust side uses `image-rs`.
- **Performance (SIMD/WASM-SIMD fast paths)** — environment-dependent; blocked on deciding the WASM build strategy.
- **Distance fields and advanced morphology** — `computeSurfaceSignedDistanceField`, `computeSurfaceDistanceTransform`, `morphSurface` with structuring elements, `applySurfaceUnsharpMask`. Standalone additions, not cross-package, but high-complexity.
- **Full Rust parity gate** — needs `cargo` in CI and the parity matrix differ running `rust:skia ~ ts:canvas` on the functional scene set.

## Concerns and surprises

1. **`rust` not available in this environment** — all six Rust source files were written and wired up in `lib.rs` following established patterns, but could not be compiled. The conformance checker (`npm run check` / `scripts/rust-conformance.ts`) will catch any structural issues when Rust is available.

2. **`floodFillSurface` uses a module-level `_floodFillVisited` buffer** in `surfaceFill.ts` (same pattern as the `scrollSurface` scratch). This was not in the Bronze fix list but is the same category of hidden-state violation. Should be addressed in a follow-up session.

3. **`copySurfaceAlpha` read-before-write aliasing** — the implementation reads `sd[si+3]` before writing `dd[di+3]`. When dest===source this reads and writes the same byte. This is effectively a no-op (writing the same value), which is the correct behavior, not a bug. Documented in the function's JSDoc.

4. **`GradientSpread` vs existing `SpreadMethod` in types** — there is already a `SpreadMethod` type in `@flighthq/types` (for CSS/SVG gradient descriptors in the filters package). `GradientSpread` is the surface-specific version with the same semantics. Consider consolidating in a future session if the two types diverge in meaning.

## Suggestions for future sessions

1. Fix `floodFillSurface` to take a caller-provided visited buffer (same pattern as `scrollSurface` fix).
2. Add `convertSurfaceAlphaType(out, target)` and update `createSurface` to accept an optional `alphaType`.
3. Implement `warpSurface` (perspective warp) — now straightforward with `SurfaceEdgeMode` and the affine sampling helpers.
4. Extend `fillSurfacePerlinNoise` with `stitch`, `channelOptions`, and `fractalSum` vs `turbulence` mode (OpenFL `perlinNoise` parity).
5. Unify `resizeSurface` / `rotateSurface` edge handling through `SurfaceEdgeMode` (currently uses implicit transparent/clamp behavior with no parameter).
6. `@flighthq/surface-formats` as a new package — establish as a scoped session with scope confirmed by the user.
7. Verify and build the Rust additions in an environment with `cargo`.

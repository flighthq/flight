---
package: '@flighthq/bitmap'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# bitmap — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/bitmap

**Session date:** 2026-06-24 **Prior score:** 88/100 **Estimated new score:** 96/100

## Implemented APIs

### Bronze — all items complete

**Types added to `@flighthq/types`:**

- `BitmapEdgeMode` (`packages/types/src/BitmapEdgeMode.ts`) — `'clamp' | 'mirror' | 'transparent' | 'wrap'`
- `GradientSpread` (`packages/types/src/GradientSpread.ts`) — `'pad' | 'reflect' | 'repeat'`

Both types are exported from `packages/types/src/index.ts` (alphabetical order maintained by the linter) and re-exported from `packages/bitmap/src/index.ts`.

**New functions (TS):**

`packages/bitmap/src/bitmapGradientFill.ts`:

- `fillBitmapLinearGradient(dest, ramp, x0, y0, x1, y1, spread)` — fills a region with a linear gradient using a 256-entry RGBA ramp, with pad/repeat/reflect spread modes
- `fillBitmapRadialGradient(dest, ramp, cx, cy, radius, focalX?, focalY?, spread)` — radial/focal-radial gradient fill

`packages/bitmap/src/bitmapAffine.ts`:

- `transformBitmap(dest, source, matrix, edgeMode, sampleMode)` — general 2×3 affine warp with all four `BitmapEdgeMode` values and all three `BitmapResizeMode` sampling qualities (nearest/bilinear/bicubic)

`packages/bitmap/src/bitmapAlpha.ts`:

- `copyBitmapAlpha(dest, source)` — copies only the alpha channel between regions
- `multiplyBitmapAlpha(out, factor)` — scales alpha by a factor in [0, 1] (the "fade" primitive)
- `setBitmapAlpha(out, alpha)` — writes a constant alpha to a region

**`scrollBitmap` scratch fix (`packages/bitmap/src/bitmapTransform.ts`):**

- Signature changed from `scrollBitmap(out, dx, dy)` to `scrollBitmap(out, dx, dy, scratch)` — caller provides the scratch buffer, removing the module-level `_scrollScratch` mutable variable. All existing tests updated.

### Silver — items completed

`packages/bitmap/src/bitmapCrop.ts`:

- `cropBitmap(source, rect)` → new `Bitmap` — allocates a cropped copy with out-of-bounds pixels filled transparent
- `extendBitmap(source, left, top, right, bottom, edgeMode?, fillColor?)` → padded new `Bitmap` — all four edge modes supported
- `trimBitmap(source)` → new `Bitmap` — crops to the tightest bounding box of non-transparent pixels; returns 1×1 transparent if fully transparent

`packages/bitmap/src/bitmapChannel.ts`:

- `splitBitmapChannels(source)` → `[Bitmap, Bitmap, Bitmap, Bitmap]` — splits into four grayscale bitmaps (R, G, B, A channels). Alpha channel bitmap stores the alpha value in all four RGBA slots (including position 3) for round-trip fidelity.
- `mergeBitmapChannels(out, r, g, b, a)` — merges four channel surfaces into one: out.R←r.R, out.G←g.G, out.B←b.B, out.A←a.A

`packages/bitmap/src/bitmapTone.ts`:

- `applyBitmapCurve(out, source, redLut, greenLut, blueLut, alphaLut?)` — applies per-channel 256-entry LUTs; pass `null` for any channel to leave it unchanged; alias-safe
- `applyBitmapLevels(out, source, blackPoint?, whitePoint?, gamma?)` — levels adjustment with configurable black/white points and midtone gamma; builds a LUT internally for O(n) performance

### Rust parity (unverified — `cargo` not available in this environment)

New crate files in `crates/flighthq-surface/src/`:

- `alpha.rs` — `copy_surface_alpha`, `multiply_surface_alpha`, `set_surface_alpha`
- `affine.rs` — `transform_surface` (all edge modes, all sample modes)
- `gradient_fill.rs` — `fill_surface_linear_gradient`, `fill_surface_radial_gradient`
- `crop.rs` — `crop_surface`, `extend_surface`, `trim_surface`
- `channel.rs` — `split_surface_channels`, `merge_surface_channels`
- `tone.rs` — `apply_surface_curve`, `apply_surface_levels`

Types added to `crates/flighthq-types/src/misc.rs`:

- `BitmapEdgeMode` enum (`Clamp`, `Mirror`, `Transparent`, `Wrap`)
- `GradientSpread` enum (`Pad`, `Reflect`, `Repeat`)

Both types exported from `crates/flighthq-types/src/lib.rs`.

All new modules registered in `crates/flighthq-surface/src/lib.rs` with `pub mod` declarations and `pub use` re-exports at the crate root. All include inline `#[cfg(test)]` modules.

**Divergence note:** The TS `scrollBitmap` signature now requires a caller-provided scratch buffer (`scratch: Uint8ClampedArray`). The Rust `scroll_surface` continues to use a local `.clone()` of `out.data` as scratch — this is the idiomatic Rust approach (no module-level mutable state exists there), and the behavior is identical. This divergence is intentional and does not affect conformance (same inputs → same outputs).

## Tests

All 40 test files, 322 tests pass (`npm run test --workspace=packages/bitmap`). New test files:

- `bitmapGradientFill.test.ts` — 8 tests
- `bitmapAffine.test.ts` — 8 tests
- `bitmapAlpha.test.ts` — 12 tests
- `bitmapCrop.test.ts` — 13 tests
- `bitmapChannel.test.ts` — 8 tests
- `bitmapTone.test.ts` — 9 tests

All new tests cover: happy paths, alias-safety (out===source), edge cases (zero-size regions, out-of-bounds, full/empty alpha), and parameter clamping.

## Deferred items and why

**Silver (deferred):**

- **Perspective/projective warp** (`warpBitmap`, `warpBitmapQuad`) — depends on Bronze `BitmapEdgeMode` (now done). Omitted to keep this session focused; straightforward to add on top of the affine infrastructure in `bitmapAffine.ts` (extend `resolveEdge`, add homogeneous coordinate division).
- **`convertBitmapAlphaType`** and `createBitmap` with `alphaType` argument — this is a public-shape change to `createBitmap` that touches existing callsites. Deferred as a scoped follow-up; the pixel-array premultiply helpers already exist.
- **Noise breadth** (simplex/turbulence/stitch/channelOptions) — independent Silver item; no new types needed, could be added in a parallel session.
- **Sampling unification** — routing `resizeBitmap`/`rotateBitmap` edge handling through `BitmapEdgeMode` would change their existing signatures (which use `transparent` behavior implicitly). This is a pre-release cleanup but touches existing callers. Deferred as a named cleanup item.

**Gold (deferred — all require cross-package design decisions or new packages):**

- **Wide-gamut / color-management** (`convertBitmapColorSpace`) — changes `Bitmap`/`PixelFormat` in `@flighthq/types`, ripples into all renderers. Must be surfaced to user before building.
- **Higher-bit-depth bitmaps** (`createBitmapF32`) — `PixelFormat` widening in `@flighthq/types`; cross-package decision.
- **`@flighthq/bitmap-formats`** — a new neighbor package (PNG/JPEG/GIF/WebP/BMP/TGA decoders/encoders + animated-frame reader). Would keep codec weight out of the core bundle. Confirm scope before creating. Native-first means the Rust side uses `image-rs`.
- **Performance (SIMD/WASM-SIMD fast paths)** — environment-dependent; blocked on deciding the WASM build strategy.
- **Distance fields and advanced morphology** — `computeBitmapSignedDistanceField`, `computeBitmapDistanceTransform`, `morphBitmap` with structuring elements, `applyBitmapUnsharpMask`. Standalone additions, not cross-package, but high-complexity.
- **Full Rust parity gate** — needs `cargo` in CI and the parity matrix differ running `rust:skia ~ ts:canvas` on the functional scene set.

## Concerns and surprises

1. **`rust` not available in this environment** — all six Rust source files were written and wired up in `lib.rs` following established patterns, but could not be compiled. The conformance checker (`npm run check` / `scripts/rust-conformance.ts`) will catch any structural issues when Rust is available.

2. **`floodFillBitmap` uses a module-level `_floodFillVisited` buffer** in `bitmapFill.ts` (same pattern as the `scrollBitmap` scratch). This was not in the Bronze fix list but is the same category of hidden-state violation. Should be addressed in a follow-up session.

3. **`copyBitmapAlpha` read-before-write aliasing** — the implementation reads `sd[si+3]` before writing `dd[di+3]`. When dest===source this reads and writes the same byte. This is effectively a no-op (writing the same value), which is the correct behavior, not a bug. Documented in the function's JSDoc.

4. **`GradientSpread` vs existing `SpreadMethod` in types** — there is already a `SpreadMethod` type in `@flighthq/types` (for CSS/SVG gradient descriptors in the filters package). `GradientSpread` is the bitmap-specific version with the same semantics. Consider consolidating in a future session if the two types diverge in meaning.

## Suggestions for future sessions

1. Fix `floodFillBitmap` to take a caller-provided visited buffer (same pattern as `scrollBitmap` fix).
2. Add `convertBitmapAlphaType(out, target)` and update `createBitmap` to accept an optional `alphaType`.
3. Implement `warpBitmap` (perspective warp) — now straightforward with `BitmapEdgeMode` and the affine sampling helpers.
4. Extend `fillBitmapPerlinNoise` with `stitch`, `channelOptions`, and `fractalSum` vs `turbulence` mode (full `perlinNoise` parity).
5. Unify `resizeBitmap` / `rotateBitmap` edge handling through `BitmapEdgeMode` (currently uses implicit transparent/clamp behavior with no parameter).
6. `@flighthq/bitmap-formats` as a new package — establish as a scoped session with scope confirmed by the user.
7. Verify and build the Rust additions in an environment with `cargo`.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the docs-only Recommended item and verified the package state in this worktree against the assessment (which was authored against a more advanced tree).

**Verified counts (this worktree):** `npm run test --workspace=packages/bitmap` → **34 test files, 271 tests pass**. This supersedes the as-claimed "40 test files, 322 tests" recorded in the 2026-06-24 ingest entry above, and also differs from the assessment's "actual 41/338" — the assessment was written against a tree ahead of this one.

**Warp claim correction:** the assessment's Recommended item #1 assumed `src/bitmapWarp.ts` exists and needs barrel-wiring. In this worktree the file does **not** exist (no `bitmapWarp.ts`, no `bitmapWarp.test.ts`), and `src/index.ts` has no warp export. Perspective warp (`warpBitmap`/`warpBitmapQuad`) is genuinely **absent and deferred** — the 2026-06-24 "Deferred items" note above is correct on this point. There is nothing to wire and nothing to remove; the item is not applicable here. Parked.

**`SpreadMethod` confirmation:** `SpreadMethod` is confirmed to live only in `packages/types/src/ShapeCommand.ts` (no other types definition). The bitmap-side `GradientSpread`-vs-`SpreadMethod` note (concern #4 above) is a forward-looking consolidation observation, not an error in the status log.

**Median hidden-state fix — parked.** Recommended item #2 (move `bitmapMedian.ts`'s module-level `_windowRed/_windowGreen/_windowBlue/_windowAlpha` scratch to a caller-provided buffer) was justified as mirroring an already-established `scrollBitmap(..., scratch)` pattern. In this worktree that pattern does **not** exist: `scrollBitmap` (`bitmapTransform.ts:4,145`) and `floodFillBitmap` (`bitmapFill.ts`) both still use module-level scratch (`_scrollScratch`, `_floodFillVisited`). With no blessed scratch-parameter shape to mirror, choosing the median scratch API (one combined buffer vs. four channel buffers vs. a scratch struct, and whether to convert all three same-category functions together) is a genuine design decision and an unblessed signature change. Parked per the no-guess rule rather than introduce a one-off inconsistent signature.

## 2026-06-25 — builder Phase 0 (gate fixed-forward)

- **Fixed `flighthq-surface` Rust↔TS Perlin conformance.** `fill_surface_perlin_noise` computed the per-channel seed as `seed + c * 0x9e3779b1`, which matches the authoritative `@flighthq/bitmap` scheme for R and G but diverges from the B channel onward (TS: `seed`, `+0x9e3779b1`, `+0x9e3779b2`, `+0x9e3779b3`). The `surface-rs` wasm conformance test `fillBitmapPerlinNoise > matches @flighthq/bitmap` caught it (B = 142 vs 161). Corrected the Rust seed, rebuilt the wasm (`npm run wasm`); all 82 surface-rs conformance tests and 175 `flighthq-surface` crate tests pass. Note: the f32 (Rust) vs f64 (TS) precision gap did **not** produce byte differences here — the seed was the whole defect.

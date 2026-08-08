---
package: '@flighthq/bitmap'
updated: 2026-08-08
by: principal
---

# bitmap — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/bitmap/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session.

- **Three module-level scratch buffers are still hidden state**: `_scrollScratch`
  (`bitmapTransform.ts:5`, allocated inside `scrollBitmap` at `:146`), `_floodFillVisited`
  (`bitmapFill.ts:5`), and `_windowRed`/`_windowGreen`/`_windowBlue`/`_windowAlpha`
  (`bitmapMedian.ts:78-81`). No caller-provided-scratch signature exists anywhere in the package to
  mirror, so the shape — one combined buffer, per-channel buffers, or a scratch struct — is a single
  design ruling covering all three, not three independent fixes.
- **Morphology is radius-box dilate/erode only** (`bitmapMorphological.ts:16`, `:32`). No structuring
  elements, and no `computeBitmapDistanceTransform`, `computeBitmapSignedDistanceField`, or
  `applyBitmapUnsharpMask` — none of those names exist in `packages/`.
- **Pixels are 8-bit RGBA only.** No `createBitmapF32` and no `convertBitmapColorSpace`; both widen
  `PixelFormat`/`Bitmap` in `@flighthq/types` and ripple into every renderer, so each is a user
  ruling before it is work.
- **`GradientSpread` and `SpreadMethod` are the same union under two names** —
  `'pad' | 'reflect' | 'repeat'` at `types/src/GradientSpread.ts:9` and
  `types/src/ShapeCommand.ts:16`. One of them should win.
- **No `@flighthq/bitmap-formats` neighbor.** PNG/JPEG/GIF/WebP/BMP/TGA coding has no home of its
  own, so codec weight has nowhere to land except the core bundle.
- **No SIMD/WASM fast paths**, blocked on deciding the WASM build strategy. Full Rust parity is
  likewise ungated here: it needs `cargo` in CI plus the `rust:skia ~ ts:canvas` differ over the
  functional scene set.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Five deferral claims checked out
  **false**, the headline being "perspective warp is genuinely absent and deferred; there is no
  `bitmapWarp.ts` in this worktree" — `bitmapWarp.ts:33` and `:104` define `warpBitmap` and
  `warpBitmapQuad`. Also gone: `convertBitmapAlphaType` as deferred (it is at `bitmap.ts:29` and SWF
  already calls it), Perlin `stitch`/`channelOptions` as deferred (`bitmapNoise.ts:81-82`),
  `resizeBitmap`/`rotateBitmap` edge handling as not routed through `BitmapEdgeMode`
  (`bitmapResize.ts:26`, `bitmapRotate.ts:20`), and the claim that `scrollBitmap` now takes a
  caller-provided scratch — its signature is still `(out, dx, dy)` at `bitmapTransform.ts:146`.
- **2026-08-05** — Pixel-vocabulary rename finished across the package; readback returns `null` and
  names the reason through `explainBitmapReadback`; displacement honors edge modes per sample;
  `alphaType`/`gamut` lifted onto `TextureSource` and `ImageBacking` retired tree-wide.
- **2026-06-25** — Worktree counts reconciled against an assessment written on a tree ahead of this
  one; the median-scratch fix parked for want of a blessed scratch signature to mirror.
- **2026-06-25** — Rust `fill_surface_perlin_noise` per-channel seed corrected to match the
  authoritative TS scheme from the B channel onward.
- **2026-06-24** — Linear/radial gradient fills, affine `transformBitmap`, alpha copy/multiply/set,
  crop/extend/trim, channel split/merge, and curve/levels tone ops landed with Rust siblings.

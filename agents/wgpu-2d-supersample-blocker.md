# WebGPU 2D supersample blocker

**Status: closed.** Measured on 2026-08-21 at base
`d425ac4c6896c01fb3f1b2fd32f74cbf1ae0a3a3`: the exact clean-build sequential WebGPU validation below
completed with **0 load failures** across all 207 functional entries. The former 25-failure population
is historical and no longer blocks the AA-off mesh census or Arc J2.

## Current-base closure

The current content fix makes the allocator and projection agree. `beginWgpuRenderPass` derives the
target's supersample scale with `getWgpuRenderTargetSupersampleScale`, publishes the logical extent
(`target.width / supersample`, `target.height / supersample`) through `runtime.renderTargetViewport`,
and still gives the render-pass encoder the physical `target.width` and `target.height`. Logical 2D
coordinates therefore span the full physical supersample target.

After a clean `npm run build:functional` build, this exact sequential reproduction completed
successfully:

```sh
tsx packages/tool-capture/src/bin.ts validate --tool=functional --renderer=webgpu \
  --no-regression --no-parity --report --out=<sequential-output> --sequential
```

The validator's load-failure count subsumes render-verification failures, including a functional
scene's `assertRender` failure. Therefore the generated report's `loadFailures: 0` entails **0
`assertRender` failures**, not merely 0 page-load failures. That report (2026-08-21T09:01:59.217Z) also
recorded `aborted: false` and `shouldFail: false`. The 33 skips were out-of-scope renderers or entries
without a WebGPU fingerprint, not hard failures.

The evidence trail is **41 → 12 → 0**: the historical run below found 41 affected WebGPU 2D effect
cells configured with `sampleCount: 4`; the 2026-08-21 source census at the measured base found only 12
WebGPU scene files still configured that way; and the clean current-base sequential run measured 0
`assertRender` failures. The intermediate 12 is a configuration population, not an inferred failure
count. The historical diagnosis and its measured 25-cell hard-failure census are preserved below.

> **Historical record boundary:** everything from this point describes the original failure at
> `50e987798904ae1243b2318d7b2517d840dc3a68`, not the current failure population.

## Reproduction

The following two runs were made from `50e987798904ae1243b2318d7b2517d840dc3a68` after a clean
functional build:

```sh
tsx packages/tool-capture/src/bin.ts validate --tool=functional --renderer=webgpu \
  --no-regression --no-parity --report --out=<six-worker-output> --parallel=6
tsx packages/tool-capture/src/bin.ts validate --tool=functional --renderer=webgpu \
  --no-regression --no-parity --report --out=<sequential-output> --sequential
```

Both runs produced the same 25 failures, in the same entries and at the same positions. A normalized
projection of every check (`entry`, `renderers`, `kind`, `status`, `message`, `distance`, `contrast`)
had SHA-256
`6711372eb91751c62c1739254fac2f503c5accaf7b89c5c05fd6db6116e4e329` in both reports. The failures
span check positions 15 through 65 rather than accumulating at the end of the run.

Two boundary entries were then run alone, sequentially, with 30 capture frames:

```sh
tsx packages/tool-capture/src/bin.ts validate --tool=functional --renderer=webgpu \
  --no-regression --no-parity --report --filter-exact=effect-bloom --frames=30 --sequential
tsx packages/tool-capture/src/bin.ts validate --tool=functional --renderer=webgpu \
  --no-regression --no-parity --report --filter-exact=effect-vignette --frames=30 --sequential
```

Each failed as check 1 of 1 with the same measurement as the full runs: bloom's halo was `#05060a`,
and vignette's center luminance was 16.5. Therefore neither run position, six-worker contention, nor
additional SwiftShader warm-up frames changes the result. Warm-up is not a viable explanation or fix.

## Complete hard-failure census

The tool reports these `assertRender` failures in its load-failure count. Two rows (`effect-msaa` and
`effect-msaa-bloom`) are assertions for the former single-sample fallback and now fail because sampling
is active. The other 23 rows are content assertions broken by the supersampled 2D scene extent.

| Position | Cell | Observed failure mode |
| ---: | --- | --- |
| 15 | `effect-bloom` | Halo beside the yellow tile is `#05060a`; the colored glow is missing. |
| 17 | `effect-brightness-contrast` | Blue cell luminance is 109.4, expected greater than 115; brightness lift is absent. |
| 19 | `effect-chain` | Yellow core saturation is 1.000, expected at most 0.45; the expected pass-order result is absent. |
| 20 | `effect-channel-mixer` | First cell is `(120,255,128)`; red was expected at most 80 for the `(32,255,128)` channel mapping. |
| 21 | `effect-chromatic-aberration` | Least-fringed corner imbalance is 4.0, expected at least 25; radial fringing is absent. |
| 22 | `effect-color-grade` | Green-cell spread is 37, expected greater than 160; the saturation boost is absent. |
| 24 | `effect-crt` | Vertical high-frequency energy is 0.82, expected at least 2; scanlines are not visible. |
| 25 | `effect-directional-blur` | Smear ratio is 1.00 (7.0 versus 7.0), expected at least 2.2. |
| 32 | `effect-fxaa` | White-shape center luminance is 6.2, expected greater than 200; content is not preserved. |
| 34 | `effect-god-rays` | Ray axis is at y=0 instead of centerY 0.4 (y=240, tolerance 72). |
| 36 | `effect-grayscale` | Only two luminance levels remain, expected at least three (`154,39,39,39,39,39`). |
| 43 | `effect-lens-flare` | Top-left corner is 27.72, expected at least 60; ghost light is absent. |
| 45 | `effect-lift-gamma-gain` | Mean blue is 114.5, expected at least 120. |
| 48 | `effect-msaa` | 212 partial-coverage pixels, expected at most 40 by the obsolete no-op assertion; AA is active. |
| 49 | `effect-msaa-bloom` | Applied sample count is 4, expected 1 by the obsolete fallback assertion; AA is active. |
| 50 | `effect-outline` | Pure-black ink covers 0.591% of the frame, expected at least 1%; outlines are absent. |
| 53 | `effect-radial-blur` | No steep steps appear at centerY 0.4, expected at least 20. |
| 57 | `effect-sharpen` | High-frequency energy is 0.35, expected at least 0.85. |
| 58 | `effect-sketch` | Adjacent-pixel energy is 0.78, expected at least 1.2; stroke structure is absent. |
| 59 | `effect-smaa` | White-shape center luminance is 6.2, expected greater than 200; content is not preserved. |
| 60 | `effect-ssao` | White-shape center luminance is 6.2, expected greater than 150; content is not preserved. |
| 61 | `effect-ssr` | White-shape center luminance is 6.2, expected greater than 200; content is not preserved. |
| 62 | `effect-taa` | White-shape center luminance is 6.2, expected greater than 200; content is not preserved. |
| 64 | `effect-tone-map` | White-block luminance is 25.5, expected at least 150. |
| 65 | `effect-vignette` | Center luminance is 16.5; the full-frame fill did not render. |

## Correlation and visible signature

All 25 hard failures use a WebGPU effect pipeline with `sampleCount: 4`. Sixteen other 2D effect cells
using that same configuration still pass their content assertion, but every one has a materially changed
fingerprint in the controlled run:

| Cell | Fingerprint distance |
| --- | ---: |
| `effect-bokeh-dof` | 52.47 |
| `effect-camera-motion-blur` | 54.20 |
| `effect-dither` | 9.26 |
| `effect-exposure` | 42.68 |
| `effect-film-grain` | 39.51 |
| `effect-halftone` | 1.50 |
| `effect-hue-saturation` | 111.54 |
| `effect-kuwahara` | 11.75 |
| `effect-lens-distortion` | 39.39 |
| `effect-pixelate` | 10.44 |
| `effect-posterize` | 134.91 |
| `effect-scanlines` | 6.78 |
| `effect-screen-space-fog` | 26.94 |
| `effect-sepia` | 126.58 |
| `effect-tilt-shift` | 49.48 |
| `effect-white-balance` | 136.31 |

Thus all 41 WebGPU 2D effect cells configured with `sampleCount: 4` are affected: 25 fail their hard
oracle and the remaining 16 drift from their regression fingerprint. An isolated capture of
`effect-posterize` makes the geometric error unambiguous. Its declaration requires a gapless 3×2 grid
to fill 800×600, but the current frame places the entire grid in the upper-left 400×300 and leaves the
remaining three quarters black.

## Source-level cause

This is a mismatch between the physical supersample target and the logical 2D coordinate space:

1. `createWgpuRenderEffectPipeline` normalizes any requested sample count above one to four.
2. `resolveWgpuRenderTargetExtent` realizes four samples by multiplying both target dimensions by two.
   An 800×600 effect scene target is therefore physically 1600×1200.
3. `beginWgpuRenderPass` publishes that physical 1600×1200 size through
   `runtime.renderTargetViewport` while preserving the existing 2D render transform.
4. The 2D renderers form their clip projection from `runtime.renderTargetViewport`. For example,
   `shapeMeshMatrix` uses `2 / viewport.width` and `2 / viewport.height`, and
   `writeWgpuQuadUniforms` passes the same viewport to `setWgpuMatrixFromTransform`.
5. Functional effect scenes call `prepareScene2DRender` before opening the effect pipeline. Their
   logical 800×600 transforms are consequently projected against a 1600×1200 viewport with no matching
   2× transform. The scene occupies half the width and half the height before post-processing and
   presentation.

This also explains why the AA-off 3D mesh controls can agree while the 2D effect corpus fails: 3D uses
clip-space camera projection and does not derive object placement from this 2D pixel viewport. GL's
native multisample target retains its logical width and height, so it does not introduce the same
coordinate-space mismatch.

The blocker requires a real correction that keeps the logical 2D viewport/transform consistent with
the physical supersample texture. Excluding cells, accepting the fingerprints, or adding capture frames
would only conceal the regression.

# Structurally Unable Expected-Image Worklist

Status: measured CC-2 assignment sheet. This document contains no expected-image descriptions.

The census below traverses `discoverEntries('functional', root)` and every renderer cell, resolves each
cell's backing file through `functionalScene3DFile`, and parses that file's calls. It does not infer
cells from filenames or grep totals.

| measurement | cells |
| --- | ---: |
| discovered | 493 |
| already reachable through `createFunctionalTarget` | 250 |
| structurally unable | 243 |
| unable: effect | 117 |
| unable: material | 45 |
| unable: mesh | 24 |
| unable: other | 57 |

The 243 rows comprise 219 GL/WebGPU render-target or effect-pipeline cells, 18 Canvas
`beginCanvasRenderEffectPipeline` cells, and six direct-registration tail cells. The six are marked
`DIRECT` below because a constructor-family sweep can silently omit them; CC-2 must use this explicit
cell list as its population. The completion condition has **two** parts and the number alone is not one
of them: `npm run check:expected-image-descriptions` reporting 493/493 reachable and zero structurally
unable, **and** cross-verification sign-off by an agent other than the batch's author.

The number cannot stand alone because of what it measures. The gate asks only whether a cell carries
non-empty static text — it cannot ask whether that text describes the picture, since the referent is an
image. A confidently wrong description scores exactly as well as a right one, and a wrong description is
worse than a missing one: the missing one prompts somebody to write it, while the wrong one becomes the
reference a reviewer compares the render against. On 2026-08-18 a cross-verification pass disputed 18 of
41 cells in one landed batch while this number read as fully covered.

Cross-verification is a **precondition of landing a batch, not a follow-up to it** — the gate cannot hold
these, so the process has to. Two source-only readings disagreeing establishes a disagreement, not which
reading is right. Where the source decides it — a coordinate recomputed, a shader that multiplies
saturation by 0.4 under a description saying "boosted" — recomputation is the adjudication and the
correction is safe. Where only appearance decides it, it stays open.

Both writing and correcting a description are **source-only**. A description is an independent prediction
derived from the source, which is what lets it catch a renderer bug; write it — or fix it — by looking at
the render and agreement becomes true by construction, leaving a transcript that can never disagree with
anything.

**So if you ever put a description beside its render: a disagreement is never resolved by rewriting the
description to match the picture.** A disagreement means the description is wrong *or the renderer is*,
and the render alone cannot say which — the second case is the entire reason these descriptions exist.
Adjudicate by returning to the source. "Correcting" a description against a capture silently converts a
renderer-bug detector into a renderer-bug concealer, and nothing downstream can detect that it happened.

## Derived values carry their symbolic form, including the dimension

Write `y = 0.4*H + sin(a)*0.28*H = 408`, not `y = 408`. Every derived number keeps the expression it came
from, and every factor keeps the dimension it was taken from — `H` where the source uses height, `W` where
it uses width.

This is not a formatting preference and must not be simplified back to the bare number. On 2026-08-18 a
verifier reviewing cold, with no access to the original author's reasoning, made the *same* wrong-dimension
error as the authors on the same scene: a width-based radius applied to the y axis. Two people failing
independently in one direction is a property of the task, not of either of them — the dimension is the
thing this work is easiest to get wrong, and swapping in a fresh reader does not fix it.

The symbolic form is what changes the cost of catching it. `y = 408` can only be checked by redoing the
derivation, which is the very step that goes wrong; `0.28*W` sitting in text where the source says `H` is
visible by comparison. Make the wrong thing visibly wrong rather than requiring the reader to recompute
it — the same reason the completion condition above names a checkable property instead of a commit hash.

Check the command can still fail before quoting its output as done: `package.json` must pass `--check`,
which is what reaches the only `process.exitCode = 1` in the script. An earlier revision of this line
named the same command while `--check` was absent, so the finish condition was unfalsifiable — the
command reported success whatever state the descriptions were in. That is verifiable in one step and
does not depend on a commit hash, which a rebase rewrites.

The bounded-candidate audit found none. Every row resolves to a unique backend-specific backing file,
so the shared-file/per-backend constraint documented in
[bounded expected-image descriptions](functional-bounded-descriptions.md) does not apply. No source in
this population records a genuinely undecided correct picture like `swf-alpha-transform`. `none`
means no candidate was found in this audit; a CC-2 writer must still stop and report newly discovered
evidence of an undecided design rather than weaken a precise description.

| cell | file | constructor / registration seam | family | bounded candidate |
| --- | --- | --- | --- | --- |
| `application-render-view/webgl` | `functional/scenes/application-render-view.webgl.ts` | `DIRECT — createGlApplicationRenderView` | other | none |
| `camera-orthographic/webgl` | `functional/scenes/camera-orthographic.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `camera-orthographic/webgpu` | `functional/scenes/camera-orthographic.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `compressed-texture/webgpu` | `functional/scenes/compressed-texture.webgpu.ts` | `DIRECT — registerWgpuFunctionalTarget` | other | none |
| `effect-blend-advanced/webgl` | `functional/scenes/effect-blend-advanced.webgl.ts` | `createGlRenderTarget + beginGlRenderEffectPipeline` | effect | none |
| `effect-blend-advanced/webgpu` | `functional/scenes/effect-blend-advanced.webgpu.ts` | `createWgpuRenderTarget + beginWgpuRenderEffectPipeline` | effect | none |
| `effect-bloom/canvas` | `functional/scenes/effect-bloom.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-bloom/webgl` | `functional/scenes/effect-bloom.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-bloom/webgpu` | `functional/scenes/effect-bloom.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-bokeh-dof/webgl` | `functional/scenes/effect-bokeh-dof.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-bokeh-dof/webgpu` | `functional/scenes/effect-bokeh-dof.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-brightness-contrast/canvas` | `functional/scenes/effect-brightness-contrast.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-brightness-contrast/webgl` | `functional/scenes/effect-brightness-contrast.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-brightness-contrast/webgpu` | `functional/scenes/effect-brightness-contrast.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-camera-motion-blur/webgl` | `functional/scenes/effect-camera-motion-blur.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-camera-motion-blur/webgpu` | `functional/scenes/effect-camera-motion-blur.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-chain/canvas` | `functional/scenes/effect-chain.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-chain/webgl` | `functional/scenes/effect-chain.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-chain/webgpu` | `functional/scenes/effect-chain.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-channel-mixer/webgl` | `functional/scenes/effect-channel-mixer.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-channel-mixer/webgpu` | `functional/scenes/effect-channel-mixer.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-chromatic-aberration/webgl` | `functional/scenes/effect-chromatic-aberration.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-chromatic-aberration/webgpu` | `functional/scenes/effect-chromatic-aberration.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-color-grade/canvas` | `functional/scenes/effect-color-grade.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-color-grade/webgl` | `functional/scenes/effect-color-grade.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-color-grade/webgpu` | `functional/scenes/effect-color-grade.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-composite/webgpu` | `functional/scenes/effect-composite.webgpu.ts` | `createWgpuRenderTarget + beginWgpuRenderEffectPipeline` | effect | none |
| `effect-crt/webgl` | `functional/scenes/effect-crt.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-crt/webgpu` | `functional/scenes/effect-crt.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-directional-blur/webgl` | `functional/scenes/effect-directional-blur.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-directional-blur/webgpu` | `functional/scenes/effect-directional-blur.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-displacement/webgl` | `functional/scenes/effect-displacement.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-displacement/webgpu` | `functional/scenes/effect-displacement.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-dither/webgl` | `functional/scenes/effect-dither.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-dither/webgpu` | `functional/scenes/effect-dither.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-empty-passthrough/canvas` | `functional/scenes/effect-empty-passthrough.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-empty-passthrough/webgl` | `functional/scenes/effect-empty-passthrough.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-empty-passthrough/webgpu` | `functional/scenes/effect-empty-passthrough.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-exposure/webgl` | `functional/scenes/effect-exposure.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-exposure/webgpu` | `functional/scenes/effect-exposure.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-film-grain/canvas` | `functional/scenes/effect-film-grain.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-film-grain/webgl` | `functional/scenes/effect-film-grain.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-film-grain/webgpu` | `functional/scenes/effect-film-grain.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-fxaa/webgl` | `functional/scenes/effect-fxaa.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-fxaa/webgpu` | `functional/scenes/effect-fxaa.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-glitch/webgl` | `functional/scenes/effect-glitch.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-glitch/webgpu` | `functional/scenes/effect-glitch.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-god-rays/webgl` | `functional/scenes/effect-god-rays.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-god-rays/webgpu` | `functional/scenes/effect-god-rays.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-grayscale/canvas` | `functional/scenes/effect-grayscale.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-grayscale/webgl` | `functional/scenes/effect-grayscale.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-grayscale/webgpu` | `functional/scenes/effect-grayscale.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-halftone/webgl` | `functional/scenes/effect-halftone.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-halftone/webgpu` | `functional/scenes/effect-halftone.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-hue-saturation/canvas` | `functional/scenes/effect-hue-saturation.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-hue-saturation/webgl` | `functional/scenes/effect-hue-saturation.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-hue-saturation/webgpu` | `functional/scenes/effect-hue-saturation.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-invert/canvas` | `functional/scenes/effect-invert.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-invert/webgl` | `functional/scenes/effect-invert.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-invert/webgpu` | `functional/scenes/effect-invert.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-kuwahara/webgl` | `functional/scenes/effect-kuwahara.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-kuwahara/webgpu` | `functional/scenes/effect-kuwahara.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-lens-distortion/canvas` | `functional/scenes/effect-lens-distortion.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-lens-distortion/webgl` | `functional/scenes/effect-lens-distortion.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-lens-distortion/webgpu` | `functional/scenes/effect-lens-distortion.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-lens-flare/canvas` | `functional/scenes/effect-lens-flare.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-lens-flare/webgl` | `functional/scenes/effect-lens-flare.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-lens-flare/webgpu` | `functional/scenes/effect-lens-flare.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-lensdirt/webgl` | `functional/scenes/effect-lensdirt.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-lensdirt/webgpu` | `functional/scenes/effect-lensdirt.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-lift-gamma-gain/webgl` | `functional/scenes/effect-lift-gamma-gain.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-lift-gamma-gain/webgpu` | `functional/scenes/effect-lift-gamma-gain.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-lut-grade/webgl` | `functional/scenes/effect-lut-grade.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-lut-grade/webgpu` | `functional/scenes/effect-lut-grade.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-motion-blur/webgl` | `functional/scenes/effect-motion-blur.webgl.ts` | `createGlVelocityTarget + beginGlRenderEffectPipeline` | effect | none |
| `effect-motion-blur/webgpu` | `functional/scenes/effect-motion-blur.webgpu.ts` | `createWgpuVelocityTarget + beginWgpuRenderEffectPipeline` | effect | none |
| `effect-msaa-bloom/canvas` | `functional/scenes/effect-msaa-bloom.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-msaa-bloom/webgl` | `functional/scenes/effect-msaa-bloom.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-msaa-bloom/webgpu` | `functional/scenes/effect-msaa-bloom.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-msaa/webgl` | `functional/scenes/effect-msaa.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-msaa/webgpu` | `functional/scenes/effect-msaa.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-outline/webgl` | `functional/scenes/effect-outline.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-outline/webgpu` | `functional/scenes/effect-outline.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-pixelate/canvas` | `functional/scenes/effect-pixelate.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-pixelate/webgl` | `functional/scenes/effect-pixelate.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-pixelate/webgpu` | `functional/scenes/effect-pixelate.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-posterize/canvas` | `functional/scenes/effect-posterize.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-posterize/webgl` | `functional/scenes/effect-posterize.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-posterize/webgpu` | `functional/scenes/effect-posterize.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-radial-blur/webgl` | `functional/scenes/effect-radial-blur.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-radial-blur/webgpu` | `functional/scenes/effect-radial-blur.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-scanlines/canvas` | `functional/scenes/effect-scanlines.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-scanlines/webgl` | `functional/scenes/effect-scanlines.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-scanlines/webgpu` | `functional/scenes/effect-scanlines.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-screen-space-fog/webgl` | `functional/scenes/effect-screen-space-fog.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-screen-space-fog/webgpu` | `functional/scenes/effect-screen-space-fog.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-sepia/canvas` | `functional/scenes/effect-sepia.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-sepia/webgl` | `functional/scenes/effect-sepia.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-sepia/webgpu` | `functional/scenes/effect-sepia.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-sharpen/webgl` | `functional/scenes/effect-sharpen.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-sharpen/webgpu` | `functional/scenes/effect-sharpen.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-sketch/webgl` | `functional/scenes/effect-sketch.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-sketch/webgpu` | `functional/scenes/effect-sketch.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-smaa/webgl` | `functional/scenes/effect-smaa.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-smaa/webgpu` | `functional/scenes/effect-smaa.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-ssao/webgl` | `functional/scenes/effect-ssao.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-ssao/webgpu` | `functional/scenes/effect-ssao.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-ssr/webgl` | `functional/scenes/effect-ssr.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-ssr/webgpu` | `functional/scenes/effect-ssr.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-taa/webgl` | `functional/scenes/effect-taa.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-taa/webgpu` | `functional/scenes/effect-taa.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-tilt-shift/canvas` | `functional/scenes/effect-tilt-shift.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-tilt-shift/webgl` | `functional/scenes/effect-tilt-shift.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-tilt-shift/webgpu` | `functional/scenes/effect-tilt-shift.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-tone-map/webgl` | `functional/scenes/effect-tone-map.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-tone-map/webgpu` | `functional/scenes/effect-tone-map.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-vignette/canvas` | `functional/scenes/effect-vignette.canvas.ts` | `beginCanvasRenderEffectPipeline` | effect | none |
| `effect-vignette/webgl` | `functional/scenes/effect-vignette.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-vignette/webgpu` | `functional/scenes/effect-vignette.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `effect-white-balance/webgl` | `functional/scenes/effect-white-balance.webgl.ts` | `beginGlRenderEffectPipeline` | effect | none |
| `effect-white-balance/webgpu` | `functional/scenes/effect-white-balance.webgpu.ts` | `beginWgpuRenderEffectPipeline` | effect | none |
| `env-ibl/webgl` | `functional/scenes/env-ibl.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `env-ibl/webgpu` | `functional/scenes/env-ibl.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `env-skybox/webgl` | `functional/scenes/env-skybox.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `env-skybox/webgpu` | `functional/scenes/env-skybox.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `light-hemisphere/webgl` | `functional/scenes/light-hemisphere.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `light-hemisphere/webgpu` | `functional/scenes/light-hemisphere.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `light-many-point/webgl` | `functional/scenes/light-many-point.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `light-many-point/webgpu` | `functional/scenes/light-many-point.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `light-point/webgl` | `functional/scenes/light-point.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `light-point/webgpu` | `functional/scenes/light-point.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `light-spot/webgl` | `functional/scenes/light-spot.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `light-spot/webgpu` | `functional/scenes/light-spot.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `material-alpha-map-pbr/webgl` | `functional/scenes/material-alpha-map-pbr.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-alpha-map-pbr/webgpu` | `functional/scenes/material-alpha-map-pbr.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-alpha-map/webgl` | `functional/scenes/material-alpha-map.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-alpha-map/webgpu` | `functional/scenes/material-alpha-map.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-anisotropy/webgl` | `functional/scenes/material-anisotropy.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-blend-modes/webgl` | `functional/scenes/material-blend-modes.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-blend-modes/webgpu` | `functional/scenes/material-blend-modes.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-blinn-phong/webgl` | `functional/scenes/material-blinn-phong.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-blinn-phong/webgpu` | `functional/scenes/material-blinn-phong.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-clearcoat/webgl` | `functional/scenes/material-clearcoat.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-custom-shader/webgl` | `functional/scenes/material-custom-shader.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-custom-shader/webgpu` | `functional/scenes/material-custom-shader.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-depth-orthographic/webgl` | `functional/scenes/material-depth-orthographic.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-depth/webgl` | `functional/scenes/material-depth.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-depth/webgpu` | `functional/scenes/material-depth.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-emissive/webgl` | `functional/scenes/material-emissive.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-emissive/webgpu` | `functional/scenes/material-emissive.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-iridescence/webgl` | `functional/scenes/material-iridescence.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-lambert/webgl` | `functional/scenes/material-lambert.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-lambert/webgpu` | `functional/scenes/material-lambert.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-matcap/webgl` | `functional/scenes/material-matcap.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-matcap/webgpu` | `functional/scenes/material-matcap.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-normal/webgl` | `functional/scenes/material-normal.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-normal/webgpu` | `functional/scenes/material-normal.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-phong/webgl` | `functional/scenes/material-phong.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-phong/webgpu` | `functional/scenes/material-phong.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-sheen/webgl` | `functional/scenes/material-sheen.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-specular-glossiness/webgl` | `functional/scenes/material-specular-glossiness.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-specular-glossiness/webgpu` | `functional/scenes/material-specular-glossiness.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-specular/webgl` | `functional/scenes/material-specular.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-standard-pbr/webgl` | `functional/scenes/material-standard-pbr.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-standard-pbr/webgpu` | `functional/scenes/material-standard-pbr.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-subsurface/webgl` | `functional/scenes/material-subsurface.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-toon/webgl` | `functional/scenes/material-toon.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-toon/webgpu` | `functional/scenes/material-toon.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-transmission-volume/webgl` | `functional/scenes/material-transmission-volume.webgl.ts` | `createGlRenderTarget + beginGlRenderEffectPipeline` | material | none |
| `material-unlit/webgl` | `functional/scenes/material-unlit.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-unlit/webgpu` | `functional/scenes/material-unlit.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-vertex-color-interpolated/webgl` | `functional/scenes/material-vertex-color-interpolated.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-vertex-color/webgl` | `functional/scenes/material-vertex-color.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-vertex-color/webgpu` | `functional/scenes/material-vertex-color.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `material-video-map/webgl` | `functional/scenes/material-video-map.webgl.ts` | `DIRECT — createGlRenderState` | material | none |
| `material-video-map/webgpu` | `functional/scenes/material-video-map.webgpu.ts` | `DIRECT — registerWgpuFunctionalTarget` | material | none |
| `material-wireframe/webgl` | `functional/scenes/material-wireframe.webgl.ts` | `beginGlRenderEffectPipeline` | material | none |
| `material-wireframe/webgpu` | `functional/scenes/material-wireframe.webgpu.ts` | `beginWgpuRenderEffectPipeline` | material | none |
| `mesh-cone/webgl` | `functional/scenes/mesh-cone.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-cone/webgpu` | `functional/scenes/mesh-cone.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-cylinder/webgl` | `functional/scenes/mesh-cylinder.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-cylinder/webgpu` | `functional/scenes/mesh-cylinder.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-geometry/webgl` | `functional/scenes/mesh-geometry.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-geometry/webgpu` | `functional/scenes/mesh-geometry.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-hierarchy-parent-transform/webgl` | `functional/scenes/mesh-hierarchy-parent-transform.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-hierarchy-parent-transform/webgpu` | `functional/scenes/mesh-hierarchy-parent-transform.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-mirrored-facing/webgl` | `functional/scenes/mesh-mirrored-facing.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-multiple-depth/webgl` | `functional/scenes/mesh-multiple-depth.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-multiple-depth/webgpu` | `functional/scenes/mesh-multiple-depth.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-normal-position-groups/webgl` | `functional/scenes/mesh-normal-position-groups.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-normal-position-groups/webgpu` | `functional/scenes/mesh-normal-position-groups.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-plane/webgl` | `functional/scenes/mesh-plane.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-plane/webgpu` | `functional/scenes/mesh-plane.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-tangent-mirror-handedness/webgl` | `functional/scenes/mesh-tangent-mirror-handedness.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-tangent-mirrored-uv/webgl` | `functional/scenes/mesh-tangent-mirrored-uv.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-tangent-mirrored-uv/webgpu` | `functional/scenes/mesh-tangent-mirrored-uv.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-transform-position/webgl` | `functional/scenes/mesh-transform-position.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-transform-position/webgpu` | `functional/scenes/mesh-transform-position.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-transform-rotation/webgl` | `functional/scenes/mesh-transform-rotation.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-transform-rotation/webgpu` | `functional/scenes/mesh-transform-rotation.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `mesh-transform-scale/webgl` | `functional/scenes/mesh-transform-scale.webgl.ts` | `beginGlRenderEffectPipeline` | mesh | none |
| `mesh-transform-scale/webgpu` | `functional/scenes/mesh-transform-scale.webgpu.ts` | `beginWgpuRenderEffectPipeline` | mesh | none |
| `particle-emitter-3d/webgl` | `functional/scenes/particle-emitter-3d.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `particle-emitter-3d/webgpu` | `functional/scenes/particle-emitter-3d.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `particle-motion-blur/webgl` | `functional/scenes/particle-motion-blur.webgl.ts` | `createGlVelocityTarget + beginGlRenderEffectPipeline` | other | none |
| `particle-motion-blur/webgpu` | `functional/scenes/particle-motion-blur.webgpu.ts` | `createWgpuVelocityTarget + beginWgpuRenderEffectPipeline` | other | none |
| `render-pass-shared-context/webgl` | `functional/scenes/render-pass-shared-context.webgl.ts` | `createGlRenderTarget` | other | none |
| `render-pass-viewport/webgl` | `functional/scenes/render-pass-viewport.webgl.ts` | `createGlRenderTarget` | other | none |
| `render-target-axes/webgl` | `functional/scenes/render-target-axes.webgl.ts` | `DIRECT — createGlRenderState + acquireGlRenderTarget` | other | none |
| `render-target-format-policy/webgl` | `functional/scenes/render-target-format-policy.webgl.ts` | `createGlRenderTarget` | other | none |
| `render-texture/webgl` | `functional/scenes/render-texture.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-morph/webgl` | `functional/scenes/scene-morph.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-morph/webgpu` | `functional/scenes/scene-morph.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene-skin-material-families/webgl` | `functional/scenes/scene-skin-material-families.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-skin-morph-compose/webgl` | `functional/scenes/scene-skin-morph-compose.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-skin-morph-compose/webgpu` | `functional/scenes/scene-skin-morph-compose.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene-skin-nonuniform-normals/webgl` | `functional/scenes/scene-skin-nonuniform-normals.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-skin-nonuniform-normals/webgpu` | `functional/scenes/scene-skin-nonuniform-normals.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene-skin-two-skeletons/webgl` | `functional/scenes/scene-skin-two-skeletons.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-skin-two-skeletons/webgpu` | `functional/scenes/scene-skin-two-skeletons.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene-skinning/webgl` | `functional/scenes/scene-skinning.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-skinning/webgpu` | `functional/scenes/scene-skinning.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene-transparent-depth-write/webgl` | `functional/scenes/scene-transparent-depth-write.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-transparent-orthographic/webgl` | `functional/scenes/scene-transparent-orthographic.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene-transparent/webgpu` | `functional/scenes/scene-transparent.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `scene2d-clip-contour-hdr/webgl` | `functional/scenes/scene2d-clip-contour-hdr.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `scene2d-clip-contour-hdr/webgpu` | `functional/scenes/scene2d-clip-contour-hdr.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shading-globe/webgl` | `functional/scenes/shading-globe.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shading-globe/webgpu` | `functional/scenes/shading-globe.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shading-normal-map/webgpu` | `functional/scenes/shading-normal-map.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-classic/webgl` | `functional/scenes/shadow-classic.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-classic/webgpu` | `functional/scenes/shadow-classic.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-directional/webgl` | `functional/scenes/shadow-directional.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-directional/webgpu` | `functional/scenes/shadow-directional.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-sampling-controls/webgl` | `functional/scenes/shadow-sampling-controls.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-sampling-controls/webgpu` | `functional/scenes/shadow-sampling-controls.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-scene-scale/webgl` | `functional/scenes/shadow-scene-scale.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-scene-scale/webgpu` | `functional/scenes/shadow-scene-scale.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-skin-nonuniform/webgl` | `functional/scenes/shadow-skin-nonuniform.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-skin-nonuniform/webgpu` | `functional/scenes/shadow-skin-nonuniform.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `shadow-skinning/webgl` | `functional/scenes/shadow-skinning.webgl.ts` | `beginGlRenderEffectPipeline` | other | none |
| `shadow-skinning/webgpu` | `functional/scenes/shadow-skinning.webgpu.ts` | `beginWgpuRenderEffectPipeline` | other | none |
| `text-native/dom` | `functional/scenes/text-native.dom.ts` | `DIRECT — registerFunctionalTarget` | other | none |

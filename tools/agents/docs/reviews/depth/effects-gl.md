# Depth Review: @flighthq/effects-gl

**Domain**: WebGL 2 backend for screen-space post-process effects — the GPU runner layer that turns the data-descriptor effects in `@flighthq/effects` into multi-pass fullscreen shader recipes, plus the post-process pipeline that drives them (MSAA-aware scene target, ping-pong pool, per-state effect registry, program cache, G-buffer seam).

**Verdict**: solid — 82/100

This is the concrete `-gl` implementation half of the effects domain (the abstract descriptors and shared math live in `@flighthq/effects`; the descriptor catalog is reviewed there). Judged as a GL post-process backend, it is broad, well-structured, and largely faithful to industry recipes; it falls short of "authoritative" only where the 2D color-only substrate fundamentally cannot supply the G-buffer data that screen-space 3D effects require — and it documents those limits honestly rather than pretending.

## Present capabilities

- **1:1 backend coverage of the descriptor catalog.** Every one of the 44 effect descriptors in `@flighthq/effects` has a matching `apply<Name>EffectToGl` recipe and a `defaultGl<Name>EffectRunner` here. No descriptor is left without a GL runner. Categories covered:
  - **Color / grade**: brightness-contrast, hue-saturation, channel-mixer, color-grade, lift-gamma-gain, white-balance, exposure, tone-map, lookup-table (3D LUT) grade, posterize, dither, grayscale, sepia, invert.
  - **Blur family**: directional, radial, motion (velocity-driven), camera-motion-blur, tilt-shift, bokeh depth-of-field.
  - **Sharpen / stylize**: sharpen, kuwahara, sketch, outline, halftone, pixelate, scanlines, CRT, film-grain, glitch.
  - **Light / atmosphere**: bloom, god-rays, lens-flare, lens-dirt, lens-distortion, chromatic-aberration, vignette, displacement, screen-space-fog.
  - **Anti-aliasing**: FXAA, SMAA, TAA.
  - **Screen-space 3D**: SSAO, SSR.
- **Real multi-pass recipes, not single-shader stubs.** Bloom is the reference recipe: bright-pass → reuse the Tier-1 `applyGaussianBlurFilterToGl` on the bright branch → additive composite, acquiring/releasing intermediate targets from the pool. This correctly reuses the filter Gaussian rather than inlining a fixed kernel (the exact issue called out and fixed per the conformance doc).
- **A complete pipeline, not just loose shaders.** `glRenderEffectPipeline.ts` implements an opt-in post-process pass: `begin` renders the scene into an (optionally MSAA/HDR/depth) target, `end` resolves MSAA, walks the per-frame effect list through the registry ping-ponging two pooled scratch targets, then blits to the canvas via a cached present program. Allocation is explicit (`acquire`/`release` brackets), and the default render loop imports none of it.
- **G-buffer seam done correctly.** The pipeline threads `sceneDepthTexture` and `sceneVelocityTexture` (settable via `setGlRenderEffectVelocityTexture`) to runners, always sourced from the original scene target rather than the ping-ponged source. Velocity-driven motion blur and depth-driven DoF / screen-space-fog take the real path when the buffer is present and fall back to a sentinel copy when null — the right shape for a 2D SDK that may or may not produce a G-buffer.
- **Tree-shakable registry pattern.** `registerGlRenderEffect(state, kind, runner)` / `getGlRenderEffectRunner` is a per-`GlRenderState` `WeakMap` registry — no monolithic switch, runners register only when imported, and a runner can be swapped under the same key. `getGlEffectProgram` caches compiled programs per state keyed by a stable string, so each shader compiles once.
- **Test colocation.** Each effect file has a colocated `.test.ts`.

## Gaps vs an authoritative WebGL post-process library

- **True screen-space 3D effects are luminance stand-ins, by substrate constraint.** SSAO darkens by local luminance variation rather than reconstructing view-space position/normals from depth and accumulating occlusion over a kernel; SSR is a documented passthrough copy (no depth/normals); TAA is an explicit no-op placeholder (no history buffer / reprojection). These are honestly commented as stand-ins. For a 2D color context this is the correct call, but it means the AA and screen-space-reflection slots are not what those names promise in a 3D engine. **Missing-by-substrate**, not pure omission — but a consumer reading "SSAO" / "SSR" / "TAA" should not expect 3D-grade results.
- **No batch registration helper.** There is no `registerAllGlRenderEffects(state)` / `registerDefaultGlRenderEffects(state)` convenience that wires every `default*Runner` into a state. Each runner must be imported and registered individually. That is consistent with the tree-shaking philosophy (and arguably correct), but an authoritative library usually offers an opt-in "register the standard set" entry for the all-effects case.
- **Bloom is single-scale, not a mip pyramid.** Bloom blurs one bright branch at a fixed radius rather than the multi-resolution downsample/upsample pyramid (Call-of-Duty / Unreal style) that production bloom uses for wide, stable glows. Adequate, not best-in-class.
- **No exposed effect-chain ordering / dependency metadata.** The pipeline runs the effect list in array order; there is no notion of which effects want HDR-linear input, which must run pre/post tone-map, or auto-insertion of tone-mapping before display. Ordering is entirely the caller's responsibility.
- **Anti-aliasing depth is thin.** FXAA and SMAA appear present as real edge recipes, but TAA being a no-op leaves the temporal AA slot unfilled; there is no MLAA or CMAA alternative.

## Naming / API-shape notes

- Naming is clean and self-identifying: `apply<Effect>EffectToGl(state, source, dest, [pool|depthTexture|velocityTexture], effect)` and `defaultGl<Effect>EffectRunner`. The `ToGl` suffix and full effect type word in every function name match the codebase rule. Filenames are backend-prefix-first (`glBloomEffect.ts`), per the project's filename philosophy.
- Allocation boundaries are explicit and correct: recipes `acquire`/`release` from the pool in matched brackets; the pipeline owns the scene target and pool lifecycle with `create`/`destroy`.
- `Readonly<>` is applied consistently to `source`/`dest`/`effect` parameters.
- The runner indirection is slightly redundant — every file exports both `apply*ToGl` (direct) and a `default*Runner` thunk that just casts and calls it. This is deliberate (direct call for known effects, registry runner for data-driven dispatch) and matches the renderer-registration pattern one tier up, so it reads as intentional rather than accidental duplication.
- `package.json` declares a dependency on `@flighthq/filters` that is not value-imported (only `filters-gl` is used in source); the conformance doc already flags this as a declared-but-unused edge. Minor manifest hygiene.

## Recommendation

Keep the verdict at **solid**. As a GL backend for the effects descriptor catalog it is genuinely complete (44/44), well-structured, and honest about its limits. To push toward authoritative:

1. Add a `registerDefaultGlRenderEffects(state)` opt-in batch registrar (and document that individual registration remains the tree-shaking path) so the all-effects case has a canonical entry.
2. Upgrade bloom to a mip-pyramid (downsample chain + additive upsample) for production-grade wide glows.
3. Either implement real TAA (history target + velocity reprojection — the velocity seam already exists) or rename/relocate the TAA/SSR/SSAO slots so their names do not over-promise in the 2D context; if they stay, keep the stand-in comments as-is.
4. Drop the unused `@flighthq/filters` manifest dependency.
5. Consider lightweight per-effect metadata (wants-HDR, runs-pre/post-tonemap) so the pipeline can validate or auto-order chains rather than trusting array order blindly.

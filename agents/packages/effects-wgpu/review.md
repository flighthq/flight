---
package: '@flighthq/effects-wgpu'
status: solid
score: 72
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# effects-wgpu — Review

## Verdict

`solid — 72/100`. A mature, well-structured WebGPU backend for the substrate-agnostic post-process pipeline: a per-state registry, a ping-pong pipeline orchestrator with adjustment fusion, a compiled-pipeline cache, a guard module, a RenderTexture-to-RenderTexture bridge, and 45 per-kind runner/registrar pairs. The infrastructure is the strongest part of the package and satisfies every codebase-map convention cleanly. The score is held back by three things: two of the 45 runners are acknowledged stand-ins under real names (SSAO is luminance-variation, SMAA is a single-pass blur), the depth G-buffer is fed `null` (cross-package blocker degrading every depth-sensitive recipe), and the per-effect test floor is almost entirely smoke tests with no uniform-packing or orchestration assertions.

## Present capabilities

All claims grounded in `packages/effects-wgpu/src/`.

**Core infrastructure.**

- `wgpuRenderEffectRegistry.ts` — per-`WgpuRenderState` registry via `@flighthq/registry`: `registerWgpuRenderEffect`, `getWgpuRenderEffectRunner` (sentinel `null`), `hasWgpuRenderEffectRunner`, `isWgpuRenderEffectResolvable`. Registry dispatch, no monolithic `switch`, last-write-wins, unused recipes tree-shake. The `isResolvable` seam allows per-instance resolution gating (used by `BitmapDisplacementEffect`).

- `wgpuRenderEffectPipeline.ts` — `create/begin/end/destroyWgpuRenderEffectPipeline` plus `setWgpuRenderEffectVelocityTexture`. `end*` walks the per-frame `ReadonlyArray<RenderEffect | Adjustment>` across two pooled scratch targets, fuses consecutive pointwise adjustments (matrix-tier into one `applyColorMatrixPassToWgpu`, LUT-tier into one `applyColorLutPassToWgpu`), skips unregistered kinds through the diagnostics seam, and presents the final result via a `replace`-blend fullscreen pass with an sRGB or linear-to-sRGB conversion. Allocation is explicit and pooled (`acquire*`/`release*` bracketed correctly). `destroy*` frees GPU targets, pool, and LUT cache. Two diagnostics seams: `setWgpuRenderEffectPipelineSkipGuard` (unregistered kind) and `setWgpuRenderEffectPipelineSampleCountGuard` (sample-count substitution).

- `wgpuEffectProgramCache.ts` — `getWgpuEffectPipeline(state, key, wgsl, blend)`, a per-state `WeakMap<state, Map<key, pipeline>>` that compiles and caches WGSL pipelines.

- `wgpuEffectPass.ts` — the low-level draw primitive: shared fullscreen-quad vertex shader (`EFFECT_VERTEX_WGSL`), a 512-slot ring buffer for per-pass uniforms, texture bind-group cache keyed by `GPUTextureView`, and three blend modes (premultiplied, replace, erase). `drawWgpuEffectPass` (single source) and `drawWgpuDualSourceEffectPass` (two sources for blend/composite). `createWgpuEffectPipeline`/`createWgpuDualSourceEffectPipeline` compile pipelines with per-format variants for HDR targets. `getWgpuEffectPassState` exposes the infrastructure to effects needing custom bind groups.

- `wgpuEffectTexelScale.ts` — `getWgpuEffectLogicalResolution` and `getWgpuRenderTargetTexelScale`, used to keep descriptor distances in logical pixels across supersampled scratch targets. The logical/physical distinction is well-tested: 11 effects use logical resolution, FXAA and SMAA correctly use physical resolution.

- `wgpuColorMatrixPass.ts` — generic pointwise 4x5 color-matrix pass for fused adjustment runs.

- `wgpuColorLutPass.ts` — 3D LUT color-grading pass for LUT-tier adjustment fusion.

- `wgpuRenderTextureEffect.ts` — `applyWgpuRenderEffectsToRenderTexture`, the explicit RenderTexture-to-RenderTexture bridge for per-node capture lanes. Caller-owned source/destination/scratch leases, deterministic final-destination parity, rich `WgpuRenderEffectApplicationExplanation` status reporting. Separate `explainWgpuRenderEffectApplication` query for pre-flight diagnostics. Guard seam via `setWgpuRenderEffectApplicationGuard`.

- Shared WGSL utilities: `wgpuEffectBlitShader.ts` (copy pass), `wgpuEffectBoxBlur.ts` (separable box blur), `wgpuEffectGradientRamp.ts` (gradient ramp texture), `wgpuEffectTintShader.ts` (tint overlay).

**Guard module.**

- `enableWgpuRenderEffectGuards.ts` — `enableWgpuRenderEffectGuards`/`disableWgpuRenderEffectGuards`/`areWgpuRenderEffectGuardsEnabled`. Installs `@flighthq/log`-based `logOnce` reporters for: unregistered effect kind skipped in the pipeline, sample-count substitution, and the full `WgpuRenderEffectApplicationExplanation` covering partial-registration, source-unavailable, partial-resolution, stale-destination, and unresolved-effects. The diagnostics follow the inversion rule: core stays message-free, the guard module is separately importable.

**Effect library — 45 runners**, each `apply<Name>EffectToWgpu` + `defaultWgpu<Name>EffectRunner` + `registerWgpu<Name>Effect`:

Bevel, BitmapDisplacement, Blend, Bloom, Blur, CameraMotionBlur, ChromaticAberration, Composite, ContactShadows, Convolution, Crt, DirectionalBlur, Displacement, Dither, DropShadow, FilmGrain, Fxaa, Glitch, GodRays, GradientBevel, GradientGlow, Halftone, InnerGlow, InnerShadow, Kuwahara, LensDirt, LensDistortion, LensFlare, Median, MotionBlur, OuterGlow, Outline, Pixelate, Posterize, RadialBlur, Scanlines, ScreenSpaceFog, Sharpen, Sketch, Smaa, Ssao, TiltShift, ToneMap, Vignette, WhiteBalance.

Registration is per-kind; there are no batch/band registrars.

**Notable multi-pass recipes:**

- `wgpuBloomEffect.ts` — bright-pass (luminance threshold) into Gaussian blur (via `applyGaussianBlurToWgpu`) into additive composite via a dual-source pipeline. Three pooled scratch targets, all released. Uses the shared `computeBloomThreshold`/`computeBloomIntensity`/`computeBloomBlurRadius` from `@flighthq/effects`.

- `wgpuBlendEffect.ts` — W3C straight-color advanced blend over a registered backdrop. 13 blend modes (Overlay through Lighten), HSL modes (Hue, Saturation, Color, Luminosity). Dual-source pipeline. The backdrop registry is shared with `wgpuCompositeEffect.ts`.

- `wgpuCompositeEffect.ts` — all 11 Porter-Duff coverage operators via the same backdrop registry.

- `wgpuBevelEffect.ts` — multi-pass spatial effect: blur, tint, angle-based highlight/shadow, composite.

**Sibling parity.** WGPU has 45 runners; GL has 47. The two GL-only effects are `BokehDepthOfField` (depth-dependent, deliberately deleted from WGPU) and `CustomShader` (a user-supplied shader seam, an open direction in the charter). Every other kind key matches one-for-one. HDR target-format selection (`'rgba16f'` to `'rgba16float'`) is present on WGPU and absent from GL, so WGPU slightly leads on target format.

## Gaps

1. **SSAO is a luminance-variation stand-in.** `wgpuSsaoEffect.ts:7-11` documents this explicitly: it darkens by local luminance variation instead of depth-derived occlusion. The blocker is upstream: `getWgpuRenderTargetDepthTexture` does not exist in `render-wgpu`, so no depth data reaches any effect. The SSAO runner accepts `radius`/`intensity` from the descriptor but ignores `samples` and `bias`. The charter's North star principle 4 ("Real recipes, not stubs") names this kind of gap directly.

2. **SMAA is a single-pass edge-aware blur, not full SMAA.** `wgpuSmaaEffect.ts:8-9` documents this: "Full SMAA needs separate edge-detection and blend-weight passes against precomputed area/search lookup textures; this single-pass approximation softens detected edges only." The implementation is ~70 lines sampling four cardinal neighbors. This is the second runner that is a stand-in under the real name, in tension with North star principle 4.

3. **No depth G-buffer (cross-package blocker).** `beginWgpuRenderEffectPipeline` feeds `sceneDepthTexture: null` to every runner. Effects with depth-dependent algorithms (SSAO, ScreenSpaceFog, CameraMotionBlur, MotionBlur, ContactShadows) run color-only fallback paths. The status correctly identifies this as a `render-wgpu` prerequisite.

4. **`BloomEffect.passes` is accepted and discarded.** The `passes` field is declared in the descriptor at `packages/types/src/BloomEffect.ts:8` but read by no runner in WGPU, GL, or Canvas. A descriptor field no backend reads is dead API surface.

5. **`strength` is applied before the spatial operator, not after.** The status documents this at `wgpuEffectTintShader.ts:24` and notes it is identical across GL/Canvas/WGPU legs. The shared fix is a post-operator coverage-gain pass per the unratified `effect-recipe-model`.

6. **Two GL-only effects.** `BokehDepthOfField` was deliberately deleted (depth-dependent, depthless version was a misimplementation). `CustomShader` is an open direction: whether WGPU must expose a user-supplied-WGSL seam.

7. **No chain validation.** `validateWgpuRenderEffectChain` and `RenderEffectChainHint` do not exist. A chain with unresolvable or conflicting effects is discovered only at draw time via the guard seam.

8. **Thin per-effect test floor.** Most effect test files (e.g. `wgpuVignetteEffect.test.ts`) contain only `expect(typeof applyXToWgpu).toBe('function')` smoke tests. The infrastructure tests (registry, pipeline, RenderTexture bridge) and the cross-cutting tests (`wgpuSpatialEffectRegistration.test.ts` verifying all 45 registrations; `wgpuLogicalEffectResolution.test.ts` verifying logical/physical uniform packing for 13 effects) are substantive. The per-effect gap is that uniform-packing correctness, parameter handling, and multi-pass orchestration are unasserted for the remaining ~30 effects. jsdom cannot verify pixel output, but it can verify that the right uniforms reach the right slots — the `wgpuLogicalEffectResolution.test.ts` pattern proves this is feasible.

## Charter contradictions

1. **Runner count.** The charter's Decisions section records "WGPU has 44 realized built-ins" (2026-07-31). The source and the registration test (`wgpuSpatialEffectRegistration.test.ts`) show 45 runners. ContactShadows appears to have landed after the decision was written. Not a design contradiction, but the charter's count is stale by one.

2. **Status claims no guard module.** The status's Open section states "No guard module. `effects-gl` carries `enableGlRenderEffectGuards`; `enableWgpuRenderEffectGuards` does not exist." The guard module exists at `enableWgpuRenderEffectGuards.ts`, is exported from both lanes, and has a colocated test. The status is factually wrong on this point.

Apart from these, the source aligns well with the charter:
- North star 1 (backend, not redefinition): no descriptors or math defined here; all come from `effects`/`types`.
- North star 2 (registry by default): registry dispatch, per-state, last-write-wins, tree-shakable.
- North star 3 (explicit pooled GPU ownership): create/destroy lifecycle, acquire/release pool brackets.
- North star 5 (conformance-ready value seam): WGSL bodies are plain string constants, all inputs are data-shaped.

## Contract & docs fit

**Lives up to the contract (a):**

- Types-first: all types imported from `@flighthq/types/contract`; no exported types defined inline.
- Naming: every export carries the full unabbreviated type name (`applyBloomEffectToWgpu`, `getWgpuRenderEffectRunner`, `hasWgpuRenderEffectRunner`, `registerWgpuBlurEffect`, `destroyWgpuRenderEffectPipeline`). Globally unique, greppable.
- Export lanes: `index.ts` is a curated re-export of `contract.ts`; `contract.ts` re-exports all source modules via `export *`. Infrastructure (effect pass, program cache, color matrix/LUT passes, shared shaders) is on the contract lane only, keeping the public lane focused on runners and pipeline.
- Sentinels not throws: `getWgpuRenderEffectRunner` returns `null`, pipeline skips unregistered kinds silently, `applyWgpuRenderEffectsToRenderTexture` returns `boolean`. The one `throw` in `wgpuEffectPass.ts:180` is a precondition violation (no active command encoder), correctly a programmer error.
- Diagnostics inversion: guard module separately importable, core message-free, guard reporters keyed by kind for deduplication via `logOnce`.
- `sideEffects: false`, no top-level registration.
- Dependencies are tight: `adjustments`, `color`, `effects`, `geometry`, `log`, `render-wgpu`, `registry`, `types`.

**Candidate revisions to the contract / admin docs (b):**

- **Type homing.** `RenderEffectPipelineOptions` is a substrate-agnostic type living in `types/src/GlRenderEffectPipeline.ts`. A type shared by both backends homed under one backend's filename is a mis-home. Candidate: move to its own `RenderEffectPipelineOptions.ts`. The charter's Open directions already note this.
- **Charter runner count.** The Decisions entry "WGPU has 44 realized built-ins" should read 45 (ContactShadows landed). A factual correction to a Decisions entry.
- **Status guard-module claim.** The status's Open section claims no guard module exists. The claim should be removed — the module exists, is tested, and is exported.

## Candidate open directions

The charter already carries a thorough set of open directions. One new candidate surfaced by this review:

- **Stand-in recipes vs. North star principle 4.** The SSAO luminance-variation stand-in and the single-pass SMAA approximation are both registered under the real effect names and documented as approximations. North star principle 4 says "A registered runner is a parameter-responsive realization of the named effect, not an identity copy or a different algorithm under the requested name." The SSAO stand-in is explicitly a different algorithm (luminance variation, not depth-derived occlusion), and the SMAA is a different algorithm (single-pass blur, not three-pass edge-detect/blend-weight/neighborhood). Should these be renamed to reflect what they actually do, removed until the real algorithm is feasible, or accepted as interim approximations that do not violate principle 4 because they are documented? The charter is silent on this specific tension.

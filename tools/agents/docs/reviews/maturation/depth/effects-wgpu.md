# Maturation Roadmap: @flighthq/effects-wgpu

**Current verdict**: solid — 80/100. A broad, well-structured WebGPU realization of the agnostic `@flighthq/effects` descriptors (45 runners + per-state registry + ping-pong pipeline + program cache), a faithful 1:1 mirror of `effects-gl`, held back from authoritative only by the absent depth/velocity G-buffer in the WebGPU render path that forces ~6 effects to ship as color-only stand-ins.

This package is unusually far along: every gap below is backend-implementation depth, not API-surface or naming work. The agnostic descriptor surface lives in `@flighthq/effects` and is already complete; the runner/pipeline/context types already live in `@flighthq/types` (`WgpuRenderEffectContext`, `WgpuRenderEffectRunner`, `WgpuRenderEffectPipeline`) and already carry `sceneDepthTexture`/`sceneVelocityTexture` slots wired to `null`. The work is to make those slots real and to deepen the algorithms behind a handful of recipes. Bronze/Silver are therefore comparatively small; the genuine frontier is concentrated in Gold.

## Bronze

The minimum to retire the most visible "this effect does nothing" placeholders and ship a curated entry point. Highest value per unit effort.

- **Land a sampleable scene depth attachment in `render-wgpu` (cross-package prerequisite).** Today `WgpuRenderTarget.depthStencilView` is `RENDER_ATTACHMENT` only. Add `TEXTURE_BINDING` usage (or a separate sampleable depth resolve) plus a `getWgpuRenderTargetDepthTexture(target): GPUTexture | null` accessor in `render-wgpu`, and feed it into `endWgpuRenderEffectPipeline` so `ctx.sceneDepthTexture` is non-null. This single change is the gate for true SSAO, screen-space fog, DoF, and depth-aware blur.
- **Real depth-driven `applySsaoEffectToWgpu`.** Replace the luminance-variation stand-in with view-space position/normal reconstruction from the depth texture and a hemisphere sample kernel over `radius`/`samples`/`bias`, with a range-check falloff. Read `SsaoEffect` params already defined in `@flighthq/effects`.
- **Real depth-driven `applyScreenSpaceFogEffectToWgpu`.** Use reconstructed linear view depth for exponential/exp² distance fog instead of the color-only approximation; honor existing `ScreenSpaceFogEffect` fields.
- **`registerStandardWgpuRenderEffects(state)` curated registrant.** A single opt-in function that registers all 45 `default*` runners under their canonical kinds. Keep it as a separate named export (so it tree-shakes when unused) and mirror the identical helper into `effects-gl` (`registerStandardGlRenderEffects`) for symmetry. This is the one missing convenience a mature library is expected to offer.
- **Grouped registrants alongside the full set:** `registerColorWgpuRenderEffects`, `registerBloomWgpuRenderEffects`, `registerBlurWgpuRenderEffects`, `registerStylizeWgpuRenderEffects`, `registerAntialiasingWgpuRenderEffects`, `registerScreenSpaceWgpuRenderEffects` — so callers pull a taxonomy band without naming every runner.
- **Functional-test scenes for the newly-real depth effects** (ssao, screen-space-fog) under `tests/functional/`, captured cross-backend against `effects-gl` for parity, so the depth path is regression-gated.

## Silver

Competitive and solid: the velocity pass, genuine temporal AA, the bloom mip-chain, and full SMAA — the features a well-regarded real-time effects backend is expected to have.

- **Velocity (motion-vector) G-buffer pass in `render-wgpu` (cross-package).** Produce a per-pixel screen-space velocity texture (current vs. previous frame clip position) and feed it to `pipeline.velocityTexture` rather than relying on a caller hand-setting it via `setWgpuRenderEffectVelocityTexture`. Add `getWgpuRenderTargetVelocityTexture` and the per-state previous-view-projection bookkeeping.
- **Real velocity-driven `applyMotionBlurEffectToWgpu` and `applyCameraMotionBlurEffectToWgpu`.** Sample along the per-pixel velocity vector with a configurable sample count; retire the color-only fallbacks.
- **Real temporal `applyTaaEffectToWgpu` with a persistent history buffer.** Extend `WgpuRenderEffectPipeline` (type lives in `@flighthq/types`) with a retained `historyTarget: WgpuRenderTarget | null`; reproject the prior frame by velocity, neighborhood-clamp (AABB clipping) to reject ghosting, and accumulate with a feedback factor. This is the first effect that needs cross-frame state retained on the pipeline — design that slot deliberately.
- **Real depth-driven `applyBokehDepthOfFieldEffectToWgpu`.** Circle-of-confusion from reconstructed depth + focus distance/aperture, scatter-as-gather bokeh kernel, near/far separation; retire the color-only blur.
- **Progressive bloom mip-chain (`applyBloomEffectToWgpu` upgrade).** Add a downsample/upsample mip-chain path (Call-of-Duty/Unreal style: 5–6 progressive downsamples with Karis average on the first, tent-filter upsample composite) for wide, stable, flicker-free glow, selectable via the existing `BloomEffect` descriptor. Keep the current single-radius gaussian as the cheap tier. The `rgba16float` HDR target plumbing already exists.
- **Full three-pass `applySmaaEffectToWgpu`.** Replace the reduced-quality approximation with the canonical SMAA: edge detection → blend-weight calculation (with the area/search lookup textures) → neighborhood blend. Add the precomputed lookup textures as cached per-state GPU resources.
- **Real depth-driven `applySsrEffectToWgpu`.** Screen-space ray march in view space against the depth buffer with binary-search refinement and edge/Fresnel fade; retire the color-only stand-in.
- **Depth-aware variants where it raises quality:** make `applyTiltShiftEffectToWgpu` and `applyRadialBlurEffectToWgpu` optionally depth-gated (focus plane) now that depth exists.
- **Cross-backend parity gates** for every newly-real depth/velocity effect: extend the `effects-gl`↔`effects-wgpu` parity matrix so the two backends are held to visual agreement (the depth review notes structural twinning is the correct outcome for a backend pair).

## Gold

Authoritative / AAA: exhaustive coverage, performance, full error handling, and 1:1 Rust-port parity. This is the genuine frontier for this package.

- **`flighthq-effects-wgpu` Rust crate mirror at full conformance.** The Rust port targets `render-wgpu` (wgpu); the effect runners, registry, ping-pong pipeline, and program cache port 1:1 (`apply_*_effect_to_wgpu`, `default_*_effect_runner`, `register_standard_wgpu_render_effects`). The WGSL shader bodies are shared verbatim between TS and Rust (they are already plain WGSL string constants — extract them so both ports consume one source). Record the effect-by-effect parity in the conformance map; this is the package most able to reach bit-deterministic Rust↔TS agreement because the shaders are identical and the descriptors are plain data.
- **Performance: HDR throughout + half-resolution effect buffers.** Run SSAO/SSR/DoF/bloom at half resolution with a depth-aware bilateral upsample, and make `rgba16float` the default for the HDR effect band. Add a `RenderEffectPipelineOptions` field for effect-buffer scale (type change in `@flighthq/types`).
- **Compute-shader paths for the heavy reductions.** Bloom downsample/upsample, SSAO, and gaussian separable blurs as WGSL compute (storage-texture) passes where the workgroup-shared-memory win is real, behind the same runner API so callers see no difference. This is a WebGPU-specific advantage `effects-gl` cannot match and is worth exploiting.
- **Bilateral / edge-aware denoise pass for SSAO and SSR** (cross-bilateral blur gated by depth + normal) so the half-res samples resolve clean — the standard finishing pass an authoritative implementation includes.
- **CAS / contrast-adaptive sharpening** (`applyCasEffectToWgpu`) as a higher-quality sibling to `applySharpenEffectToWgpu`, and **temporal upscaling** stage building on the TAA history (the canonical AAA upscale path). Define the descriptors in `@flighthq/effects` first.
- **Effect-chain validation and auto-format negotiation.** A `validateWgpuRenderEffectChain(effects): RenderEffectChainIssue[] | null` that flags ordering hazards (e.g. tone-map after a color-grade LUT, AA after a heavy distortion), HDR-required effects on an LDR target, and depth/velocity-required effects when no G-buffer is produced — returning a sentinel (`null`) when the chain is clean, surfacing issues rather than silently degrading.
- **Exhaustive edge-case handling:** zero-size / 1px targets, format mismatch between scene target and pool descriptor, missing depth/velocity with a graceful documented fallback path per effect, and resize mid-frame. Each path covered by a colocated unit test; no internal-invariant throws (sentinels only, per the design rules).
- **Performance and quality budget docs** in-source per heavy effect (sample counts, mip levels, cost class) so callers can reason about the bundle and the frame budget — the kind of completeness a domain expert checks for.
- **Full functional + parity + regression coverage** for all 45 effects across `effects-gl`/`effects-wgpu` (and the Rust `displayobject-wgpu`/effects path), with committed fingerprint baselines, so the whole surface is render-gated, not just smoke-tested.

## Sequencing & effort

Recommended order, with dependencies and the items that must be surfaced rather than done autonomously.

1. **Bronze depth attachment first — it is the keystone.** Everything depth-driven (SSAO, fog, DoF, SSR, depth-gated blur) is blocked on a sampleable depth texture in `render-wgpu`. This is a **cross-package change to `@flighthq/render-wgpu`** (add `TEXTURE_BINDING` usage / a depth accessor) and should be raised with the user as a coordinated change, since it touches the render-state contract and should land symmetrically with the `effects-gl`/`render-gl` side to keep the backends twinned. No new `@flighthq/types` shape is needed for depth (the `sceneDepthTexture` slot already exists); the type layer is already ahead of the implementation here.
2. **Bronze SSAO + fog + curated/grouped registrants** follow immediately once depth is sampleable — low risk, high visibility, and the registrant helpers are pure additive exports with no dependency. Mirror the registrant into `effects-gl` in the same change.
3. **Silver velocity pass** is the second cross-package `render-wgpu` change (previous-view-projection bookkeeping + velocity texture). It is heavier than depth and unblocks motion blur, camera motion blur, and feeds TAA. Surface this as a design decision: where the previous-frame matrices live (render-state runtime slot vs. pipeline) is a contract choice.
4. **Silver TAA needs a new retained slot on `WgpuRenderEffectPipeline`** (`historyTarget`) — a **`@flighthq/types` change** that also affects `GlRenderEffectPipeline` for symmetry. Define the type first, then implement. This is the first effect with cross-frame state; get the retention/disposal (`destroyWgpuRenderEffectPipeline` must free the history target) right deliberately.
5. **Silver bloom mip-chain and full SMAA are independent** of the depth/velocity work and can proceed in parallel by a second contributor; SMAA needs cached lookup textures (per-state GPU resource, same caching pattern as the program cache).
6. **Gold Rust mirror** should begin only after the TS depth/velocity/TAA paths are settled, because the shaders and the pipeline shape must be stable to port 1:1; the payoff is that the WGSL bodies are shared verbatim, so extracting the shader constants into a shareable form is a cheap prerequisite worth doing early (even during Silver) to avoid divergence.
7. **Gold compute-shader and half-res paths are performance reshapes** — do them last, behind the stable runner API, gated by the parity baselines so the optimization cannot silently change output.

**Cross-package / design-decision items to surface to the user:**

- The `render-wgpu` depth-sampleable change and the velocity pass are not in this package's scope and must be coordinated; both should land symmetrically with `render-gl`/`effects-gl`.
- The `RenderEffectPipelineOptions` effect-buffer-scale field and the `historyTarget` slot are `@flighthq/types` (header-layer) changes shared by both the Gl and Wgpu pipelines — define in types first.
- New descriptors (CAS, temporal upscale) belong in `@flighthq/effects` first, not here; raise them as agnostic-surface additions.
- Whether half-res HDR becomes the default (Gold) is a quality-vs-conformance tradeoff that affects cross-backend parity baselines — flag before changing defaults.

# Breadth Review: Rendering / GPU Engineer

**Lens:** I judge whether the rendering stack — backend-agnostic core plus GL/WebGPU/Canvas/DOM backends, per-subject leaf renderers, state/queue/update pipeline, materials/shaders, textures/samplers/render targets, blending, masking, post-process effects and filters, surface/pixel access, and color management — is complete and coherent across all backends.

**Coverage:** 84/100

## What a complete SDK owes this perspective

A renderer engineer expects, at minimum:

- A **backend-agnostic render core**: registration by kind, render state, a render queue/list, render-node data, and an explicit update pass that propagates transform/alpha/visibility/blend into render nodes before draw.
- **Multiple concrete backends behind one contract** so a scene draws identically on each: at least an immediate-mode 2D backend (Canvas2D), a retained DOM backend, and GPU backends (WebGL2 and WebGPU). The GPU side should be split into a subject-agnostic _core_ (state/shaders/targets/draw) and _per-subject leaf renderers_.
- **Render targets / framebuffers**: offscreen targets, pooling, resize, MSAA resolve, and a way to composite a target's result back into the scene.
- **Textures and samplers**: upload from image sources, update, bind, and (for 3D) sampler/cubemap/mip controls.
- **Blending and compositing** across every backend with a shared blend-mode vocabulary.
- **Masking / clipping** across backends.
- **Filters** (per-primitive image effects) and **post-process effects** (full-screen passes) with real backend implementations, not just descriptors.
- **CPU pixel access (surface)**: read/write/generate pixel data, fingerprint/compare for conformance.
- **A coherent color convention** with one packing and one gamma story across backends.
- For an OpenFL/Lime target with a 3D doorway: **materials/shaders**, a **mesh/lighting/camera/texture** family, and the 3D draw backends.

## Well covered

- **Three-layer render architecture is real and consistent.** `render` (core: registration, state/queue, update pipeline, draw contracts) → `render-gl` / `render-wgpu` (subject-agnostic GPU cores) → `displayobject-{gl,wgpu,canvas,dom}` and `scene-{gl,wgpu}` leaf renderers. This is exactly the layering a renderer engineer wants, and it is mirrored 1:1 into the Rust port.
- **Four 2D backends with parity intent.** Canvas2D, DOM, WebGL2, and WebGPU all implement the same per-feature seams (`apply*BlendMode` + `enable*BlendModeSupport`, mask draws, render targets). Blend mode and masking exist on every backend behind one `BlendMode` vocabulary — the cross-backend coherence is the strongest part of the stack.
- **Render targets are mature on the GPU backends.** Create/begin/end/resize/clear/destroy, a **pool** (`acquire*`/`release*`), MSAA **resolve** (`resolveGlRenderTarget`), descriptor-driven allocation, and a `drawRenderTargetResult` composite path. This is production-grade, not a stub.
- **Texture seam is present on every GPU backend.** `create/bind/update` GL textures, `WgpuTextureEntry` lifecycle, frame-capture textures, and gradient-ramp textures for filters. 3D adds PBR/material texture binding with sampler awareness.
- **Post-process effects are a standout.** A full AAA suite — Bloom, FXAA, SMAA, SSAO, DepthOfField, MotionBlur, Vignette, ChromaticAberration, ColorGrade, Exposure, Grain, GodRays, Outline, ToneMap — each with Canvas/GL/WGPU implementations and a runner. This exceeds OpenFL/Lime and is coherent across backends.
- **Filters are split correctly and per-backend.** `filters` (descriptors + blur math), plus real backends `filters-canvas`, `filters-css`, `filters-gl`, `filters-wgpu`, and the CPU `filters-surface` bridge over `surface`. Blur/glow/bevel/drop-shadow/color-matrix/convolution/displacement/gradient variants are all present.
- **Surface (CPU pixel) package is deep.** Far beyond `getPixels/setPixels`: procedural noise (Perlin), morphology (dilate/erode/flood-fill), channel copy, histogram equalize, palette map, threshold, color-bounds, dissolve, composite/region, plus **fingerprint/compare** primitives that double as the conformance instrument. This is a complete sub-library.
- **Materials are unexpectedly complete.** A full PBR family (standard/specular-gloss/clearcoat/sheen/iridescence/anisotropy/subsurface/transmission), classic (Blinn-Phong/Phong/Lambert), and stylized (toon/matcap/unlit/wireframe/normal/depth/emissive/vertex-color), with `ColorTransform` math and a `LinearColor`/`unpackColorToLinear` path.
- **3D pipeline exists end to end at the plumbing level.** `scene`, `mesh`, `lighting`, `texture`, `camera` (3D projections, not photo capture), with `scene-gl`/`scene-wgpu` compiling per-material programs (PBR/classic/toon/matcap/unlit/debug/wireframe) via define-key permutation and a light block. `geometry` carries `Frustum` math.
- **Color convention is explicit and documented.** Packed `0xRRGGBBAA`, RGBA8 non-sRGB, premultiplied alpha, sRGB pass-through — one rule, stated to hold across backends and the Rust port. This is the right call for cross-backend/Rust conformance.

## Gaps & missing capabilities

- **No shadow rendering anywhere.** There is lighting and PBR but no shadow-map render target, no light-space depth pass, no PCF/sampler-compare seam. A 3D renderer without shadows is visibly incomplete; this is the single biggest 3D gap.
- **No GPU-side culling / draw-list optimization.** `Frustum` math exists in `geometry`, but nothing in `scene`/`render` consumes it for frustum culling, and there is no occlusion or sort/batch-by-material draw-list pass surfaced. For 2D this matters less; for 3D scenes it is expected.
- **No environment / skybox / IBL path.** PBR materials exist but there is no cubemap-as-environment, no skybox draw, no irradiance/prefiltered-environment or BRDF-LUT generation. PBR without IBL only does direct lighting — a meaningful coherence gap with the material breadth.
- **No WebGPU compute seam.** WebGPU's headline capability (compute passes for particle simulation, blur/SSAO done in compute, GPU skinning) is not exposed. Effects are implemented as fragment passes only. For a renderer that ships a `wgpu` backend, the absence of any `dispatchCompute`/compute-pipeline seam is a notable omission.
- **Sampler state is implicit.** Textures are created/bound, but there is no first-class sampler descriptor (wrap/filter/mip/anisotropy/compare) surfaced as a reusable type — important once mips, tiling, and shadow-compare samplers appear.
- **Stencil/scissor clipping is not a first-class seam.** Masking is done via per-primitive mask draws; there is no scissor-rect or stencil-based clip-region API for cheap rectangular/nested clipping, which renderers usually want alongside mask-shape clipping.
- **HDR / tone-mapping pipeline is per-effect, not a render-target format story.** `ToneMap`/`Exposure` effects exist, but render targets are non-sRGB RGBA8 only; there is no `rgba16float` HDR target format or a documented linear-HDR-then-tonemap chain. With a full PBR set this is the natural next layer.
- **No render-graph / pass-dependency layer.** Effects chain via runners, but there is no declarative pass graph that manages target lifetime, read-after-write hazards, and transient-target aliasing across a multi-effect frame. At this breadth it would unify effects + post + 3D.

## Missing or too-thin packages I would expect

- **`shadow` (or shadow support inside `lighting`/`scene-*`)** — shadow-map targets, light-space passes, and the sampler-compare seam. Currently absent.
- **`environment` / skybox + IBL** — cubemap environment, skybox draw, and irradiance/prefilter/BRDF-LUT bake. The material breadth implies it; no package serves it.
- **A WebGPU compute seam** — either inside `render-wgpu` (compute pipeline/bind-group/dispatch) or a small `compute-wgpu` cell. Today there is no way to author a compute pass.
- **`displayobject-skia` (Rust) software backend** — referenced repeatedly in the Rust docs as the in-box software-render/reference path, but no `displayobject-skia` package/crate is present yet. Without it the Rust port has GPU backends only and no deterministic software reference.
- **A sampler/texture-format types layer** — `texture` covers 3D textures/samplers/cubemaps, but a shared sampler-descriptor and render-target-format enum (including HDR formats) would make targets, mips, and shadows coherent.
- **A render-graph/frame-graph package** — optional but expected at AAA scope to orchestrate the otherwise-strong effects + post + 3D passes.

## Verdict

From a rendering/GPU standpoint this is a genuinely strong, coherent stack — far past stub quality. The three-layer split (core → GPU core → per-subject leaf), the four-backend 2D parity with a shared blend/mask vocabulary, the mature pooled+MSAA render targets, the AAA post-process effect suite implemented on all backends, the deep CPU `surface` library, and an explicit single-color convention are all exactly what I want to see, and the Rust port mirrors the architecture rather than diverging. The 2D path reads as complete and OpenFL/Lime-surpassing.

The weakness is the **3D frontier**: the plumbing (scene/mesh/lighting/camera/materials/PBR shaders) is in place, but the rendering _techniques_ that make 3D usable — shadows, IBL/skybox, frustum culling, and HDR targets — are not, and WebGPU compute is unexposed. These are upper-layer features on top of solid foundations, not foundational holes, which is why coverage lands high (84). Close shadows, IBL, a compute seam, and the Rust `displayobject-skia` reference backend, and this stack would be hard to fault from this perspective.

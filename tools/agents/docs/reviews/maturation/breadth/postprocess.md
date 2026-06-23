# New Package Spec: @flighthq/postprocess

**Represents** — A composable 3D HDR post-processing chain over the scene `RenderTarget`: an HDR scene render plus an ordered stack of named passes (tone mapping/exposure, bloom from HDR, SSAO, motion blur, AA resolve) wired to the 3D scene's depth/velocity/G-buffer outputs and resolved down to the LDR present target.

**Requested by** — spatial-3d, rendering-gpu

**Fits**

- **Layer.** A render-orchestration cell that sits _above_ `@flighthq/effects` and _beside_ `@flighthq/scene-gl` / `@flighthq/scene-wgpu`. It is not a new effect library — the `effects` package already ships the AAA fullscreen-pass suite (Bloom, Ssao, ToneMap, Exposure, Fxaa, Smaa, Taa, MotionBlur, BokehDepthOfField, GodRays, ChromaticAberration, ColorGrade, …) with per-backend runners and a generic `RenderEffectPipeline`. `postprocess` is the **3D-scene-aware orchestrator** that (a) owns the HDR scene target and its depth/velocity/G-buffer companions, (b) feeds those auxiliary buffers into the depth/motion/temporal-tagged effect runners that `effects` cannot supply on its own, and (c) defines the canonical ordered chain and its defaults. It composes `effects` runners; it does not duplicate them.
- **Why distinct from `effects`.** `effects` is substrate-agnostic and 2D-fullscreen-first: its pipeline takes a flat `RenderEffect[]` and a single color input, with only an opt-in velocity texture. It has no concept of an HDR scene target, no G-buffer/depth production from a 3D scene, no exposure/auto-exposure metering loop, and no canonical 3D post order. `postprocess` provides exactly that 3D-render glue. The 2D fullscreen-effects-on-a-display-list story stays in `effects`.
- **Dependencies.** `@flighthq/types` (the `Postprocess*` contracts — header layer, defined first), `@flighthq/render` (`RenderTargetDescriptor`, `RenderTargetFormat`, `RenderTargetDepth`, `VelocityField`), `@flighthq/effects` (the `RenderEffect` intents + per-backend runners it dispatches), `@flighthq/camera` (exposure/jitter/VP for TAA + motion reconstruction), `@flighthq/signals` (optional `enable*` group). It does **not** depend on `@flighthq/sdk`. Backend draw work is delegated to the existing `render-gl` / `render-wgpu` cores via the `effects` runners, so `postprocess` itself stays backend-agnostic (no GL/WGPU import in the root package).
- **Backend seam.** This is a _render-orchestration_ package, not a platform capability, so it follows the **renderer-registration** pattern (kind + `register*`), not the `get*Backend`/`set*Backend`/`createWeb*Backend` host seam. The per-backend execution is provided by `effects`' already-registered runners (`registerGlRenderEffect`, etc.); `postprocess` adds one thin per-backend execution adapter, `registerGlPostprocessChain` / `registerWgpuPostprocessChain`, that knows how to allocate the HDR/aux targets on that backend and route them into the runner `ctx`. No top-level registration — callers opt in.
- **Neighbor packages.** `@flighthq/postprocess-presets` (optional) — canonical ready-made chains (`createCinematicPostprocessChain`, `createBasicHdrPostprocessChain`) as plain `PostprocessChain` data, following the `-formats`/`-presets` neighbor convention so the base package stays preset-free and tree-shakable. Auto-exposure luminance metering that needs a compute path could spawn `@flighthq/postprocess-compute` once a WebGPU compute seam exists (see open questions).
- **Rust crate.** `flighthq-postprocess` (+ `flighthq-postprocess-presets`), mirroring the TS package per the 1:1 conformance rule. The chain definition is plain data and ports directly; the per-backend adapter mirrors the `scene-gl` / `scene-wgpu` registration shape. tiny-skia (`displayobject-skia`) has no HDR post path — postprocess is GPU-only (gl/wgpu) in both TS and Rust, an intentional entry in the conformance divergence map.

## Bronze

The minimum useful 3D HDR post chain: render the scene into an HDR float target, run an ordered list of fullscreen passes, and resolve to the LDR present target with tone mapping + exposure. This is the "PBR finally looks right" slice — without it the strong materials/lighting layer clamps to LDR and bloom has no HDR to bloom from.

- **Types in `@flighthq/types/Postprocess.ts` first (header layer):**
  - `PostprocessChainKind = 'PostprocessChain'` — string kind identifier (canonical PascalCase), registry/serialization key.
  - `PostprocessStage` — one ordered entry: `Readonly<{ effect: RenderEffect; enabled?: boolean; name?: string }>`. Wraps an existing `effects` `RenderEffect` intent (e.g. a `BloomEffect`, `ToneMapEffect`) with chain-ordering metadata. Plain data.
  - `PostprocessChain` — `Readonly<{ kind: typeof PostprocessChainKind; stages: ReadonlyArray<PostprocessStage>; hdrFormat: RenderTargetFormat; outputFormat: RenderTargetFormat }>`. The whole chain is serializable plain data; no runtime objects.
  - `PostprocessSceneInputs` — the auxiliary buffers a stage may read: `Readonly<{ depth: boolean; velocity: boolean; normals: boolean }>` request flags (Bronze: `depth` only honored; `velocity`/`normals` reserved). Drives which aux attachments the adapter allocates.
  - `PostprocessTargetSet` — opaque per-backend runtime holder (HDR target, ping/pong scratch, optional depth/velocity targets). Lives behind a runtime slot; not public mutable state.
- **Functions in `@flighthq/postprocess` (backend-agnostic root):**
  - `createPostprocessChain(options): PostprocessChain` — allocates a chain from an ordered stage list, defaulting `hdrFormat: 'rgba16f'`, `outputFormat: 'rgba8'`. Explicit allocation.
  - `appendPostprocessStage(chain, stage): PostprocessChain` / `setPostprocessStageEnabled(chain, name, enabled): PostprocessChain` — immutable edits returning a new chain (plain data; chains are cheap to clone).
  - `getPostprocessStage(chain, name): PostprocessStage | null` — sentinel `null` for missing.
  - `hasPostprocessStage(chain, name): boolean`.
  - `getPostprocessSceneInputs(chain): PostprocessSceneInputs` — derives which aux buffers the chain's stages require by inspecting the `effects` intents (a `SsaoEffect`/`BokehDepthOfFieldEffect` ⇒ depth; a `MotionBlurEffect`/`TaaEffect` ⇒ velocity+temporal). This is the "what does this chain need" query the adapter uses to size targets.
  - **Default chain helper:** `createBasicHdrPostprocessChain(): PostprocessChain` — the canonical Bronze order: bloom-from-HDR → exposure → tone map → (optional FXAA). The 80%-value default.
- **Per-backend adapters (thin, in `@flighthq/postprocess` root, gated behind `register*`):**
  - `registerGlPostprocessChain(state)` / `registerWgpuPostprocessChain(state)` — opt-in; ensures the `effects` runners are present and registers the postprocess execution path against the backend state. No top-level side effects.
  - `createGlPostprocessTargetSet(state, descriptor)` / `createWgpuPostprocessTargetSet(...)` — allocate the HDR target (`format: 'rgba16f'`) + ping/pong scratch + optional `depth: 'depth-stencil-sampled'` from the existing `RenderTargetDescriptor` axes. `resizePostprocessTargetSet(...)` on viewport change. `destroyGlPostprocessTargetSet(...)` (frees GPU targets — `destroy*`, non-GC resource).
  - `beginGlPostprocessFrame(state, targets, clearColor)` — binds the HDR target so the **3D scene draws into HDR** (caller runs `prepareSceneRender` + `drawGlScene` between begin and run).
  - `runGlPostprocessChain(state, targets, chain, present)` / `runWgpuPostprocessChain(...)` — executes the ordered, enabled stages by dispatching each `effect` through the registered `effects` runner with the right `ctx` (ping/pong scratch, depth texture wired in), then resolves the final result to `present` (the backbuffer/LDR target). Returns nothing; this is the per-frame call.

Effort: medium. Most pass _implementations_ already exist in `effects`; Bronze is the target allocation, the HDR begin/run/resolve loop, the depth wiring for SSAO/DoF, and the canonical default chain. One root source file per concern + colocated tests, one types file. The headline win is HDR-correct PBR + bloom-from-HDR, which the rendering-gpu and spatial-3d reviews both flag as the natural next layer above the material breadth.

## Silver

Competitive with a well-regarded engine post stack (Three.js `EffectComposer` / Unity URP post volume): velocity-driven motion blur and TAA, auto-exposure metering, proper resolve ordering, per-stage resolution scaling, and the presets neighbor.

- **Types added to `@flighthq/types`:**
  - `PostprocessExposureMode = 'manual' | 'auto'` and `PostprocessExposureConfig` — `Readonly<{ mode; exposureValue; minLuminance; maxLuminance; adaptationSpeed; meteringMask?: 'average' | 'center-weighted' | 'spot' }>`. The metering loop config feeding the existing `ExposureEffect`.
  - `PostprocessAaMode = 'none' | 'fxaa' | 'smaa' | 'taa'` — single knob selecting the AA resolve stage, mapping to the existing `Fxaa`/`Smaa`/`Taa` effects; TAA implies camera jitter + history.
  - `PostprocessHistory` — opaque temporal-history holder (previous-frame color + the camera VP used) for TAA and reactive masking; runtime slot, not public state.
  - `PostprocessStageScale` — per-stage resolution scale (`'full' | 'half' | 'quarter'`) so bloom/SSAO can run at reduced res, the standard quality/perf lever.
  - Extend `PostprocessSceneInputs` to fully honor `velocity` and `normals` (G-buffer normals for SSAO quality).
- **Functions in `@flighthq/postprocess`:**
  - `createPostprocessExposureState(config): PostprocessExposureState` + `updatePostprocessExposure(state, sceneLuminance, deltaSeconds): number` — the auto-exposure adaptation loop; reads a downsampled luminance, drives the per-frame exposure value with eye-adaptation easing. Returns the resolved exposure for the `ExposureEffect`.
  - `contributePostprocessVelocity(targets, field, root)` + the begin-frame velocity pass — wires `@flighthq/render`'s `VelocityField` / `renderGlVelocity` into the motion-blur and TAA stages so `MotionBlurEffect`/`TaaEffect` get real motion vectors (today they are opt-in textures the caller must supply manually).
  - `setPostprocessAaMode(chain, mode): PostprocessChain` — swaps the AA resolve stage; for `'taa'`, installs the camera-jitter + history requirement and reorders the chain so TAA resolve precedes tone map.
  - `setPostprocessStageScale(chain, name, scale): PostprocessChain` — per-stage downscale.
  - `reorderPostprocessChain(chain, order): PostprocessChain` + `validatePostprocessChainOrder(chain): PostprocessChainOrderIssue[]` — canonicalizes and reports order mistakes (e.g. tone map before bloom, AA after tone map when it should precede) — returns an empty array when valid, sentinels over throwing.
  - `createCinematicPostprocessChain()` (moved to / mirrored in the `-presets` neighbor) — bloom → SSAO → DoF → motion blur → TAA → exposure (auto) → tone map (ACES) → color grade → vignette → chromatic aberration → film grain, the recognizable "filmic" default.
  - **Signals group, opt-in:** `enablePostprocessSignals(chain)` / `createPostprocessSignals()` — `onChainResized`, `onExposureAdapted`, `onStageSkipped` signals (the entity owner exposes the group, per the `enable*` rule). Without it, the chain runs callback-free.
- **Cross-backend consistency.** The `effects` runners are already implemented on gl + wgpu; Silver adds the parity gate: a functional/conformance scene that renders the cinematic chain on both backends and fingerprints them, so HDR/tonemap/bloom agree (the reviews call out cross-backend coherence as a first-class property).
- **Neighbor:** `@flighthq/postprocess-presets` shipped with the cinematic/basic/retro chains as plain data.

Effort: medium-large. Auto-exposure metering and the velocity/TAA history plumbing are the real work; the AA-mode and stage-scale knobs are thin chain rewrites over existing effects.

## Gold

Authoritative / AAA: a true render-graph-backed post chain with transient-target aliasing and hazard tracking, the full HDR tone-mapping operator set, deferred/G-buffer-aware passes (SSR, SSAO with normals, screen-space fog), debug visualization, exhaustive edge-case handling, full tests + docs, and 1:1 Rust parity.

- **Types in `@flighthq/types`:**
  - `PostprocessPass` / `PostprocessResource` / `PostprocessGraph` — a declarative **frame-graph** layer: passes declare their reads/writes by named resource; the scheduler computes transient-target lifetimes, aliases scratch targets, and orders passes by dependency. This is the render-graph the rendering-gpu review asks for, scoped to post.
  - `PostprocessToneMapOperator = 'reinhard' | 'reinhard-extended' | 'aces-filmic' | 'aces-fitted' | 'agx' | 'uncharted2' | 'neutral' | 'linear'` — the exhaustive operator set (extends what `ToneMapEffect` exposes), with `PostprocessToneMapConfig` (white point, contrast, shoulder).
  - `PostprocessColorSpace = 'srgb' | 'rec709' | 'rec2020' | 'display-p3'` + `PostprocessOutputTransform` — wide-gamut / HDR-display output transform, beyond the current non-sRGB RGBA8 present.
  - `PostprocessDithering`, `PostprocessBloomQuality` (`'low' | 'medium' | 'high'` mip-chain depth), `PostprocessSsaoConfig` (radius/bias/samples/blur, normal-aware), `PostprocessSsrConfig`, `PostprocessDebugView = 'none' | 'depth' | 'normals' | 'velocity' | 'luminance' | 'bloom' | 'ssao' | 'overdraw'`.
- **Functions / capabilities in `@flighthq/postprocess`:**
  - `createPostprocessGraph(chain): PostprocessGraph`, `compilePostprocessGraph(state, graph): CompiledPostprocessGraph`, `executePostprocessGraph(state, compiled, inputs, present)` — the graph compiler + executor with transient aliasing, read-after-write hazard insertion, and dead-pass elimination (a disabled/unread stage is dropped, its targets never allocated).
  - Full **tone-mapping** operator implementations wired through `setPostprocessToneMapOperator(chain, operator, config)`, including AgX and ACES-fitted, with the output transform for wide-gamut / HDR-display present (`setPostprocessOutputTransform`).
  - **G-buffer-aware passes:** SSAO with packed normals + depth, SSR over the G-buffer, screen-space fog, ground-truth-AO-style quality tier — all consuming the MRT axes already in `RenderTargetDescriptor` (`colorAttachments` / `colorFormats`).
  - **Debug visualization:** `setPostprocessDebugView(chain, view)` renders the depth/normals/velocity/luminance/bloom/ssao buffers to screen (the 3D debug-draw the spatial-3d review notes is missing for post).
  - **Performance:** mip-chain bloom (downsample/upsample Kawase) instead of fixed-radius blur, half-res SSAO/SSR with bilateral upsample, target reuse across stages, GPU-timer hooks (`getPostprocessPassTimings`) for profiling, and a compute-path option for luminance reduction / blur where a WebGPU compute seam exists.
  - **Robustness:** every config validated with sentinel returns (`validatePostprocessChainOrder`, format-mismatch detection returning `PostprocessChainIssue[]`), graceful degradation when a backend lacks `rgba16f` (fall back to `rgba8` + warn via signal, never throw), and resize/zero-size guards.
  - **Tests:** colocated unit tests for chain construction/ordering/auto-exposure math + alias scheduling; functional regression scenes per tone-map operator and per AA mode, fingerprinted on gl + wgpu; cross-backend parity cells in the parity matrix.
  - **Docs:** a domain doc under `tools/agents/docs/` covering the HDR-render → post-chain → present flow, the canonical stage order, and the gl/wgpu/Rust posture.
- **Rust parity:** `flighthq-postprocess` mirrors the chain data, the graph compiler, and the operator set 1:1; `scene-gl`/`scene-wgpu`-style adapters in `flighthq-postprocess` drive `render-gl`/`render-wgpu`. The divergence map records the no-skia-HDR-path note and any operator-precision deltas.

Effort: large. The frame-graph compiler, the full operator/output-transform matrix, G-buffer SSR/SSAO quality, and the cross-backend + Rust conformance gates are each substantial; this is the canonical-reference tier.

## Boundaries

- **Effect implementations stay in `@flighthq/effects` (+ `effects-gl`/`effects-wgpu`/`effects-canvas`).** `postprocess` never reimplements Bloom/Ssao/ToneMap/etc.; it composes their existing `RenderEffect` intents and per-backend runners. New _fullscreen_ effects are added to `effects`, not here.
- **2D fullscreen post on a display list stays in `effects`'** generic `RenderEffectPipeline` (`createGlRenderEffectPipeline` / begin / end). `postprocess` is specifically the 3D-scene HDR orchestration; a 2D app that just wants a vignette over its canvas uses `effects` directly.
- **Render-target primitives stay in `@flighthq/render`.** `postprocess` consumes `RenderTargetDescriptor` / `RenderTargetFormat` / `RenderTargetDepth` and the pool/resolve functions; it does not own the target type. HDR/MRT/sampled-depth axes already exist there.
- **The 3D scene render stays in `scene-gl` / `scene-wgpu`.** The caller runs `prepareSceneRender` + `drawGlScene` _into_ the HDR target between `beginPostprocessFrame` and `runPostprocessChain`. `postprocess` does not own the scene walk.
- **Velocity production stays in `@flighthq/render`** (`VelocityField`, `renderGlVelocity`); `postprocess` wires it to the motion/TAA stages but does not redefine it.
- **Skybox/IBL bake and shadows are out** — they are separate requested packages (`environment`, `shadow`). Postprocess consumes their results (HDR scene + depth) but does not generate environment maps or shadow maps.
- **Canvas2D/DOM have no HDR path** — postprocess is GPU-only (gl/wgpu). `displayobject-skia` (Rust software) likewise has no HDR post; recorded in the conformance divergence map rather than emulated.
- **Color packing/convention** stays the SDK-wide packed `0xRRGGBBAA` non-sRGB premultiplied rule; the Gold wide-gamut output transform is an explicit, opt-in present-time conversion, not a change to the internal convention.

## Open design questions

- **Chain ownership of effect order vs. effects' own pipeline.** `effects` already has `RenderEffectPipeline` with an ordered `RenderEffect[]`. Should `PostprocessChain` _be_ a thin specialization of that pipeline (reusing its begin/end), or a separate orchestration object that calls runners directly? Leaning separate (it needs HDR target + aux-buffer ownership the generic pipeline lacks), but the overlap should be deliberate, not duplicated.
- **Auto-exposure without a compute seam.** Luminance metering wants a parallel reduction; the rendering-gpu review flags the absent WebGPU compute seam. Bronze/Silver can do mip-chain downsample on the fragment path, but a `postprocess-compute` neighbor (or a compute path inside `render-wgpu`) is the clean home. Decide whether auto-exposure ships fragment-only first.
- **Where the canonical stage order lives.** Is the "correct" 3D post order (HDR → SSAO → bloom → DoF → motion blur → TAA → exposure → tone map → grade → grain) enforced by `validatePostprocessChainOrder`, or only documented? Enforcement helps agents/users but risks fighting deliberate non-standard chains.
- **G-buffer scope.** SSR/normal-aware SSAO need a G-buffer (`colorAttachments > 1`). Does `postprocess` drive G-buffer production (deferred-ish), or does it stay forward + sampled-depth only and leave deferred shading to a future `scene` deferred path? This decides whether Gold's SSR is in-scope or deferred to a deferred-rendering package.
- **TAA jitter coupling with `@flighthq/camera`.** `setCameraJitter` exists with no resolve consumer. Should `postprocess` own the jitter sequence (Halton) and write it back to the camera each frame, or require the caller to drive jitter? The history buffer + jitter must stay in lockstep; one owner is cleaner.
- **Presets vs. base.** Confirm the `-presets` split is worth a separate package vs. a handful of `create*Chain` helpers in-root. The `-formats`/`-presets` convention argues for the split; bundle-size measurement should decide.

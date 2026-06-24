---
package: '@flighthq/render-gl'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/render-gl.md
  - source
  - changes.patch
---

# render-gl — Review

Evidence: `incoming/builder-67dc46d64/head/packages/render-gl/` (source + tests), `changes.patch` (delta), verified against the worker status doc (`builder-67dc46d64`, as-claimed) and the prior depth review (72/100).

## Verdict

**solid — 86/100.** A genuinely strong WebGL2 **backend-core** layer (state, targets, shaders, draw, fullscreen passes) that closed almost every correctness/introspection gap the prior depth review named: context-loss detection, capability + extension introspection, non-throwing shader compile, GPU readback, configurable texture/sampler abstraction with `texStorage2D`, a complete cached pipeline-state layer, FBO completeness reporting, and an opt-in instrumentation surface. It is held back from authoritative by items that are real (not cosmetic): the instrumentation it added is **not wired into any draw path**, the context-loss "signals" do **not** use `@flighthq/signals` despite the `enable*Signals` name, and the deeper device primitives (UBO/sampler objects, blit/copy, sRGB policy, recreation contract) plus the cross-package clip promotion remain unbuilt or design-blocked. The worker's self-estimate of 91 is slightly high for those reasons; 86 reflects shipped-and-coherent work with two concrete contract drifts and a chunk of Gold still pending.

The status doc's claims check out against the diff: 260 tests, `makeGlState`/`glTestHelper` removed from the barrel, the three new files (`glPipelineState`, `glTexture`, `glInstrumentation`) present and exported, the new `@flighthq/types` kind/descriptor files landed types-first, and the runtime cache fields moved into `GlRenderStateRuntime` in `@flighthq/types`.

## Present capabilities

Grounded in source under `67dc46d6:packages/render-gl/src/`:

- **Context-loss detection** (`glContextLoss.ts`) — `attachGlContextLossHandlers`/`detachGlContextLossHandlers` (idempotent, WeakMap-tracked exact-listener removal, `preventDefault` on loss), `isGlContextLost`, `enableGlContextLossSignals`. Correct event wiring and teardown.
- **Capabilities** (`glCapabilities.ts`) — `createGlCapabilities`/`getGlCapabilities` read max texture size, texture units, samples, draw buffers, color attachments, renderbuffer size, color-buffer-float, float-linear, sRGB, and max anisotropy (with vendor-prefixed extension fallbacks), cached lazily on the runtime. This is the surface that stops leaf renderers reaching into `gl` directly.
- **Extension manager** (`glExtension.ts`) — `getGlExtension<T>`/`hasGlExtension` over a per-state cached `Map`, resolving each extension string at most once.
- **Non-throwing shader compile** (`glShader.ts`) — `tryCompileGlBitmapProgram` + `getGlLastShaderLog` alongside the throwing `compileGlBitmapProgram`; `tryCompileGlFullscreenProgram` mirrors it in `glFullscreenPass.ts`. Hot-reload / fallback-shader path.
- **GPU readback** (`glReadback.ts`) — `readGlRenderTargetPixels` binds the resolve (or draw) FBO, checks completeness, `readPixels`, restores the prior binding, returns `false` on incomplete/zero-size. The substrate capture and feedback effects need.
- **Configurable texture/sampler** (`glTexture.ts`) — `createGlTextureFromDescriptor` (immutable `texStorage2D` allocation, auto-enables float extensions, computes mip level count), `configureGlTextureSampler` (wrap/filter/anisotropy on the bound texture), `generateGlTextureMipmaps`, `updateGlTextureSubImage` (dirty-rect `texSubImage2D`), and `getGlRenderTargetStatus` (exhaustive FBO completeness via raw numeric constants, robust under jsdom mocks).
- **Cached pipeline state** (`glPipelineState.ts`) — `setGlDepthTest`/`setGlDepthWrite`/`setGlDepthFunc` (8 compare funcs), `setGlCullFace` (with null = disable), `setGlColorMask`, `setGlScissorTest`, `setGlViewport`, `setGlPolygonOffset`. All but polygon-offset elide redundant GL calls via `pipeline*` runtime fields. These are the core-owned setters leaves were previously reaching into `gl` for.
- **Instrumentation** (`glInstrumentation.ts`, opt-in/tree-shakable) — `enableGlRenderStats`/ `getGlRenderStats`/`resetGlRenderStats`, the `recordGl*` counters, `beginGlTimerQuery`/`endGlTimerQuery`/ `getGlTimerQueryResult` (EXT*disjoint_timer_query_webgl2, returns ns / null-not-ready / -1-disjoint), `setGlObjectLabel` (KHR_debug, no-op when absent), and `GL_DEBUG_TYPE*\*` constants.
- **Pre-existing core** (unchanged this pass, confirmed still present): render-target MSAA/MRT/HDR/ depth-stencil (`glRenderTarget.ts`), the render-target pool (`glRenderTargetPool.ts`), default + custom bitmap shaders, fullscreen pass, immediate quad + texture cache, blend modes, and the material/shader registries.
- **Types-first compliance** — every new type landed in `@flighthq/types` before use: `GlCapabilities`, `GlContextLoss`, `GlCullFaceKind`, `GlDepthFuncKind`, `GlFramebufferStatusKind`, `GlRenderStats`, `GlTextureDescriptor`/`GlTextureInternalFormat`, `GlTextureFilterKind`, `GlTextureWrapKind`; runtime cache fields added to `GlRenderStateRuntime` (not the public entity).

## Gaps

What a mature WebGL2 device/context layer (three.js `WebGLState`/`WebGLTextures`, PixiJS systems, bgfx device tier) still has that this lacks:

- **Instrumentation is dead weight until wired.** `recordGlDrawCall`/`recordGlTextureBind`/ `recordGlProgramSwitch`/`recordGlFramebufferBind` are exported and unit-tested but **called by nothing** in the package (verified: zero non-test, non-`glInstrumentation` callers; `glDraw.ts` issues `gl.drawElements` without recording). `enableGlRenderStats` + `getGlRenderStats` will report all-zero during real draws. The status doc flags this as a deliberate deferral; it is nonetheless a surface that does not yet do what its name promises.
- **No UBO / sampler-object primitives.** `createGlUniformBuffer`/`updateGlUniformBuffer`/ `bindGlUniformBuffer` and `WebGLSampler` helpers (`createGlSampler`/`bindGlSampler`) — the core primitives instanced leaf renderers should build on — are absent.
- **No blit/copy helpers.** Only the MSAA-resolve `blitFramebuffer` exists; no general `copyGlRenderTarget`/`blitGlRenderTarget`, `copyGlTextureToTexture`, or per-attachment clear (`clearGlRenderTargetAttachment`).
- **No compressed-texture upload.** `uploadGlCompressedTexture` over `compressedTexImage2D` (gated on `WEBGL_compressed_texture_*`) and a format-enumeration query are not present — core GPU plumbing, not a 3D-crate concern.
- **Scissor/stencil clip primitive still lives in `displayobject-gl`.** The runtime type reserves `scissorStack`, `clipForms`, `currentMaskDepth`, `currentScissorRect`, but render-gl exports no `pushGlScissorClip`/`pushGlStencilClip`/pop. This is the right layering for a backend core; it is design-blocked (cross-package move), not forgotten.
- **No context-loss _recreation_ contract.** Detection/signals exist; the `GlRecreatable` registry that walks resource owners on `webglcontextrestored` does not. A lost-then-restored context currently has no path back — every cached program/buffer/target is stale.
- **sRGB policy unresolved.** `GlTextureInternalFormat` includes `srgb8_alpha8` and `textureFormatConstants` maps it, but `getGlCapabilities` hard-codes `supportsSrgb: true` and there is no render-target sRGB path or documented stance against the Rust "sRGB pass-through" conformance decision.
- **Pixel-store / per-upload override control** (`setGlPixelStore`, flipY/premultiply overrides) and an optional `enableGlErrorChecking` dev mode are not present.
- **`updateGlTextureSubImage` is rgba8-only.** It hard-codes `gl.RGBA, gl.UNSIGNED_BYTE` and accepts a `premultiplyAlpha` default of `true` but does not vary by the texture's actual format — sub-image updates to float/r8/rg8 textures are not supported.
- **No `npm run size` confirmation** that the instrumentation/texture/pipeline additions tree-shake out of a minimal bitmap example (claimed unverified in the status doc).
- **Rust `flighthq-render-gl` parity** for this pass's additions is not done.

## Charter contradictions

The charter is a **stub** (all four body sections are `_TODO_`), so there is no blessed North star, Boundary, or Decision to contradict. Judged against the codebase-map AAA fallback instead — see Contract & docs fit for the two real convention drifts, and Candidate open directions for what the silent charter should settle.

## Contract & docs fit

**(a) How well the package lives up to the contract**

- **Types-first: strong.** Every new cross-package type is in `@flighthq/types` and the runtime cache fields moved onto `GlRenderStateRuntime` there (was previously a concern in the depth review). Clean.
- **Naming / verbs: strong.** Every export carries the `Gl` prefix and the full operated-on type word (`createGlTextureFromDescriptor`, `setGlPipeline*`, `getGlRenderTargetStatus`). `destroy*` for GPU resources, `acquire`/`release` for the pool, no `dispose*` misuse. Allocation discipline is clean (`create*` allocates; matrix/pipeline helpers write into runtime scratch or issue cached GL calls).
- **Sentinels-not-throws: improved.** `tryCompile*` returns `null` + log; readback/status return `false`/`'Unknown'`; timer queries return `null`/`-1`. Good adherence.
- **Single root export + `sideEffects: false`: holds.** `index.ts` is a thin barrel; the `makeGlState`/ `glTestHelper` public-API leak the depth review called out is **fixed** (no longer exported).
- **CONTRACT DRIFT — context-loss "signals" are not `@flighthq/signals`.** `enableGlContextLossSignals` installs `{ onGlContextLost: [], onGlContextRestored: [] }` as **plain callback arrays** in `@flighthq/types/GlContextLoss.ts`, and `glContextLoss.ts` iterates them manually. The codebase rule is explicit: an event with multiple listeners, opted into via an `enable*Signals` function, should use the signals package (priority, cancellation, the `Signal<T>` shape). The maturation roadmap specified exactly this (`GlContextLossSignals` group via the signals package). render-gl imports `@flighthq/signals` nowhere. Either the name should drop `Signals` (it is a plain listener list) or it should be a real signal group — as shipped it is a `Signals`-named API that is not signals.
- **CONTRACT DRIFT (minor) — `internal.ts` cast persists.** `createGlRenderState` still does `(state as { canvas })...`/`(state as { gl })...`. The codebase rule flags the `internal.ts` cast as a legacy approach not to be extended; the runtime-slot refactor the roadmap called for did not happen.
- **Minor — `GlTextureInternalFormat` is a lowercase string union** (`'rgba8'`, `'srgb8_alpha8'`) while the sibling discriminants (`GlTextureWrapKind`, `GlCullFaceKind`, `GlDepthFuncKind`) are PascalCase `*Kind` strings per the types-layout rule. It is named `*Format` not `*Kind`, so it is arguably exempt, but the casing is inconsistent with every other GL discriminant added this pass.
- **`glRenderTargetPool.ts` has no colocated test** (pre-existing, not introduced here; would fail `exports:check` intent). `clearGlRenderTarget`, `drawGlFullscreenPass`, `resolveGlRenderTarget`, and the `glShaderBinding` material-shader getters remain uncovered (pre-existing).

**(b) Where the contract / admin docs are stale against the work**

- **Package Map line is accurate** — `@flighthq/render-gl` as a "backend core (state, targets, shaders, draw, fullscreen/surface)" still matches. No revision needed there.
- **`render-backend-support.md`** notes "gl = Normal+Add only" for blend modes; this pass did not change that (non-separable blend modes still map to `null`). Still accurate; flag only that the planned `registerGlBlendModeShader` seam remains unbuilt.
- **The charter is an empty stub** while the package is `solid`/86 — the highest-value doc gap. A package this mature with no captured direction means every reviewer re-derives scope from the depth review. This should be authored (see below).

## Candidate open directions

Questions the stub charter must settle (each is something this review had to assume against the codebase-map fallback):

- **Is the backend-core boundary the blessed scope?** The depth review and roadmap treat "state + targets + shaders + draw + fullscreen" as the charter, with leaf concerns (instanced batch, particles, per-subject shaders) explicitly out of scope. Confirm this so "missing UBO/instancing draw" is correctly read as out-of-scope-by-design vs. a gap.
- **Context-loss signals: real `Signal<T>` or plain listener list?** The shipped code is neither cleanly — it is an array named `Signals`. Decide whether render-gl depends on `@flighthq/signals` for this (matching the SDK rule) or renames to a callback-list API. This is the single clearest contract resolution needed.
- **Clip primitive ownership (cross-package, fork A).** Promote `pushGlScissorClip`/`pushGlStencilClip`/pop from `displayobject-gl` into render-gl (the runtime type already reserves the state), or leave the GL clip state in the leaf? Touches `displayobject-gl` call sites — a real decision, not a sweep.
- **Context-loss recreation contract (cross-package).** Is `GlRecreatable` render-gl-internal, or a shared seam leaf packages self-register into? Determines whether `registerGlRecreatable` is exported.
- **sRGB / color-space policy (cross-backend).** Must be settled jointly with `render-wgpu` and the Rust "sRGB pass-through" conformance decision before `srgb8_alpha8` becomes a usable render-target format. A unilateral choice here breaks cross-backend and Rust↔TS conformance.
- **Non-separable blend modes (fork B).** Is shader-based blending (`registerGlBlendModeShader`) render-gl's responsibility or the leaf's? The current closed `BlendMode → blendFunc` map degrades non-separable modes to normal; growth toward Multiply/Screen/etc. is the registry-vs-closed-switch fork.
- **Stats hot-path wiring.** Confirm `recordGl*` should be called from `drawGlQuad`/`bindGlTexture`/ `useGlProgram`/`beginGlRenderTarget` (low-risk, touches tested hot-path code) — without it the instrumentation surface is inert.

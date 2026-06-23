---
id: render-gl
title: '@flighthq/render-gl'
type: depth
target: render-gl
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/render-gl.md
  - tools/agents/docs/reviews/depth/render-gl.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — completeness 72/100 for the WebGL2 backend-core scope it claims (render state, targets, shaders, draw, fullscreen passes); render-target support is already AAA-grade, but it lacks the device-level robustness (context loss, capability introspection, sampler/texture configurability, scissor/stencil primitive, readback, instrumentation) that separates a solid core from an authoritative one.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable hardening: the correctness and introspection gaps no leaf package can own, plus removing the test-helper leak. These are the items that turn "works on a happy-path canvas" into "survives a real browser session."

- **Context-loss survival.** New `glContextLoss.ts`: `attachGlContextLossHandlers(state, { onLost, onRestored })` / `detachGlContextLossHandlers(state)` wiring `webglcontextlost` (preventDefault) and `webglcontextrestored`. Add `isGlContextLost(state): boolean` and a `GlContextLossSignals` group enabled via `enableGlContextLossSignals(state)` (signals package, `onGlContextLost`/`onGlContextRestored`) so multiple subsystems can re-create resources. Define the `GlContextLossSignals` and listener types in `@flighthq/types` first. Backend core only emits/flags; resource re-creation contract lands in Silver.
- **Device-capabilities surface.** New `glCapabilities.ts`: `createGlCapabilities(gl): GlCapabilities` reading `MAX_TEXTURE_SIZE`, `MAX_TEXTURE_IMAGE_UNITS`, `MAX_SAMPLES`, `MAX_DRAW_BUFFERS`, `MAX_COLOR_ATTACHMENTS`, `MAX_RENDERBUFFER_SIZE`, color-buffer-float / float-linear / sRGB availability, anisotropy max. Cache it on the runtime (`GlRenderStateRuntime.capabilities`, initialized lazily, type added to `@flighthq/types`). `getGlCapabilities(state): Readonly<GlCapabilities>`. This is what stops leaf renderers querying `gl` directly.
- **Extension manager.** `getGlExtension(state, name): T | null` over a cached `Map<string, unknown>` so `EXT_color_buffer_float`, `EXT_texture_filter_anisotropic`, `EXT_disjoint_timer_query_webgl2` are resolved once and shared, replacing the ad-hoc inline `getExtension` calls. `hasGlExtension(state, name): boolean`.
- **Non-throwing shader compile.** Add `tryCompileGlBitmapProgram(gl, fragmentSrc): GlShaderLocations | null` and `tryCompileGlFullscreenProgram(gl, fragmentSource): GlFullscreenProgram | null` returning `null` + writing the log to a `getGlLastShaderLog()` (or out-param) on failure, alongside the existing throwing variants. Enables hot-reload / fallback-shader paths. Keep the throwing forms for programmer-error misuse.
- **GPU readback primitive.** New `glReadback.ts`: `readGlRenderTargetPixels(state, target, x, y, width, height, out: Uint8Array | Float32Array): boolean` (binds the resolve FBO, `readPixels`, returns `false` on incomplete FBO / format mismatch). This is the substrate `flighthq-capture` and feedback effects need; today they hit `gl` directly.
- **Remove `makeGlState` from the published barrel.** Drop the `export { makeGlState }` line in `index.ts`; move it to a test-only import path (`glTestHelper.ts` imported directly by tests). Public API leak called out in the depth review.
- **Replace the `internal.ts` cast in `createGlRenderState`** with proper runtime slots per the codebase rule (the `state as {…}` writes), so the legacy cast pattern is not extended.
- Colocated `*.test.ts` for each new file; `npm run exports:check` / `npm run order` / `npm run api` green.

### Silver

Competitive and solid — what a well-regarded WebGL2 device layer (PixiJS systems, three.js `WebGLState`/`WebGLTextures`, bgfx device tier) offers: configurable sampler/texture state, the context-loss _recreation_ contract, the shared clip primitive, and explicit cached pipeline state so leaves stop reaching into `gl`.

- **Configurable texture + sampler abstraction.** New `glTexture.ts` superseding the shallow `createGlTexture`/`bindGlTexture` path:
  - `GlTextureDescriptor` in `@flighthq/types` (`wrapS`/`wrapT` ∈ `GlTextureWrapKind`, `minFilter`/`magFilter` ∈ `GlTextureFilterKind`, `mipmaps`, `anisotropy`, `premultiplyAlpha`, `format`).
  - `createGlTextureFromDescriptor(state, descriptor): WebGLTexture`, `configureGlTextureSampler(state, texture, descriptor)`.
  - `updateGlTextureSubImage(state, texture, x, y, source)` — partial `texSubImage2D` upload (no full re-upload for dirty sub-rects).
  - `generateGlTextureMipmaps(state, texture)`; mipmap-aware filter selection.
  - WRAP/FILTER as `*Kind` string identifiers (`GlTextureWrapKind = 'Repeat' | 'ClampToEdge' | 'MirroredRepeat'`, etc.) in `@flighthq/types`.
- **Compressed-texture upload.** `uploadGlCompressedTexture(state, target, level, internalFormat, width, height, data): boolean` over `compressedTexImage2D`, gated on capability detection (`WEBGL_compressed_texture_s3tc`/`_etc`/`_astc`). Format enumeration via `getGlCompressedTextureFormats(state)`. (Cubemap/array/3D textures stay delegated to the 3D `texture` crate per the layering.)
- **Scissor / stencil clip primitive promoted into the core.** The runtime type already reserves `scissorStack`, `clipForms`, `currentMaskDepth`, `currentScissorRect`, `GlScissorRect`. Export the operations here:
  - `pushGlScissorClip(state, rect: Readonly<GlScissorRect>)` / `popGlScissorClip(state)` (intersecting scissor stack).
  - `pushGlStencilClip(state, drawContour)` / `popGlStencilClip(state)` (contour stencil increment/decrement with nesting depth).
  - `getGlCurrentScissorRect(state): Readonly<GlScissorRect> | null`.
  - `displayobject-gl` then consumes these instead of owning the GL state. **Cross-package move — surface as a design decision (see Sequencing).**
- **Explicit cached render-pipeline state setters.** New `glPipelineState.ts` with redundant-call elimination tracked on the runtime: `setGlDepthTest(state, enabled)`, `setGlDepthWrite(state, enabled)`, `setGlDepthFunc(state, func: GlDepthFuncKind)`, `setGlCullFace(state, mode: GlCullFaceKind | null)`, `setGlColorMask(state, r, g, b, a)`, `setGlViewport(state, x, y, w, h)`, `setGlScissorTest(state, enabled)`, `setGlPolygonOffset(state, factor, units)`. Cached `current*` fields added to `GlRenderStateRuntime` in `@flighthq/types`. These are core GPU plumbing leaves currently reach into `gl` for.
- **Blend-equation + separate blend state.** `setGlBlendEquation(state, rgb, alpha)` and `setGlBlendFuncSeparate(...)` cached setters; extend `applyGlBlendMode` to drive them. Document the non-separable blend modes (currently mapped to `null`) as needing shader blending and provide the seam (`registerGlBlendModeShader`) for a leaf to supply one.
- **Context-loss recreation contract.** Define `GlRecreatable` (a runtime registry of resources with a `recreate(state)` callback) so on `webglcontextrestored` the core walks the registry and rebuilds programs/buffers/targets. `registerGlRecreatable(state, handle)` / `unregisterGlRecreatable(state, handle)`. Render targets, default programs, and the quad buffers self-register.
- **`Readonly`/`*Like` tightening.** `setGlMatrixFromTransform` should accept `Readonly<MatrixLike>` instead of the bare structural literal; viewport params as `Readonly<{ width; height }>`.
- **Cross-backend consistency tests** with `render-wgpu`: shared functional scenes (clip stack, MSAA resolve, HDR target, sub-image upload) gated by `test:parity`.

### Gold

Authoritative / AAA — the canonical WebGL2 backend core. Exhaustive capability coverage, instrumentation, performance discipline, full error/edge handling, and 1:1 Rust-port parity with `flighthq-render-gl`.

- **Debug / profiling instrumentation surface.** New `glInstrumentation.ts` (opt-in, tree-shakable, off by default):
  - `KHR_debug` object labels: `setGlObjectLabel(state, type, handle, label)` guarded on `getGlExtension`.
  - GPU timer queries: `createGlTimerQuery(state)`, `beginGlTimerQuery`/`endGlTimerQuery`, `getGlTimerQueryResult` over `EXT_disjoint_timer_query_webgl2`.
  - Draw-call / triangle / texture-bind / program-switch counters: `enableGlRenderStats(state)`, `getGlRenderStats(state): Readonly<GlRenderStats>`, `resetGlRenderStats(state)`. `GlRenderStats` type in `@flighthq/types`.
  - Debug-group markers `pushGlDebugGroup`/`popGlDebugGroup`.
- **Uniform Buffer Objects + sampler objects.** `createGlUniformBuffer(state, byteLength)`, `updateGlUniformBuffer(...)`, `bindGlUniformBuffer(state, buffer, bindingPoint)`, and `WebGLSampler`-object support (`createGlSampler(state, descriptor)`, `bindGlSampler`) so descriptors are decoupled from texture objects. These are core primitives the leaf instanced renderers can build on (without owning the buffer-object lifecycle themselves).
- **sRGB + color-space correctness.** sRGB framebuffer / texture support (`SRGB8_ALPHA8`) behind capability detection, with the sRGB-vs-linear decision documented against the conformance map (the Rust port's "sRGB pass-through" decision must match). `RenderTargetFormat` extension in `@flighthq/types`.
- **Floating-point + integer render targets, blit/copy helpers.** `copyGlRenderTarget(state, src, dst, filter)` and `blitGlRenderTarget(...)` (general `blitFramebuffer`, not just MSAA resolve); `copyGlTextureToTexture`. Multi-attachment clear control (`clearGlRenderTargetAttachment(state, target, index, rgba)`).
- **Exhaustive error / edge handling.** FBO-completeness reporting (`getGlRenderTargetStatus(state, target): GlFramebufferStatusKind` instead of silent failure), capability-gated graceful degradation everywhere (HDR → RGBA8, MSAA → single-sample, anisotropy clamp), optional `enableGlErrorChecking(state)` dev mode that wraps draws in `gl.getError()` with the failing call site.
- **Pixel-store + alignment control** (`setGlPixelStore`), `flipY`/`premultiply` per-upload overrides, and `texStorage2D` immutable-storage allocation path for targets (driver-friendlier than `texImage2D`).
- **Performance discipline.** State-sort-friendly bind elimination across program/texture/sampler/UBO/blend/depth/cull; documented hot-path zero-allocation guarantees; `npm run size` baseline showing the instrumentation/UBO/clip additions tree-shake out of a minimal bitmap example.
- **Docs + 1:1 Rust parity.** A package-level doc covering the device contract (context-loss, capabilities, clip stack, pipeline state). Mirror every Bronze/Silver/Gold addition in `flighthq-render-gl` (glow over native GL) and record any intentional TS↔Rust divergence (e.g. timer-query availability, `KHR_debug`) in the conformance divergence map. Cross-backend `test:regression` baselines for clip, MSAA, HDR, compressed-texture, and readback scenes.
- **Full functional + unit coverage:** colocated tests for every export, parity scenes shared with `render-wgpu`, and regression fingerprints for the new target/clip/texture paths.

## Sequencing & effort

Recommended order, dependencies, and items needing a human design decision.

1. **Bronze first, in this order** (each is self-contained, low cross-package risk):
   1. Remove `makeGlState` from barrel + replace `internal.ts` cast (pure cleanup, ~0.5 day).
   2. `glCapabilities.ts` + extension manager (~1 day) — _prerequisite for almost everything in Silver/Gold_ (texture formats, anisotropy, float targets, timer queries all gate on it). Do this early.
   3. Non-throwing shader compile + `glReadback.ts` (~1 day each, independent).
   4. Context-loss _detection/signals_ (~1 day). Define `GlContextLossSignals` in `@flighthq/types`; the full _recreation_ contract is deferred to Silver because it touches every resource owner.

2. **Silver depends on Bronze capabilities.** Order: configurable texture/sampler (`glTexture.ts`) → compressed textures → cached pipeline-state setters (`glPipelineState.ts`) → blend-equation seam → context-loss recreation contract (last, because it consumes the recreation registry that targets/programs/buffers must opt into). The scissor/stencil clip promotion can run in parallel but is the **highest-coordination item**.

3. **Gold depends on Silver's pipeline-state and capability work.** UBO/sampler objects and instrumentation are independent and can be parallelized; sRGB/color-space must be settled jointly with the Rust conformance map before implementing.

**Cross-package / design-decision items to surface (do not act autonomously):**

- **Scissor/stencil clip primitive move (Silver).** The clip GL state currently lives in `displayobject-gl`; the runtime _type_ already reserves it in `@flighthq/types`. Promoting `pushGlScissorClip`/`pushGlStencilClip`/pop into render-gl is the right layering, but it removes ownership from a leaf package and changes `displayobject-gl`'s call sites. This crosses a package boundary — raise as a proposal before moving.
- **Context-loss recreation contract (Silver).** The `GlRecreatable` registry implies render-target / program / buffer owners across this package (and potentially leaves) self-register. Decide whether the contract is render-gl-internal only or a shared seam leaves participate in.
- **sRGB vs linear color space (Gold).** Must be decided jointly with `render-wgpu` and the Rust port's committed "sRGB pass-through" decision (conformance map). A unilateral choice here would break cross-backend and Rust↔TS conformance.
- **Non-separable blend modes.** Currently mapped to `null` (degrade to normal). The `registerGlBlendModeShader` seam (Silver) lets a leaf supply shader-based blending — confirm whether shader blending is render-gl's responsibility or the leaf's.
- **Types-first rule.** Every new type (`GlCapabilities`, `GlTextureDescriptor`, `GlTextureWrapKind`/`GlTextureFilterKind`, `GlDepthFuncKind`/`GlCullFaceKind`, `GlRenderStats`, `GlContextLossSignals`, `GlRecreatable`, `GlFramebufferStatusKind`) lands in `@flighthq/types` **before** the implementation. New `*Kind` values are PascalCase strings.

**Effort summary:** Bronze ≈ 4–5 focused days (mostly additive, low risk). Silver ≈ 1.5–2 weeks (texture/sampler + pipeline state are substantial; the clip move needs coordination). Gold ≈ 2–3 weeks plus the Rust mirror pass. None of the tiers require new dependencies; all additions are tree-shakable and preserve the single root `.` export and `"sideEffects": false`.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/render-gl` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

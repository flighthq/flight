---
package: '@flighthq/render-wgpu'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - prior review.md (2026-08-25)
  - assessment.md (2026-07-21)
  - source + tests (live tree, 2026-09-02)
---

# render-wgpu — Review

> Full re-survey of the **live tree** (`packages/render-wgpu/src/`, 29 source + 29 test files, 318 test cases). Compared against the prior review (2026-08-25, 14 source + 14 test / 96 tests), the package has roughly doubled in surface area: new modules for device loss (`wgpuDeviceLoss.ts`), antialiasing (`wgpuAntialias.ts`), compressed textures (`wgpuCompressedTexture.ts`), mipmaps (`wgpuMipmap.ts`), render textures (`wgpuRenderTexture.ts`, `wgpuRenderTexturePool.ts`), texture resolution (`wgpuTextureResolver.ts`, `explainWgpuTextureResolution.ts`, `enableWgpuTextureResolverGuards.ts`), external textures (`wgpuExternalTexture.ts`, `wgpuExternalImageSource.ts`), texture upload (`wgpuTextureUpload.ts`), pipelines (`wgpuPipeline.ts`), host backend (`wgpuHost.ts`), and elements (`wgpuElement.ts`). The `@flighthq/scene2d` layering inversion is fixed (moved to `devDependencies`). Device loss is implemented. Every source file has a colocated test file.

## Verdict

**solid -- 82/100.** A well-structured, subject-agnostic WebGPU backend core with strong opt-in discipline, a first-class capture path, and genuine device-loss observation. The package has matured meaningfully since the prior review: device loss is wired (`wgpuDeviceLoss.ts` with `observeWgpuDeviceLoss`, `enableWgpuDeviceSignals`, `getWgpuDeviceLoss`, `isWgpuDeviceLost`), the scene2d dependency inversion is resolved, mipmaps and anisotropic sampling are implemented (`wgpuMipmap.ts`, `getWgpuSampler` with wrap/mip-filter/anisotropy), texture resolution uses an open registry with guard and explain seams, surface antialiasing delivers 2x supersample resolve, and render textures provide device-locked pooled leases. The score is held from higher by: capture resource teardown leaking GPU allocations (North star #3 violation), the dead ternary branch in `drawWgpuFullscreenPass`, per-call bind-group allocation in the fullscreen pass hot path, stale in-source comments referencing absent API, uniform ring overflow remaining unguarded, Darken/Lighten blend inaccuracy under partial coverage, and the scissor stack having no consumer.

## Present capabilities

- **Render state lifecycle** (`wgpuRenderState.ts`) -- `createWgpuAcquisitionFromCanvasElement` (async, returns null for no WebGPU -- sentinel for expected failure), `createWgpuDeviceState` (device-only entity with `WgpuDeviceRuntime`), `createWgpuRenderState` (synchronous from a pre-acquired `WgpuHostAcquisition`; configures canvas `premultiplied` + `COPY_SRC`; allocates 4096-slot uniform ring clamped to `minUniformBufferOffsetAlignment`), `createWgpuRenderStateFromCanvasElement` (async convenience), `createWgpuOffscreenRenderState` (two overloads: from a device state + pipeline, or from a parent render state where it snapshots registrations and shares the device tier; returns `WgpuOffscreenRenderStateResult` with `reason: 'device-lost'` when the source device is lost), `destroyWgpuRenderState` (idempotent via WeakSet; destroys uniform buffer, particle instance buffer, depth-stencil, surface AA texture, quad-batch pool; decrements device-tier references and releases flight-owned acquisition when the last state is destroyed), `getWgpuSampler` (cached by numeric key packed from filter/wrap/mip-filter/anisotropy bits -- zero per-call string allocation; enforces WebGPU linear-filter requirement when `maxAnisotropy > 1`), `resolveWgpuApplyBlendMode` (walks parent chain for derived states). Runtime-slot pattern throughout, no `internal.ts` cast.

- **Device loss** (`wgpuDeviceLoss.ts`) -- `observeWgpuDeviceLoss` attaches one loss observer per physical device in `createMinimalDeviceRuntime`, records `GPUDeviceLostInfo` on the `WgpuDeviceRuntime.lost` field; `enableWgpuDeviceSignals` / `disposeWgpuDeviceSignals` arm the `onDeviceLost` signal (fires once, only for unexpected loss; orderly `device.destroy()` is suppressed); `getWgpuDeviceLoss` / `isWgpuDeviceLost` read the terminal fact. Charter Decision 2026-07-02 ("detect and signal minimum") is now implemented. Absent from the `device.lost` handler: `pushErrorScope`/`popErrorScope` and any resource-recreation path -- the announcement half is complete, the recovery half remains open (noted in status.md).

- **Frame loop** (`wgpuBackground.ts`) -- `beginWgpuFrame` (opens command encoder, resets ring/batch/mask/scissor; preserves prerequisite work when called after explicit encoder open), `renderWgpuBackground` (lazy depth-stencil reallocation, capture-texture redirect, AA view acquisition), `submitWgpuRenderPass` (writes used ring portion, encodes AA resolve before capture, encodes capture copy, submits, drains retired buffers and textures), `retireWgpuBuffer` / `retireWgpuTexture` (mid-frame GPU resource retirement with well-documented lifetime rationale), `withWgpuFrameBorrow` (temporarily lends encoder/pass boundary from a presentation state to an offscreen state; saves/restores all frame state including depth-stencil and color format; transfers retired resources to owner).

- **Pipeline + blend** (`wgpuShader.ts`) -- `getWgpuPipeline` keyed `blendMode-stencilMode-format` (format differentiates HDR `rgba16float` from canvas format); `getActiveWgpuPipeline` resolves stencil mode from mask depth; `getWgpuBlendState` shared by bitmap/batch/shape draw families; `BLEND_MODES` table realizes the fixed-function set: Add, Darken (min), Lighten (max), Multiply (premultiplied), Normal, Screen; `writeWgpuQuadUniforms` packs 128-byte ring slot (mat3x3 + alpha + color scale/bias + straight-alpha flag + corners/UVs); `setWgpuMatrixFromTransform` handles pixel-to-clip with Y-flip; mask fragment shader writes stencil only. Advanced/composite modes (Overlay, HardLight, Difference, Invert, Erase, Alpha, None) are handled elsewhere as `BlendEffect` / `CompositeEffect`, not in the node-property `BlendMode` enum -- this is by design, not a gap.

- **Draw path** (`wgpuDraw.ts`) -- `drawWgpuQuad` / `drawWgpuQuadWithTransform` / `submitWgpuQuadDraw` (dynamic-offset bind group 0, stencil reference from mask depth), `bindWgpuTexture` (WeakMap cache per `CanvasImageSource`; premultiplied upload with documented WebGPU vs WebGL `alphaType` asymmetry), `bindWgpuBitmapTexture` / `bindWgpuImageResourceTexture` / `bindWgpuCompressedImageTexture` (separate premultiplied/straight x linear/srgb caches per `TextureSource`; mip identity check prevents silent mip-level downgrades; version-based cache invalidation with retired-texture lifecycle), `bindWgpuVideoTexture` (per-frame dirty gate; resolution-change recreation; sampler resolved from `Texture.sampler` descriptor), `enableWgpuBlendModeSupport` (installs `applyWgpuBlendMode` on state), `resolveWgpuSmoothingBindGroup` (per-draw sampler selection -- never captured at upload time; mirrors GL `smoothingOverride`), `warmWgpuPipelines` (Normal + Add), `convertRgba8AlphaEncoding` (bidirectional premultiply/unpremultiply for material texture alpha correctness).

- **Texture resolution** (`wgpuTextureResolver.ts`, `explainWgpuTextureResolution.ts`, `enableWgpuTextureResolverGuards.ts`) -- open keyed registry (`TextureSourceKind` -> `WgpuTextureResolver`); `resolveWgpuTexture` dispatches through the registry with `registryMiss` notification; `registerStandardWgpuTextureResolvers` wires bitmap, image, and render-texture resolvers; `registerWgpuCompressedImageTextureResolver` adds compressed image support separately; `explainWgpuTextureResolution` returns `TextureResolutionExplanation` plain data (missing-kind / missing-resolver / registered); `enableWgpuTextureResolverGuards` enables render-registry guards plus a mipmap-degradation warning. Diagnostics-inversion rule is satisfied for this domain.

- **Render textures** (`wgpuRenderTexture.ts`, `wgpuRenderTexturePool.ts`) -- device-locked, explicitly leased `RenderTexture` lifecycle with `acquire`/`release` brackets on `WgpuRenderTexturePool`; `renderIntoWgpuRenderTexture` opens/closes a render pass bracket with try/finally; `writeWgpuRenderTextureTarget` provides lower-level multi-pass access; `explainWgpuRenderTexture` / `isWgpuRenderTextureReady` with guard notification; status tracking (unrendered / writing / ready / released); pool destruction handles both free and outstanding leases. `withWgpuRenderTextures` provides a RAII-style bracket that acquires N textures and releases on exit.

- **Offscreen targets + pool** (`wgpuRenderTarget.ts`, `wgpuRenderTargetPool.ts`) -- `createWgpuRenderTarget` with format parameter (HDR `rgba16float`) and supersample scale (`sampleCount: 4` -> 2x physical), `beginWgpuRenderPass` / `endWgpuRenderPass` (render-target stack save/restore with color format, depth-stencil, and render transform; `RenderPassPreserve` support for selective load-op), `drawWgpuRenderTargetResult` (Y-flipped composite with composed transform -- alias-safe), `resizeWgpuRenderTarget` (destroys old allocations, clears bind group cache), `setWgpuRenderTransform2D` (allocates fresh matrix to preserve saved reference). Pool matches on `(width, height, format, sampleCount)`.

- **Surface antialias** (`wgpuAntialias.ts`) -- opt-in 2x supersample texture + fullscreen linear resolve via `WgpuRenderOptions.antialias`; the supersample texture is lazily created/resized; resolve encodes a single fullscreen triangle pass from 2x to 1x before capture readback; scissor coordinates are scaled by `getWgpuSurfaceRenderScale` when the AA pass is active; `getWgpuSurfaceLogicalExtent` / `getWgpuSurfaceRenderExtent` distinguish logical vs physical dimensions.

- **Fullscreen pass** (`wgpuFullscreenPass.ts`) -- `createWgpuFullscreenPipeline` (N input-texture bind-group layouts + optional uniforms group), `drawWgpuFullscreenPass` (sets pipeline, bind groups, draws 3-vertex fullscreen triangle), `destroyWgpuFullscreenPipeline` (documented no-op for API symmetry). Consumed by `effects-wgpu`.

- **Scissor** (`wgpuScissor.ts`) -- `pushWgpuScissorRect` / `popWgpuScissorRect` / `applyWgpuScissorRect` (save/restore, not intersect); `setWgpuRenderPassScissorRect` scales by the supersample factor when the AA surface is active; clamps to non-negative integers and minimum 1x1.

- **Registries** -- `registerWgpuBitmapShader` (state-wide default shader on runtime, `wgpuShaderRegistry.ts`), `setWgpuShader` / `getWgpuShader` / `resolveWgpuShader` (per-node binding via WeakMap + lazy resolver install -- tree-shaken until first use, `wgpuShaderBinding.ts`), `registerWgpuMaterialRenderer` / `getWgpuMaterialRenderer` / `resolveWgpuMaterialRenderer` (open keyed registry with `StandardMaterialKind` fallback; unresolved = null, never built-in; registry miss reported once per kind, `wgpuMaterialRegistry.ts`).

- **Compressed textures** (`wgpuCompressedTexture.ts`) -- `detectWgpuCompressedTextureSupport` (BC/ETC2/ASTC feature queries), `getWgpuCompressedTextureFormat` / `hasWgpuCompressedTextureFormat` (native format resolution), `uploadWgpuCompressedTextureContainer` (handles 2D, cubemap, 2D-array shapes; RGBA CPU decode fallback for 2D-only when decoder is registered), `registerWgpuCompressedTextureUpload` / `registerWgpuCompressedTextureDecoder` (opt-in registry slots). Supports sRGB format pairs for BC, ETC2, and ASTC families. Supercompression, volume textures, and cubemap-arrays are explicitly rejected with null return.

- **Mipmaps** (`wgpuMipmap.ts`) -- `generateWgpuMipmaps` (per-level fullscreen-triangle downsample via cached format-keyed pipeline; uses the device's linear sampler), `getWgpuMipLevelCount`, `registerWgpuMipmapGeneration` (installs generator on runtime). Mipmap pipeline is cached at device tier per format (`mipmapPipelineCache`).

- **External textures** (`wgpuExternalTexture.ts`) -- `createExternalWgpuTexture` (wraps a caller-supplied `GPUTexture` as a `Texture` with sampler/wrap/anisotropy support; registers the `ExternalTextureSourceKind` resolver), `disposeExternalWgpuTexture` (removes from device-tier WeakMap cache).

- **Texture upload primitives** (`wgpuTextureUpload.ts`) -- `uploadWgpuTextureData` (rgba8 CPU pixels via `queue.writeTexture`), `uploadWgpuTextureElement` (DOM element via `queue.copyExternalImageToTexture`), `uploadWgpuTextureImageResource` (host-backed Image fast path).

- **External image source** (`wgpuExternalImageSource.ts`) -- `isWgpuExternalImageSourceReady` (readiness checks for Canvas, Image, Video, ImageBitmap, OffscreenCanvas, VideoFrame), `tryCopyWgpuExternalImageToTexture` (guarded copy with `InvalidStateError`/`OperationError` recovery -- source unavailability returns false, other errors propagate).

- **Capture readback** (`wgpuSurface.ts`) -- `enableWgpuFrameCapture` (redirects frame into offscreen `COPY_SRC` texture), `encodeWgpuFrameCapture` (copy texture to buffer within frame encoder; skips while buffer is mapped to avoid stacking GPU work), `createBitmapFromWgpuRenderState` (maps retained buffer, normalizes BGRA->RGBA, preserves premultiplied pixels with documented quantization rationale, configurable `timeoutMs` with race+abandon pattern). North star #5 is genuinely met.

- **Host backend** (`wgpuHost.ts`) -- `createWebWgpuHostBackend` (explicit browser adapter: requests BC/ETC2/ASTC features, maxBindGroups 5 when available), `installWgpuHostBackend` / `setWgpuHostBackend` (first-host-wins + custom override pattern), `getWgpuHostBackend` (resolution order: custom > installed host > built-in web).

- **Adapter capabilities** (`wgpuAdapterCapabilities.ts`) -- `getWgpuAdapterCapabilities` (float32-filterable, timestamp-query, maxTextureDimension2D, conservative maxSampleCount = 4).

- **Pipeline entity** (`wgpuPipeline.ts`) -- `createWgpuPipeline` (entity wrapping a `WgpuRenderRegistries` snapshot), `createEmptyWgpuRegistries` (typed registry tables for renderers, materials, effects, texture resolvers, shape rasterizer, stroke tessellator, compressed texture upload/decode, modifiers, velocity writers).

- **Test seam** (`wgpuTestHelper.ts`, `wgpuTestHelper.test.ts`) -- `installWgpuMock` (JSDOM shim with runtime WebGPU constants, mock device with `writeBuffer`/`writeTexture` validation, mock adapter with `maxBindGroups: 8`), `createWgpuRenderStateForTest`, `createReadyImageElementForTest`. Exported from barrel; consumed by `scene2d-wgpu`, `scene-wgpu`, `effects-wgpu` tests. Has its own colocated test file (fixing the prior review's gap).

Tests: 318 cases across 29 colocated test files. Every source module (excluding `contract.ts` and `index.ts`) has its test file.

## Gaps

Measured against the charter, the status.md open items, and a mature WebGPU backend core:

- **Capture resource teardown leak.** `destroyWgpuRenderState` destroys uniform buffer, particle buffer, depth-stencil, surface AA texture, and quad-batch pool -- but NOT `frameCaptureTexture` or `frameCaptureBuffer`. No `registerWgpuRenderStateTeardown` is installed for these by `enableWgpuFrameCapture`. A state that enabled capture and is then destroyed leaks two GPU allocations. This is a direct North-star-#3 (deterministic teardown) violation. The fix is local: either destroy them in `destroyWgpuRenderState` or register a teardown callback in `enableWgpuFrameCapture`.

- **Dead ternary in `drawWgpuFullscreenPass`.** Line 78: `const pass = dest !== null ? runtime.renderPass : runtime.renderPass;` -- both arms are identical. The `dest` parameter is accepted but ignored. Either honor `dest` (begin a pass into it) or remove the parameter and collapse the branch.

- **Per-call bind-group allocation in `drawWgpuFullscreenPass`.** A fresh `createBindGroup` is built per input per pass per frame (line 91-98). Unlike the render-target path (which caches its bind group on the target), the fullscreen pass creates and discards every frame. For a multi-pass effect recipe this generates N bind groups per frame that are immediately GC-eligible.

- **Uniform ring overflow unguarded.** 4096 slots per frame. Past that limit, `writeWgpuQuadUniforms` silently writes out of bounds in the `Float32Array` (values are dropped) and `submitWgpuRenderPass`'s `writeBuffer` fails with a confusing error. No guard module, no `explain*` seam. The diagnostics-inversion rule calls for a shakeable guard.

- **Stale in-source comments.** `wgpuAdapterCapabilities.ts` line 5: "pass the result as `options.adapterCapabilities`" -- no such option exists on `createWgpuRenderState`. Line 17: "enables GPU time measurement (`enableWgpuTimestampQueries`)" -- that function does not exist.

- **No profiling surface.** The charter's "What it is" names timestamp profiling; `getWgpuAdapterCapabilities` reports `supportsTimestampQuery` availability that nothing consumes. `enableWgpuTimestampQueries`, `getWgpuFrameGpuTime`, `encodeWgpuTimestampResolve` are all absent.

- **No effect-target MSAA.** The main surface has the 2x supersample path (`WgpuRenderOptions.antialias`), but offscreen render targets normalize requested sample counts to supersample-scale only. Effect-target multisample-capable pipeline variants remain absent. Pooled targets do now match on `sampleCount`, so the pool is ready; the pipeline variants are the missing piece.

- **No sampleable depth texture.** `getWgpuRenderTargetDepthTexture` does not exist. The depth-stencil texture is created with `RENDER_ATTACHMENT` usage only (no `TEXTURE_BINDING`), making it unsampleable. This blocks SSAO, screen-space fog, and depth-of-field on WGPU (noted in status.md).

- **No depth-write pipeline variant.** `getActiveWgpuDepthWritePipeline` is absent. The existing pipeline always sets `depthWriteEnabled: false`, so there is no opt-in z-ordered path (painter's order only).

- **Guard asymmetry with render-gl.** Only `enableWgpuTextureResolverGuards` exists; `render-gl` carries three guard modules (`enableGlRenderStateGuards`, `enableGlRenderTextureGuards`, `enableGlTextureResolverGuards`). North star #2 (sibling symmetry) calls for matching guard surfaces.

- **Scissor stack has no consumer.** `pushWgpuScissorRect` / `popWgpuScissorRect` / `applyWgpuScissorRect` are exported, tested, but referenced by nothing outside this package. `scene2d-wgpu` never applies them, so rect clips do not scissor on WGPU. The wiring belongs in that leaf cell.

- **Darken/Lighten partial-coverage inaccuracy.** `MIN`/`MAX` operations do not distribute over the premultiplied blend equation `(1-a)*dst + a*B(src,dst)`, so at zero alpha Darken wipes backdrop to black. Both want a destination-reading `BlendEffect`, matching the status.md note and the parallel note in `render-gl`.

- **Device loss recovery action half absent.** `onDeviceLost` fires and the terminal fact is recorded, but there is no resource-recreation path and no `pushErrorScope`/`popErrorScope` OOM guard. Parked as a design question per assessment.md.

- **Retired resources not drained on mid-frame destruction.** `retiredBuffers` and `retiredTextures` are drained only in `submitWgpuRenderPass`. If `destroyWgpuRenderState` is called between `renderWgpuBackground` and `submitWgpuRenderPass`, any mid-frame retired resources are orphaned. Minor in practice (destruction mid-frame is unusual) but worth noting.

## Charter contradictions

1. **"What it is" over-describes the live tree (reduced).** The charter names MSAA draw-and-resolve, the `sampleCount[-depthwrite]` pipeline key, and timestamp profiling as owned capabilities. The pipeline key is `blendMode-stencilMode-format` (no sampleCount, no depthwrite). The 2x supersample path exists but is not MSAA (it is a full-resolution render into a 2x texture + linear downsample, not a multisample resolve). Timestamp profiling is absent. This is reduced from the prior review: device-lost signals are now implemented.

2. **Decision 2026-07-02 "Context/device loss: detect and signal minimum" is now implemented.** `wgpuDeviceLoss.ts` provides detection (`observeWgpuDeviceLoss` on every device) and signaling (`enableWgpuDeviceSignals` / `onDeviceLost`). The detection-and-signal minimum is met. The recovery action half (resource recreation, error scopes) remains open -- an extension, not a contradiction.

3. **North star #1 (no subject dependency) is now satisfied.** `@flighthq/scene2d` has been moved from `dependencies` to `devDependencies`. No runtime source file imports it (verified -- zero hits outside test files). The layering inversion is resolved.

4. **North star #3 (deterministic teardown) vs the capture leak.** `destroyWgpuRenderState` still does not destroy `frameCaptureTexture` or `frameCaptureBuffer`. This is the only remaining teardown gap for state-owned GPU resources.

Otherwise the North stars hold well: strong `enable*`/`register*` opt-in gating (capture, blend support, shader binding, mipmap generation, texture resolvers, compressed texture upload all cost nothing un-opted), file-level symmetry with `render-gl` (Background/Draw/Element/FullscreenPass/MaterialRegistry/RenderState/RenderTarget(+Pool)/RenderTexture(+Pool)/Shader/ShaderBinding/ShaderRegistry/CompressedTexture/Mipmap/TextureResolver/TextureUpload/ExternalTexture/Antialias/DeviceLoss/Host/Pipeline/Surface/AdapterCapabilities/Scissor/ExternalImageSource line up), and correct runtime-slot usage (no `internal.ts` cast anywhere).

## Contract & docs fit

**Package -> contract:** types-first (all shapes in `@flighthq/types`, including `WgpuRenderStateRuntime`, `WgpuDeviceRuntime`, `WgpuDeviceSignals`, `WgpuPipeline`, `WgpuRenderRegistries`, `WgpuRenderTarget`, `WgpuRenderTexturePool`, `WgpuTextureEntry`, `WgpuFullscreenPipeline`, `WgpuAdapterCapabilities`); two blessed lanes (`.` root + `./contract`); `sideEffects: false`; no top-level registration; full unabbreviated `Wgpu` names; sentinels for expected failures (`createWgpuAcquisitionFromCanvasElement` -> null, `resolveWgpuMaterialRenderer` -> null, `resolveWgpuTexture` -> null, `bindWgpuTexture` -> null, scissor/draw no-op without a pass) and throws only for environment/API misuse (`createWgpuRenderState` configuration failure, `createBitmapFromWgpuRenderState` without capture, `withWgpuFrameBorrow` cross-device, render-target exceeds max dimension); paired pool brackets (`acquire`/`release` for render targets and render textures); `@webgpu/types` as a peer dependency.

**Diagnostics alignment:** `enableWgpuTextureResolverGuards` activates render-registry guards and the mipmap-degradation warning, matching the inversion rule. `explainWgpuTextureResolution` provides an `explain*` plain-data query matching the diagnostics convention. `explainWgpuRenderTexture` does the same for render texture status. Missing: guard/explain for uniform ring overflow, guard/explain for Darken/Lighten partial-coverage degrade, guards for render state and render texture matching `render-gl`'s three-guard surface.

**Contract/admin docs -> candidate revisions:**

- `wgpuAdapterCapabilities.ts` lines 5 and 17 contain stale references: `options.adapterCapabilities` (no such parameter) and `enableWgpuTimestampQueries` (absent function). These are transient comments that should be removed or corrected.
- `drawWgpuFullscreenPass` line 78 dead ternary -- both arms identical, `dest` parameter ignored.
- `wgpuRenderState.ts` comment at line 34 says "Ring buffer: 4096 draw slots per frame" -- accurate, but no guard exists for overflow (diagnostics-inversion rule wants one).
- gl<->wgpu barrel asymmetry (North star #2): `render-gl` does not export its shader registry or test helper from its barrel, while wgpu exports both. The readback seam names also differ (`glReadback.ts`/`readGlRenderTargetPixels` vs `wgpuSurface.ts`/`createBitmapFromWgpuRenderState`). These are not blockers but are symmetry debts against North star #2.

## Candidate open directions

The charter's nine Open directions remain live. This survey updates:

1. **Capture teardown fix (local).** `destroyWgpuRenderState` should destroy `frameCaptureTexture` and `frameCaptureBuffer` (or `enableWgpuFrameCapture` should register a teardown). Purely within-package, no design decision needed. This is the only remaining North-star-#3 violation.

2. **Fullscreen pass cleanup (local).** Collapse the dead `dest` ternary. Consider caching bind groups on the input targets (the render-target path already does this) to eliminate per-call bind-group allocation.

3. **Uniform ring overflow guard.** Add an `explain*` / guard seam that fires when the ring is exhausted, reporting the slot count and the per-frame draw count that exceeded it. Independent of ring-growth strategy.

4. **Guard parity with render-gl.** Add `enableWgpuRenderStateGuards` and `enableWgpuRenderTextureGuards` to match the three-guard surface `render-gl` exposes.

5. **Sampleable depth texture.** Add `TEXTURE_BINDING` usage to depth-stencil textures (at least on render targets) and expose `getWgpuRenderTargetDepthTexture`. This is the keystone under SSAO, screen-space fog, and depth-of-field on WGPU (status.md open item).

6. **Depth-write pipeline variant.** Add a `depthwrite` stencil mode to the pipeline cache key and a `getActiveWgpuDepthWritePipeline` function for opt-in z-ordered rendering.

7. **Profiling surface.** Implement `enableWgpuTimestampQueries`, `getWgpuFrameGpuTime`, and `encodeWgpuTimestampResolve` to consume the `supportsTimestampQuery` capability already reported by `getWgpuAdapterCapabilities`. Or trim the charter's "What it is" to exclude profiling if it is deferred.

8. **Stale comment cleanup.** Remove or correct the `options.adapterCapabilities` and `enableWgpuTimestampQueries` references in `wgpuAdapterCapabilities.ts`.

9. **Were MSAA, timestamps, and the `onContextResize` signal dropped deliberately?** Status.md records `onContextResize` as dropped (resize belongs to a presentation surface, not a device). Timestamps are absent with no recorded removal. MSAA is absent as native multisample; the 2x supersample path is the current AA realization. Settle whether the charter is trimmed or these are re-chartered as build items.

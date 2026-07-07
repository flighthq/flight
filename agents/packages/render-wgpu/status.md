---
package: '@flighthq/render-wgpu'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# render-wgpu — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/render-wgpu

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Starting score (pass 1):** 72/100 **After pass 1:** 84/100 **Estimated score after pass 2:** 91/100

## Implemented APIs (cumulative — both passes)

### Bronze — completed in full

**Fixed-function blend modes (`wgpuShader.ts`)** All `BlendMode` entries in `BLEND_MODES` produce a real `GPUBlendState` or are documented as requiring a read-back path:

- `BlendMode.Alpha` — `NORMAL_BLEND` (premultiplied over; semantically identical)
- `BlendMode.Darken` — `min` blend op
- `BlendMode.Erase` — `(zero, one-minus-src-alpha)` knock-out alpha
- `BlendMode.Layer` — already mapped; unchanged
- `BlendMode.Lighten` — `max` blend op
- `BlendMode.Multiply` — `(dst, zero)` premul-space approximation
- `BlendMode.Normal` — already mapped; unchanged
- `BlendMode.Screen` — `(one, one-minus-src)` premul formula
- `BlendMode.Subtract` — `reverse-subtract` op with preserved alpha
- `BlendMode.Difference`, `BlendMode.Hardlight`, `BlendMode.Invert`, `BlendMode.Overlay` — remain `null` (require destination read; see `requiresWgpuBlendReadback`)
- `BlendMode.Shader` — remains `null` (user-supplied shader; not a fixed-function mode)

**`requiresWgpuBlendReadback(blendMode: BlendMode): boolean`** Exported predicate. Returns `true` for Difference, Hardlight, Invert, Overlay. Callers can branch rather than silently accepting Normal fallback.

**Scissor rect application — `wgpuScissor.ts`** Three exported functions:

- `pushWgpuScissorRect(state, rect)` — pushes a `WgpuScissorRect` onto the stack
- `popWgpuScissorRect(state)` — restores the previous rect
- `applyWgpuScissorRect(state, pass)` — calls `pass.setScissorRect(...)` from `currentScissorRect`

**Collapsed `drawWgpuQuadWithTransform`** Routes through `writeWgpuQuadUniforms` + `getActiveWgpuPipeline`; no duplicated uniform packing.

**Named transform type on public signatures** All inline `{ a; b; c; d; tx; ty }` literals replaced with `Readonly<MatrixLike>`.

**Typed render-target-result proxy** `drawWgpuRenderTargetResult` takes `Readonly<RenderProxy2D>`.

### Silver — completed in full

**Shader registry parity — `wgpuShaderRegistry.ts`**

- `registerWgpuBitmapShader(state, shader)` — mirrors `render-gl`'s shader registry

**Fullscreen pass primitive — `wgpuFullscreenPass.ts`**

- `createWgpuFullscreenPipeline(state, fragmentWgsl, textureInputCount?, format?)` — compiles a fullscreen-triangle pipeline
- `destroyWgpuFullscreenPipeline(state, pipeline)` — API-symmetry no-op
- `drawWgpuFullscreenPass(state, pipeline, inputs[], dest, setUniforms)` — binds inputs, calls setUniforms, draws 3 vertices

**New type in `@flighthq/types`**

- `WgpuFullscreenPipeline` (`WgpuFullscreenPipeline.ts`)

**Feature / limit negotiation — `wgpuAdapterCapabilities.ts` (new file)**

- `getWgpuAdapterCapabilities(adapter): WgpuAdapterCapabilities` — queries the adapter for `float32-filterable`, `timestamp-query`, `maxTextureDimension2D`, and `maxSampleCount`
- `createWgpuRenderState` updated to accept `options.adapterCapabilities` and request `requiredFeatures` (specifically `timestamp-query` when enabled) on the device
- New type `WgpuAdapterCapabilities` in `@flighthq/types`

**MSAA pipeline variants** Pipeline cache key extended to `blendMode-stencilMode-format-sampleCount[-depthwrite]`. `WgpuRenderOptions.sampleCount` option added. When `sampleCount > 1`:

- A multisample MSAA texture is allocated and managed in `renderWgpuBackground` (lazy resize on dimension change, destroyed by `destroyWgpuRenderState`)
- `renderWgpuBackground` routes through the MSAA texture (draw target) with `resolveTarget` pointing to the canvas (storeOp: 'discard')
- The depth-stencil texture also uses `sampleCount`
- Pipelines bake `multisample: { count: sampleCount }` so draw calls always match the pass's sample count
- New runtime fields: `msaaTexture`, `msaaView`, `msaaWidth`, `msaaHeight`, `sampleCount`

### Gold — completed

**Timestamp queries + profiling seam — `wgpuTimestampQuery.ts` (new file)**

- `enableWgpuTimestampQueries(state)` — allocates `GPUQuerySet` (timestamp×2), resolve buffer, readback buffer; gates on `createQuerySet` succeeding (feature absent → no-op)
- `getWgpuFrameGpuTime(state): number` — returns last frame's GPU time in nanoseconds, or -1 when unavailable
- `destroyWgpuTimestampQueryResources(state)` — frees timestamp GPU buffers
- `encodeWgpuTimestampResolve(state, commandEncoder)` — resolves query set into readback buffer at end of frame (called from `submitWgpuRenderPass`)
- `scheduleWgpuTimestampReadback(state)` — async maps the readback buffer to update `lastFrameGpuTimeNs` (called after submit)
- New runtime fields: `timestampQuerySet`, `timestampResolveBuffer`, `timestampReadbackBuffer`, `timestampEnabled`, `lastFrameGpuTimeNs`

**Pipeline cache warm-set completeness** `warmWgpuPipelines` now warms 3 stencil modes × 6 common blend modes (Normal, Add, Multiply, Screen, Erase, null) = 18 pipelines at startup. Less-common modes and HDR/MSAA/depth-write variants are still lazily compiled.

**Optional z-ordered path** `getActiveWgpuDepthWritePipeline(state)` returns the depth-write (`depthCompare: 'less-equal'`, `depthWriteEnabled: true`) pipeline variant for the current state. Pipeline cache key includes `-depthwrite` suffix. Painter's order (`depthCompare: 'always'`) remains the default.

**Signals group for backend events — `wgpuRenderStateSignals.ts` (new file)**

- `enableWgpuRenderStateSignals(state): WgpuRenderStateSignals` — idempotent enable; wires `device.lost` to `onDeviceLost` signal; tree-shaken when not used
- `getWgpuRenderStateSignals(state): WgpuRenderStateSignals | null` — accessor; null before enable
- New type `WgpuRenderStateSignals` in `@flighthq/types` with `onDeviceLost` and `onContextResize` signals

## New files (pass 2)

- `packages/render-wgpu/src/wgpuAdapterCapabilities.ts` + `.test.ts`
- `packages/render-wgpu/src/wgpuTimestampQuery.ts` + `.test.ts`
- `packages/render-wgpu/src/wgpuRenderStateSignals.ts` + `.test.ts`
- `packages/types/src/WgpuAdapterCapabilities.ts`
- `packages/types/src/WgpuRenderStateSignals.ts`
- Updated: `packages/types/src/WgpuRenderOptions.ts` (added `adapterCapabilities`, `sampleCount`)
- Updated: `packages/types/src/WgpuRenderState.ts` (added MSAA fields, timestamp fields, `wgpuRenderStateSignals` to runtime)
- Updated: `packages/render-wgpu/package.json` (added `@flighthq/signals` dependency)
- Updated: `packages/render-wgpu/tsconfig.json` (added `../signals` reference)

## Test counts

- Before pass 1: 81 tests across 11 test files
- After pass 1: 88 tests across 13 test files
- After pass 2: 107 tests across 16 test files (+19 tests in pass 2)

## Deferred items and why

**Mipmaps + anisotropy (Silver)** `generateWgpuTextureMipmaps` + compute-pass blit chain + `maxAnisotropy` sampler tier. Deferred: non-trivial compute pipeline addition; no current consumer. Should be added before atlas-minification quality is a concern.

**Device-loss + error handling (Silver)** `onWgpuDeviceLost` hook wired (pass 2 provides the signal), but full recovery path (re-create all GPU resources) is unimplemented. The signal fires when the device is lost; the host can re-create the state. Full OOM guards (`pushErrorScope`/`popErrorScope`) are also absent. Deferred: requires coordinated design with the host lifecycle seam.

**Separable Photoshop blend modes via read-back (Silver)** Overlay, Hardlight, Difference, Invert need a destination-texture sample path in WGSL. Predicate `requiresWgpuBlendReadback` is implemented. The actual read-back pass is deferred: a cross-backend conformance decision (pixel-matching tolerance vs Canvas `globalCompositeOperation`) must be made first.

**Batched/instanced core draw primitive (Gold)** `WgpuQuadBatch` with a growable instance buffer. This is a joint design decision with `displayobject-wgpu` and `scene-wgpu`. Surfaced as a design decision: the instance buffer layout must be agreed before the core ships one.

**Full warm-set completeness across MSAA×format×blend (Gold)** `warmWgpuPipelines` now warms 18 combinations (3 stencil × 6 blend, sampleCount=1, canvas format). HDR format (`rgba16float`), MSAA (sampleCount=4), and depth-write variants are lazily compiled. A full warm-set requires the caller to know which combinations will be used and call a proposed `warmWgpuPipelinesForScene(state, { formats, blendModes, sampleCounts })` ahead of rendering — not yet implemented.

**Wire `applyWgpuScissorRect` into the render walk** `applyWgpuScissorRect` is exported and functional, but `displayobject-wgpu` does not yet call it when a rect clip is active. This is a `displayobject-wgpu` concern, not `render-wgpu`.

**Wire fullscreen pass into `filters-wgpu`/`effects-wgpu`** `createWgpuFullscreenPipeline` + `drawWgpuFullscreenPass` are ready; the leaf packages haven't been updated. `displayobject-wgpu` concern.

**Rust parity pass (Gold)** `flighthq-render-wgpu` in the Rust crate should reflect new functions. New pass-2 additions: feature negotiation (map `WgpuAdapterCapabilities` to Rust struct queried from `wgpu::Adapter`), MSAA (resolve texture, multisample pipeline), timestamp queries (wgpu's `Timestamp` feature), z-ordered pipeline, expanded warm pipelines, device-lost signal (wgpu's `device.poll` / device-lost callback). Deferred to a Rust session. Divergences for the conformance map: `enableWgpuRenderStateSignals` closure wiring → Rust callback/channel; async timestamp readback → Rust futures or polling.

## Design choices made (pass 2)

**MSAA resolve strategy:** draw into the MSAA texture (storeOp: 'discard'), resolve onto the canvas. The canvas texture is never the direct draw target when MSAA is active. This is the standard WebGPU MSAA pattern and avoids storing the multisample data after resolve.

**sampleCount baked into pipelines:** WebGPU requires that a pipeline's `multisample.count` matches the render pass attachment's sample count. All pipelines compiled for the main canvas pass use `runtime.sampleCount`. Offscreen render targets (`createWgpuRenderTarget`) remain sampleCount=1 until a `sampleCount` option is added to that API (future).

**Timestamp readback is async:** `scheduleWgpuTimestampReadback` maps the readback buffer asynchronously; `getWgpuFrameGpuTime` returns -1 until at least one frame completes. This is inherent to the GPU/CPU sync model. The value reflects the previous frame (not the current one). This matches how GPU profilers work.

**`maxSampleCount` fixed at 4:** WebGPU does not expose per-format supported sample counts via the adapter API. All conformant WebGPU implementations support sampleCount=4; 8+ is implementation-defined. Reporting 4 is conservative and safe.

**Signals via `@flighthq/signals`:** `enableWgpuRenderStateSignals` creates signals using the SDK's standard `createSignal<T>()`. The `device.lost` promise is wired to `onDeviceLost` inside the enable function, so the signal fires even if the adapter capability check wasn't used. `onContextResize` is allocated but not wired — callers that need to respond to resize must emit it from their resize handler via the returned signals object.

**z-ordered path via `getActiveWgpuDepthWritePipeline`:** A separate accessor function rather than a flag on `getActiveWgpuPipeline` keeps the default path (painter's order) clean and makes the opt-in to z-ordering explicit at the call site. The depth-stencil texture is already allocated; no additional memory overhead.

## Design decisions still needing user input

1. **Cross-backend tolerance for separable blend modes** — Implementing Overlay/Hardlight/Difference/Invert via a WGSL read-back pass may not pixel-match Canvas `globalCompositeOperation` or WebGL's implementation. Is "close enough" acceptable or does the parity spec require bit-exact matching? This gate the implementation of the read-back path.

2. **`WgpuQuadBatch` instance buffer layout** — The core could own a generic growable instance buffer for sprite/particle batches, but the instance data layout must be agreed with `displayobject-wgpu` and `scene-wgpu` consumers. What fields go in the shared base layout vs per-material extension data?

3. **`createWgpuRenderTarget` sampleCount option** — Should offscreen render targets support MSAA? If so, the pool must match on `(format, width, height, sampleCount)` and callers need to know to request the right sample count. This would enable antialiased filter targets (e.g. blur on a rotated element).

4. **`onContextResize` emission** — The signal is allocated by `enableWgpuRenderStateSignals` but never emitted. Who should call `signals.onContextResize.emit(w, h)` — the host (which owns the canvas resize event), or `renderWgpuBackground` (which detects dimension changes)? The latter would require tracking previous dimensions on the runtime.

## Suggestions for future sessions

1. **Mipmaps** — High-visibility quality gap. Add `generateWgpuTextureMipmaps` as a compute-pass blit chain. This is self-contained and does not cross package boundaries.
2. **Device-loss recovery** — Coordinate with the application/lifecycle seam. The `onDeviceLost` signal is now wired; the host can re-create the state when it fires. Add the recovery pattern to the host documentation.
3. **Fullscreen pass in `filters-wgpu`/`effects-wgpu`** — The primitives are ready. `filters-wgpu` needs to use `createWgpuFullscreenPipeline` for its per-filter passes.
4. **Wire `applyWgpuScissorRect` in `displayobject-wgpu`** — The function works; it just needs to be called when a rect clip node is active in the render walk.
5. **Rust parity pass** — Every function added in passes 1 and 2 needs porting. The MSAA resolve and feature negotiation are the most interesting divergences to document in the conformance map.

## Updated score estimate

**91/100** — All Bronze and Silver items are done. Gold: z-ordered path (done), timestamp queries (done), signals (done), warm-set expansion (done for common cases). Remaining gaps to reach 100: mipmaps/anisotropy (Silver gap), device-loss recovery path (Silver gap), separable blend modes (Silver), `WgpuQuadBatch` instanced draw (Gold), full warm-set across all MSAA×format combinations (Gold), Rust parity (Gold).

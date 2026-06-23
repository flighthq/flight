# New Package Spec: @flighthq/compute-wgpu

**Represents:** WebGPU compute seam — compute pipeline, bind groups, dispatch, storage buffers/textures, and readback — to author compute passes (particle simulation, GPU culling, IBL/environment bake, blur/SSAO in compute, skinning).

**Requested by:** rendering-gpu

## Fits

`@flighthq/compute-wgpu` is the missing _general-purpose compute_ counterpart to the GPU **render** core `@flighthq/render-wgpu`. The render core owns the `GPUDevice`, the swapchain, and the per-frame render pass; this package owns the _other_ WebGPU queue capability — `GPUComputePipeline` / `dispatchWorkgroups` — and the storage-resource plumbing (storage buffers/textures, readback) that render passes never needed. The renderer breadth review names this absence directly: "WebGPU's headline capability (compute passes …) is not exposed … the absence of any `dispatchCompute`/compute-pipeline seam is a notable omission."

- **Depends on:** `@flighthq/types` (header layer — all the `Compute*` types live here first), `@flighthq/entity` (entity/runtime split for `ComputeState`), and `@flighthq/geometry` only for any `out`-param math in helpers. It **shares the `GPUDevice`** with `render-wgpu` rather than owning one: a `ComputeState` is created _from_ a `WgpuRenderState`'s device/queue so compute and render interleave on one device, but the package does **not** depend on `render-wgpu` (it takes a `GPUDevice` + `GPUQueue`, not a `WgpuRenderState`, keeping it usable headless and renderer-free). It must not import `@flighthq/sdk`.
- **Why a sibling cell, not inside `render-wgpu`:** compute is needed by callers who never instantiate a renderer (a physics/particle step, an offscreen IBL bake, a culling pass that only produces a draw-indirect buffer). Folding it into `render-wgpu` would force the whole 2D render core into those bundles and couple compute lifetime to a swapchain. A separate `"sideEffects": false` cell tree-shakes to nothing when unused and keeps the render core focused. This mirrors the existing `render-wgpu` / `displayobject-wgpu` / `scene-wgpu` split: one technology core, many subject consumers.
- **Neighbor packages (consumers, built later, not here):** `particles-wgpu` (GPU particle simulation over this seam), a future `culling-wgpu` / frustum-cull-and-compact pass, and the IBL bake path that the breadth review's "environment / skybox / IBL" gap wants. Those own the _shaders and the domain_; this package owns only the _mechanism_ (pipeline, bind groups, dispatch, buffers, readback). It is the "verbs", they are the "nouns".
- **`-formats` neighbor:** none. There is no on-disk compute artifact to parse; WGSL compute source is a plain string the caller supplies. (A future `@flighthq/compute-wgpu-formats` would only earn its place if a precompiled-pipeline cache artifact is introduced — listed as an open question.)
- **Backend seam:** **none of the `*Backend`/`createWeb*` kind.** This is not a swappable platform capability — it _is_ the WebGPU backend, exactly as `render-wgpu` is. There is no "web vs native" seam at the TS layer; the swap is "which renderer technology" (`gl` has no compute in WebGL2; `wgpu` does), expressed by package choice, not a `set*Backend`. `isComputeWgpuSupported()` is the capability probe (mirrors `isWgpuSupported`).
- **Signals:** none at Bronze/Silver. Compute is request/response. An optional `enableComputeWgpuSignals` group (`onComputeError`, `onComputePipelineCompiled`) is a Gold concern for long-running async pipeline compilation and device-lost handling.
- **Rust crate:** `flighthq-compute-wgpu` — over `wgpu`'s `ComputePipeline` / `dispatch_workgroups`, sharing the `wgpu::Device`/`Queue` with `render-wgpu` (the canonical native host). 1:1 conformance target; deterministic compute (fixed workgroup size, integer math) is headlessly fingerprintable via `flighthq-capture` reading back a storage buffer — making it one of the better Rust↔TS conformance subjects despite being GPU-bound. Async pipeline creation resolves toward the native-clean seam (see the host async/`Send` note in `rust/index.md`); `host-web` bridges `!Send` internally.

Types are defined in `@flighthq/types` first, then implemented against here.

## Bronze

The minimum viable compute seam: create a state from a device, build one pipeline from WGSL, bind storage buffers, dispatch, and read a buffer back to the CPU. This alone unblocks GPU particle simulation and offscreen bakes.

- **Types in `@flighthq/types`:**
  - `ComputeState` (entity) — `{ readonly device: GPUDevice; readonly queue: GPUQueue }`; package-private `ComputeStateRuntime` (runtime tier) holds the pipeline cache (`Map<string, GPUComputePipeline>`), bind-group-layout cache, and a per-frame command encoder slot. Mirrors the `WgpuRenderState` / `WgpuRenderStateRuntime` split exactly.
  - `ComputePipelineDescriptor` — `{ shader: string; entryPoint: string; layout: ComputeBindGroupLayoutDescriptor; label?: string }` (plain data; `shader` is WGSL source).
  - `ComputeBindGroupLayoutDescriptor` — ordered `ComputeBindingDescriptor[]` (binding index = array index, the WebGPU convention made explicit).
  - `ComputeBindingDescriptor` — `{ kind: ComputeBindingKind; access?: ComputeStorageAccessKind }`.
  - `ComputeBindingKind` — string `*Kind` identifiers: `'StorageBuffer'`, `'UniformBuffer'`, `'StorageTexture'`, `'SampledTexture'`, `'Sampler'`.
  - `ComputeStorageAccessKind` — `'ReadOnly' | 'WriteOnly' | 'ReadWrite'` (the WGSL storage access qualifiers, as kinds).
  - `ComputeStorageBuffer` — `{ buffer: GPUBuffer; byteLength: number; usage: number }` (an owned storage buffer + its sizing).
  - `ComputeDispatchDimensions` — `{ x: number; y: number; z: number }`.
- **`@flighthq/compute-wgpu`:**
  - `isComputeWgpuSupported(): boolean` — capability probe (navigator.gpu present + device supports compute); sentinel-style, never throws.
  - `createComputeState(device: GPUDevice, queue: GPUQueue): ComputeState` — allocates the state + runtime caches. (Convenience `createComputeStateFromWgpuRenderState` lives in a consumer/`sdk`, **not** here, to avoid the `render-wgpu` dependency.)
  - `destroyComputeState(state: ComputeState): void` — `destroy*` (frees GPU buffers/pipelines it owns; leaves the shared device alone — the device's owner destroys it).
  - `createComputePipeline(state: ComputeState, descriptor: Readonly<ComputePipelineDescriptor>): GPUComputePipeline` — compiles + caches by descriptor key (last-write-wins cache, no rebuild on identical descriptor). Returns the pipeline; `null` on compile failure (sentinel — caller checks; misuse like a missing device throws).
  - `createComputeStorageBuffer(state: ComputeState, byteLength: number, usage?: number): ComputeStorageBuffer` — allocates a `STORAGE | COPY_DST | COPY_SRC` buffer by default; explicit allocation, explicit size.
  - `writeComputeStorageBuffer(state: ComputeState, buffer: Readonly<ComputeStorageBuffer>, data: Readonly<ArrayBufferView>, byteOffset?: number): void` — uploads via `queue.writeBuffer`.
  - `createComputeBindGroup(state: ComputeState, pipeline: GPUComputePipeline, resources: Readonly<ComputeBindResource[]>): GPUBindGroup` — binds buffers/textures/samplers in declared order (`ComputeBindResource` is the tagged union in `@flighthq/types`).
  - `dispatchCompute(state: ComputeState, pipeline: GPUComputePipeline, bindGroup: GPUBindGroup, dimensions: Readonly<ComputeDispatchDimensions>): void` — encodes one compute pass + `dispatchWorkgroups` into the state's encoder.
  - `submitComputePass(state: ComputeState): void` — finishes the encoder and submits to the queue (paired with the implicit `beginComputePass` inside `dispatchCompute`; an explicit `beginComputePass`/`endComputePass` pair arrives at Silver for multi-dispatch passes).
  - `readComputeStorageBuffer(state: ComputeState, buffer: Readonly<ComputeStorageBuffer>): Promise<ArrayBuffer | null>` — the readback path: copy to a `MAP_READ` staging buffer, `mapAsync`, return the bytes. `null` on map failure. This is the single most-requested capability (verifying culling output, capturing simulation state, conformance fingerprinting).
- **Effort:** one focused cell — pipeline cache + bind-group builder + dispatch + readback. The 80/20: a particle sim or an offscreen bake can be authored end to end. Readback is the fiddly part (staging buffer + async map); everything else is thin WebGPU plumbing.

## Silver

Competitive with what a real compute layer offers (wgpu/Dawn-tier ergonomics, the patterns a `wgpu`-based engine ships): storage textures, indirect dispatch, multi-dispatch passes, buffer pooling, push-constant-style uniform updates, and explicit timing/sync so compute composes with rendering in one frame.

- **Types in `@flighthq/types`:**
  - `ComputeStorageTexture` — `{ texture: GPUTexture; view: GPUTextureView; format: GPUTextureFormat; width: number; height: number }` (storage-image binding for blur/SSAO/IBL-bake-in-compute).
  - `ComputeIndirectBuffer` — `{ buffer: GPUBuffer; offset: number }` (a `dispatchWorkgroupsIndirect` argument buffer — the output of a culling/compaction pass feeds the next dispatch with no CPU round-trip).
  - `ComputeUniformBuffer` — small per-dispatch uniform block (sim dt, counts, params); ring-buffered like the render core's uniform ring.
  - `ComputePassDescriptor` — `{ label?: string; timestampWrites?: ComputeTimestampWrites }` for an explicit multi-dispatch pass.
  - `ComputeWorkgroupSize` — `{ x: number; y: number; z: number }` plus `getComputeWorkgroupCount(total, workgroupSize, out)` helper math (ceil-div, the universal dispatch-sizing footgun, made a named function).
  - Extend `ComputeBindingKind` with `'ReadOnlyStorageTexture'` / `'WriteOnlyStorageTexture'` access variants on `ComputeStorageAccessKind`.
- **`@flighthq/compute-wgpu`:**
  - `createComputeStorageTexture(state, descriptor): ComputeStorageTexture` and `destroyComputeStorageTexture(state, texture): void` — storage-image lifecycle (compute-written textures: blur, downsample, IBL prefilter mips).
  - `beginComputePass(state, descriptor?): void` / `endComputePass(state): void` — explicit pass scope so several `dispatchCompute` calls share one pass (the common case: a multi-stage simulation), instead of a pass per dispatch.
  - `dispatchComputeIndirect(state, pipeline, bindGroup, indirect: Readonly<ComputeIndirectBuffer>): void` — GPU-driven dispatch sizing (the culling → compact → draw chain stays on-device).
  - `createComputeUniformBuffer(state, byteLength): ComputeUniformBuffer` + `writeComputeUniform(state, uniform, data): void` — per-dispatch params via the ring buffer (avoids a new buffer per frame).
  - **Buffer pooling:** `acquireComputeStorageBuffer(state, pool, byteLength): ComputeStorageBuffer` / `releaseComputeStorageBuffer(pool, buffer): void` + `createComputeBufferPool()` / `destroyComputeBufferPool(state, pool)` — paired `acquire*`/`release*` brackets for transient per-frame scratch buffers (ping-pong simulation, reduction temporaries), matching the render core's `WgpuRenderTargetPool`.
  - **Ping-pong helper:** `createComputeBufferPingPong(state, byteLength): ComputeBufferPingPong` + `swapComputeBufferPingPong(target): void` — the read-from-A/write-to-B/swap pattern every iterative sim needs, as a named value type so the convention is one obvious thing.
  - **Render interop:** `copyComputeBufferToVertexBuffer(state, source, destination): void` and a documented rule for using a compute-written `ComputeStorageBuffer` directly as an instance/vertex buffer in `render-wgpu` (shared device, no copy) — this is the seam that makes "simulate on GPU, draw the result" a single-device, copy-free flow. The _type_ contract lives in `@flighthq/types` so `render-wgpu` can accept the buffer without depending on this package.
  - **Sync/timing:** `createComputeTimestampQuery(state): ComputeTimestampQuery` + `readComputeTimestamp(state, query): Promise<number | null>` — GPU-side pass timing (gated on the `'timestamp-query'` feature; returns `-1`/`null` when unsupported, sentinel-style).
  - `getComputeLimits(state): ComputeLimits` — surface `maxComputeWorkgroupsPerDimension`, `maxComputeInvocationsPerWorkgroup`, `maxComputeWorkgroupStorageSize` etc. as plain data so callers size dispatches correctly across adapters.
- **Cross-backend consistency:** there is no second compute backend in TS (WebGL2 has no compute), so "cross-backend" here means **Rust↔TS** consistency: the same WGSL, the same workgroup sizing, the same readback bytes. The committed conformance map records this as a wgpu-only subject (no `gl`/`canvas`/`dom` cells), and the readback path is the comparison instrument.
- **Effort:** storage textures + indirect dispatch + pooling are each bounded; the render-interop buffer-sharing contract is the design-heavy piece (it touches `render-wgpu`'s buffer expectations and must stay a `@flighthq/types` contract, not a cross-package import). This is the tier where GPU particles, GPU culling, and compute-blur become production-usable.

## Gold

The authoritative WebGPU compute layer: nothing a domain expert finds missing — full resource/error/limits coverage, the canonical built-in compute passes the engine actually needs, robust device-lost/async handling, exhaustive tests, and 1:1 Rust parity.

- **Types in `@flighthq/types`:**
  - `ComputeError` / `ComputeErrorKind` (`'CompilationFailed'`, `'OutOfMemory'`, `'DeviceLost'`, `'Validation'`) for structured, sentinel-returned failure reporting (no thrown error-wrapper types — returned or signaled).
  - `ComputePipelineCacheEntry` + a `getComputePipelineCacheKey(descriptor)` contract for explicit, inspectable caching.
  - `ComputeReductionKind` (`'Sum'`, `'Min'`, `'Max'`, `'Prefix'`) and `ComputeScanDescriptor` for the built-in reduction/prefix-sum passes (the primitives culling/sorting are built from).
  - `ComputeSortKind` (`'Bitonic'`, `'RadixKeyValue'`) for GPU sort (transparency depth sort, spatial hashing).
- **`@flighthq/compute-wgpu`:**
  - **Async pipeline path:** `createComputePipelineAsync(state, descriptor): Promise<GPUComputePipeline | null>` (uses `createComputePipelineAsync` to avoid frame hitches on first use) + `warmComputePipelines(state, descriptors): Promise<void>` (precompile, mirroring `warmWgpuPipelines`).
  - **Error & device-lost handling:** `pushComputeErrorScope(state, kind)` / `popComputeErrorScope(state): Promise<ComputeError | null>` wrapping WebGPU error scopes; `onComputeDeviceLost(state, listener): () => void`; and `enableComputeWgpuSignals(state)` for the multi-listener `onComputeError` / `onComputePipelineCompiled` groups (opt-in, owned here, tree-shaken until enabled).
  - **Canonical built-in compute passes** (the "nouns" that justify the mechanism, shipped as named, reusable passes rather than left to every consumer to re-derive):
    - `dispatchComputeReduction(state, input, kind, out): void` — parallel reduction (sum/min/max) — the building block for histograms, auto-exposure, bounds.
    - `dispatchComputePrefixScan(state, input, out): void` — prefix-sum / stream compaction — the core of GPU culling (compact visible indices) and particle allocation.
    - `dispatchComputeSort(state, keys, values, kind): void` — GPU key/value sort (bitonic + radix) for depth-sorted transparency and spatial bucketing.
    - `dispatchComputeFrustumCull(state, bounds, frustum, outVisible, outIndirect): void` — the breadth review's named "GPU-side culling / draw-list optimization" gap: read per-instance bounds, test against a `Frustum` (from `@flighthq/geometry`), compact survivors, and write a `ComputeIndirectBuffer` for the draw — the whole cull stays on-GPU.
    - `dispatchComputeBlurSeparable(state, source, target, radius): void` — compute-shader separable blur into a storage texture (the breadth review's "blur/SSAO done in compute") — shared with the IBL prefilter path.
    - `dispatchComputeMipChain(state, texture): void` — compute mip generation (no render-pass-per-level), the substrate for IBL prefiltered-environment mips.
  - **Subgroups / workgroup-storage introspection:** `hasComputeSubgroupSupport(state): boolean` and a documented workgroup-shared-memory budget helper so reductions/scans pick the optimal path per adapter.
  - **Skinning seam:** `dispatchComputeSkinning(state, vertices, joints, weights, matrices, out): void` — GPU vertex skinning into a storage buffer the mesh renderer draws (the breadth review's named "GPU skinning" use), again copy-free on the shared device.
- **Tests & docs:** colocated `*.test.ts` per source file (jsdom + a faked `WebGPU2` device the way `render-wgpu` mocks the context); a `functional`/`capture` compute scene whose readback buffer is fingerprinted as the conformance baseline; `dispatchCompute` alias-safety tests (output buffer == input buffer in `ReadWrite` access); and worked docs for the simulate-then-draw single-device flow.
- **Rust parity:** `flighthq-compute-wgpu` mirrors every public function (`dispatch_compute`, `read_compute_storage_buffer`, `dispatch_compute_frustum_cull`, …) over `wgpu`, with the reduction/scan/sort/cull built-ins ported and fingerprint-conformed against the TS readback baselines; the divergence map records WGSL-source and workgroup-size choices that must stay identical for byte-equal output.
- **Effort:** the built-in passes (reduction/scan/sort/cull/blur/mips) are each a small shader + a dispatch wrapper but collectively the bulk of the work and the part that makes this "the canonical compute layer" rather than raw plumbing. Async/error/device-lost handling is bounded but necessary for production. Order: ship reduction → prefix-scan → frustum-cull first (they unblock the renderer's culling gap), then sort/skinning/blur/mips.

## Boundaries

- **The render pass stays in `render-wgpu`.** This package owns _compute_ passes and storage resources only; the swapchain, the per-frame render pass, render targets, blend/stencil, and draw remain in `render-wgpu`. The device is **shared, not owned** here — whoever created the device destroys it.
- **No domain shaders / no simulation logic.** Particle forces, culling policy, IBL math, skinning rigs are _consumers_ (`particles-wgpu`, the IBL/environment bake, the mesh skinner). This package supplies the mechanism and the canonical low-level GPU primitives (reduction/scan/sort) those domains compose; it does not encode any domain's rules.
- **No WebGL2/Canvas/DOM compute "emulation."** WebGL2 has no compute shaders; there is deliberately no `compute-gl` fallback. CPU equivalents (the existing `surface` library does blur/morphology on the CPU; particle sim can run on CPU in `particles`) are the non-WebGPU path — the substrate-existence rule from `rust/index.md` applies: do not emulate a capability whose substrate is absent.
- **No platform `*Backend` seam.** Compute is a renderer-technology capability, not a host capability — there is no web-vs-native swap at the TS layer (contrast the platform-suite packages). The native swap is "which `flighthq-*-wgpu` crate," handled by package selection.
- **HDR target formats and the render-graph** (other breadth-review gaps) are not here — formats belong to `render-wgpu`/`types`, a frame-graph would be its own orchestration package consuming both render and compute.
- **`@flighthq/types` holds every `Compute*` type.** No compute type is defined inline in this package; the header layer is navigable to the full compute surface without importing the implementation, including the buffer-sharing contract `render-wgpu` reads.

## Open design questions

- **Device acquisition.** Should `createComputeState` take a bare `GPUDevice`/`GPUQueue` (renderer-free, headless-friendly — the proposed Bronze) with a thin `createComputeStateFromWgpuRenderState` convenience living in a consumer/`sdk`, or should it accept a `WgpuRenderState` directly (ergonomic but couples the cell to `render-wgpu` and forces the render core into compute-only bundles)? The spec assumes the former for tree-shaking; confirm.
- **Buffer-sharing contract location.** The "use a compute-written `ComputeStorageBuffer` as a `render-wgpu` vertex/instance buffer" interop is the crux. Keeping it a `@flighthq/types` data contract avoids a cross-package import, but the exact shape (does `render-wgpu` accept a `ComputeStorageBuffer`, or a narrower `{ buffer: GPUBuffer; ... }` interface both packages reference?) needs a decision before Silver.
- **Built-in passes vs. raw seam only.** Should the canonical reduction/scan/sort/cull/blur/skinning passes live _in this package_ (proposed Gold — they make it authoritative and directly close the renderer's culling gap), or in their respective consumer cells (`culling-wgpu`, IBL bake), leaving `compute-wgpu` a pure mechanism layer? The argument for here: they are reusable primitives many consumers share; the argument against: scope creep beyond "the seam."
- **Pipeline cache persistence.** A future `@flighthq/compute-wgpu-formats` for a precompiled-pipeline-cache artifact — worth it only if WGSL compile time becomes a measured startup cost. Defer until measured.
- **Async/`Send` seam (Rust).** `createComputePipelineAsync` and `mapAsync` readback are async; per `rust/index.md`, keep the `flighthq-types` seam native-clean and let `host-web` bridge `!Send`. Confirm the readback signature (sync-blocking on native via `capture`, async on web) does not fork the public surface.
- **Timestamp-query availability.** Timing is feature-gated and often unavailable on software adapters (and in the test mock). Confirm `-1`/`null` sentinels are sufficient and no consumer needs to _require_ timing.

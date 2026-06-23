# New Package Spec: @flighthq/render-graph

**Represents:** A declarative frame-graph / render-graph: a per-frame DAG of named passes that declare their resource (render-target/buffer) reads and writes, from which the package derives execution order, transient-resource lifetimes and aliasing, and the barrier/clear/resolve insertion needed to orchestrate 2D draw, post-process effects, filters, and 3D passes into one coherent frame.

**Requested by:** rendering-gpu

**Fits:**

`@flighthq/render-graph` is the orchestration layer that sits _above_ the backend render cores and _below_ the application loop. Today effects chain through ad-hoc runners, render targets are acquired/released by hand (`acquireGlRenderTarget` / `releaseGlRenderTarget`), and there is no single object that knows the whole frame's pass/resource dependency structure. This package is that object: passes and resources are declared as plain data, and the graph computes the schedule. It is the AAA-scope unifier the rendering-gpu review names in its final gap ("No render-graph / pass-dependency layer … at this breadth it would unify effects + post + 3D").

- **Dependencies:** `@flighthq/types` (header layer) and `@flighthq/render` (the backend-agnostic core — `RenderState`, `RenderTargetDescriptor`, the draw contracts). It must **not** import any concrete backend (`render-gl`, `render-wgpu`, `render-canvas`, `render-dom`) — the graph is backend-agnostic and reaches concrete targets through a `RenderGraphBackend` seam, exactly as `render` reaches concrete draws through registered renderers. It must not import `@flighthq/sdk`.
- **Position in the SDK:** one layer below `@flighthq/application`'s loop and above `render`/`render-*`. It consumes the existing `RenderTargetDescriptor` and per-backend target pools rather than reinventing them — the graph _plans_ target usage; the backend seam _allocates_ via the existing pooled `acquire*`/`release*` paths. `@flighthq/effects`, `@flighthq/filters`, and `scene-*` become pass _producers_ that hand the graph a pass node; they do not depend on it.
- **Neighbor packages:** `@flighthq/render` (core it builds on), `@flighthq/effects` and `@flighthq/filters` (pass sources), `@flighthq/scene` / `scene-gl` / `scene-wgpu` (3D passes). No `-formats` neighbor is warranted at Bronze/Silver — a render graph is built in code, not loaded from a file. A future `@flighthq/render-graph-formats` could parse an authored JSON/declarative pipeline description (a "graph file") into a `RenderGraph`; that is the one place the `-formats` pattern applies, and it stays out until there is a real authored format (see Gold / Open questions).
- **Backend seam:** yes — `RenderGraphBackend` (defined in `@flighthq/types`) is the swappable adapter that turns the planned graph into real GPU/Canvas/DOM work: allocate/alias/free transient targets, begin/end a pass, insert a barrier, blit/resolve. Surfaced with `getRenderGraphBackend` / `setRenderGraphBackend` / `createWebRenderGraphBackend` over a `RenderState`, plus per-backend constructors (`createGlRenderGraphBackend(state)`, `createWgpuRenderGraphBackend(state)`) living in the respective backend packages — not here — so the graph stays tree-shakable and backend-free. (The "web default" here is the Canvas/GL-over-DOM-canvas backend, matching the SDK's always-available web posture.)
- **Rust crate:** `flighthq-render-graph` under `crates/`, a 1:1 mirror. Free functions over `&mut RenderGraph` / `&RenderGraphBackend`; the planner is deterministic value math (DAG topo-sort + lifetime/aliasing computation) and belongs to the conformance-testable set — the _plan_ (pass order, alias assignments, barrier list) is a deterministic artifact that can be fingerprinted and compared TS↔Rust independent of any GPU. The execution is driven by the host's `render-wgpu` / `host-*` the same as every other render path. Recorded in the conformance map.

Types are defined in `@flighthq/types` first (the header layer), then implemented in `@flighthq/render-graph` against them.

## Bronze

The minimum viable, genuinely useful version: declare passes and the targets they read/write, get a correct execution order and automatic transient-target allocation/free, and execute the frame through a backend seam. This replaces hand-wired effect runners with one declared frame for the common linear-and-branching post chain.

- **Types in `@flighthq/types`:**
  - `RenderGraphResourceKind` — string `*Kind` identifiers for the resource classes the graph schedules: `RenderTargetResourceKind = 'RenderTargetResource'` (the only one at Bronze; buffers/compute arrive later). Plain PascalCase strings, vendor-prefixed for custom kinds.
  - `RenderGraphResourceId` — an opaque `number` newtype-style id (a `-1` sentinel for "none/invalid"), the handle returned when a resource is declared.
  - `RenderGraphResourceDescriptor` — plain data describing a transient target: `{ kind: RenderGraphResourceKind; target: RenderTargetDescriptor; transient: boolean; name: string }` (reuses the existing `RenderTargetDescriptor` from `render` rather than redefining size/format).
  - `RenderGraphAccess` — `'read' | 'write' | 'readWrite'` (how a pass touches a resource; drives ordering and aliasing).
  - `RenderGraphResourceUse` — `{ resource: RenderGraphResourceId; access: RenderGraphAccess }`.
  - `RenderGraphPass` — plain pass node: `{ name: string; reads: readonly RenderGraphResourceUse[]; writes: readonly RenderGraphResourceUse[]; execute: RenderGraphPassExecute }`.
  - `RenderGraphPassExecute` — the per-pass callback type `(context: RenderGraphPassContext) => void` (a direct callback, not a signal — one guaranteed callsite per pass).
  - `RenderGraphPassContext` — what a pass receives at execution: resolved physical targets for its declared resources plus the backend handle (`{ backend: RenderGraphBackend; getInput(resource): RenderTargetHandle; getOutput(resource): RenderTargetHandle }`).
  - `RenderGraph` — the entity (declared passes + resources + the compiled plan slot, opaque runtime state held separately).
  - `RenderGraphBackend` — the seam (Bronze methods only): `allocateTransientTarget`, `freeTransientTarget`, `beginGraphPass`, `endGraphPass`, `blitGraphTarget`.
- **Graph construction + declaration in `@flighthq/render-graph`:**
  - `createRenderGraph(state, options?): RenderGraph` — allocates a graph bound to a `RenderState`.
  - `resetRenderGraph(graph): void` — clear passes/resources to rebuild the graph next frame (graphs are rebuilt per frame; this is the cheap reuse path, no allocation).
  - `declareRenderGraphTarget(graph, descriptor): RenderGraphResourceId` — register a transient (or imported) target, returns its handle.
  - `importRenderGraphTarget(graph, target): RenderGraphResourceId` — bring an externally-owned target (e.g. the swapchain/backbuffer, or a persistent cache target) into the graph as a non-transient resource the planner must not alias or free.
  - `addRenderGraphPass(graph, pass): void` — add a declared pass.
- **Planning (the deterministic core):**
  - `compileRenderGraph(graph): boolean` — topologically orders passes by their read/write dependencies, **culls** passes whose outputs are never read (dead-pass elimination), computes each transient resource's first-write→last-read lifetime, and assigns aliasing groups (resources with disjoint lifetimes and identical `RenderTargetDescriptor` may share one physical target). Returns `false` on an unschedulable graph (a cycle) — a sentinel, not a throw, since a malformed user graph is an expected failure case to report, while genuinely impossible internal states stay assertions.
  - `getRenderGraphPassOrder(graph): readonly number[]` — the compiled execution order (also the fingerprintable plan artifact for conformance).
  - `hasRenderGraphCycle(graph): boolean` — explicit cycle query for diagnostics.
- **Execution:**
  - `executeRenderGraph(graph, backend): void` — walks the compiled order, asks the backend to allocate/alias transient targets at first use and free them after last use, invokes each pass's `execute` with a resolved `RenderGraphPassContext`, and inserts the begin/end target transitions. Must `compileRenderGraph` first if dirty.
- **Web backend default:** `createWebRenderGraphBackend(state): RenderGraphBackend` exposed here only as the thin always-available fallback over the canvas render state; the GL/WGPU backends register their own via `setRenderGraphBackend`.
- **Tests:** colocated `*.test.ts` (topo order correctness, dead-pass culling, cycle → `false`, lifetime computation, two disjoint-lifetime passes alias one target, imported target never aliased/freed, alias-safe plan recompute on `reset`).

Effort: medium. The 20% that delivers 80%: declare → compile → execute with transient aliasing replaces every hand-wired effect runner and target-pool dance, and gives the SDK one place that owns the frame's structure.

## Silver

Competitive and solid — matches what a well-regarded modern render graph (FrameGraph-class) offers: barrier/transition insertion, history (ping-pong) resources, sub-resources and mip handling, an effects/filters bridge so the existing AAA effect suite flows through the graph, multi-target outputs, and conditional/optional passes.

- **Types in `@flighthq/types`:**
  - `RenderGraphResourceState` — tracked resource state for transition computation: `'undefined' | 'renderTarget' | 'shaderRead' | 'transferSrc' | 'transferDst' | 'present'`.
  - `RenderGraphBarrier` — a computed transition: `{ resource: RenderGraphResourceId; from: RenderGraphResourceState; to: RenderGraphResourceState }` (the backend realizes it; on WebGL it may be a no-op/flush, on WebGPU a real usage transition).
  - `RenderGraphHistoryResource` — a ping-pong pair `{ current: RenderGraphResourceId; previous: RenderGraphResourceId }` for temporal effects (TAA, motion blur, temporal denoise) that read last frame while writing this frame.
  - `RenderGraphSubresource` — `{ resource: RenderGraphResourceId; mipLevel: number; arrayLayer: number }` so a pass can read/write a specific mip/layer (mip-chain downsample passes, cubemap faces).
  - `RenderGraphPassCondition` — `(graph: Readonly<RenderGraph>) => boolean` for optional passes (skip bloom when intensity is 0, skip SSAO when disabled).
  - `RenderGraphEffectPass` — a typed pass node that carries an `effect` descriptor (from `@flighthq/effects`) + input/output resource ids, so the effects suite plugs in without each effect knowing the graph.
  - Extend `RenderGraphBackend` with `transitionGraphResource`, `resolveGraphTarget` (MSAA resolve), `generateGraphMips`, and a `clearGraphTarget` (load-op control).
- **Barrier / transition planning:**
  - `computeRenderGraphBarriers(graph): readonly RenderGraphBarrier[]` — per-pass read-after-write / write-after-read hazard tracking that derives the minimal transition set; folded into `compileRenderGraph` and surfaced for inspection/conformance.
  - Load/store-op inference: `RenderGraphPass` gains `loadOp`/`storeOp` hints (`'clear' | 'load' | 'discard'`) so the planner can skip clears the graph proves are fully overwritten (a real perf win and a parity-relevant decision).
- **History / temporal:**
  - `declareRenderGraphHistory(graph, descriptor): RenderGraphHistoryResource` — declare a double-buffered resource; `advanceRenderGraphHistory(history): void` swaps current/previous between frames.
- **Mip / sub-resource passes:**
  - `declareRenderGraphMipChain(graph, descriptor, levels): readonly RenderGraphResourceId[]` and sub-resource reads/writes via `RenderGraphSubresource` in a pass's `reads`/`writes`, enabling the bloom downsample/upsample pyramid and SSAO blur chains as first-class graph nodes.
- **Effects & filters bridge (the unifier the review names):**
  - `addRenderGraphEffectPass(graph, effect, input, output): void` — adds an `@flighthq/effects` descriptor as a graph pass; the graph owns its intermediate targets and ordering. This is the seam that lets the existing AAA effect suite (Bloom, FXAA, SMAA, SSAO, DepthOfField, MotionBlur, etc.) run _through_ the graph instead of a bespoke runner.
  - `addRenderGraphFilterPass(graph, filter, input, output): void` — same for `@flighthq/filters` per-primitive image effects when they are composited as full-target passes.
  - `buildRenderGraphEffectChain(graph, effects, input, output): RenderGraphResourceId` — convenience that wires a linear effect chain into properly-aliased ping-pong targets and returns the final resource (the common post stack, now declarative).
- **Conditional / optional passes:** `addRenderGraphPass` honors an optional `condition: RenderGraphPassCondition`; culled passes (by condition or by dead-output) are skipped before allocation.
- **Multiple render targets (MRT):** a pass may declare multiple `writes` to distinct color attachments (G-buffer passes for deferred 3D), with the backend seam binding them as one render pass.
- **Diagnostics:**
  - `describeRenderGraph(graph): RenderGraphSummary` — a plain-data dump (passes in order, resources with computed lifetimes, alias groups, barriers) for logging.
  - `exportRenderGraphDot(graph): string` — Graphviz DOT of the compiled DAG for visual debugging (a string generator, no I/O).
- **Tests:** barrier minimality, load-op clear-skip correctness, history swap aliasing, mip-chain lifetimes, effect-chain ping-pong target reuse, conditional-pass culling, MRT single-pass binding, DOT/summary snapshot.

Effort: medium-large. Barriers + load/store inference and the effects/filters bridge are the substantial pieces; history, mips, and conditions are each self-contained additions on the Bronze planner.

## Gold

Authoritative / AAA — the canonical frame-graph reference for the SDK: compute passes, async/parallel scheduling hints, buffer resources, split-barrier and queue-aware planning, persistent cross-frame resources, full validation/error reporting, memory budgeting, exhaustive tests/docs, and 1:1 Rust parity with a fingerprintable plan.

- **Types in `@flighthq/types`:**
  - `RenderGraphBufferResourceKind = 'RenderGraphBufferResource'` plus `RenderGraphBufferDescriptor` (`{ byteLength; usage: RenderGraphBufferUsage }`) — buffers as first-class graph resources for compute interop (particle simulation buffers, GPU skinning, indirect-draw args).
  - `RenderGraphComputePass` — a pass that declares buffer/texture reads-writes and a `dispatch: { x; y; z }`, scheduled and barriered alongside render passes. This is the WebGPU compute seam the review flags as missing, expressed at the graph layer rather than ad hoc.
  - `RenderGraphQueue` — `'graphics' | 'compute' | 'transfer'` and `RenderGraphAsyncHint` so the planner can mark passes for async-compute overlap where a backend supports it.
  - `RenderGraphPersistentResource` — a resource whose contents survive across frames (TAA history that the graph must not alias/clear; persistent shadow atlases), distinct from per-frame transients and from imported externals.
  - `RenderGraphValidationIssue` — `{ severity: 'error' | 'warning'; code: string; pass: number; message: string }` for structured validation output (read-before-write, missing producer, format mismatch on alias, oversized budget).
  - `RenderGraphMemoryBudget` / `RenderGraphMemoryReport` — declared budget and the planner's computed peak transient memory after aliasing.
  - Extend `RenderGraphBackend` with `dispatchGraphCompute`, `createGraphBuffer`/`destroyGraphBuffer`, split-barrier (`beginGraphBarrier`/`endGraphBarrier`), and queue submission hints.
- **Compute & buffers:**
  - `addRenderGraphComputePass(graph, pass): void`, `declareRenderGraphBuffer(graph, descriptor): RenderGraphResourceId` — full compute-pass scheduling with buffer lifetime/aliasing identical in spirit to target aliasing, so compute and raster passes share one dependency model.
  - `addRenderGraphIndirectDrawPass(...)` — GPU-driven draw where a compute pass writes indirect args a later raster pass consumes (the headline GPU-culling/indirect path the review wants).
- **Advanced scheduling:**
  - `compileRenderGraph` gains split-barrier placement (begin transition as early as the last read allows, end it just before the next use) and async-compute overlap planning behind `RenderGraphAsyncHint`; both are inert no-ops on backends that cannot honor them (WebGL2), keeping the plan portable.
  - `getRenderGraphMemoryReport(graph): RenderGraphMemoryReport` and `setRenderGraphMemoryBudget(graph, budget)` — peak-transient-memory accounting after aliasing, with a validation warning when a budget is exceeded.
- **Persistent / cross-frame resources:** `declareRenderGraphPersistentTarget(graph, descriptor): RenderGraphResourceId` with stable identity across frames (shadow atlases, IBL bakes, TAA history), excluded from transient aliasing and freed only on `disposeRenderGraph`.
- **Validation & errors (full coverage):**
  - `validateRenderGraph(graph): readonly RenderGraphValidationIssue[]` — exhaustive structural validation (read-before-write, dangling resource, alias format/size mismatch, unconsumed write that is _not_ an imported/persistent output, compute/raster queue hazard). Returns issues as data; only genuine API misuse (declaring a pass after execution has begun) throws.
  - Defined behavior for every degenerate graph: empty graph, single-pass graph, all-culled graph, self-reading pass via history — each documented and tested, returning sentinels rather than throwing.
- **3D orchestration (closing the review's frontier gaps at the graph layer):** the graph is the place shadow passes, the skybox/IBL bake, the G-buffer, lighting, and the post chain are declared and ordered. Provide `RenderGraphPass` recipes — `addRenderGraphShadowPass`, `addRenderGraphGBufferPass`, `addRenderGraphLightingPass` — as thin pass-builders (the _techniques_ themselves live in `scene-*`/`lighting`/a future `shadow` package; the graph only sequences them). These make "unify effects + post + 3D" concrete.
- **Lifecycle:** `disposeRenderGraph(graph): void` (detach signals, release graph-held references — GC path) vs. `destroyRenderGraph(graph, backend): void` (free persistent GPU targets/buffers the graph owns — deterministic resource free), honoring the distinct teardown verbs.
- **Signals (opt-in):** `enableRenderGraphSignals(graph)` exposing `onRenderGraphCompile` / `onRenderGraphPassExecute` / `onRenderGraphValidationFailed` via `@flighthq/signals`, behind the `enable*` group so the default bundle stays signal-free (used by a future graph debugger/inspector).
- **`@flighthq/render-graph-formats` neighbor (if an authored format lands):** `parseRenderGraphDescription(json): RenderGraphDescription` + `buildRenderGraphFromDescription(state, description): RenderGraph` to load a declarative pipeline from a file — the `-formats` split, kept out of the core package so the runtime graph stays format-free and tree-shakable.
- **Docs & tests:** exhaustive planner tests (split barriers, async overlap inertness on WebGL, compute/buffer aliasing, memory budget accounting, persistent-resource survival, every validation code, indirect-draw producer→consumer ordering); doc comments stating ownership/aliasing/allocation/coordinate semantics per the source-style rules; `npm run api render-graph` reviewed for naming symmetry against `render`.
- **Rust parity:** `flighthq-render-graph` mirrors every function; the **plan** (pass order, alias groups, barrier list, memory report) is fingerprinted and compared TS↔Rust in the conformance suite independent of GPU execution — a clean deterministic conformance reference. Recorded in the conformance map; execution rides the shared `render-wgpu` present seam.

Effort: large, cleanly partitioned — compute/buffer scheduling, advanced (split/async) barrier planning + memory accounting, full validation, and the Rust plan-parity mirror are the four substantial pieces; the 3D recipe builders and the optional `-formats` neighbor are incremental.

## Boundaries

- **The graph plans; it does not draw.** No primitive rasterization, no shader compilation, no texture upload lives here. A pass's `execute` calls into `render-*` draws and the existing effect/filter backends; the graph only orders passes, manages transient target lifetime/aliasing, and inserts transitions. Concrete GPU work stays in `render-gl` / `render-wgpu` / `render-canvas` / `render-dom`.
- **It does not own the render target implementation.** Target _allocation_ remains the backends' pooled `acquire*`/`release*` paths via `RenderGraphBackend`; the graph reuses `RenderTargetDescriptor` from `render` and never redefines size/format/MSAA. `render-graph` decides _which_ targets exist and _when_; the backend decides _how_ they are made.
- **Effects, filters, and 3D techniques stay in their packages.** Bloom/SSAO/FXAA descriptors and their backend passes stay in `@flighthq/effects` + `effects-*`; per-primitive filters in `@flighthq/filters` + `filters-*`; shadow/IBL/skybox/G-buffer _techniques_ in `scene-*` / `lighting` / a future `shadow` / `environment` package. `render-graph` provides the pass-builder seams that wire them into a frame, not their implementations. Those packages do **not** depend on `render-graph`.
- **No application loop, no frame timing.** `@flighthq/application` owns the main loop and calls `executeRenderGraph` once per frame; the graph is frame-driver-agnostic and holds no clock.
- **No authored file format in the core package.** Building a graph is a code activity. Any JSON/declarative pipeline loading is the `@flighthq/render-graph-formats` neighbor (Gold, conditional), kept out so the runtime stays format-free and tree-shakable.
- **No global mutable state / eager registration.** Backends are installed per `RenderState` via `setRenderGraphBackend` (opt-in), never at module top level; `"sideEffects": false`, single root `.` export.

## Open design questions

- **Per-frame rebuild vs. cached compiled graph.** A render graph is conventionally rebuilt every frame (cheap declaration, fresh culling against per-frame conditions). But recompiling topo-order + aliasing each frame has a cost. Proposal: `resetRenderGraph` + redeclare as the default cheap path, with an optional dirty-flag fast path that reuses the previous compilation when the pass/resource structure is unchanged. Confirm which is the documented golden path and the conformance baseline.
- **How much does the graph reuse the existing per-backend target pools vs. own its own aliasing allocator?** The backends already have `GlRenderTargetPool` with `acquire*`/`release*`. The graph's aliasing wants finer control (assign N logical resources to M physical targets by lifetime). Decide whether `RenderGraphBackend.allocateTransientTarget` is a thin wrapper over the existing pool or a dedicated aliasing allocator — this affects both memory accounting accuracy and how much new code each backend must add.
- **Barrier model on WebGL2 vs. WebGPU.** WebGPU has explicit usage transitions; WebGL2 has implicit ordering with occasional `flush`/feedback-loop hazards. The `RenderGraphBarrier` type is computed uniformly, but its realization diverges sharply. Confirm that barriers are inert no-ops on the GL backend (relying on GL's ordering) except where a feedback loop forces a copy — and that this divergence is recorded in the conformance map rather than treated as a bug.
- **Is the plan itself the conformance artifact, or only the rendered output?** The deterministic plan (order/alias/barriers/memory) is attractive to fingerprint directly for TS↔Rust parity without GPU. But aliasing assignments could legitimately differ between implementations while producing identical pixels. Decide whether conformance asserts plan-identity (stricter, simpler to debug) or only output-identity (looser, allows allocator freedom) — likely output-identity for pixels plus a _separate_ plan snapshot test guarded by a documented divergence allowance.
- **Compute-pass seam location (Gold).** The WebGPU compute capability the review wants could live as a low-level `render-wgpu` primitive _and_ as `RenderGraphComputePass`. Decide whether compute is only ever scheduled through the graph (clean dependency model, one path) or also exposed as a standalone `dispatchWgpuCompute` for users who do not want a graph — and whether the latter belongs in `render-wgpu` rather than here.
- **Does `addRenderGraphEffectPass` belong here or in `effects`?** The bridge needs to know both an `effects` descriptor and the graph's resource model. Placing it in `render-graph` keeps `effects` graph-free (good for tree-shaking effects standalone) but means `render-graph` imports `effects` types. Confirm the dependency direction — likely `render-graph` depends on `@flighthq/types`' effect descriptors only, not on `@flighthq/effects` runtime, so the bridge stays a data adapter.

# New Package Spec: @flighthq/devtools

**Represents:** Opt-in developer tooling for a running Flight app — frame/timing stats, draw-call and triangle counters, scene-graph inspection, GPU timing, and a render overlay — exported for SDK consumers, not just internal CI.

**Requested by:** missing-domains (gap #9 — "No debugging/devtools/profiling beyond `log`").

## Fits

- **Dependencies:** `@flighthq/types` (all shared shapes), `@flighthq/signals` (the `enable*` stat-stream groups), `@flighthq/log` (structured emission of profiler snapshots). Reads `RenderState` from `@flighthq/render` and the scene graph through `@flighthq/node` feature aliases (`HierarchyNode`, `BoundsNode`, `Transform2DNode`) — but does **not** import `@flighthq/render`/`@flighthq/node` for types; those live in `@flighthq/types` per the header rule. The overlay's drawing reuses the host's existing renderer (it is just more display objects / a text label), so devtools never depends on a concrete `render-*` backend. No new third-party dependencies.
- **Neighbors:** sits beside `@flighthq/log` (declarative knowledge spine) the way an inspector sits beside a logger. Conceptually parallel to the event-style platform capabilities (`network`, `power`) in that nothing runs until a `create*`/`enable*`/`attach*` call. Distinct from the CI-facing `tools/capture` + parity harness, which is build-time tooling; devtools is a _shippable consumer surface_.
- **Hook points (the load-bearing seams that make zero-cost-when-unused possible):**
  - **Counters** ride the render core's existing extension points rather than new always-on branches. `registerRenderer(state, kind, renderer)` is wrapped at opt-in time by a counting proxy so each `renderer.draw` increments a frame counter; `walkNode(state, root, visit)` / `RenderProxyVisitor` provide node-visit and visibility counts; `installRenderAdaptHook(fn)` is the existing global hook devtools attaches to for adapt/draw lifecycle. None of this is referenced unless `enableRenderCounters(state)` is called.
  - **GPU timing** uses backend-specific timer queries the _backend_ exposes, not a devtools-owned GL/WGPU dependency: a `GpuTimerBackend` seam in `@flighthq/types` that `render-gl` (EXT_disjoint_timer_query_webgl2) and `render-wgpu` (timestamp-query) fill via `registerGpuTimerBackend`. Devtools consumes the seam; it never touches a `WebGL2RenderingContext` or `GPUDevice` directly.
  - **Frame timing** wraps the caller's loop explicitly — `beginProfilerFrame` / `endProfilerFrame` brackets the app's own update+render, so devtools measures what the caller chooses to measure and allocates nothing per frame when absent.
- **Rust crate name:** `flighthq-devtools` (identity mapping). Native hosts (`host-winit`/`host-sdl`) supply the `GpuTimerBackend` via wgpu timestamp queries; the overlay renders through the same display-object path. Headless `flighthq-capture` can read a `ProfilerSnapshot` without an overlay.

The design center: **every capability is a nullable hook or a registration installed by an explicit `enable*`/`register*`/`create*` call, never a flag on `RenderState` that the hot path checks.** Unused devtools tree-shakes to zero because the render core has no static reference to it.

---

## Bronze

Minimum viable — the 20% that delivers 80%. Frame timing, the core counters, and a text overlay.

**Types (in `@flighthq/types`):**

- `FrameTiming` — `Readonly` plain data: `{ frameDurationMs, updateDurationMs, renderDurationMs, fps, frameIndex, timestampMs }`.
- `RenderCounters` — `{ drawCallCount, nodeVisitCount, culledNodeCount, renderTargetSwitchCount, triangleCount }` (triangleCount best-effort; `-1` when the backend cannot report it).
- `ProfilerSnapshot` — `{ timing: FrameTiming, counters: RenderCounters }`, the single read-out value type.
- `Profiler` — opaque entity; `ProfilerRuntime` companion holds accumulators (entity/runtime split). Stored counter state lives on the runtime, attached to `RenderStateRuntime` via a nullable slot owned by devtools — not a new field on `RenderState`.
- `DevtoolsOverlay` — entity describing overlay placement/content; `DevtoolsOverlayRuntime` holds the display objects it owns.
- `ProfilerOverlayKind = 'ProfilerOverlay'` — `*Kind` string for the overlay's display node, so it registers/renders like any other node.

**Functions (free, full names, `@flighthq/devtools`):**

- `createProfiler(): Profiler` — explicit allocation.
- `enableRenderCounters(state: RenderState): void` — installs the counting wrapper over `registerRenderer`/`walkNode` and an `installRenderAdaptHook` listener. This is the opt-in switch; without it the render core is untouched.
- `disableRenderCounters(state: RenderState): void` — removes the wrappers, restoring zero overhead.
- `beginProfilerFrame(profiler: Profiler): void` / `endProfilerFrame(profiler: Profiler): void` — frame-timing bracket around the caller's loop.
- `markProfilerUpdateBoundary(profiler: Profiler): void` — splits update vs render time within a frame.
- `getProfilerSnapshot(out: ProfilerSnapshot, profiler: Readonly<Profiler>): void` — no-alloc read into `out`.
- `resetRenderCounters(state: RenderState): void` — zero the per-frame counters (called by `beginProfilerFrame`).
- `createDevtoolsOverlay(options?: Readonly<DevtoolsOverlayOptions>): DevtoolsOverlay` — builds the overlay's display objects (a `TextLabel`-backed stats panel) via constructors, not literals.
- `updateDevtoolsOverlay(overlay: DevtoolsOverlay, snapshot: Readonly<ProfilerSnapshot>): void` — pushes the latest numbers into the overlay text.
- `attachDevtoolsOverlay(overlay: DevtoolsOverlay, parent: HierarchyNode): void` / `detachDevtoolsOverlay(overlay: DevtoolsOverlay): void` — add/remove the overlay subtree.
- `disposeProfiler(profiler: Profiler): void` / `disposeDevtoolsOverlay(overlay: DevtoolsOverlay): void` — detach listeners/registries, release to GC (no GPU resources owned at Bronze; `dispose*` is correct, not `destroy*`).

Bronze delivers an FPS + draw-call + node-count readout on screen with one `enableRenderCounters` + `createProfiler` + `createDevtoolsOverlay` call, working on every backend (counters are backend-agnostic; triangleCount may be `-1`).

---

## Silver

Competitive/solid — scene-graph inspection, GPU timing, rolling history, and signal streams.

**Types (`@flighthq/types`):**

- `SceneInspectorNode` — `Readonly` snapshot row: `{ kind: Kind, nodeId, name, childCount, visible, alpha, bounds: RectangleLike, depth }`. A flattened, serializable view — no live entity references, so it round-trips and crosses the wasm boundary.
- `SceneInspectorTree` — `{ root: SceneInspectorNode, children: ReadonlyArray<SceneInspectorTree> }`.
- `FrameTimingHistory` — fixed-capacity ring of recent `FrameTiming` (explicit capacity, no growth): `{ samples: ReadonlyArray<FrameTiming>, capacity, writeIndex }`.
- `GpuTimerScope` — `{ label: string, durationNs: number }` (`-1` when unavailable).
- `GpuTimerBackend` — the seam: `{ beginGpuTimerScope(label): void; endGpuTimerScope(): void; resolveGpuTimerScopes(out: GpuTimerScope[]): void; isGpuTimerSupported(): boolean }`.
- `ProfilerSignals` — signal group (created by `enableProfilerSignals`): `onProfilerFrame: Signal<ProfilerSnapshot>`, `onProfilerThresholdExceeded: Signal<ProfilerThresholdEvent>`.
- `ProfilerThreshold` / `ProfilerThresholdEvent` — budget config (`{ frameDurationMs?, drawCallCount?, ... }`) and the breach payload.
- `DevtoolsOverlayLayout` — placement enum-as-string + graph (`'TopLeft' | 'TopRight' | ...`), panel toggles (timing/counters/gpu/graph), and a sparkline section.

**Functions (`@flighthq/devtools`):**

- `captureSceneInspectorTree(out: SceneInspectorTree, root: Readonly<HierarchyNode>): void` — walks the graph via node feature aliases into a flat snapshot. No-alloc into a reused `out` where possible.
- `findSceneInspectorNode(tree: Readonly<SceneInspectorTree>, nodeId: number): SceneInspectorNode | null` — sentinel `null` for not-found.
- `enableProfilerSignals(profiler: Profiler): void` — opt-in signal group (cost assumed only on call), per the signals rule; group lives here because devtools owns the entity.
- `setProfilerThreshold(profiler: Profiler, threshold: Readonly<ProfilerThreshold>): void` — drives `onProfilerThresholdExceeded`.
- `createFrameTimingHistory(capacity: number): FrameTimingHistory` / `pushFrameTimingHistory(history: FrameTimingHistory, timing: Readonly<FrameTiming>): void` / `getFrameTimingAverage(out: FrameTiming, history: Readonly<FrameTimingHistory>): void`.
- `registerGpuTimerBackend(state: RenderState, backend: GpuTimerBackend): void` / `getGpuTimerBackend(state: RenderState): GpuTimerBackend | null` — the seam install; `null` when no backend registered (web GL without the extension, headless).
- `beginGpuTimerScope(state: RenderState, label: string): void` / `endGpuTimerScope(state: RenderState): void` / `resolveGpuTimerScopes(out: GpuTimerScope[], state: RenderState): void` — delegate to the backend; no-op + `-1` when absent (sentinel, not throw).
- `createWebGlGpuTimerBackend(...)` / `createWebGpuGpuTimerBackend(...)` — **live in `render-gl` / `render-wgpu`**, not devtools (the backend owns the GPU object), mirroring the `createWeb*Backend` factory convention; devtools only defines the seam and the consume side.
- `renderDevtoolsOverlaySparkline(overlay: DevtoolsOverlay, history: Readonly<FrameTimingHistory>): void` — frame-time graph.
- `setDevtoolsOverlayLayout(overlay: DevtoolsOverlay, layout: Readonly<DevtoolsOverlayLayout>): void`.

Silver covers what a professional reaches for: an inspectable, serializable graph snapshot; rolling FPS/frame-time graphs; real GPU timing where the backend supports it (graceful `-1` where it does not); and a frame-budget alarm via signals.

---

## Gold

Authoritative/AAA — exhaustive instrumentation, per-pass/per-kind breakdowns, memory + allocation accounting, remote/export pipeline, performant, fully tested, documented, Rust-port parity.

**Types (`@flighthq/types`):**

- `DrawCallRecord` — per-draw detail: `{ kind: Kind, nodeId, triangleCount, textureBindCount, shaderProgramId, durationNs }`. A bounded ring (capacity-capped) for a single captured frame.
- `RenderPassTiming` — per-pass breakdown (`'background' | 'cache' | 'mainPass' | 'filter' | 'overlay'`) with CPU + GPU durations.
- `CounterBreakdown` — counters grouped by `Kind` (`Map<Kind, RenderCounters>`) so the inspector shows "Bitmap: 412 draws, Shape: 88".
- `MemoryStats` — `{ renderTargetBytes, textureBytes, geometryBufferBytes, renderTargetCount, textureCount, poolHighWaterMark }` — reported by backends via an optional `MemoryReporter` seam, `-1`/`0` when unreported.
- `ProfilerCaptureFrame` — a complete single-frame deep capture: `{ snapshot, drawCalls, passTimings, counterBreakdown, gpuScopes, memory }` — the export/serialization unit.
- `ProfilerExportFormat = 'ProfilerJson' | 'ChromeTrace'` — `*Kind`-style string for exporters (Chrome `chrome://tracing` / Perfetto compatibility).
- `DevtoolsTransport` — optional remote-inspect seam: `{ sendProfilerCaptureFrame(frame): void }` for piping captures to an external panel (DevTools extension, native window, web socket) — backend-swappable, web default `null`.
- `SceneInspectorWatch` — a selection/highlight descriptor so the inspector can flash a chosen node in the overlay.

**Functions (`@flighthq/devtools`):**

- `enableDrawCallRecording(state: RenderState, capacity: number): void` / `disableDrawCallRecording(state: RenderState): void` — deep per-draw capture, off by default (highest overhead tier; explicit capacity, no unbounded growth).
- `getProfilerCaptureFrame(out: ProfilerCaptureFrame, state: RenderState, profiler: Readonly<Profiler>): void` — assembles the full deep capture into `out`.
- `getCounterBreakdown(out: CounterBreakdown, state: RenderState): void`.
- `beginRenderPassTiming(state: RenderState, pass: string): void` / `endRenderPassTiming(state: RenderState): void` — per-pass CPU+GPU brackets the render backends call when recording is enabled (no-op when not).
- `registerMemoryReporter(state: RenderState, reporter: MemoryReporter): void` / `getMemoryStats(out: MemoryStats, state: RenderState): void` — backend-reported VRAM/pool accounting; `createWebGlMemoryReporter`/`createWebGpuMemoryReporter` live in the render backends.
- `exportProfilerCaptureFrame(frame: Readonly<ProfilerCaptureFrame>, format: ProfilerExportFormat): string` — JSON / Chrome-trace export for offline analysis; returns `''` for an unknown format (sentinel).
- `registerProfilerExporter(format: ProfilerExportFormat, exporter: ProfilerExporter): void` — extensible exporter registry, last-write-wins, vendor-prefixed custom formats.
- `setDevtoolsTransport(state: RenderState, transport: DevtoolsTransport | null): void` / `sendProfilerCaptureFrame(state: RenderState, frame: Readonly<ProfilerCaptureFrame>): void` — remote inspection pipe; no-op when transport is `null`.
- `setSceneInspectorWatch(overlay: DevtoolsOverlay, watch: Readonly<SceneInspectorWatch> | null): void` — highlight a node in the live overlay.
- `createDevtoolsCommandPanel(...)` — interactive overlay controls (pause, step-frame, toggle panels) wired through `enableProfilerSignals`.
- Pooled scratch for hot-loop snapshots: `acquireProfilerSnapshot()` / `releaseProfilerSnapshot(snapshot)` for callers polling every frame.

**Quality bar:** every exported function colocated-tested (incl. aliased-`out` cases per the testing rule); `npm run api` symmetry across the `*Counters`/`*Timing`/`*Snapshot` families; a functional-test overlay scene; `npm run size` confirming zero contribution to a build that never imports devtools. Documented in a `tools/agents/docs/` reference doc covering the hook seams and the GPU-timer backend contract.

**Rust-port parity (`flighthq-devtools`):** `FrameTiming`/`RenderCounters`/`ProfilerSnapshot` as plain `#[derive(Clone, Copy)]` value structs; `GpuTimerBackend`/`MemoryReporter`/`DevtoolsTransport` as traits in `flighthq-types`; native wgpu timestamp-query backend in `render-wgpu`; counters ride the Rust renderer registry (`HashMap<KindId, _>`) the same way. The value-typed snapshot/capture types make devtools read-out a clean conformance + mixing target — a `ProfilerSnapshot` captured by the Rust runtime is comparable cell-for-cell against the TS one in the parity differ.

---

## Boundaries

- **Not the logging spine.** `@flighthq/log` owns structured log emission; devtools _uses_ it to emit snapshots but does not replace or absorb it.
- **Not the CI capture/parity harness.** `tools/capture` and the regression fingerprint gate are build-time, environment-coupled tooling. Devtools is a runtime, shippable, app-facing surface. They may share a `ProfilerSnapshot` shape but are different cells.
- **Not a renderer.** Devtools defines no GL/WGPU code and depends on no concrete `render-*` backend. GPU timing and memory reporting are _seams the backends fill_ (`registerGpuTimerBackend`, `registerMemoryReporter`); the overlay draws through the host's existing renderer as ordinary display objects.
- **Not always-on.** Nothing executes at import. Every capability is gated behind an explicit `enable*`/`register*`/`create*` call, and the render core holds no static reference to devtools, so an app that never imports it pays zero bytes and zero hot-path cost.
- **Not a profiler for arbitrary app code.** Scope is the SDK's render + scene-graph surface. General CPU sampling/flame-graphs of user code are out of scope (use the platform's own profiler); devtools instruments Flight's pipeline.
- **Counters degrade, never throw.** `triangleCount`, `durationNs`, and `MemoryStats` return `-1`/`0` sentinels when a backend cannot report them, rather than failing — expected-failure rule.

## Open design questions

1. **Counter installation mechanism.** Wrapping `registerRenderer` at `enableRenderCounters` time only counts renderers registered _after_ the enable call, while wrapping `walkNode`/the adapt hook counts everything but at coarser granularity. Should the render core expose a first-class, nullable `RenderInstrumentationHook` slot on `RenderStateRuntime` (a single seam devtools fills) instead of devtools wrapping multiple existing functions? That would be cleaner and keep the hook in the package that owns `RenderState`, at the cost of one new (nullable, zero-cost-when-null) field in the render core.
2. **GPU timing latency.** Timer-query results lag 1–3 frames (async resolve on both GL and WGPU). Should `GpuTimerScope.durationNs` report the most-recent-resolved value (stale but always present) or expose explicit `frameIndex` so consumers can align — and does the overlay show "last resolved" or interpolate?
3. **Triangle counting source of truth.** Triangle counts are only known inside the leaf renderers (`displayobject-gl` quad/shape tessellation, `scene-*` meshes). Should `RenderCounters.triangleCount` be reported by renderers through the instrumentation hook (accurate, requires each backend to opt in), or estimated by devtools from node kinds (always available, approximate)? Likely both, with a `triangleCountIsExact` flag.
4. **Overlay text dependency.** The overlay needs text rendering, which pulls `@flighthq/text` (+ shaping) into a devtools build. Is that acceptable for a devtools-only build, or should the overlay offer a minimal bitmap-font fallback so a tiny build (counters → external panel via `DevtoolsTransport`, no on-screen text) stays small?
5. **Inspector mutation.** Bronze/Silver make the inspector read-only (snapshots). Should Gold allow _editing_ from the inspector (toggle visibility, nudge alpha/transform live), and if so, does that write seam belong in devtools or in `@flighthq/node`?
6. **Naming: `devtools` vs `profiler` + `inspector`.** Is one `devtools` package the right boundary, or should profiling (timing/counters) and inspection (scene tree) be two tree-shakable cells? Single package keeps the overlay (which needs both) cohesive; the split keeps a counters-only consumer leaner. The overlay's need for both leans toward one package with clean internal sub-modules.

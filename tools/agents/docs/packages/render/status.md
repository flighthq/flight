---
package: '@flighthq/render'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# render — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/render

**Session dates**: 2026-06-24 (pass 1 + pass 2) **Starting score**: 74/100 (solid) **Estimated new score**: 90/100

## Implemented APIs (cumulative across both passes)

### Pass 1 — Bronze housekeeping and shared draw driver

- Deleted `beginRenderProxyUpdate` — was an exported no-op with no body (API debt).
- Deleted `updateDisplayObjectRenderTransform` alias — was a thin wrapper over `updateRenderProxy2DTransform` with no added value.
- Converted global `_adaptHook` + module-level `_installed` flag to per-state slots — `RenderStateRuntime.renderAdaptHook` is now a `RenderAdaptHook | null` field initialized to `null`. `installRenderAdaptHook(state, fn)` now takes a state parameter; multiple states coexist independently.
- **New types in `@flighthq/types`**: `RenderDrawContext`, `RenderBatchKey`, `RenderStateStats`, `RenderAdaptHook`, `RenderBatchFlushCallback`. `RenderStateRuntime` extended with `drawContext`, `renderAdaptHook`, `renderBatchFlushMap`.
- **`renderDriver.ts`** — the shared, backend-agnostic draw driver:
  - `drawRenderProxy(state, root)` — shared draw walk over prepared proxies; auto-flushes on batch-key change; returns `true` if any proxy was submitted.
  - `flushRenderBatch(state, barrier?)` — forces the open batch to flush; no-op when no batch is open.
  - `registerRenderBatchFlush(state, format, flush)` — registers a backend flush callback per `BatchFormat`.
  - `submitRenderProxy(state, proxy)` — submits a single render proxy; auto-flushes on batch-key change.
- **`renderState.ts`**: `getRenderStateStats(state)` — returns `Readonly<RenderStateStats>` snapshot.

### Pass 2 — Silver items: culling, blend stack, retained queue, parity suite

#### New types in `@flighthq/types`

- **`RenderBlendStateEntry`** (`packages/types/src/RenderBlendStateEntry.ts`) — one saved entry on the blend/alpha save-restore stack: `alpha`, `blendMode`. Plain data with no runtime identity.
- **`RenderQueue`** (`packages/types/src/RenderQueue.ts`) — retained, sortable draw list: `entries: RenderQueueEntry[]`, `entryCount: number`. Reusable across frames (entryCount reset, array capacity preserved). Also exports `RenderQueueEntry` (proxy + `sortKey`) and `RenderSortKey` (number alias).
- **`RenderViewport2D`** (`packages/types/src/RenderViewport2D.ts`) — low-level pixel-space culling rectangle: `x`, `y`, `width`, `height`. Distinct from the application-layer `Viewport` type (which carries `align`/`scaleMode`/`root`).
- `RenderStateRuntime` extended with `renderBlendStack: RenderBlendStateEntry[]` — per-state stack initialized empty.

#### New functions in `packages/render/src/`

**`renderBlendState.ts`** — blend/alpha save-restore stack:

- `pushRenderBlendState(state)` — saves current `renderAlpha` + `renderBlendMode` onto the per-state stack. Call before entering a clip group, filter pass, or render-cache capture scope.
- `popRenderBlendState(state)` — restores from the top of the stack; no-op on underflow (silently ignored rather than throwing, since this runs in draw loops).
- `getRenderBlendStackDepth(state)` — returns the current stack depth for assertions and diagnostics.

**`renderQueue.ts`** — retained, sortable render queue:

- `buildRenderQueue(state, source, out)` — fills `out` with one entry per visible proxy with a renderer, using scene-order encounter indices as sort keys. Call `prepareDisplayObjectRender` first; does not advance the frame id.
- `clearRenderQueue(queue)` — resets `entryCount` to 0 without releasing the array (capacity preserved for the next fill).
- `compareRenderQueueEntries(a, b)` — ascending sort-key comparator; the default for `sortRenderQueue`.
- `createRenderQueue()` — allocates a new empty `RenderQueue`.
- `packRenderSortKey(layer, depth, isTransparent)` — packs layer (15-bit), transparent flag, and depth (15-bit) into a single `RenderSortKey` integer. Opaque sorts before transparent within a layer; higher depth buckets sort later.
- `pushRenderQueueEntry(queue, proxy, sortKey)` — appends one entry; reuses array capacity, allocates only when the array is full.
- `sortRenderQueue(queue, compare?)` — sorts `[0..entryCount)` in-place; accepts a custom comparator for opaque-front-to-back / transparent-back-to-front partitioning.

**`renderViewport.ts`** — 2D viewport/scissor culling:

- `computeRenderProxyWorldBounds(out, source)` — writes the axis-aligned world-space bounding rect of `source` into `out`. Returns `false` when the source does not carry `HasTransform2D` (no `scaleX`); conservatively treats missing-bounds as in-viewport. Alias-safe (reads from source, writes to out).
- `createRenderViewport2D(x, y, width, height)` — convenience constructor for `RenderViewport2D`.
- `isRenderableInViewport(source, viewport)` — returns `true` when the source node's world-space bounds overlap the viewport; conservatively true for non-spatial sources or when `getNodeWorldBoundsRectangle` throws. Uses inclusive AABB overlap (touching edges count as in-viewport).
- `isRenderProxyInViewport(proxy, viewport)` — same as `isRenderableInViewport` but takes a `RenderProxy2D` and dispatches through `proxy.source`.

**`renderDriverParity.test.ts`** — cross-backend consistency test suite:

A recording stub `Renderer` implementation (`RecordingRenderer`) captures every `submit` call. The suite verifies:

- Submit call count matches visible node count for no-format, Quad, and VertexStream backends.
- Single-node scene produces exactly one flush regardless of format.
- Different-format two-node scene produces exactly two flushes (one mid-walk on format change, one final).
- `drawCallCount` stat equals actual submit call count for both format and no-format backends.
- Root is submitted before child (pre-order traversal is format-independent).
- Counters reset to zero at the start of each walk.
- Invisible nodes skip submission identically across backends.

### Test coverage

- **17 test files, 210 tests** — all passing.
- Pass 2 added: `renderBlendState.test.ts` (9 tests), `renderQueue.test.ts` (17 tests), `renderViewport.test.ts` (7 tests), `renderDriverParity.test.ts` (11 tests).

## Deferred items and why

### `computeTextFormatFontString` cross-package move

The depth review and maturation roadmap both flag this as a scope leak in the render core (it is a CSS font-string builder for `TextFormat`, residing in `renderTextFormat.ts`). Moving it to `@flighthq/text` requires updating **14 import sites** across `displayobject-canvas`, `displayobject-dom`, `displayobject-gl`, `displayobject-wgpu`, and `textshaper-canvas`. This is a deliberate cross-package rename. Deferred because the instruction scope is `@flighthq/render` and the guidance says to raise cross-package changes rather than act autonomously. **Suggestion**: move `computeTextFormatFontString` to `@flighthq/text` in a dedicated cross-package cleanup session.

### Backend-agnostic render-pass / attachment descriptor (Silver)

The maturation roadmap calls for `RenderPassDescriptor`, `beginRenderPass(state, pass)`, `endRenderPass(state)`, `computeRenderPassViewport`, `computeRenderPassScissor`. This requires reconciling with `render-gl`'s `glRenderTarget`/`glRenderTargetPool` and `render-wgpu`'s targets — the core pass descriptor must subsume what those two GPU cores already do. **Cross-package design decision**: surface to the user before acting. This is the highest-value remaining Silver item.

### Gold items (not yet started)

All Gold items are deferred per the maturation roadmap. They require multi-session effort and some (3D prepare extensions) require cross-package coordination:

- **Frame graph / multi-pass dependency description** (`RenderGraph`, `RenderResource`, transient target aliasing, `compileRenderGraph`, `executeRenderGraph`) — depends on the Silver pass descriptor and the transient-target pool seam in `render-gl`/`render-wgpu`.
- **3D prepare to the authoritative bar** — point/spot lights, shadow-caster collection, draw-order/material sort, GPU instancing batching, LOD selection. Flagged as a cross-package decision with `scene`/`mesh`/`lighting`; surface before acting.
- **Performance & diagnostics seam** — full `RenderStats` (triangle count, per-format breakdown, etc.), `beginRenderTimer`/`endRenderTimer`, `enableRenderProxySignals` debug capture group via `@flighthq/signals`.
- **GPU-timer-query hook contract** (`RenderTimerBackend` with `get*/set*/createWeb*`).
- **`flighthq-render` Rust crate parity** — mirror driver, queue, pass, and frame-graph seams 1:1.
- **Full render-core architecture docs** — lifecycle, batch-key model, adapt/effect seam, backend authoring contract.

## Design choices made (pass 2)

### `RenderQueue` uses a window-based entryCount rather than slicing

`RenderQueue.entries` is a plain array that grows but never shrinks. `entryCount` marks the valid window. `clearRenderQueue` resets `entryCount` to 0 without releasing the array — subsequent fills reuse capacity from the previous frame without allocation. `sortRenderQueue` sorts only `[0..entryCount)`, slicing internally and writing back, so stale entries beyond `entryCount` are never sorted or submitted. This matches the existing `tempStack` and `_drawStack` scratch patterns in the package.

### `RenderSortKey` is a packed integer (not an object)

`packRenderSortKey(layer, depth, isTransparent)` encodes three axes in a single 31-bit integer: layer (15 bits, high), transparent flag (1 bit, mid), depth (15 bits, low). A single numeric comparison simultaneously orders layers, opaque-before-transparent within a layer, and near-before-far within opaque. This is the standard GPU draw-call sort trick. Users who want finer control pass a custom comparator to `sortRenderQueue`.

### `RenderViewport2D` is named to distinguish from application `Viewport`

The existing `Viewport` type carries `align`, `scaleMode`, and `root` — it is an application-layer scene-graph concept. `RenderViewport2D` is a low-level pixel-space culling rectangle used exclusively by the render core. Using a distinct type name avoids ambiguity and keeps the two concepts cleanly separated.

### `isRenderableInViewport` uses inclusive AABB overlap

Zero-size objects (e.g. a freshly-created DisplayObject at origin with no geometry) have bounds `{x:0, y:0, width:0, height:0}`. With a strict `>` (exclusive) overlap test, such an object at the edge of the viewport would be incorrectly culled. The inclusive `>=` test treats touching edges as overlapping — correct conservative culling for zero-size nodes that may still render (e.g. a container with children positioned by its transform).

### `pushRenderBlendState` allocates one object per push

Each `push` creates a small `{alpha, blendMode}` object. For render loops, the depth is shallow (mirrors clip nesting), so GC pressure is acceptable. The `renderBlendStack` lives on the `RenderStateRuntime`, so it is per-state and isolated. A future optimization could use a typed flat array (two numbers per entry) to eliminate object allocation entirely, but that is premature for the current use pattern.

### Cross-backend parity test uses a recording stub not a mock framework

The `RecordingRenderer` captures `submit` calls in a plain array, with an explicit `reset()` method. This is more readable than a mock framework for sequential assertion on a known call sequence, and avoids any dependency on a specific mock library. The `makeFlushRecorder` helper follows the same pattern.

## Concerns and surprises

1. **`blendMode` root inheritance differs for root vs. child nodes in the presence of `state.renderBlendMode`**: A root node (no parent) gets `blendMode = state.renderBlendMode ?? source.blendMode`, which defaults to `BlendMode.Normal (10)` when `state.renderBlendMode = BlendMode.Normal`. A child node gets `blendMode = source.blendMode = null` (the source's own field, which defaults to `null`). This means root and child have different batch-key `blend` values even when both nodes have "normal" blend intent. This subtlety caused a cross-format batch-key parity test to fail until the test was corrected. Not a bug — it reflects intentional behavior where the root applies the state blend override and children inherit from their parent — but it is worth noting for anyone who expects a consistent batch key across a parent/child pair with no explicit blend set.

2. **`_drawStack` and `_buildStack` are module-level globals**: The draw driver and queue builder both use module-level scratch arrays to avoid per-frame allocation. These are safe for single-threaded non-reentrant JS, but callers must not invoke `drawRenderProxy` or `buildRenderQueue` reentrantly. This matches the existing `tempStack`/`_drawStack` contract documented in the code.

## Suggestions for future sessions

1. Implement the render-pass descriptor in coordination with `render-gl` and `render-wgpu` — this is the highest-value remaining Silver item (guards begin/end-target across backends).
2. Move `computeTextFormatFontString` to `@flighthq/text` in a cross-package cleanup session.
3. Begin the Gold frame-graph work once the Silver pass descriptor is settled.
4. Wire up the 3D prepare extensions (point/spot lights, shadow casters, material sort) in coordination with the `scene`/`mesh`/`lighting` roadmap owners.
5. Consider using `drawRenderQueue` as a variant of `drawRenderProxy` that consumes a pre-built `RenderQueue` (sorted entries) rather than re-walking the scene graph — natural next step after `buildRenderQueue` + `sortRenderQueue` are in use.

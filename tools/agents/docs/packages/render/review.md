---
package: '@flighthq/render'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/render.md
  - source
  - changes.patch
---

# render — Review

> Survey layer. Independent observation of `@flighthq/render` as it stands in the `builder-67dc46d64` incoming bundle. Supersedes the prior depth review (74/100). Evidence is `incoming/builder-67dc46d64/head/packages/render/` + `changes.patch`; findings cite `<sha>:<path>`.

## Verdict

**solid — 86/100.** This pass closed the single biggest gap the prior depth review (74/100) named — the absent backend-agnostic draw/submit driver that the `Renderer.submit` / `BatchFormat` contract implied — and cleaned up the API debt the review flagged (the no-op `beginRenderProxyUpdate`, the `updateDisplayObjectRenderTransform` alias, the process-global adapt hook). It also added the retained sortable queue, the blend save/restore stack, 2D viewport culling, and a stats snapshot. The package is now a coherent, well-tested render _core_ that owns preparation **and** the shared draw walk. It stops short of authoritative because the two remaining render-core pillars — a backend-agnostic render-pass / target-attachment descriptor and a frame-graph — are still absent (correctly deferred as cross-package design work), and a handful of small contract-fit nits remain (a mis-homed type, a type-leaky stats return, `try/catch` used as a culling control-flow path). The charter is a stub, so this is judged against the AAA codebase-map standard.

The status doc's claims were verified against the diff and source and are **accurate**: 17 test files, 210 `it` cases (counted), the three deletions are real (`beginRenderProxyUpdate`, `updateDisplayObjectRenderTransform` absent from `src/`), `installRenderAdaptHook(state, fn)` now takes a state and the hook lives on `RenderStateRuntime.renderAdaptHook` (per-state, no module global), and every new type is `@flighthq/types`-first. The estimated 90/100 is a touch generous given the contract-fit nits and the still-missing pass abstraction, but the direction and the verification both hold.

## Present capabilities

The carry-over core (registry, prepare pipeline, cache seam, target math, 3D prepare) is unchanged and well-described in the prior depth review; what follows is grounded in the bundle source. New in this bundle:

- **Shared draw driver (`<sha>:packages/render/src/renderDriver.ts`)** — `drawRenderProxy(state, root)` walks already-prepared proxies in scene order, dispatches `renderer.submit` via `submitRenderProxy`, auto-flushes the open batch on batch-key change, flushes the trailing batch after the walk, and returns whether anything was submitted. `flushRenderBatch(state, barrier?)` forces a flush (no-op when no batch is open; `barrier` is reserved and currently `void`ed). `registerRenderBatchFlush(state, format, flush)` wires a per-`BatchFormat` backend flush callback (last-write-wins, matching the renderer-registration convention). `submitRenderProxy(state, proxy)` builds a candidate `RenderBatchKey` from the proxy's renderer attributes and flushes the open batch first if the key differs. This is exactly the `submit`/`flush` driver the depth review said was the package's biggest hole, and it lets the four backends contribute leaf draws rather than each re-walking the graph. It uses a dedicated `_drawStack` scratch (not the shared `tempStack`), so prepare and draw can interleave in one frame.

- **Retained sortable queue (`<sha>:packages/render/src/renderQueue.ts`)** — `createRenderQueue` / `buildRenderQueue(state, source, out)` / `clearRenderQueue` / `pushRenderQueueEntry` / `sortRenderQueue(queue, compare?)` / `compareRenderQueueEntries` / `packRenderSortKey(layer, depth, isTransparent)`. The queue is a grow-but-never-shrink array with an `entryCount` window (reuses capacity frame-to-frame, no per-frame allocation — matches the existing scratch patterns). `packRenderSortKey` packs layer (15 bits) · transparent flag (1 bit) · depth (15 bits) into a single integer so one numeric compare orders layer → opaque-before-transparent → depth — the canonical GPU draw-call sort trick.

- **Blend save/restore stack (`<sha>:packages/render/src/renderBlendState.ts`)** — `pushRenderBlendState` / `popRenderBlendState` / `getRenderBlendStackDepth` over a per-state `renderBlendStack`. Push saves `renderAlpha`+`renderBlendMode`; pop restores and is a silent no-op on underflow (deliberate: runs inside draw loops). Directly answers the depth review's "blend mode is a single field, not a stack" note.

- **2D viewport culling (`<sha>:packages/render/src/renderViewport.ts`)** — `createRenderViewport2D`, `computeRenderProxyWorldBounds(out, source)`, `isRenderableInViewport(source, viewport)`, `isRenderProxyInViewport(proxy, viewport)`. Inclusive AABB overlap (touching edges count as in-view, so zero-size nodes at the edge are conservatively kept). Non-spatial sources (no `scaleX`) are treated as in-view. This gives the 2D path the bounds-based offscreen rejection the depth review said was absent (the 3D path already had frustum culling).

- **Stats snapshot (`<sha>:packages/render/src/renderState.ts`)** — `getRenderStateStats(state)` returns a `Readonly<RenderStateStats>` (drawCallCount, flushCount, proxyVisitedCount) from the last draw walk. Answers the "no stats/diagnostics" gap at the counter level.

- **Cleanup** — `beginRenderProxyUpdate` (exported no-op) and `updateDisplayObjectRenderTransform` (thin alias) are deleted; the process-global `_adaptHook`/`_installed` pair is gone, replaced by the per-state `RenderStateRuntime.renderAdaptHook` slot wired through `installRenderAdaptHook(state, fn)` and lazily installed by `setRenderProxyAdapter`. Multiple render states now coexist independently — this is the correct fix for the "shared top-level mutable state" smell and a genuine contract improvement.

- **Cross-backend parity suite (`<sha>:packages/render/src/renderDriverParity.test.ts`)** — a `RecordingRenderer` stub captures every `submit`; the suite asserts submit-count = visible-node-count, one-flush-per-single-node, two-flushes-on-format-change, counter resets, pre-order root-before-child, and identical invisible-node skipping across no-format / Quad / VertexStream backends. This is the kind of behavioral-consistency test the driver needed and is a meaningful maturity signal.

- **Types-first** — every new type lives in `@flighthq/types` with thorough ownership/aliasing comments: `RenderDrawContext`, `RenderBatchKey`, `RenderStateStats`, `RenderAdaptHook`, `RenderBatchFlushCallback` (the last two as `type` aliases in `RenderState.ts`), `RenderBlendStateEntry`, `RenderQueue` / `RenderQueueEntry` / `RenderSortKey`, `RenderViewport2D`. Runtime slots (`drawContext`, `renderBatchFlushMap`, `renderBlendStack`, `renderAdaptHook`) are added to `RenderStateRuntime`, the correct narrow tier.

## Gaps vs an authoritative render-core

- **No render-pass / target-attachment descriptor.** Still the largest remaining hole. There is target _math_ (`renderTarget.ts`) but no backend-agnostic `RenderPassDescriptor` / `beginRenderPass` / `endRenderPass` to host the begin/end-target pattern each backend reinvents. Correctly deferred (it must reconcile with `render-gl`/`render-wgpu` target pools — a cross-package design decision), but it is the next pillar between "solid" and "authoritative."

- **No frame-graph / multi-pass dependency description.** No `RenderGraph` / transient-target aliasing / `compile`/`execute`. Gold-tier, depends on the pass descriptor; appropriately not started.

- **The queue is built but not yet driven.** `RenderQueue`'s own doc comment says it is "consumed by `drawRenderQueue`" — but `drawRenderQueue` does not exist (`<sha>:packages/render/src/` has no such export; it is listed only as a future suggestion). So the retained queue can be built and sorted but nothing in the core submits _from_ it — `drawRenderProxy` re-walks the graph. The sort path is, for now, dead weight relative to the actual draw loop. Either ship `drawRenderQueue` or soften the type's doc comment so it does not reference an unbuilt consumer.

- **3D prepare still narrow.** One directional + one ambient light, no point/spot lights, no shadow-caster collection, no draw-order/material sort, no instancing or LOD. Missing-by-design per the `scene` roadmap and the cross-package-coordination note; flagged here only as the eventual bar.

- **Stats are counters only.** No per-format breakdown, no triangle/vertex count, no timing hooks, no `enableRenderProxySignals` debug-capture group. Adequate as a seam; short of a mature diagnostics layer.

- **`computeTextFormatFontString` still resident.** A CSS font-string builder still lives in `<sha>:packages/render/src/renderTextFormat.ts` — a scope leak into the render core. Consciously deferred (the move to `@flighthq/text` touches 14 import sites across backends — a cross-package rename). Noted, not charged heavily.

## Charter contradictions

The charter (`packages/render/charter.md`) is a **stub** — only "What it is" is filled; North star, Boundaries, Decisions, and Open directions are all `_TODO_`. There is therefore no stated North-star principle, Boundary, or Decision for the code to contradict. **No charter contradictions** — and that is purely because the charter is silent, not because the package was measured against a real rubric. The silences are collected as candidate open directions below.

## Contract & docs fit

Against the codebase contract — strong, with a few nits:

- **Names** — full and self-identifying throughout (`drawRenderProxy`, `flushRenderBatch`, `packRenderSortKey`, `computeRenderProxyWorldBounds`, `getRenderBlendStackDepth`). Verb discipline is correct: `get*` snapshots, `is*` predicates, `create*` allocates, `push/pop` bracket. ✔
- **Types-first, single root export, `sideEffects: false`** — all hold. `index.ts` is a thin barrel; every new type is in `@flighthq/types`; `package.json` declares `"sideEffects": false` and one `exports` root. ✔
- **No top-level mutable state** — the adapt-hook global was _removed_ this pass; state now lives on the runtime. The module-level `_drawStack`/`_buildStack` scratch arrays remain (documented non-reentrant, matching the existing `tempStack` contract) — acceptable per the established scratch pattern. ✔
- **`out`-params / alias-safety** — `computeRenderProxyWorldBounds` reads `source`, writes `out`, documents alias-safety; `buildRenderQueue` writes `out`. ✔
- **Sentinels not throws** — mostly. But see the `try/catch` note below — culling reaches _into_ a function (`getNodeWorldBoundsRectangle`) that can throw and swallows it as a conservative "in-view" result. That is the contract's "return sentinel for expected failure" rule being satisfied via exception-catching rather than a sentinel-returning probe; it works but reads against the grain.

Candidate contract / docs-fit revisions (the user's gate, flagged not acted on):

- **`RenderBatchKey` is mis-homed.** It is defined inside `<sha>:packages/types/src/RenderDrawContext.ts`, not its own `RenderBatchKey.ts`. The types-layout convention is one concept per file with filename = type name; `RenderBatchKey` is a distinct, independently-meaningful concept (the batch identity) and reads as a candidate to split out.
- **`getRenderStateStats` returns the live `drawContext` cast to `Readonly<RenderStateStats>`.** `RenderDrawContext` is a structural superset (it also carries the mutable `openBatchKey`), so the return is a live reference into the runtime narrowed by an interface, not a snapshot. The doc comment says "do not retain across frames," so the aliasing is disclosed — but "snapshot" in the type doc overstates it, and a caller who up-casts gets at `openBatchKey`. A copy-out or a distinct stats object would match the stated intent more honestly.
- **`RenderQueue` doc references an unbuilt `drawRenderQueue`** (see Gaps). Doc/impl drift.
- **Package Map line is still accurate** — "renderer registration, render state/queue, render node data, update pipeline, transform/color propagation." The new queue/driver work makes the "render state/queue" phrase _more_ true than before; no Map revision needed.
- **Rust mirror** — `crate: flighthq-render` per the front matter; the driver/queue/pass/frame-graph seams are the 1:1 parity surface the status doc flags as Gold (`flighthq-render` crate parity). Not a gap in _this_ package, but the seam names introduced here (`drawRenderProxy`, `flushRenderBatch`, `packRenderSortKey`, `RenderBatchKey`) are now the conformance contract the crate must mirror.

## Structural-forks fit

- **Fork B (closed union vs open registry).** The flush dispatch is a **registry** (`renderBatchFlushMap: Map<BatchFormat, RenderBatchFlushCallback>`, last-write-wins) — the registry-by-default direction, good. `batchKeysEqual` is a fixed 5-field struct compare in the hot submit path; that is a closed comparison but it is the tight-inner-loop exception the fork allows, and the _format set_ it keys on is open via the registry. No drift.
- **Fork C (monolith decomposition — hot-function audit).** `drawRenderProxy` / `submitRenderProxy` are small and single-purpose; the prepare pipeline's `updateRenderProxy2D` remains the one composite per-node visitor (appearance + transform + material + clip + adapt-hook), a known carry-over. Worth a future glance but not a new config-gated-branch smell introduced this pass.
- **Fork D (runtime-backend seam).** The driver is exactly a backend seam: backends register flush callbacks and contribute leaf `submit`s; the core owns the walk. Clean fit.
- **Fork A (source-data vs graph participation).** Not engaged by this package.

## Candidate open directions

The charter is a stub; these are the questions a reviewer had to assume, surfaced for the charter's Open directions (do not treat as decided):

1. **Does the core own the draw loop, or only the contract for it?** This pass had the core _take over_ the draw walk (`drawRenderProxy`). The depth review framed this as "partly missing-by-design — the immediate-mode backends each drive their own walk." The charter should rule on whether the shared driver is the intended single draw path (and the backends become pure leaf-submit), or whether immediate-mode backends are still permitted to drive their own walk. This is the package's central identity question and the charter is silent on it.
2. **Is the render-pass / target-attachment descriptor in scope for `render`, or does it live in the GPU cores?** The status doc flags this as the highest-value remaining Silver item and a cross-package decision. The charter should state where the begin/end-target abstraction is homed.
3. **Is the frame-graph (`RenderGraph`) a `render` responsibility or a separate package?** Per structural-fork G's note, `render-graph`'s reshaping of `render` is "architecturally significant — its own design pass."
4. **What is the diagnostics bar?** Counters exist; the charter should say whether full `RenderStats` (per-format / triangle counts), GPU-timer hooks, and an `enableRenderProxySignals` debug group are in scope for the core or pushed to backends.
5. **Where does `computeTextFormatFontString` belong?** Both the depth review and the status doc want it in `@flighthq/text`; the charter should bless the cross-package move so it stops being deferred.
6. **3D prepare ownership.** Point/spot lights, shadow-caster collection, material/draw-order sort: does `render` own these prepare passes, or `scene`/`lighting`? The charter should set the boundary the status doc keeps deferring to "the `scene`/`mesh`/`lighting` roadmap owners."

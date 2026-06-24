---
package: '@flighthq/render'
crate: flighthq-render
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# render — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/render` is the **backend-agnostic render core**: the contracts and the CPU-side preparation that every concrete backend consumes, with none of the backend draw code itself.

It owns renderer registration (the `*Kind`→renderer registry), render state, the scene-graph→render-proxy update/prepare pipeline, the render-cache seam, render-target geometry math, the shared draw driver (`drawRenderProxy` / `submitRenderProxy` / `flushRenderBatch` over a per-`BatchFormat` flush registry), the retained sortable render queue, a blend save/restore stack, 2D viewport culling, the 3D scene-prepare (cull / light-pack) pass, and a counter-level stats snapshot. Every public type lives in `@flighthq/types` first; this package implements against that header.

Where it ends: the concrete per-backend draw loops, batching, target pools, and shaders live in the sibling backend packages (`render-canvas`, `render-dom`, `render-gl`, `render-wgpu`, and the `displayobject-<backend>` / `scene-<backend>` leaves). `render` is the seam those backends register into and the preparation they all draw from — it is the "what to draw and in what order," not the "how this GPU draws it." It is also distinct from the scene-graph packages it reads (`node`, `displayobject`, `sprite`, `scene`): it consumes prepared graph state, it does not define node types.

_(Seeded from the prior depth review and the builder-67dc46d64 survey; replace with the intent in your own framing.)_

## North star (proposed)

_Proposed durable principles, inferred from the design + the structural forks. Confirm, edit, or move any of these into Open directions before they are treated as blessed._

- **Contracts and preparation, not pixels.** The core owns the renderer registry, the prepare pipeline, and the draw/submit/flush contract; concrete drawing stays in the backend packages. A feature belongs here only if every backend needs it and it can be expressed without touching a specific GPU API.
- **Types-first, header-driven.** Every cross-package render type is defined in `@flighthq/types` before it is implemented here, with ownership / aliasing / coordinate-space comments. The header is the design surface; the seam names this package introduces (`drawRenderProxy`, `flushRenderBatch`, `packRenderSortKey`, `RenderBatchKey`, …) are the conformance contract the `flighthq-render` crate mirrors 1:1.
- **Registry by default at the backend seam.** Backend contributions are registered, not switched (`registerRenderer`, `registerRenderBatchFlush`, last-write-wins). A closed struct compare is permitted only in the tight inner submit loop (`batchKeysEqual`); the _set_ it keys over stays open via the registry. (Structural fork B / D.)
- **No hidden per-frame allocation, no shared top-level state.** Hot paths reuse grow-but-never- shrink scratch (the render queue, `_drawStack`); mutable state lives on `RenderStateRuntime`, not module globals, so multiple render states coexist independently. Allocation is explicit and named.
- **3D is strictly additive.** The 3D scene-prepare path composes the shared substrate without a 2D app ever reaching it; a 2D bundle pays nothing for 3D. (Structural fork G.)

## Boundaries (proposed)

_Proposed scope lines drawn from the review and the neighbor packages. The homing questions marked below are unsettled — see Open directions._

In scope:

- Renderer registration and the render state that holds it.
- The scene-graph→render-proxy prepare/update pipeline (transform, color, appearance, material, clip propagation).
- The shared draw driver, the per-`BatchFormat` flush registry, and the retained sortable queue.
- Render-target geometry math, blend save/restore, 2D viewport culling.
- The 3D scene-prepare (cull / light-pack) pass at the contract level.
- Counter-level render stats as a diagnostics seam.

Non-goals (today):

- Concrete per-backend draw loops, batching internals, GPU target pools, and shaders — those are the backend packages.
- Node-type definitions — those belong to `node` / `displayobject` / `sprite` / `scene`.
- CSS / platform string building — `computeTextFormatFontString` is a current resident scope leak flagged for the move to `@flighthq/text` (see Open directions).

## Decisions

None blessed yet.

## Open directions

_The real questions. Every candidate from the review, plus the structural forks that touch this package. An agent asks here rather than assuming._

1. **Does the core own the draw loop, or only the contract for it?** This pass had the core take over the draw walk (`drawRenderProxy`), where the depth review had framed the walk as partly backend-owned ("immediate-mode backends each drive their own walk"). The charter must rule whether the shared driver is the single intended draw path (backends become pure leaf-submit) or whether immediate-mode backends may still drive their own walk. This is the package's central identity question.

2. **Is the render-pass / target-attachment descriptor in scope for `render`, or does it live in the GPU cores?** There is target _math_ (`renderTarget.ts`) but no backend-agnostic `RenderPassDescriptor` / `beginRenderPass` / `endRenderPass`. This is the highest-value remaining item and a cross-package decision (it must reconcile with `render-gl` / `render-wgpu` target pools). Where is the begin/end-target abstraction homed?

3. **Is the frame-graph (`RenderGraph`) a `render` responsibility or a separate package?** No `RenderGraph` / transient-target aliasing / `compile`/`execute` exists yet. Per structural fork G, `render-graph`'s reshaping of `render` is "architecturally significant — its own design pass."

4. **What is the diagnostics bar?** Counters exist (`getRenderStateStats`). Should the core carry full `RenderStats` (per-format / triangle / vertex counts), GPU-timer hooks, and an `enableRenderProxySignals` debug-capture group, or are those pushed to the backends?

5. **Where does `computeTextFormatFontString` belong?** Both the depth review and the status doc want it in `@flighthq/text`; the move touches ~14 import sites across backends. The charter should bless the cross-package move so it stops being deferred.

6. **3D prepare ownership.** Point/spot lights, shadow-caster collection, and material/draw-order sort: does `render` own these prepare passes, or do `scene` / `lighting` / `mesh`? The current 3D prepare is narrow (one directional + one ambient light). The charter should set the boundary the status doc keeps deferring to the `scene`/`mesh`/`lighting` roadmap owners. (Structural fork A — source-data vs graph participation — and fork G.)

7. **Should the retained queue actually drive draws?** `RenderQueue`'s doc references a `drawRenderQueue` consumer that does not exist; `drawRenderProxy` re-walks the graph instead, so the sort path is currently dead weight relative to the real draw loop. Direction: ship `drawRenderQueue` and route the driver through the sorted queue, or soften the type to a build-and-sort utility with no implied consumer?

8. **Contract-fit nits to settle (the user's gate).** `RenderBatchKey` is mis-homed inside `RenderDrawContext.ts` rather than its own file; `getRenderStateStats` returns a live `drawContext` cast to `Readonly<RenderStateStats>` (a narrowed live reference, not a true snapshot — a caller who up-casts reaches `openBatchKey`); and viewport culling swallows a throw from `getNodeWorldBoundsRectangle` as a conservative "in-view" rather than probing via a sentinel-returning path. Each reads against the contract grain and wants a ruling.

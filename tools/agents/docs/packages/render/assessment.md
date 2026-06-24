---
package: '@flighthq/render'
updated: 2026-06-24
basedOn: ./review.md
---

# render — Assessment

> Recommendation layer. Sorts the gaps in `review.md` and the absorbed maturation roadmap (`reviews/maturation/depth/render.md`) into **Recommended** (sweep-safe, within-package) and **Backlog** (parked, with a reason each). `Approved` is empty — approval is the user's verbal gate. The charter is a **stub** (only "What it is" filled), so every design fork and cross-package item is routed to the charter's Open directions (noted at the bottom), never into Recommended.

## Recommended

Strictly sweep-safe: within `@flighthq/render`'s own surface (its types in `@flighthq/types` included), no behavioral/breaking change to a consumer, no open design decision. Safe under a blanket "do all recommended."

- **Soften the `RenderQueue` doc comment's `drawRenderQueue` reference.** `RenderQueue`'s own doc says it is "consumed by `drawRenderQueue`," but no such export exists — the retained/sorted queue is not yet driven (`drawRenderProxy` re-walks the graph). Pure doc/impl drift: edit the type's doc comment to not name an unbuilt consumer (and to note the queue is build/sort-only for now). Does not touch behavior or shipping a consumer — that consumer is a Backlog design call. — review.md#gaps, review.md#contract-and-docs-fit

- **Split `RenderBatchKey` into its own `RenderBatchKey.ts`.** It is currently defined inside `packages/types/src/RenderDrawContext.ts`; the types-layout convention is one concept per file with filename = type name, and `RenderBatchKey` is an independently-meaningful concept (the batch identity). Mechanical file relocation within `@flighthq/types`, same export name and shape — no consumer change, no API surface change. — review.md#contract-and-docs-fit

- **Make `getRenderStateStats` return an honest snapshot.** It currently returns the live `drawContext` cast to `Readonly<RenderStateStats>`; because `RenderDrawContext` is a structural superset, the return is a live runtime reference (an up-cast caller reaches `openBatchKey`), while the doc claims a "snapshot." Copy the three counters into a distinct stats object (or a dedicated stats struct) so the return matches the stated intent. In-package, return _type_ unchanged (`Readonly<RenderStateStats>`), no breaking change. — review.md#contract-and-docs-fit

## Backlog

Parked — each crosses a package boundary, awaits an Open direction in the charter, or is a larger multi-session lift. Not sweep-safe; not eligible for blanket approval.

- **Drive the draw from the retained queue (`drawRenderQueue`), or keep it build/sort-only.** The sorted queue is presently dead weight relative to the actual draw loop. Whether the core submits _from_ the queue or `drawRenderProxy` remains the single draw path is the package's central identity question. _Parked:_ gated on Open direction 1 (does the core own the draw loop?). Build only after that ruling; until then the Recommended doc-softening covers the drift.

- **Backend-agnostic render-pass / target-attachment descriptor** (`RenderPassDescriptor`, `RenderAttachment`, `LoadOp`/`StoreOp`, `ClearValue`, `beginRenderPass`/`endRenderPass`, viewport/ scissor helpers). The largest remaining render-core hole. _Parked:_ cross-package — it must subsume what `render-gl` (`beginGlRenderTarget`, `glRenderTargetPool`) and `render-wgpu` already do, a coordinated change across three packages, and is gated on Open direction 2 (is the pass abstraction homed in `render` or the GPU cores?).

- **Frame-graph / multi-pass dependency description** (`RenderGraph`, `RenderGraphNode`, `RenderResource`, transient-target aliasing, `compile`/`execute`). _Parked:_ Gold-tier, depends on the pass descriptor above, and structural-fork G flags `render-graph`'s reshaping of `render` as "its own design pass." Gated on Open direction 3.

- **3D prepare to the authoritative bar** — point/spot lights beyond the single directional+ambient, light culling, shadow-caster collection, draw-order/material sort, GPU instancing, LOD. _Parked:_ cross-package coordination with the `scene`/`mesh`/`lighting` roadmap owners (structural-fork A and G); explicitly not to be built unilaterally in `render`. Gated on Open direction 6.

- **Full diagnostics layer** — per-format breakdown, triangle/vertex counts, CPU/GPU timing markers (`RenderTimerBackend` seam), and an `enableRenderProxySignals` debug-capture group. _Parked:_ the diagnostics bar is an unsettled design decision (counters exist today as an adequate seam); gated on Open direction 4, and the GPU-timer/signals work introduces new seams rather than sweeping a within- package nit.

- **Relocate `computeTextFormatFontString` to `@flighthq/text`.** A CSS font-string builder still resident in the render core — a scope leak. _Parked:_ cross-package — the move touches ~14 import sites across the backends, a coordinated rename, not autonomous. Gated on Open direction 5.

- **Replace the `try/catch` culling control-flow with a sentinel-returning probe.** 2D culling reaches into `getNodeWorldBoundsRectangle`, which can throw, and swallows it as a conservative "in-view" result — satisfying the "expected failure returns a sentinel" rule via exception-catching rather than a sentinel. _Parked:_ the clean fix adds a sentinel-returning (`null`) bounds probe in `@flighthq/node`, a cross-package change; works correctly today, so this is a quality cleanup, not a correctness fix.

- **`flighthq-render` Rust crate parity** — mirror the driver/queue/pass/frame-graph seams 1:1 (`draw_render_proxy`, `flush_render_batch`, `RenderQueue`/`build_render_queue`, `RenderPassDescriptor`/ `begin_render_pass`, `RenderGraph`, `KindId`-keyed registry, `Signal<T>` stats events) and record any intentional divergence in the conformance map. _Parked:_ cross-repo conformance work that must _follow_ the TS seams settling (TS is authoritative), and the pass/frame-graph seams it would mirror are themselves still Backlog/undesigned.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

## Notes for the charter's Open directions (not edited here)

The charter is a stub. `review.md` already surfaced six candidate Open directions; this assessment did not move any of them into Recommended, and the Backlog above is gated on them:

1. Does the core own the single draw loop (`drawRenderProxy` / a future `drawRenderQueue`), or may immediate-mode backends still drive their own walk? — gates the queue-driving Backlog item.
2. Is the render-pass / target-attachment descriptor homed in `render` or the GPU cores? — gates the pass-descriptor Backlog item.
3. Is the frame-graph a `render` responsibility or a separate `render-graph` package?
4. What is the diagnostics bar (per-format/triangle counts, GPU-timer hooks, signals group)?
5. Bless the cross-package move of `computeTextFormatFontString` into `@flighthq/text`.
6. Who owns 3D prepare passes (point/spot lights, shadow casters, material/draw sort) — `render` or `scene`/`lighting`?

Seed absorbed: `reviews/maturation/depth/render.md` (Bronze/Silver/Gold roadmap) is fully reflected above and can be removed as one-time seed. Its Bronze items already landed in this bundle (per review.md); the residual Bronze nits are the Recommended set, and Silver/Gold map to the Backlog.

---
package: '@flighthq/render'
updated: 2026-09-23
by: auditor
---

# render — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/render/src/` on 2026-09-23.

- **The shared draw driver is absent.** The chartered `drawRenderProxy`, `submitRenderProxy`,
  `flushRenderBatch`, and `registerRenderBatchFlush` functions do not exist, so concrete backends still
  own their draw walks.
- **Queue and viewport primitives are unconsumed.** `buildRenderQueue`, `sortRenderQueue`,
  `isRenderableInViewport`, and `isRenderProxyInViewport` have no production callers outside their
  modules. Queue push allocates an entry object and queue sort allocates a slice.
- **Stats, blend stack, and render graph remain targets, not capabilities.** There is no
  `getRenderStateStats`, `pushRenderBlendState` / `popRenderBlendState`, or render-pass/graph API despite
  the charter naming them in scope.
- **3D preparation still re-walks the scene.** Collection is now iterative and includes InstancedMesh,
  but every prepare clears and repopulates the visible lists; no root aggregate revision proves reuse is
  safe.
- **Some state remains module-scoped.** `preparedScene3Ds`, `_buildStack`, `_collectStack`, and guard or
  scratch values have per-state or reusable semantics but do not satisfy the charter's strict runtime-slot
  posture and are not re-entrant.
- **The charter describes planned work as present ownership.** Its draw driver, counter snapshot, and
  render-graph claims should remain read as directed architecture until implementations land.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-23** — Re-audited current source: typed `Node2D` viewport bounds and iterative 3D collection
  have landed; canvas fallback ownership now uses `HostCanvasCapability`; the unconsumed queue, missing
  driver/stats/graph, full 3D re-walk, and module-scoped state remain open.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped ~130 lines describing the
  `builder-67dc46d64` bundle as implemented: `renderDriver.ts`, `renderBlendState.ts`,
  `getRenderStateStats`, `drawRenderProxy`, and `pushRenderBlendState` are all absent from this tree,
  and the 2026-06-25 entry below had already established the bundle was never merged here — the
  narration outlived its own retraction by six weeks. `renderQueue.ts` and `renderViewport.ts` from
  that bundle *are* present and are kept. Two residual claims re-checked and corrected: the
  `computeTextFormatFontString` cross-package move is **done** (it lives in
  `packages/text/src/textFormatFont.ts`), while the `pivotX` duck typing **survives** and is retained
  above.
- **2026-08-05** — Source-verified 54 commits since the 2026-07-13 review; state/runtime boundary
  intact. Gained opt-in color-adjustment propagation, registry coverage diagnostics, hierarchy-change
  proxy invalidation, wider 3D light packing.
- **2026-07-09** — `packSceneLightBlock` bumps `SceneLightBlock.version` only on real change, and
  scene-gl `bindGlMeshLightBlock` honors it per program. Previously it bumped every frame, defeating
  any version-keyed skip.
- **2026-06-25** — Recommended sweep executed nothing: all three items described the ingested
  `builder-67dc46d64` bundle, which was never landed in this tree.
- **2026-06-24** — `builder-67dc46d64` bundle ingested as-claimed. Superseded by the entry above.

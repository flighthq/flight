---
package: '@flighthq/render'
updated: 2026-08-08
by: principal
---

# render — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/render/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **No render-state-wide guard/explain surface.** `enableSceneRenderGuards` and
  `explainScene2DRender` / `explainScene2DCoverage` exist, but each is scoped to a scene pass. The
  older combined `enableRenderGuards` / `explainRenderState` contract — draw-before-prepare, missing
  clip hooks — has no implementation; neither name appears in the tree.
- **`RenderTargetSizeOptions` is an exported header with no consumer.** Declared in
  `packages/types/src/RenderTargetSizeOptions.ts` and re-exported from `contract.ts`; zero importers
  outside `packages/types`. Either wire it or delete it.
- **`computeRenderTargetSize` allocates its result** (`renderTarget.ts:32`) — returns a fresh
  `{width, height}` rather than writing an `out`, against the explicit-allocation rule.
- **`renderQueue.ts` names `drawDriver._drawStack`, and there is no draw driver.** `renderDriver.ts`
  does not exist in this tree, so the reference points at nothing.
- **`RenderViewport2D` still duck-types the transform** — `renderViewport.ts:71` tests
  `'pivotX' in source` to decide whether a source carries a 2D transform.
- **3D prepare has no dirty short-circuit.** `prepareScene3DRender` (`sceneRender.ts:157`) clears and
  refills `prepared.meshes` every call, and `collectVisibleMeshes` (`:190`, self-call at `:228`) is
  recursive. `sceneGraphSyncPolicy` reaches only transform freshness, not the walk. An O(1) cached
  path needs a scene-root aggregate revision first.
- **Cross-backend viewport authority is unsettled.** GL derives camera aspect from the active
  viewport; the WGPU draw path still falls back to the camera-authored aspect. Tied to the held
  `RenderView` / sub-target ownership question in
  [render view model](../../render-view-model.md) — unratified, do not build on it.
- **No render graph, and the prerequisites are unbuilt.** Explicit pass/attachment descriptors and a
  view-ownership contract come first; both are cross-package (`render-gl`, `render-wgpu`) and want a
  ruling before anyone starts.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

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

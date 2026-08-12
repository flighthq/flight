---
package: '@flighthq/scene3d'
updated: 2026-08-08
by: principal
---

# scene3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene3d/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **Morph is a CPU vertex pass; skin is not.** `prepareScene3DMorph`
  calls `updateMeshMorph`, which blends base + Σ wᵢ·targetᵢ into `geometry.vertices` and bumps the
  version so every backend re-uploads (`packages/mesh/src/updateMeshMorph.ts:11`). It is dirty-gated,
  so a settled morph costs one weight compare. There is no GPU morph path — deltas are never resolved
  in the vertex shader — unlike skin, which poses in-shader from the bone palette.
- **`InstancedMesh` and `LodMesh` are headers with no implementation.**
  `packages/types/src/InstancedMesh.ts` and `LodMesh.ts` declare the interfaces, runtimes, and kinds;
  `InstancedMeshKind` / `LodMeshKind` have **zero** consumers outside `packages/types`. No
  `createInstancedMesh` / `createLodMesh` exists in this package or any other. `createBillboard`
  (`billboard.ts:31`) is the one member of that taxonomy that landed.
- **No subtree clone.** `cloneMesh` (`mesh.ts:35`) clones one node; there is no `cloneNode3D` anywhere
  in `packages/`, so copying a hierarchy is caller work. The undecided part is ownership semantics for
  shared geometry/material references.
- **`createScene3DLightsFromDocument` is an initial-placement snapshot** (`sceneDocumentLights.ts:38`).
  A document light's optional node binding is not live, so animating that node does not move the
  returned descriptor. Also lossy by contract: `Scene3DLights` carries one ambient and one directional
  slot, so the first representable descriptor of each kind in document order wins.
- **Document flow is import-only.** `sceneDocument.ts` reads (`createScene3DFromDocument`,
  `createScene3DsFromDocument`); nothing writes a `Scene3DDocument` back out, so a scene cannot
  round-trip.
- **No diagnostics layer.** The package exports no `enable*Guards` and no `explain*` query — the only
  `enable*` functions are the three signal openers (`sceneNode.ts:37`, `mesh.ts:70`,
  `billboard.ts:45`). Both backends carry guard and explain modules; this graph carries none, against
  the inversion rule.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the whole 2026-06-24 deferred
  list as stale: frustum culling shipped as `buildScene3DFrustum` / `cullNode3DByFrustum`
  (`sceneNodeCulling.ts:21,36`) and raycasting shipped as `pickScene3D` / `pickScene3DWithRay3D` in
  `@flighthq/picking`, both filed there for two months as "cross-package design decision required".
  The 2026-07-19 morph/skin note was half false and is corrected above — skin no longer CPU-blends per
  frame; it poses on the GPU from the palette `prepareScene3DSkinning` readies. Traversal and TRS
  helpers named in that list are not gone but **moved** to `@flighthq/node`
  (`node/src/traversal.ts`); `disposeSceneNode` is now `disposeNode3D` (`scene.ts:14`).
- **2026-08-01** — `createScene3DLightsFromDocument` bridges a document's standalone light table into a
  renderer-ready `Scene3DLights` without attaching lights to the assembled scene.
- **2026-07-19** — Recorded the morph/skin composition gap; see the correction above.
- **2026-06-24** — Traversal, TRS, world-bounds, and dispose surfaces landed; most have since moved to
  `@flighthq/node`.

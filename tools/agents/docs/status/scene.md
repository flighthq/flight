# @flighthq/scene status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `packages/scene/src/` down to `mesh`, `scene`, `sceneNode`, and `index`, but `dist/` proved nine `sceneNode*` modules had compiled. Reconstructed the recoverable ones from `dist/<m>.js` (impl + comments) merged with `dist/<m>.d.ts` (types), tests from `dist/<m>.test.js`. The "camera pattern".

### Recovered (4 modules)

- **sceneNodeBounds** — `getSceneNodeWorldBounds(out, node)`: world-space AABB accumulation over a subtree, Mesh leaves transformed by world matrix, empty box when no mesh. Alias-safe.
- **sceneNodeCulling** — `buildSceneFrustum(out, viewProjection)`, `cullSceneNodeByFrustum(out, root, frustum)`: frustum extraction from a view-projection matrix and depth-first AABB frustum culling that appends visible Mesh leaves to `out` (does not clear), skipping disabled subtrees.
- **sceneNodeDispose** — `disposeSceneNode(node)`: detach + recursive dispose to GC (no GPU teardown; `dispose*` contract).
- **sceneNodeTransform** — `getSceneNodePosition`, `getSceneNodeRotationQuaternion`, `getSceneNodeScale`, `setSceneNodeLookAt`, `setSceneNodePosition`, `setSceneNodeRotationQuaternion`, `setSceneNodeScale`, `setSceneNodeTransform`: decompose/recompose TRS helpers over `localMatrix` plus a model-space look-at.

Added matching `export *` lines to `src/index.ts` (alphabetized) and colocated `*.test.ts` for each.

### Parked (5 modules) — all blocked by missing dependencies outside the scene package (HARD BOUNDARY)

- **sceneNodeRaycast** (`raycastSceneNode`, `raycastSceneNodeFirst`) — needs types `SceneRaycastHit` and `SceneRaycastOptions` in `@flighthq/types` (absent from `packages/types/src/`). Genuine work; recover once the types exist.
- **sceneNodeTaxonomy** (`createBillboard`/`createGroup`/`createInstancedMesh`/`createLodMesh` + their `is*`/`get*`/`set*`/`selectLodMeshLevel`) — needs types `Billboard`, `BillboardMode`, `Group`, `InstancedMesh`, `LodLevel`, `LodMesh` and kind consts `BillboardKind`/`GroupKind`/`InstancedMeshKind`/ `LodMeshKind` in `@flighthq/types` (all absent). Genuine work.
- **sceneNodeClone** (`cloneSceneNode`) — imports the taxonomy constructors/predicates above; blocked transitively until `sceneNodeTaxonomy` is recoverable.
- **sceneNodeBoundingSphere** (`getSceneNodeWorldBoundingSphere`) — needs `computeMeshGeometryBoundingSphere` from `@flighthq/mesh`, which is present in `mesh/dist` but was pruned from `mesh/src` (also a curation loss, in another package). Recover after that mesh function is restored.
- **sceneNodeTraversal** (`findSceneNodeByName`/`findSceneNodesWhere`/`findSceneNodeWhere`/ `forEachSceneNodeChild`/`traverseSceneNode`/`traverseSceneNodePostOrder`) — needs type `SceneNodeVisitor` in `@flighthq/types` (absent). Genuine work.

### Fossils skipped

None. None of the dist modules implement a deliberately-dropped concept; every parked item is genuine work blocked only by a missing cross-package dependency.

### Test result

`npm run test --workspace=packages/scene` — 7 files, 84 tests, all passing.

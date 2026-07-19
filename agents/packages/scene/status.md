---
package: '@flighthq/scene'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# scene — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-07-19 — morph corrective-over-skin composition follow-up (doc-honesty stage)

`updateMeshMorph` + `updateMeshSkin` both currently CPU-blend into `geometry.vertices` and re-upload;
the documented ordering (morph first so the skin captures its bind pose from the morphed result — see
the durable note in `updateMeshMorph.ts`) makes corrective-shapes-over-skinning *correct* but *not
composed on the GPU*. AAA depth gap, parked here rather than inline: a true composed skin+morph GPU path
(morph deltas + bone palette resolved together in the vertex shader, no per-frame CPU rewrite of the
vertex buffer) is deferred — see the morph-target-animation charter's open directions. Until then a
mesh carrying both deformers pays a full CPU vertex pass per frame.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/scene

**Session date:** 2026-06-24 **Starting score:** 22/100 (stub) **Estimated new score:** 52/100 (Bronze complete, trending toward Silver)

## Implemented APIs

### Types added to `@flighthq/types`

- **`SceneNodeVisitor`** (`SceneNodeVisitor.ts`) — visitor callback type `(node: Readonly<SceneNode>, depth: number) => boolean | void`. Return `false` to prune the subtree.

### New exports in `@flighthq/scene`

#### `sceneNodeTraversal.ts` — 3D scene traversal and query

- `findSceneNodeByName(root, name)` — depth-first pre-order search by name; returns first match or `null`
- `findSceneNodesWhere(out, root, predicate)` — collect all matching nodes into `out[]` (no allocation, returns `out`)
- `findSceneNodeWhere(root, predicate)` — first depth-first pre-order match; returns `null` on miss
- `forEachSceneNodeChild(node, visitor)` — shallow iteration over direct children; stops early on `false`
- `traverseSceneNode(root, visitor)` — depth-first pre-order walk with prune-on-`false`; visits `root` at depth 0
- `traverseSceneNodePostOrder(root, visitor)` — depth-first post-order walk; suited for teardown/bottom-up

#### `sceneNodeTransform.ts` — TRS ergonomics and lookAt

- `getSceneNodePosition(out, node)` — reads translation from `localMatrix`; alias-safe
- `getSceneNodeRotationQuaternion(out, node)` — decomposes rotation from `localMatrix`; alias-safe
- `getSceneNodeScale(out, node)` — decomposes scale from `localMatrix`; alias-safe
- `setSceneNodeLookAt(node, eye, target, up)` — model-space look-at matrix at `eye` facing `target`; marks dirty
- `setSceneNodePosition(node, x, y, z)` — fast translation-only write (does not recompose); marks dirty
- `setSceneNodeRotationQuaternion(node, q)` — sets rotation via decompose–recompose; preserves position/scale; marks dirty
- `setSceneNodeScale(node, x, y, z)` — sets scale via decompose–recompose; preserves position/rotation; marks dirty
- `setSceneNodeTransform(node, position, rotation, scale)` — full TRS recompose in one call; alias-safe; marks dirty

#### `sceneNodeBounds.ts` — world-space bounds aggregation

- `getSceneNodeWorldBounds(out, node)` — accumulates world-space AABB across all Mesh descendants; resets `out` to empty before accumulation; alias-safe

#### `sceneNodeDispose.ts` — subtree teardown

- `disposeSceneNode(node)` — detaches from parent, recursively disposes all descendants, clears signal registries; calls through to `disposeNode`; does not free GPU resources

### Bug fixes / doc corrections

- `scene.ts`: corrected render-pipeline doc comment from `drawScene` (non-existent) to `drawGlScene / drawWgpuScene`

### Package dependency change

- `@flighthq/mesh` moved from `devDependencies` to `dependencies` (required for `computeMeshGeometryBounds` in `getSceneNodeWorldBounds`)

### Tests

- `sceneNodeTraversal.test.ts` — 38 tests covering all 6 traversal/query functions
- `sceneNodeTransform.test.ts` — 16 tests covering all 8 TRS functions, including alias-safety cases
- `sceneNodeBounds.test.ts` — 7 tests covering `getSceneNodeWorldBounds` (empty, single mesh, offset, multi-mesh, recursive, alias-safe)
- `sceneNodeDispose.test.ts` — 4 tests covering `disposeSceneNode`

**Total tests: 101 (7 test files, all passing)**

## Deferred items and why

### Silver items (cross-package design decisions required)

- **Frustum culling (`cullSceneNodeByFrustum`)** — depends on `getCameraViewProjectionMatrix4` from `@flighthq/camera`. The integration point with `@flighthq/render`'s `prepareSceneRender` (does render consume a cull result, or does scene expose a cull pass the render walk calls?) requires a coordinated design decision before building.
- **Raycasting (`raycastSceneNode`, `raycastSceneNodeFirst`, `raycastSceneNodeFromCamera`)** — per-triangle narrowphase against `MeshGeometry` triangles (iterating index + vertex buffer) is self-contained, but the types (`SceneRaycastHit`, `SceneRaycastOptions`) and the camera screen-pick path (`getCameraInverseViewProjectionMatrix4`) need a design pass. Added as a cross-package item.
- **Instanced/LOD/Billboard node taxonomy** (`createGroup`, `createInstancedMesh`, `createLodMesh`, `createBillboard`) — the instanced-draw path touches `scene-gl`/`scene-wgpu` backends. Surface this as a coordinated cross-package effort.
- **Per-node render layer / visibility mask** — adds `renderLayer` field to `SceneNode` which is a types change; coordinate with render and cull.
- **Subtree clone (`cloneSceneNode`)** — straightforward but touches `@flighthq/mesh` (geometry/material references); ownership semantics need doc + review.

### Gold items (multi-session design programs)

- **Skinning/animation nodes** (`createBone`, `createSkeleton`, `createSkinnedMesh`) — touches `mesh` (skin weights) and render backends (palette upload); largest cross-package effort.
- **Spatial acceleration structures** (BVH/octree) — decide whether `scene` internal or `scene-spatial` neighbor.
- **Scene serialization** — descriptor shape requires `@flighthq/resources` resource-key strategy.
- **Rust-port parity (`flighthq-scene`)** — not yet started; full surface mirror after all TS tiers land.

## Concerns and surprises

- **`setMatrix4LookAt` is a VIEW matrix, not a model matrix.** The geometry function builds `-(dot(axis, eye))` translation (camera-space). `setSceneNodeLookAt` needed a separate implementation that writes a model matrix (translation = eye directly). This distinction must be clearly documented — camera look-at vs. scene-node look-at are different operations.
- **`setSceneNodeScale` uses a third scratch vector `_scratchVec3b2`** to avoid aliasing between the "new scale" write and the decompose output buffers — needed because `setSceneNodeScale` writes the desired scale into `_scratchVec3b` before calling `decomposeMatrix4`, which needs to output into a different variable.
- **`getSceneNodeWorldBounds` cannot mutate `MeshGeometry.bounds`** — the geometry is a `Readonly<MeshGeometry>` in the bounds aggregation code, so when `bounds === null`, the computation goes into a scratch AABB rather than caching into the geometry. This is correct (geometry is passed by reference and may be shared), but callers who want the cache populated should call `computeMeshGeometryBounds(geom.bounds ??= createAabb(), geom)` before the bounds walk.
- **`disposeSceneNode` is intentionally thin** — it simply calls `disposeNode` from `@flighthq/node`. The extra layer exists so the scene package owns the named API (rather than users calling `disposeNode` directly for scene nodes), and so future scene-specific teardown (e.g., signals, render proxy cleanup) has a hook point.

## Suggestions for future sessions

1. **Implement `cullSceneNodeByFrustum` + `buildSceneFrustum`** — the two most impactful Silver items. All the geometry math exists; the only open question is the render-walk integration contract.
2. **Implement `raycastSceneNode`** — triangle-level intersection against `MeshGeometry`. The broadphase (world AABB via `getSceneNodeWorldBounds`) is now in place; the narrowphase just needs index/vertex iteration.
3. **Implement `cloneSceneNode`** — low design risk (geometry/materials share by reference), high utility for instancing patterns before `createInstancedMesh` lands.
4. **Consider `getSceneNodeWorldBoundingSphere`** — a bounding sphere alongside the AABB for cheaper frustum rejection (sphere test is one comparison vs. 6 for AABB).
5. **Coordinate with `@flighthq/render` on the cull/render-walk integration** before building Silver. The question: does `prepareSceneRender` accept a pre-filtered list (from `cullSceneNodeByFrustum`), or does scene expose a cull callback the render walk uses?

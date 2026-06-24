---
package: '@flighthq/scene'
status: solid
score: 68
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# scene — Review

> Survey of `@flighthq/scene` from the incoming bundle `builder-67dc46d64` (head, committed at `67dc46d64`; `dirty: false`). Evidence is `incoming/builder-67dc46d64/head/packages/scene/` plus `committed.patch`. No prior `reviews/depth/scene.md` exists in this worktree, so this is the first survey. The charter is a stub (only "What it is" is seeded), so the package is judged against the codebase-map AAA standard and the structural forks, with every charter silence flagged below.

## Verdict

`solid — 68/100`. What the codebase map still calls "a doorway… the road mostly untaken" is no longer a stub: this session built the 3D scene graph out into a real spatial-query surface — traversal, TRS ergonomics, world AABB + bounding sphere, frustum culling, raycasting, a node taxonomy (Group/Mesh/InstancedMesh/LodMesh/Billboard), subtree clone, and dispose. Twelve source files, 172 colocated tests, render-free, side-effect-free, all types homed in `@flighthq/types`. It clears Bronze comfortably and reaches into Silver. It is held back from a higher score by (a) a stale status doc that under-claims the actual work, (b) a raycaster that allocates per hit and carries dead ternaries, and (c) a charter with no North star or boundaries to anchor the in-scope/out-of-scope calls the package is now implicitly making.

## Status-doc verification (AS-CLAIMED → verified)

The distributed worker report (`status.md`, 2026-06-24) is a **mid-session snapshot** and is now **stale against the committed head**. Every item it lists as _deferred_ is in fact implemented and committed (`committed.patch`):

| status.md claim | Reality in head/src + committed.patch |
| --- | --- |
| "Estimated new score 52/100 (Bronze complete)" | Under-claims — culling, raycast, taxonomy, clone, bounding sphere all landed |
| Frustum culling **deferred** (Silver) | `sceneNodeCulling.ts`: `buildSceneFrustum`, `cullSceneNodeByFrustum` — committed, 7 tests |
| Raycasting **deferred** (Silver) | `sceneNodeRaycast.ts`: `raycastSceneNode`, `raycastSceneNodeFirst` — committed, 13 tests |
| Instanced/LOD/Billboard taxonomy **deferred** (Silver) | `sceneNodeTaxonomy.ts`: `createGroup/createInstancedMesh/createLodMesh/createBillboard` + `is*`/`selectLodMeshLevel`/`setInstancedMesh*` — committed, 35 tests |
| Subtree clone **deferred** (Silver) | `sceneNodeClone.ts`: `cloneSceneNode` — committed, 10 tests |
| `getSceneNodeWorldBoundingSphere` "consider" (suggestion #4) | `sceneNodeBoundingSphere.ts` — committed, 6 tests |
| "Total tests: 101 (7 files)" | Actually **172 tests across 12 source test files** |
| `@flighthq/mesh` moved to `dependencies` | Confirmed in `package.json` |

The `dist/` captured in the bundle predates these files (it shows only the 6-file Bronze surface), which is why `index.d.ts` under-reports the API; `src/index.ts` is the source of truth and re-exports all twelve modules. **Recommendation for the status pass: replace the stale entry** — it actively misleads on what is built and would re-task already-done Silver work. The status file is not a correctness finding against the _code_; it is a continuity-log staleness finding.

## Present capabilities

Grounded in `head/packages/scene/src/`:

- **Node primitives** (`sceneNode.ts`, `scene.ts`, `mesh.ts`): `createSceneNode`/`createScene`/ `createMesh`, the `SceneNodeRuntime` (`worldMatrix` slot, `HasTransform3D` trait), per-entity signal opt-in (`enableSceneNodeSignals`/`enableMeshSignals` delegating to `@flighthq/node`), and `isMesh` discriminating by presence of `geometry` rather than kind — robust across custom kinds.
- **Traversal/query** (`sceneNodeTraversal.ts`): `traverseSceneNode` (pre-order, prune-on-`false`), `traverseSceneNodePostOrder`, `forEachSceneNodeChild`, `findSceneNodeByName`, `findSceneNodeWhere`, `findSceneNodesWhere` (out-array, no alloc). Clean depth-tracking via the `SceneNodeVisitor` type.
- **TRS ergonomics** (`sceneNodeTransform.ts`): get/set position, rotation (quaternion), scale, `setSceneNodeTransform` (full TRS recompose), and `setSceneNodeLookAt` — correctly a _model_ matrix, distinct from geometry's view-matrix `setMatrix4LookAt`, with the distinction documented inline. Module-scratch vectors/quat for zero hot-path allocation; alias-safety comments throughout.
- **Bounds** (`sceneNodeBounds.ts`, `sceneNodeBoundingSphere.ts`): world-space AABB and bounding-sphere aggregation over all Mesh descendants, both out-param and alias-safe, both resetting to an empty box/sphere first. Sphere is offered as the cheaper frustum pre-filter (documented).
- **Culling** (`sceneNodeCulling.ts`): `buildSceneFrustum` (from a view-projection matrix) + `cullSceneNodeByFrustum` collecting visible Mesh leaves into an out-array, skipping disabled subtrees. The render-integration contract the status flagged as "needs a decision" was resolved the right way: a **caller-driven, acyclic** seam — scene builds the cull list, the render walk consumes it; scene never imports render. This is documented in the function's design note and matches the codebase-map "rendering is something the caller invokes by name" rule.
- **Raycasting** (`sceneNodeRaycast.ts`): `raycastSceneNode`/`raycastSceneNodeFirst` with AABB broadphase + Möller-Trumbore narrowphase, triangle-list and triangle-strip (with odd-triangle winding flip), indexed and non-indexed, `maxDistance`/`backfaceCull`/`predicate` options, subset resolution, and optional world-space normals. World-space triangle transform avoids needing an inverse-world matrix.
- **Taxonomy** (`sceneNodeTaxonomy.ts`): `Group`, `InstancedMesh` (instance matrices + packed-RGBA per-instance colors + active-count window), `LodMesh` (distance-selected levels), `Billboard` (`full`/`axisY`/`screenAligned`). Each has a constructor, a presence-based `is*` guard, and the field accessors a backend needs (`selectLodMeshLevel`, `setInstancedMeshInstance*`). Orientation/ instancing draw is correctly left to `scene-gl`/`scene-wgpu`.
- **Lifecycle** (`sceneNodeClone.ts`, `sceneNodeDispose.ts`): `cloneSceneNode` (deep structural copy, geometry/materials shared by reference with the ownership caveat documented; per-taxonomy reconstruction) and `disposeSceneNode` (thin delegate to `disposeNode`, intentionally a named hook point, GPU-free per the `dispose*` contract).

Render integration lives correctly **outside** this package: `render/src/sceneRender.ts` (`prepareSceneRender`), `scene-gl/src/drawGlScene.ts`, and `scene-wgpu` are siblings in the bundle. `scene` itself imports only `geometry`, `mesh`, `node`, `signals`, `types` — no render dependency, `sideEffects: false`, single root `.` export. The triad's 3D family is materializing as designed.

## Gaps

What a mature 3D scene-graph library has that this one does not yet:

- **Raycaster code quality.** `sceneNodeRaycast.ts` has two no-op ternaries (`absoluteTriIndex = indexedMode ? tri : tri` and the identical-branch `absoluteIndexStart`), confusing dead logic that should collapse. It allocates **per hit**: each `SceneRaycastHit` is a fresh object literal and `point` is `{ x, y, z } as Vector3`; the normal path calls a local `_createVector3()` that returns `{ x:0,y:0,z:0 } as Vector3` — a literal cast — _next to an imported `createVector3` it does not use_. This violates the source-style rule "prefer constructors over object literals for SDK entity types," and the per-hit allocation is a GC hazard for a query meant to run on pointer-move. (A result type carrying entities is allocation by necessity, but it should use the constructors.)
- **Normal accuracy.** Raycast normals are transformed by the world matrix's upper-3×3, not its inverse-transpose; documented as a uniform-scale-only approximation, but wrong under non-uniform scale — a real gap for skewed/stretched meshes.
- **No spatial acceleration.** Culling and raycasting are linear subtree walks. A mature graph offers a BVH/octree (the status' own Gold item) for large scenes; absent here, every query is O(n) over all meshes. Acceptable at this stage but a named ceiling.
- **No per-node visibility/layer mask.** Culling keys only on `enabled`; there is no render-layer or visibility-mask field (the status' deferred "renderLayer") for selective culling/picking.
- **Skinning/animation node family absent** (`Bone`/`Skeleton`/`SkinnedMesh`) — the largest Gold item; expected for AAA but cross-package (mesh skin weights + backend palette upload).
- **No serialization / scene descriptor.** No round-trip to a plain descriptor; needs a resource-key strategy and is cross-package.
- **No Rust crate yet.** `flighthq-scene` is unstarted (TS is authoritative; mirror is downstream).
- **`createScene` vs `createGroup` overlap.** Both produce transform-only roots; `Scene = SceneNode` while `Group` is a distinct kind. The intended difference (root identity vs. interior container) is reasonable but undocumented as a boundary — see open directions.

## Charter contradictions

The charter has only a seeded "What it is" line and no North star, Boundaries, or Decisions, so there is little to contradict. Measured against the **one** thing it asserts — "a scene root, transform-only group nodes, and renderable mesh leaf nodes, plus the runtime/signal/world-matrix plumbing those nodes need to participate in a render walk" — the code is **consistent and then some**: it delivers exactly that core and extends it (taxonomy, queries) without violating it. The charter's implicit "participate in a render walk, but do not render" line is honored: no render import, caller-driven cull seam. **No contradictions found.**

## Contract & docs fit

**Lives up to the contract:**

- Types are `@flighthq/types`-first — every new type (`SceneNode`, `Mesh`, `Group`, `Billboard`, `InstancedMesh`, `LodMesh`, `Ray3D`, `SceneRaycastHit`, `SceneRaycastOptions`, `SceneNodeVisitor`) is defined in `types/src/` and re-exported, per `committed.patch`. No cross-package type defined inline.
- Full unabbreviated names throughout (`getSceneNodeWorldBoundingSphere`, `cullSceneNodeByFrustum`).
- Out-params with documented alias-safety (`getSceneNode*`, `getSceneNodeWorldBounds/Sphere`); `find*Where`/`cull*`/`raycast*` take an out-array and return it.
- Sentinels not throws: `findSceneNodeWhere` → `null`, `raycastSceneNodeFirst` → `null`, `selectLodMeshLevel` → `-1`, `setInstancedMesh*` → `false` on out-of-range.
- `dispose*` vs `destroy*` distinction is correct and explicitly documented in `sceneNodeDispose.ts`.
- Single root `.` export, `sideEffects: false`, no top-level side effects, signals opt-in via `enable*` delegating to the owner package.

**Candidate doc revisions (user's gate, not mine to act on):**

- **Package Map line is stale.** `tools/agents/docs/index.md` still reads "`@flighthq/scene`: 3D world graph… A doorway for future development; the road is mostly untaken and the package is not yet built out." That is no longer true and contradicts structural-fork G's 2026-06-24 ruling ("full 3D is in scope… `scene`… becomes a priority build-out, not a doorway"). The line should be rewritten to describe the realized scene-graph + query surface.
- **`crate` front-matter.** Charter declares `crate: flighthq-scene`; the crate does not exist yet. Correct per the conformance "crate existence" intent (TS-first), but worth a register note that the mirror is pending.
- **Source-style enforcement.** The raycaster's object-literal entities would ideally be caught by whatever `npm run fix`/lint covers; flag that the "constructors over literals" rule is currently only prose, not mechanically enforced here.

**Structural-fork fit:**

- **Fork B (closed union vs open registry).** `cloneSceneNode`'s `_cloneNode` is a closed `if (isInstancedMesh) … else if (isLodMesh) … else if (isBillboard) … else if (isMesh) …` cascade over the taxonomy. Today the family is small and the cascade is fine (fork B's "tight loop within a closed system" exception), but clone is exactly the kind of per-kind dispatch that taxes every new node type and is a candidate to flip to a registry (a per-kind `cloneNode` registered beside the constructor) as the taxonomy grows. Worth tracking, not yet acting on.
- **Fork A (source-data vs graph participation).** `scene` holds graph participation; `mesh` holds geometry data; `InstancedMesh` fuses the instance buffer (source data) with the node — the same sim-vs-node fusion the fork flags for particles↔sprite. The line is currently drawn at "instance buffers live on the node"; whether they should live in a `mesh`/instancing data layer is an open fork question, not a defect.
- **Fork C (within-unit feature-bundling smell).** No single hot function bundles config-gated feature branches here; the closest is the raycaster's topology branching, which is legitimate geometry handling, not feature-flag bundling.

## Candidate open directions

The charter is silent on these; each is something this review had to assume and should feed the charter's Open directions for the user to settle:

1. **North star / bar.** What defines "good" for `scene` — minimal spatial graph + queries, or a full three.js/Babylon-class scene system (acceleration structures, layers, scene-level lighting/ environment binding)? Fork G says full 3D is in scope; the per-package bar is still unstated.
2. **Boundaries: `Scene` vs `Group` vs bare `SceneNode`.** Three near-identical transform-only node forms exist. Bless the intended distinction (root identity vs. named container vs. anonymous transform) or collapse it.
3. **Where the cull/render-walk contract is owned.** The package chose a caller-driven cull list (acyclic, scene builds → render consumes). Is that the blessed seam, or should `prepareSceneRender` own culling? This is the one cross-package design decision the build implicitly made; it should be ratified rather than left implicit.
4. **Acceleration-structure home.** BVH/octree as `scene`-internal vs. a `scene-spatial` neighbor — the status raised this; it is a bedrock/decomposition call.
5. **Instance-data home (fork A).** Do per-instance matrices/colors belong on the `InstancedMesh` node (current) or a separate instancing data layer?
6. **Visibility/layer mask.** Is a `renderLayer`/visibility-mask field in scope (a `types` change coordinated with render and cull)?
7. **Skinning/animation node family.** In or out of `scene` (vs. a future `skeleton`/`animation` package, per fork G's within-3D boundary question)?
8. **Raycast result allocation policy.** Should hits be pooled/reused (acquire/release) for pointer-move-frequency picking, or is per-call allocation acceptable? Settles the raycaster cleanup above.

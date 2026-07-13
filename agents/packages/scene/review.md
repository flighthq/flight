---
package: '@flighthq/scene'
status: partial
score: 55
updated: 2026-07-13
ingested:
  - status.md
  - source
  - tests
---

# scene — Review

> Survey of the **live worktree** (`packages/scene/src/`, 17 files: 8 modules + 8 tests + barrel, ~440 source lines, 90 tests). The prior review (2026-06-24, solid/68) was evidence-based on the incoming bundle `builder-67dc46d64`; **the live tree never received four of that bundle's modules**. Commit `06a0c480` ("recover lost source across packages") restored `sceneNodeBounds`/`sceneNodeCulling`/`sceneNodeDispose`/`sceneNodeTransform` (+ tests) but **not** `sceneNodeTraversal`, `sceneNodeTaxonomy`, `sceneNodeClone`, `sceneNodeBoundingSphere`, or `sceneNodeRaycast`. Since then, `6e188717` added the new `sceneAnimation` binding layer. This review re-scores the tree as it stands.

## Verdict

`partial — 55/100`. What exists is clean, contract-conformant, and well-tested: node/mesh primitives, TRS ergonomics with a correct model-space lookAt, world-AABB aggregation, frustum culling, dispose, and a new animation-clip binding layer. But the tree is thinner than both the prior review and the charter describe. Of the bundle's losses: raycast is **superseded by design** (`@flighthq/picking` now owns the full camera/ray pick over `SceneHit`, per the 2026-07-03 "keep standalone" Decision), and traversal is **well-homed generically** in `@flighthq/node` (`findNode`, `findNodeByName`, `forEachNodeDescendant`, `walkNodeDescendants`, `forEachNodeAncestor`, `getNodeCommonAncestor`, `reparentNode`). The taxonomy (`Group`/`InstancedMesh`/`LodMesh`/`Billboard`), `cloneSceneNode`, and `getSceneNodeWorldBoundingSphere` are **genuinely gone** — their types sit orphaned in `@flighthq/types` with zero consumers. BVH/octree acceleration is in scope by Decision but unstarted, and scene's cull surface has no production consumer (render duplicates the walk internally).

## Present capabilities

Grounded in `packages/scene/src/`:

- **Node primitives** (`sceneNode.ts`, `scene.ts`, `mesh.ts`): `createSceneNode`/`createScene`/`createMesh` over the shared `@flighthq/node` spine (`SceneNodeRuntime` with the `worldMatrix` slot, `SceneNodeTraitsKey`), per-entity signal opt-in (`enableSceneNodeSignals`/`enableMeshSignals` delegating to node), `getSceneNodeRuntime`/`getMeshRuntime` accessors, and `isMesh` discriminating structurally by presence of `geometry` — robust across custom kinds. `Scene = SceneNode` (observer-agnostic root; camera and lights are draw-args, matching the render-architecture principle).
- **TRS ergonomics** (`sceneNodeTransform.ts`): get/set position, rotation quaternion, scale; `setSceneNodeTransform` full recompose; `setSceneNodeLookAt` correctly building a **model** matrix (translation = eye), explicitly distinguished from geometry's view-matrix `setMatrix4LookAt`. Module-scratch vectors/quat, alias-safety documented, `invalidateNodeLocalTransform` on every write.
- **Bounds** (`sceneNodeBounds.ts`): `getSceneNodeWorldBounds` — world-space AABB over all Mesh descendants, resets `out` to an empty box, prefers cached `geometry.bounds`, computes into scratch when null (never mutates shared geometry), alias-safe.
- **Culling** (`sceneNodeCulling.ts`): `buildSceneFrustum` (view-projection → frustum) + `cullSceneNodeByFrustum` (out-array of visible Mesh leaves, disabled subtrees pruned, caller controls accumulation). The caller-driven acyclic seam is documented in a design note.
- **Animation binding** (`sceneAnimation.ts`, new since the prior review): `applyAnimationClipToScene` — the 3D binding layer over the target-free `@flighthq/animation` core, mapping `SceneAnimationTarget {node, path}` channel refs onto node TRS via the transform setters. Types (`SceneAnimationTarget`, `SceneAnimationPath` + constants) homed in `@flighthq/types`.
- **Lifecycle** (`sceneNodeDispose.ts`): `disposeSceneNode`, a thin named delegate to `disposeNode`, with the `dispose*`-vs-`destroy*` contract explicitly documented (GPU frees belong to the render packages).
- **Tests**: 90 `it` blocks across 8 colocated files; alias-safety cases present (`sceneNodeTransform.test.ts:153,202`, `sceneNodeBounds.test.ts:81`); hierarchy/world-transform integration covered in `sceneNode.test.ts`.

Downstream consumers are real: `@flighthq/picking` (imports `getSceneNodeWorldBounds`, `isMesh`, `Scene`), `@flighthq/skeleton` (`createSceneNode`, `setSceneNodePosition`), `@flighthq/scene-formats` (`createSceneFromGltf/Glb` return a `Scene`), and the render/scene-gl/scene-wgpu test suites. Deps are exactly `animation`/`geometry`/`mesh`/`node`/`types`; no render import; `sideEffects: false`; single root export.

## Gaps

Judged against the charter, the render-architecture target ("Scene = what exists", minimal `Scene`/`Mesh`/bare-group node set — which the live tree **does** deliver), and a textbook scene-graph layer:

- **Lost taxonomy, clone, and bounding sphere.** `Group`, `InstancedMesh` (instance matrices/colors/count), `LodMesh` (`LodLevel[]`), `Billboard` (`BillboardMode`) exist as complete types in `@flighthq/types` (`Group.ts`, `InstancedMesh.ts`, `LodMesh.ts`, `Billboard.ts`) with **no constructor, guard, or consumer anywhere in the tree** — as does `SceneNodeVisitor.ts`. `cloneSceneNode` and `getSceneNodeWorldBoundingSphere` are likewise absent. The charter's Boundaries list all of these as "realized".
- **Scene's cull surface has no production consumer.** `prepareSceneRender` (`packages/render/src/sceneRender.ts`) reimplements the walk internally (`collectVisibleMeshes`, including its own structural `geometry != null` mesh test and frustum check) rather than consuming `cullSceneNodeByFrustum`. The charter's North-star seam ("scene builds the list, the render walk consumes it") is currently honored in dependency direction but not in fact — the cull logic exists twice, and scene's copy is exercised only by its own tests.
- **No spatial acceleration** (BVH/octree) — in scope per the 2026-07-03 Decision; every bounds/cull query is an O(n) recursive walk.
- **No world-space TRS getters** (`getSceneNodeWorldPosition`/`WorldScale`/`WorldRotationQuaternion`) — a textbook staple; users must go through `getNodeWorldTransformMatrix4` + manual decompose.
- **No per-node visibility/layer mask** — culling keys only on `enabled` (Open direction 6).
- **No skinning node family, no serialization, no Rust crate** — all chartered as separate packages / open directions; `skeleton` exists and already consumes scene, so the node-family boundary is holding.
- **Optional `CameraNode`/`LightNode` + `findSceneCameras`/`findSceneLights`** (render-architecture's "additive, never structural" convenience) — not built; correctly absent until directed, but worth naming as the target's stated future.
- **Code-quality nits** (each grounded): `setSceneNodePosition`'s comment contradicts itself and its own implementation ("preserved by decompose–recompose … use `setSceneNodePosition` which is faster" — on `setSceneNodePosition` itself, which is the fast column-stomp path); `scene.ts` doc says "render via prepareSceneRender + drawScene" but no `drawScene` exists (backends export `drawGlScene`/`drawWgpuScene`); `sceneNodeCulling.ts` points to "`buildSceneFrustumFromCamera` in `@flighthq/camera`", which does not exist; `applyAnimationClipToScene` compares raw `'Translation'`/`'Scale'` literals instead of the exported `SceneAnimationPath*` constants and its trailing `else` treats **any** unknown path as Rotation; `sceneAnimation.test.ts` has no Rotation-path test (the quaternion path is untested); `sceneAnimation.test.ts` and `sceneNodeDispose.test.ts` omit the explicit `vitest` import the other six test files use; the mesh-local-bounds→world-AABB block is duplicated verbatim between `sceneNodeBounds.ts` and `sceneNodeCulling.ts`.

## Charter contradictions

The code violates no North-star **principle** — render-free, acyclic, plain data, out-params, sentinels, types-first all hold. But the charter's **factual claims** are now wrong against the tree:

- **Boundaries "In scope (today, realized)"** lists the taxonomy, traversal/find queries, subtree clone, bounding sphere, and raycasting. None of these live in `packages/scene/src/` today (raycast → `picking` by Decision; traversal → `node` generics; taxonomy/clone/sphere lost).
- **North star 2** cites `getSceneNodeWorldBoundingSphere` and raycast allocation policy; **Open directions 2, 5, 8, 9, 10** reason over code (`Group`, `InstancedMesh`, raycaster internals, `_cloneNode` cascade) that no longer exists here. Direction 8/9 (raycast allocation, normal accuracy) now belong to `picking`'s cell if anywhere.

These are charter-staleness findings for the user's gate, not code defects — but a successor reading the charter alone would materially mis-model the package.

## Contract & docs fit

**Lives up to the contract:** all cross-package types in `@flighthq/types` (`SceneNode`, `Mesh`, `SceneAnimationTarget`, `SceneAnimationPath`); full unabbreviated names (`cullSceneNodeByFrustum`, `getSceneNodeWorldBounds`); out-params first with documented alias-safety; sentinels not throws (`getSceneNodeSignals` → `null`; animation binding skips non-scene targets silently); `dispose*` semantics documented; single root `.` export, `sideEffects: false`, no top-level side effects, signals opt-in via `enable*`; every export has a colocated test (per file inspection). `crate: flighthq-scene` remains a forward declaration — TS-leads per Decision.

**Candidate doc/admin revisions (user's gate):**

- **Charter Boundaries + Open directions 2/5/8/9/10** need rebasing onto the live tree (see above); the raycast directions should migrate to `picking`'s cell.
- **`status.md` is doubly stale**: the newest entry (2026-06-24) is a mid-session snapshot of bundle work that was then partially lost; it would re-task or mis-task a successor. The lost-source event and the picking/node re-homing deserve a verified entry.
- **Package Map** (`agents/index.md`): `@flighthq/scene` "3D world graph; early stage" is defensible again, but `@flighthq/picking`'s line — "composition over `@flighthq/scene` raycast" — is wrong: scene exports no raycast; picking implements its own Möller–Trumbore over scene's bounds + `isMesh`.
- **Orphaned types** `Group`/`InstancedMesh`/`LodMesh`/`Billboard`/`SceneNodeVisitor` in `@flighthq/types` have zero consumers — reconcile (reimplement against them or remove them) once the taxonomy direction is settled.

## Candidate open directions

1. **Taxonomy restore-or-drop.** The types exist, the implementations do not. Restore `Group`/`InstancedMesh`/`LodMesh`/`Billboard` (the bundle's shape survives in the types), or remove the orphan types? Interacts with Open directions 2 (Scene/Group/SceneNode) and 5 (instance-data home).
2. **Cull-seam duplication.** Render's `collectVisibleMeshes` and scene's `cullSceneNodeByFrustum` are parallel implementations of one walk. Should render consume scene's cull list (making the charter's seam real), should scene's cull functions be dropped as unconsumed surface (fork B's "don't build the dispatcher"), or is deliberate duplication the blessed acyclic price? Sharpens Open direction 3.
3. **Where the visitor/traversal vocabulary lives.** `@flighthq/node` now owns generic traversal; `SceneNodeVisitor` in types is orphaned. Bless node as the traversal home (and delete the type), or does scene still want thin 3D-typed wrappers?
4. **BVH/octree shape** — in scope by Decision, home undecided (Open direction 4); now also the natural place to de-duplicate the bounds/cull walk.
5. **World-space TRS getters** — in scope for scene, or is matrix + geometry decompose the intended path?

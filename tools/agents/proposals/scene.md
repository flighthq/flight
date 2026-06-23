---
id: scene
title: '@flighthq/scene'
type: depth
target: scene
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/scene.md
  - tools/agents/docs/reviews/depth/scene.md
depends_on: []
updated: 2026-06-23
---

## Summary

stub — 22/100; a correctly-scoped but barely-populated 3D node-family declaration (Scene / SceneNode / Mesh constructors + runtime/signal plumbing) with no scene-specific traversal, query, bounds, culling, or richer node taxonomy of its own.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable scene-graph: a user can build a 3D hierarchy, walk it, find nodes by name, place nodes with TRS instead of raw matrices, and ask for a node's world-space bounds. This is the 20% that unblocks every example and every higher tier.

- **Types first (`@flighthq/types`):** add `SceneNodeVisitor` (a `(node: Readonly<SceneNode>, depth: number) => boolean | void` predicate/visitor contract; `false` prunes the subtree), and a `SceneNodeWorldBounds` shape if an aggregate result type is wanted (otherwise reuse `Aabb`). Confirm `SceneNode` exposes `localMatrix` and that a TRS-backed variant is representable.
- **3D-family traversal:** `traverseSceneNode(root, visitor)` (pre-order, draw/update-suited order, prune on `false`), `traverseSceneNodePostOrder(root, visitor)` for teardown-style walks, and `forEachSceneNodeChild(node, visitor)` as the shallow form. These are scene-graph table stakes with no natural home in generic `node`.
- **Name + predicate query:** `findSceneNodeByName(root, name)` (first match, returns `null`), `findSceneNodeWhere(root, predicate)`, `findSceneNodesWhere(out, root, predicate)` (collect-into-`out` array form, no allocation in the hot path). `getSceneNodeByName` only if a throw-on-missing variant is genuinely wanted — prefer the `find*`/`null` sentinel form.
- **TRS placement ergonomics on the node:** `setSceneNodePosition(node, x, y, z)`, `setSceneNodeRotationQuaternion(node, q)`, `setSceneNodeScale(node, x, y, z)`, and the composed `setSceneNodeTransform(node, position, rotation, scale)` — each writing the node's `localMatrix` via `composeMatrix4`, and marking the world-transform dirty through the existing node-invalidation path. Plus readers `getSceneNodePosition(out, node)` / `getSceneNodeRotationQuaternion(out, node)` / `getSceneNodeScale(out, node)` via `decomposeMatrix4`. This is the single biggest ergonomics gap: today the only way to place a node is to hand-build a Matrix4.
- **`lookAt` for a node:** `setSceneNodeLookAt(node, eye, target, up)` (orient a node toward a point), the scene-node analogue of the camera's existing `setCameraViewMatrix4FromLookAt`.
- **World-space bounds aggregation:** `getSceneNodeWorldBounds(out, node)` — accumulate this node's mesh AABB (via `computeMeshGeometryBounds`) and all descendant mesh AABBs transformed through their world matrices (via `ensureNodeWorldTransformMatrix4`) into one world-space `Aabb`. This is the feature that earns the word "spatial" and is the prerequisite for culling.
- **Subtree teardown:** `disposeSceneNode(node)` — detach signals/observer registries for the node and its subtree so it becomes GC-eligible (note: `dispose*`, not `destroy*`; GPU mesh uploads are freed by the render packages' `destroy*MeshGeometry*Data`, not here).
- **Doc + name-collision fixes:** correct the `scene.ts` render comment to name `prepareSceneRender` + `drawGlScene`; resolve the `createMesh` duplication with `@flighthq/mesh`.

### Silver

Competitive with the scene layer of a well-regarded 3D library (three.js `Object3D`/`Scene`, Babylon `TransformNode`/`Scene`): frustum culling, raycasting/picking, a real node taxonomy beyond bare-group-plus-mesh, subtree copy, and consistency with the render walk.

- **Types first (`@flighthq/types`):** `GroupKind`, `InstancedMeshKind`, `LodMeshKind`, `BillboardKind` string identifiers (PascalCase, built-in namespace); `InstancedMesh` (mesh + per-instance `Matrix4` array + count), `LodMesh` (ordered `{ distance, mesh }[]` levels), `Billboard` (a mesh leaf with a billboard mode flag), `SceneRaycastHit` (`{ node, distance, point, normal?, subset? }`), and a `SceneRaycastOptions` (`{ maxDistance, backfaceCull, predicate }`).
- **Frustum culling entry point:** `cullSceneNodeByFrustum(out, root, frustum)` — walk the subtree, test each renderable node's world AABB against a `Frustum` (`isFrustumIntersectingAabb`), collect visible nodes into `out`. Plus `buildSceneFrustum(out, camera, aspect)` convenience that derives the frustum from a camera's view-projection (`getCameraViewProjectionMatrix4` → `setFrustumFromMatrix4`). This is what `prepareSceneRender` should be able to consume so the GPU backends only draw visible meshes — coordinate the integration point with `@flighthq/render`.
- **Raycasting / picking:** `raycastSceneNode(out, root, rayOrigin, rayDirection, options?)` (collect sorted hits), `raycastSceneNodeFirst(out, root, rayOrigin, rayDirection, options?)` (nearest hit, `false`/`null` on miss), with broadphase via world AABB / bounding sphere then per-triangle narrowphase against `MeshGeometry`. `raycastSceneNodeFromCamera(out, root, camera, ndcX, ndcY)` for screen-pick using `getCameraInverseViewProjectionMatrix4`. The canonical 3D selection primitive — entirely absent today.
- **Node taxonomy:** `createGroup(obj?)` (a named transform-only node distinct from a bare `SceneNode`, mostly an intent/kind marker), `createInstancedMesh(geometry, materials, instanceMatrices, obj?)` + `setInstancedMeshInstanceMatrix4` / `getInstancedMeshInstanceCount` (GPU-instanced draw of one geometry), `createLodMesh(levels, obj?)` + `selectLodMeshLevel(lod, cameraDistance)` (distance-based level selection), `createBillboard(geometry, materials, mode, obj?)` (camera-facing leaf). Each is `is*`-discriminable (`isInstancedMesh`, `isLodMesh`, `isBillboard`) like the existing `isMesh`.
- **Subtree copy:** `cloneSceneNode(node)` (deep structural copy of the subtree; geometry/materials shared by reference, matrices copied), and `copySceneNodeChildren(target, source)`. Clarify ownership semantics in doc comments (what is shared vs. copied).
- **Per-node visibility & layer state:** confirm `enabled` is honored by traversal/cull (skip disabled subtrees), and add an optional `renderLayer`/`renderMask` field + `setSceneNodeRenderLayer` so cull/raycast can filter by layer — a common professional need (separate pick layers, overlay passes).
- **Signals coverage:** ensure `enableSceneNodeSignals` covers child-added/removed and transform-invalidated for 3D nodes (it currently delegates to the generic `enableNodeSignals`; verify the 3D-specific events a scene consumer expects are present, add scene-named accessors if a distinct group is warranted).
- **Tests + functional coverage:** colocated unit tests for every new export (the `exports:check` gate), plus a functional scene exercising traversal + cull + a raycast pick across the GL backend.

### Gold

Authoritative / AAA: exhaustive node taxonomy, spatial acceleration, deterministic performance, full edge-case handling, serialization, and 1:1 Rust-port parity. Nothing a 3D-engine author would find missing in the _scene_ layer (rendering, materials, lighting, camera remain in their own cells by design).

- **Skinning & animation-target nodes (types-first):** `SkeletonKind` / `BoneKind` / `SkinnedMeshKind`; `createBone`, `createSkeleton(bones, inverseBindMatrices)`, `createSkinnedMesh(geometry, materials, skeleton, obj?)`, `updateSkeletonPalette(out, skeleton)` (compute the joint matrix palette for the GPU). Morph-target support on `Mesh` (`setMeshMorphTargetWeight`, `getMeshMorphTargetWeight`). These are the last major node shapes a full SG kernel owns; they touch `mesh` (vertex skin weights) and the render backends (palette upload) — surface as a coordinated cross-package effort.
- **Spatial acceleration structures:** `createSceneBvh(root)` / `refitSceneBvh(bvh, root)` and `raycastSceneBvh` / `cullSceneBvh` so raycast and cull scale to large scenes instead of walking every node. Optionally an octree/grid variant for dynamic scenes. Decide whether the BVH lives here or in a focused `scene-spatial` neighbor — likely a `@flighthq/scene` internal with a public `create*`/`refit*`/`destroy*` surface, since it owns no GPU resource.
- **Bounding-sphere fast path:** `getSceneNodeWorldBoundingSphere(out, node)` alongside the AABB form, and sphere-based broadphase in cull/raycast for cheaper rejection.
- **Scene serialization / composition:** `serializeSceneNode(node)` → plain JSON descriptor tree (string-kind-driven, versioned per the types-layout migration model) and `deserializeSceneNode(descriptor, registry)`; `mergeSceneNode(target, source)` for combining scenes. Geometry/material references serialize as resource keys, not inline — coordinate the descriptor shape with `@flighthq/resources` and the kind-registry migration policy.
- **Performance & determinism:** revision/dirty-flag-driven world-bounds and cull caching (recompute only changed subtrees, using the existing `computeNodeWorldTransformRevision` revision plumbing); pooled scratch `Matrix4`/`Aabb`/`Vector3` via `acquire*`/`release*` in all traversal hot paths so culling/raycasting allocate nothing per frame; benchmarks gating large-scene walk cost.
- **Exhaustive edge cases & error handling:** empty geometry, degenerate (zero-scale) transforms, NaN-guarded bounds, cyclic-parent rejection (programmer-error throw), instanced count of 0, LOD with no levels, raycast against indexed vs non-indexed geometry, alias-safety on every `out`-param function (`out === source`), and disabled-subtree semantics consistently applied across traverse/cull/raycast/bounds.
- **Docs:** a package-level guide covering the 3D node family, the traverse→cull→draw pipeline, raycasting, instancing/LOD/skinning, and the explicit "camera & lights are draw-arguments, not scene members" design stance.
- **Rust-port parity (`flighthq-scene`):** mirror the full surface as free functions over the slotmap `NodeArena` (`traverse_scene_node`, `find_scene_node_by_name`, `set_scene_node_position`, `get_scene_node_world_bounds`, `cull_scene_node_by_frustum`, `raycast_scene_node`, `create_instanced_mesh`, `create_skinned_mesh`, `serialize_scene_node`, …), with conformance scenes paired by name to the TS functional scenes per the conformance map. The value-typed math (`Aabb`/`Frustum`/`Matrix4`) already has Rust crates; this tier proves the _scene traversal/cull/raycast_ layer conforms 1:1.

## Sequencing & effort

Recommended order, dependencies, and the items that need a human design call before code lands.

1. **Resolve cross-package collisions and doc drift first (small, do before Bronze).** Decide ownership of `createMesh` (node-constructor here vs. geometry in `@flighthq/mesh`) and fix the `scene.ts` render comment. These are name-rule/correctness blockers, not features. **Cross-package decision — surface to user.**
2. **Bronze, types-first.** Add `SceneNodeVisitor` to `@flighthq/types`, then build traversal → name/predicate query → TRS ergonomics → `lookAt` → `getSceneNodeWorldBounds` → `disposeSceneNode`, in that order (each depends on the prior; world-bounds depends on traversal). Low-to-moderate effort: all math exists in `geometry`/`node`/`mesh`; this tier is mostly composition + colocated tests. **No new package deps** beyond what's already present. This is the highest-value, lowest-risk work and should land as one cohesive PR.
3. **Silver, types-first, in two waves.** Wave A (culling + raycasting) depends on Bronze's world-bounds and on `geometry`'s `Frustum`/`isFrustumIntersectingAabb` (already present) and `camera`'s view-projection (already present) — moderate effort, the raycast narrowphase against `MeshGeometry` triangles is the main new code. **Integration point with `@flighthq/render`:** decide whether `prepareSceneRender` consumes a cull result or scene exposes a cull pass the render walk calls — coordinate before building. Wave B (node taxonomy: `Group`/`InstancedMesh`/`LodMesh`/`Billboard`) is moderate effort but **touches the render backends** (`scene-gl`/`scene-wgpu` must draw instanced/billboard geometry) — surface the instancing draw-path as a cross-package item. Subtree clone is independent and cheap.
4. **Gold, last and largest.** Skinning/morph (touches `mesh` + render backends — biggest cross-package coordination), spatial BVH (self-contained; decide `scene` internal vs. `scene-spatial` neighbor), serialization (coordinate descriptor shape with `@flighthq/resources` + kind-migration policy), then performance/caching/edge-case hardening, then Rust-port parity. Serialization and skinning each warrant their own design pass before implementation. **Cross-package / design-decision items to surface:** instancing & skinning draw paths in `scene-gl`/`scene-wgpu`; serialization descriptor + resource-key strategy; whether the BVH is in-package or a `-spatial` neighbor; and the cull/render-walk integration contract.

Honest effort read: Bronze is a focused, self-contained session (no new deps, mostly composition). Silver is the real build-out — raycasting and instancing are where the package becomes a credible scene library, and both reach into render. Gold is a multi-session, multi-package program (skinning, serialization, acceleration, Rust parity) that should be staged behind explicit design decisions rather than taken autonomously.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/scene` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

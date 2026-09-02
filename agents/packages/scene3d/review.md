---
package: '@flighthq/scene3d'
status: solid
score: 70
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - package.json
  - types surface
---

# scene3d -- Review

## Verdict

**Solid -- 70/100.** The package delivers the core 3D scene graph the charter describes: a spatial
node hierarchy (scene root, transform-only groups, Mesh leaves, Billboard leaves), structural
discrimination by presence (`isMesh`, `isBillboard`), world-transform and world-alpha propagation,
frustum culling, world-space AABB aggregation, animation binding (TRS + morph weights), CPU morph
preparation, subtree clone with material override, scene-document assembly, document-light resolution,
kind-usage introspection, material search, and a diagnostics guard layer. The export surface is 42
functions across 16 source modules (~1,420 non-test lines), with 171 unit tests across 18 colocated
test files (~2,156 test lines).

The package is well-structured against the project conventions: two-lane exports (curated `index.ts`,
full `contract.ts`), `sideEffects: false`, no top-level side effects, all intra-SDK imports use
`/contract`, no banned `@flighthq/sdk` import, no inline exported types (all in `@flighthq/types`),
no TODOs in source, and all entity types in tests are constructed via `create*` functions. Naming
is fully unabbreviated and globally self-identifying.

The score is held back by two charter-declared node families (`InstancedMesh`, `LodMesh`) that remain
type-only headers with zero consumers outside `@flighthq/types`, the absence of spatial acceleration
structures (every cull/bounds query is O(n)), fragmented preparation responsibilities across morph,
billboard, skinning, culling, and picking, and a phantom production dependency (`@flighthq/adjustments`
declared but never imported). The guard layer exists but covers only one condition (singular billboard
camera basis); the package has no `explain*` queries.

## Present capabilities

**Node hierarchy and discrimination.** `createNode3D` allocates transform-only group nodes;
`createMesh` allocates drawable leaves carrying `geometry` and `materials`. `isMesh` discriminates
structurally by `geometry` presence (not by kind symbol), so custom kinds work. `isBillboard`
discriminates by the joint presence of `geometry` and `mode`. The node taxonomy uses `Node3DKind`,
`MeshKind`, and `BillboardKind` from `@flighthq/types`. Hierarchy delegates to `@flighthq/node`
(`addNodeChild`, `removeNodeChild`, `getNodeParent`, etc.). Runtime initialization sets up
`Node3DTraits` (appearance + transform-3D traits). 30 tests in `sceneNode.test.ts` cover creation
defaults, runtime state, signals, hierarchy wiring, and world-transform caching.

**Billboard.** `createBillboard` allocates a camera-facing mesh node carrying a `BillboardMode`
(`'full'`, `'axisY'`, `'screenAligned'`). `orientBillboardToCamera` rewrites one billboard's
`localMatrix` to face the camera (deriving the camera basis from its view matrix inverse);
`orientScene3DBillboardsToCamera` walks a subtree and orients every billboard in one pass, deriving
the camera basis once. The facing logic in `billboardCamera.ts` (284 lines, the largest source file)
handles all three modes with explicit degenerate-case fallbacks (camera directly above for axisY,
parallel up for full). Position and scale are preserved; only rotation is rewritten. 10 tests in
`billboardCamera.test.ts` verify all three modes, singular-matrix decline, scale/position stability,
parent-rotation independence, and the guard callback.

**World-space bounds.** `getNode3DWorldBounds` recursively accumulates the AABB of every mesh
descendant, transforming each local-bounds box by the node's world matrix. Uses
`ensureMeshGeometryBounds` (dirty-gated cache) rather than raw `geometry.bounds`. Skinned meshes
contribute bind-pose bounds (the comment documents this as intentional, since GPU-skinned geometry
keeps bind-pose vertices). 7 tests cover empty scenes, translated meshes, multi-mesh accumulation,
recursive group traversal, and alias safety.

**Frustum culling.** `buildScene3DFrustum` extracts frustum planes from a view-projection matrix.
`cullNode3DByFrustum` walks a subtree depth-first, appending each enabled mesh whose world AABB
intersects the frustum to an output array. The output array is not cleared (caller-controlled
accumulation). 6 tests verify empty scenes, in-frustum collection, disabled-node exclusion,
behind-camera exclusion, and append-without-clear semantics.

**World alpha.** `ensureNode3DWorldAlpha` propagates parent-times-self opacity through the hierarchy,
caching on the runtime with revision gating (mirroring `ensureNodeWorldMatrix4`). `getNode3DWorldAlpha`
ensures on access. `setNode3DAlpha` sets the node's alpha and invalidates. Uses a monotonic
`_worldAppearanceRevisionCounter` (wraps at 32 bits). 7 tests cover resolution, parent-child
composition, grandparent propagation, caching, and setter invalidation.

**Scene animation.** `applyAnimationClipToScene3D` maps the animation core's target-free channels onto
scene nodes via `Scene3DAnimationTarget` (`{ node, path }`). Translation/Rotation/Scale paths write
transform components; the Weights path writes directly into `Mesh.morph.weights`. Meshes without morph
on a Weights channel are skipped. 6 tests cover all four paths plus null-target and null-morph
handling.

**CPU morph preparation.** `prepareScene3DMorph` walks the subtree and calls `updateMeshMorph` on every
enabled mesh carrying geometry. Dirty-gated (settled morphs cost one weight-vector compare). Lives in
`scene3d` (not `skeleton3d`) so morph-only apps never import skinning. 3 tests cover subtree blending,
disabled subtree skipping, and no-op for rigid meshes.

**Mesh cloning.** `cloneMesh` creates a new mesh copying transform, alpha, enabled, name, kind, and
materials. Rigid clones share geometry by reference; deformation-carrying clones (skin or morph) get a
restored, runtime-independent geometry via `cloneMeshGeometryForDeformation`. Morph targets stay shared
(immutable); the weight array is copied. Skin pose is shared explicitly. 8 tests cover geometry
sharing, material copying, transform copying, property copying, skin/morph detachment, base-geometry
restoration from a morphed mesh, and no-children semantics.

**Subtree clone.** `cloneNode3DSubtree` recursively clones a node hierarchy (meshes via `cloneMesh`,
groups via `createNode3D`), with an optional `materialOverride` callback. 7 tests cover plain nodes,
mesh leaves, recursive children, material override, transform copying, and alpha/visibility.

**Scene document assembly.** `createScene3DFromDocument` and `createScene3DsFromDocument` assemble a
`Scene3DDocument` into live `Scene3D` entities. One node per document node (mesh when the node names a
mesh index, group otherwise), child-index wiring, skin joint resolution (inline `Skeleton3D` creation
to avoid a cyclic dependency with `@flighthq/skeleton3d`), animation clip reconstruction with
`Scene3DAnimationTarget` bindings. `materializeDocumentMaterial` preserves entity-backed materials or
copies structural ones. 11 tests cover empty documents, mesh creation, material resolution, structural
material conversion, hierarchy wiring, transform application, skin binding, animation reconstruction,
scene index selection, and multi-scene building.

**Document light resolution.** `createScene3DLightsFromDocument` builds a renderer-ready
`Scene3DLights` from a document's light table, cloning descriptors and resolving directional/spot aim
and point/spot position into world space via the document light's TRS transform. Single-slot types
(ambient, directional) use first-wins. 4 tests verify empty documents, cloning/dedup, world-space
resolution, and unrepresentable kind filtering.

**Kind-usage introspection.** `createScene3DKindUsage` / `getScene3DKindUsage` walk a scene and
collect the distinct material kinds, modifier kinds, node kinds, resource MIME types, and texture
source kinds actually used. Output arrays are deduplicated and sorted. 10 tests cover all fields,
null handling, unconsumed-resource filtering, and record reuse.

**Material search.** `findScene3DMaterialByName` searches a subtree depth-first for the first material
with a given name. `getScene3DMaterials` collects all distinct materials (by-reference dedup). 9 tests
cover search, not-found, anonymous, depth-first order, root inclusion, null slots, and deduplication.

**Diagnostics guard layer.** `enableScene3DGuards` / `disableScene3DGuards` / `areScene3DGuardsEnabled`
install a shakeable guard for the billboard-camera-basis decline condition, emitting through
`@flighthq/log` via `logOnce`. The core `billboardCamera.ts` exposes a `setBillboardCameraBasisGuard`
seam that the guard layer installs into. 3 tests verify enable/disable toggling and log emission.

**Dispose.** `disposeNode3D` delegates to `@flighthq/node`'s `disposeNode` for recursive
bottom-up disposal, parent detachment, and signal clearing. 4 tests cover signal clearing, parent
detachment, standalone leaf disposal, and recursive descendant disposal.

**LookAt transform.** `setNode3DLookAt` builds a model-space look-at matrix (not a view matrix) and
writes it to the node's `localMatrix` via `setNodeLocalMatrix4`. 3 tests verify eye placement, Z-axis
direction, and homogeneous coordinate preservation. The degenerate cases (coincident eye/target, up
parallel to forward) are handled in the implementation but have no dedicated tests.

## Gaps

- **InstancedMesh is type-only.** `InstancedMeshKind` is declared in `@flighthq/types` with fields
  for `instanceMatrices`, `instanceColors`, and `instanceCount`, but no `createInstancedMesh`,
  `setInstancedMesh*`, GL/WGPU instance draw, per-instance bounds/culling, material override, or
  picking exists anywhere in the codebase. Zero consumers outside `packages/types/`.

- **LodMesh is type-only.** `LodMeshKind` is declared with `levels` and `activeLevelIndex`, but no
  constructor, level selection function, hysteresis, projected-coverage query, or renderer consumption
  exists. Zero consumers outside `packages/types/`.

- **Phantom dependency.** `@flighthq/adjustments` is listed in `package.json` production
  `dependencies` but is never imported by any source or test file in the package.

- **No spatial acceleration.** Culling (`cullNode3DByFrustum`) and bounds (`getNode3DWorldBounds`)
  are O(n) linear walks over all descendants. The charter (Decision 2026-07-03) blesses BVH/octree
  as in-scope, but none exists. For scenes with thousands of meshes, this is a performance gap.

- **Guard layer is minimal.** Only one guard condition is implemented (singular billboard camera
  basis). The package exports no `explain*` queries (the diagnostics convention calls for shakeable
  explain queries returning plain data alongside guard messages). The morph preparation, culling, and
  bounds functions have no guard coverage.

- **Preparation is fragmented.** A correct frame requires the caller to sequence calls across
  packages: `applyAnimationClipToScene3D` (animation), `prepareScene3DMorph` (morph), then
  `prepareScene3DSkinning` (skeleton3d), then `orientScene3DBillboardsToCamera` (billboard), then
  `prepareScene3DRender` (render), then `cullNode3DByFrustum` (optional). Each is a separate
  subtree walk. No unified preparation function or prepared-scene result coordinates them.

- **CPU deformation ownership.** `prepareScene3DMorph` calls `updateMeshMorph`, which writes into
  `geometry.vertices` in place. Two clones sharing geometry but with independent morph weights will
  overwrite each other's blend. `cloneMesh` detaches deformed geometry, but the hazard exists for
  geometry shared outside of clone (e.g. two meshes assigned the same geometry reference with
  different morph weights).

- **Bounds and culling do not account for deformation.** `getNode3DWorldBounds` uses bind-pose
  geometry bounds for skinned meshes (documented as intentional). Morph-blended bounds are current
  only if `prepareScene3DMorph` ran first (not enforced). Billboard-oriented bounds are not accounted
  for at all.

- **setNode3DLookAt degenerate cases untested.** The implementation handles coincident eye/target
  and up-parallel-to-forward, but no test exercises these paths.

- **Document assembly does not propagate morph from document.** `buildDocumentNode` copies
  `documentMesh.morph` onto the mesh, but `cloneMesh` (when called from `cloneNode3DSubtree`) would
  detach it. This is not a bug -- it is the intended behavior for clone -- but a test verifying
  morph round-trip through document assembly would add confidence.

- **No serialization.** Document assembly is import-only (`createScene3DFromDocument`). No export
  path (`createScene3DDocumentFromScene`) exists.

- **No layer mask / visibility categories.** The `visible` field exists on nodes but is not read by
  culling (which checks only `enabled`). No render-layer or visibility-mask field.

## Charter contradictions

- **Charter boundary "Raycasting" is listed as in-scope realized.** The charter names raycasting
  (AABB broadphase + Moeller-Trumbore) as realized in scene3d's boundary section. Raycasting has
  never lived in this package; it is in `@flighthq/picking`, which depends on `node`/`mesh`/`camera`
  but not `scene3d`. The charter boundary should be amended: raycasting is a neighbor, not a resident.
  (The charter's Open direction 8 acknowledges this implicitly by referencing raycast result allocation
  policy, but the "In scope (today, realized)" list is inaccurate.)

- **`cloneNode3DSubtree` contradicts status.md claim of "No subtree clone."** The status.md (last
  updated 2026-08-08) states "No subtree clone." but `cloneNode3DSubtree.ts` exists with 7 passing
  tests. The status is stale on this point.

## Contract and docs fit

- **Export lanes:** Correct. `index.ts` curates 38 public exports from `contract.ts`; `contract.ts`
  star-exports all 16 source modules. Contract-only exports (9 functions) are appropriately internal:
  `getNode3DRuntime`, `getMeshRuntime`, `getBillboardRuntime`, `createNode3DRuntime`,
  `ensureNode3DWorldAlpha`, `setBillboardCameraBasisGuard`, `enableScene3DGuards`,
  `disableScene3DGuards`, `areScene3DGuardsEnabled`. Kind constants (`BillboardKind`, `MeshKind`,
  `Node3DKind`) are re-exported from types through both lanes.

- **sideEffects:** `"sideEffects": false` in `package.json`, verified -- no top-level side effects
  in any source module.

- **Dependencies:** 10 production dependencies, 3 devDependencies. All production dependencies
  except `@flighthq/adjustments` are used in source. All devDependencies (`camera`, `shading`,
  `texture`) are used in tests. The `@flighthq/adjustments` entry is a phantom.

- **Type home:** All exported types (`Node3D`, `Mesh`, `Billboard`, `Scene3D`, `Scene3DDocument`,
  `MeshDeformer`, `Scene3DKindUsage`, `Scene3DLights`, etc.) live in `@flighthq/types`. The package
  exports only functions.

- **Naming conventions:** All 42 exported functions use unabbreviated type names. `get*` for accessors,
  `is*` for boolean discrimination, `create*` for allocation, `enable*` for opt-in, `set*` for mutation
  with invalidation, `dispose*` for teardown. Alphabetized within files (spot-checked).

- **Test colocality:** 1:1 source-to-test file pairing, all `*.test.ts` colocated in `src/`. 171
  total test cases. `describe` blocks mirror exported names (spot-checked). Entity types in tests
  uniformly use constructors; structural literals used only for `*Like` inputs and data descriptors
  (`Scene3DDocument`, `MeshMorph`, `VertexAttributeLayout`, `ImageResourceReference`).

- **Source style:** Module-level scratch objects (matrices, vectors, counters) placed at file bottom.
  No structural divider comments. Durable semantic comments present where needed (coordinate
  conventions, ownership, deformation semantics, skinned-bounds rationale). No inline TODOs.

## Candidate open directions

1. **Unified scene preparation.** The fragmented per-concern walks (morph, billboard, world-alpha,
   culling, bounds) should converge into a single explicit prepared-scene result or a composable
   preparation pipeline. The assessment already proposes this (item 3), and the charter carries it
   as Open direction 3.

2. **InstancedMesh realization.** The type header is complete enough to build against. A versioned
   instance-data entity with contiguous matrices, optional packed colors, and explicit capacity/count
   operations would let GL/WGPU backends implement instance draw. Assessment item 1.

3. **LodMesh realization.** Per-view level selection (projected coverage, hysteresis, orthographic
   rule) rather than a single mutable `activeLevelIndex`. Assessment item 2.

4. **Spatial acceleration.** BVH or octree for culling and raycasting, consuming the same bounds
   contract as the linear walk. Chartered as decided (2026-07-03), not yet started.

5. **Guard and explain expansion.** The guard seam pattern is established
   (`setBillboardCameraBasisGuard`); extending it to morph prep, culling, and bounds queries would
   bring the package closer to the diagnostics convention. Adding `explain*` queries for the sentinel
   returns (empty bounds, empty cull list) would complete the inversion rule.

6. **Phantom dependency cleanup.** Remove `@flighthq/adjustments` from `package.json` dependencies.

7. **Deformation ownership contract.** Formalize whether two meshes may share a `MeshGeometry`
   reference while both carry independent morph weights, or whether the clone-detach pattern is the
   only safe path. A guard warning on shared-geometry-with-morph would prevent silent overwrites.

8. **setNode3DLookAt degenerate tests.** Add test coverage for coincident eye/target and
   up-parallel-to-forward edge cases.

---
package: '@flighthq/skeleton3d'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - assessment.md
  - source
  - tests
  - types surface
  - package.json
  - cross-package consumers
---

# skeleton3d — Review

## Verdict

**Solid — 82/100.** The package delivers a coherent, well-bounded 3D skeletal deformation primitive.
It owns creation, cloning, bind-pose capture, joint-palette computation (position + normal palettes),
CPU linear-blend skinning (positions, normals, tangents), mesh-level deform, composed morph+skin
ordering, skinned bounds (conservative and exact), a scene-wide GPU-prep pass, validation, and
opt-in diagnostics. Every exported function name includes its full type name, allocation is explicit
(create/clone allocate, per-frame paths write into pre-allocated scratch), and `Readonly<T>` is used
consistently on inputs. The two-lane export structure is correct: 22 functions on the public lane,
4 guard/diagnostics functions contract-only. Every source file has a colocated test file and the
tests are substantive — they cover alias safety, covector-vs-vector normal semantics under
non-uniform scale, bind-pose-fallthrough for uninfluenced vertices, degenerate-joint recovery,
tangent handedness preservation, and the conservative-contains-exact bounds invariant.

The boundary discipline is strong: `@flighthq/render` and `@flighthq/picking` consume the
`deformedLocalBounds` slot as plain data with no import of this package. The `updateMeshMorph` half
lives in `@flighthq/mesh` (below scene), and `updateMeshDeformation` composes the two as same-layer
primitives — skeleton3d sits below `@flighthq/scene3d` with no cycle. `@flighthq/scene3d` appears
only in `devDependencies` (for `createMesh`/`createNode3D` in tests).

The score increase from 81 to 82 reflects verified tangent skinning (a full `skinTangents` export
with correct handedness-w passthrough, write-back into interleaved geometry, and orthogonality
tests), the per-joint normal palette with padded vec4 column layout (matching GPU data-texture
upload), dirty-gated bounds (the deform bumps `geometry.version` and lets `ensureMeshGeometryBounds`
recompute on demand), and the `prepareMeshSkinning` / `prepareScene3DSkinning` pass that writes
conservative posed bounds for GPU-skinned meshes without CPU-posing the vertices.

## Present capabilities

- **Skeleton lifecycle.** `createSkeleton3D` (entity-backed), `cloneSkeleton3D` (buffer-copying,
  joint-sharing clone), `cloneSkeleton3DJointHierarchy` (independent joint hierarchy via caller-
  supplied `cloneJoint` callback), `disposeSkeleton3D`, `equalsSkeleton3D`, `validateSkeleton3D`.
- **Bind-pose capture and palette computation.** `setSkeleton3DBindPose` computes inverse-bind from
  current joint world matrices, with per-joint identity fallback for singular (zero-scale) joints.
  `computeSkeleton3DJointMatrices` fills both the 4x4 position palette and the padded 3x3 normal
  palette (inverse-transpose for covector normals under non-uniform scale).
- **Joint queries.** `getSkeleton3DJointIndexByName` (sentinel -1), `getSkeleton3DJointWorldMatrix`
  and `getSkeleton3DJointWorldMatrixByName` (out-parameter pattern, boolean success).
- **CPU skinning primitives.** `skinVertices` (position as affine point + normal via separate normal
  palette; alias-safe), `skinTangents` (direction via position matrix, handedness-w passthrough;
  alias-safe). Both preserve uninfluenced vertices at bind pose rather than collapsing to origin.
- **Mesh-level skinning.** `captureMeshSkinBindPose` (de-interleaves from any interleaved layout
  into SoA scratch, including packed uint8/unorm8 joint/weight formats via mesh attribute accessors),
  `skinMeshGeometry` (skins and writes back positions, normals, tangents; bumps version),
  `updateMeshSkinBindPoseDeformInput` (refreshes position/normal input from morphed geometry for
  composed deformation).
- **Composition.** `updateMeshSkin` (lazy bind-pose capture, palette compute, deform; morph-aware
  input refresh), `updateMeshDeformation` (morph-first-then-skin ordering via `updateMeshMorph` +
  `updateMeshSkin`).
- **Skinned bounds.** `getMeshSkinConservativeBounds` (joint-driven rest-box sweep, only referenced
  joints), `getMeshSkinExactBounds` (full CPU skin then tight AABB; reuses bind-pose scratch).
  Conservative-contains-exact invariant is tested.
- **GPU preparation.** `prepareMeshSkinning` (palette compute + conservative bounds into
  `deformedLocalBounds` runtime slot, NO vertex posing), `prepareScene3DSkinning` (recursive subtree
  walk, disabled subtrees skipped). Designed to run before `prepareScene3DRender` so cull tests
  posed bounds.
- **Diagnostics.** `enableSkeleton3DGuards` / `disableSkeleton3DGuards` / `areSkeleton3DGuardsEnabled`
  (contract-only), `setSkeleton3DBindPoseGuard` (contract-only seam). Warns via `@flighthq/log`'s
  `logOnce` when a degenerate bind pose is substituted. Tree-shakeable: a non-guarded app sheds
  the text and log dependency.

## Gaps

1. **More-than-four influences are discarded.** The top-4-by-weight renormalization in
   `packSkinInfluences` (scene-formats) is the only path; no secondary influence stream
   (`joints1`/`weights1`) exists for high-fidelity skins.
2. **No double-skin guard.** The charter identifies this: a GPU-skinned mesh that also has
   `updateMeshSkin` called is skinned twice. The `enableGlScene3DDeformGuards` in scene3d-gl warns
   about missing prep, but no guard covers the CPU-over-GPU double-skin case itself.
3. **No pose buffers, joint masks, or additive/override blending.** The palette is computed directly
   from joint node world matrices; there is no intermediate pose representation for layered
   animation (e.g., upper-body override + lower-body additive), which Mecanim and UE Animation
   Blueprint provide.
4. **No IK constraints.** Analytical two-bone, CCD, FABRIK, and aim constraints are charted as
   Phase 4 and not present.
5. **No dual-quaternion skinning.** Linear-blend skinning only; DQS (which avoids volume loss at
   joints like shoulders and elbows) is absent.
6. **No retargeting.** Applying one skeleton's animation to a differently-proportioned skeleton
   is not supported.
7. **No sockets / prop attachment.** `getSkeleton3DJointWorldMatrix` provides the raw query, but
   there is no higher-level socket abstraction for attaching props to bones.
8. **WGPU GPU skinning deferred.** GL GPU skinning is structurally in place; WGPU waits on a
   `maxBindGroups` layout decision (charted in Open directions).
9. **No imported-animation CPU/GPU visual comparison test.** Structural verification only for the
   GPU path (jsdom cannot compile shaders); the MD5/glTF skinned render + GPU-vs-CPU parity need
   a host capture run.
10. **No root motion extraction.** The skeleton does not separate root translation from the
    animation for locomotion driving.

## Charter contradictions

None found. The source accurately implements the charter's committed Phases 1-3 scope:

- The `Skin` type on `Mesh.skin` (not a SkinnedMesh kind) matches the 2026-07-17 decision.
- `updateMeshSkin` lives in skeleton3d (not scene3d), matching the cycle-breaking decision.
- CPU skinning is the v1 path; GPU is layout-driven via `prepareMeshSkinning` / the HAS_SKIN
  shader variant in scene3d-gl.
- Phase 4 (morph targets, IK) remains correctly out of scope for this package. Morph target
  deformation lives in `@flighthq/mesh` as charted.

## Contract and docs fit

- **Export lanes.** The `.` lane exposes 22 functions; `./contract` adds 4 guard functions. The
  split is correct: guards are SDK-internal diagnostics, not end-user API. No types are defined
  inline; all types (`Skeleton3D`, `Skin`, `MeshSkinBindPose`, `Skeleton3DValidationDiagnostic`,
  `MeshDeformer`) live in `@flighthq/types`.
- **sideEffects: false.** Verified. No top-level registration, no mutable module state except the
  guard seam (a nullable function reference, set only by explicit `enable*`/`set*` calls) and
  three pre-allocated scratch matrices used by `computeSkeleton3DJointMatrices` (module-scope
  const, no side effect).
- **Dependencies.** `entity`, `geometry`, `log`, `mesh`, `node`, `types` — all correct.
  `scene3d` is devDependencies only (tests). No import of `@flighthq/sdk`. No cycle with
  `@flighthq/scene3d` or `@flighthq/render`.
- **Naming.** Every exported function name includes its full unabbreviated type name
  (`Skeleton3D`, `MeshSkin`, `MeshDeformation`). Functions are globally self-identifying.
  `get*` for accessors, `set*`/`update*` for mutators, `create*`/`clone*` for allocators,
  `dispose*` for teardown, `validate*` for diagnostics, `prepare*` for render-prep passes.
- **Readonly<T>.** Used on all non-mutated parameters. Mutable outputs (`outPositions`,
  `outNormals`, `outTangents`) are correctly not wrapped.
- **Alias safety.** `skinVertices`, `skinTangents` read inputs into locals before writing output;
  tested with out-aliases-input cases.
- **Sentinel returns.** `getSkeleton3DJointIndexByName` returns -1 (not throwing);
  `getSkeleton3DJointWorldMatrix` returns false for out-of-range index.
- **Test coverage.** 1:1 source-to-test-file. Tests cover the normal/covector distinction under
  non-uniform scale, tangent handedness sign preservation, bind-pose fallthrough for zero-weight
  vertices, degenerate-joint identity recovery, alias-safety, multi-joint blending, conservative-
  contains-exact bounds invariant, dirty-gated bounds recompute, and scene-walk disabled-subtree
  skipping.

## Candidate open directions

1. **Double-skin guard.** Implement the charted guard that warns when `updateMeshSkin` is called
   on a mesh whose skeleton is also being GPU-skinned (detected by the presence of a computed
   `deformedLocalBounds` from `prepareMeshSkinning`). This is the cheapest unfinished charter item.
2. **Pose buffers and joint masks.** An intermediate pose representation between animation output
   and `computeSkeleton3DJointMatrices` input would enable layered animation (masked upper/lower
   body, additive on top of override). This is a prerequisite for Mecanim-level blend-tree
   composition.
3. **Sockets.** A thin `attachToSkeleton3DJoint` utility that parents a node to a joint and keeps
   it updated would cover the common prop-attachment case without inflating the skeleton itself.
4. **Secondary influence stream.** For skins exceeding four influences, a `joints1`/`weights1`
   channel (separately importable, not inflating four-influence meshes) would improve fidelity.
5. **WGPU GPU skinning.** Resolve the `maxBindGroups` layout and mirror the GL palette-texture
   upload path.
6. **IK constraints.** Charter Phase 4: analytical two-bone, iterative CCD/FABRIK, aim constraint.
   Each should be an independently importable function, not a monolithic solver.
7. **Dual-quaternion skinning.** An alternative to LBS that avoids volume loss, offered as an
   opt-in `skinVerticesDQ` alongside the existing LBS path.
8. **Root motion extraction.** Separate root-bone translation from the skeleton pose for
   locomotion/physics integration.

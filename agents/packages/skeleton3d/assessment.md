---
package: '@flighthq/skeleton3d'
updated: 2026-07-24
basedOn: ./review.md
---

# skeleton3d — Assessment

## Recommended

_(All current Recommended items implemented — see Approved.)_

## Depth gaps

1. **Prove composed deformation behavior.** Add imported MD5/glTF/AWD GL captures, CPU-to-GPU
   comparisons, corrective morph-plus-skin cases, animated bounds/picking, clone independence, and a
   diagnostic preventing CPU-plus-GPU double skinning.
2. **Finish clone-safe morph-plus-skin ownership.** Repeated CPU frames and cloned geometry/morph
   weights are now independent, including clone-after-deform restoration. Callers can now explicitly
   pay for an independently cloned joint hierarchy through a narrow node-clone callback while the
   ordinary `cloneSkeleton3D` retains cheap shared joints. Scene-level cloning must compose that atom
   with mesh clone ownership, and the prepared GPU vertex path must make per-instance ownership equally
   explicit.
3. **Represent influences beyond the common top four.** Add a separately paid secondary/variable
   influence stream without inflating every rigid or four-influence vertex.
4. **Compose poses with animation.** Pose buffers, joint masks, additive/override blending, sockets,
   root motion, and blend-tree consumers should reuse the target-free mixer.
5. **Deepen rigging as separate primitives.** Analytical two-bone/aim constraints, optional iterative
   IK, dual-quaternion skinning, and retargeting should remain individually importable.
6. **Commission WGPU only after GL evidence.** Mirror the settled palette/layout/preparation contract;
   do not independently redesign it.

## Backlog

- Animation-graph authoring UI/runtime.
- Ragdoll coupling waits on the physics3d constraint contract.

## Approved

- [2026-07-21 · completed] `Skeleton3D` now extends Entity. `createSkeleton3D`,
  `cloneSkeleton3D`, and the cycle-safe SceneDocument skin assembler all construct the same enforced
  Entity shape; no import path can quietly return a structural skeleton literal.
- [2026-07-21 · completed] CPU morph-plus-skin has an explicit `updateMeshDeformation` composition.
  Each deformer remains independently importable; the composition runs morph first and refreshes only
  skin's deformable position/normal input on later frames, preserving static influences and allocated
  scratch. Each CPU deformer refreshes cached geometry bounds; a changing-weight two-frame test proves
  the old first-morph freeze is gone.
- [2026-07-21 · completed] Skin bind-pose capture consumes mesh's format-aware joint/weight accessors,
  so packed uint8/uint16 joint indices and normalized uint8 weights produce the same CPU influence
  streams as canonical float32 channels. This does not add a second skinning layout truth.
- [2026-07-21 · completed] `cloneSkeleton3DJointHierarchy` is the explicit independently-posed clone
  atom: a caller supplies the node-kind-aware clone callback, joint-to-joint parent links are rebuilt,
  outside-skeleton parents stay caller-owned, and skeleton buffers/names remain detached. The cheap
  `cloneSkeleton3D` sharing contract is unchanged.
- [2026-07-24 · completed] The per-frame bounds recompute is dirty-gated. `updateMeshMorph`/
  `updateMeshSkin` no longer call `refreshMeshGeometryBounds` each frame; the deform's `version` bump
  marks the bounds cache stale, and a new `ensureMeshGeometryBounds` (@flighthq/mesh) recomputes only
  when `boundsVersion !== version` — the single correct bounds read path (a raw `geometry.bounds` read
  can now be stale). A GPU-skinned or upload-only mesh that never culls/picks computes bounds zero
  times. `updateMeshMorph` additionally skips the blend itself while weights are unchanged. The posed
  skinned-mesh bounds a deform pass needs are written to a `deformedLocalBounds` node-runtime slot by
  the new caller-invoked `prepareSceneSkinning` (skeleton3d) / `prepareSceneMorph` (scene) passes;
  render's cull and picking's broad-phase consume that slot as DATA, so @flighthq/render dropped its
  @flighthq/skeleton3d dependency entirely. The picking-agreement correctness is preserved (the
  deform-then-pick tests still pass through the production path).
- [2026-07-24 · completed] The morph/skin deformer layering inversion is resolved. `updateMeshMorph`
  moved down into `@flighthq/mesh` (it reads only `mesh.geometry`/`mesh.morph` and the geometry runtime
  slot, so mesh is the lowest layer that can host it); `updateMeshSkin` stays in skeleton3d, which owns
  the palette. `updateMeshDeformation` now composes two same-layer primitives, and skeleton3d's source
  no longer imports `@flighthq/scene` at all — the duplicate `dependencies` entry is dropped, leaving
  `@flighthq/scene` only in `devDependencies` where the tests' `createMesh` legitimately needs it, so
  the "below scene with no cycle" comment is true again. `@flighthq/scene` keeps the half that genuinely
  needs the graph — routing `Weights` channels into `mesh.morph.weights`. Unify at the channel target,
  split at the deformer.

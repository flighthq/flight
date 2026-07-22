---
package: '@flighthq/skeleton3d'
updated: 2026-07-22
basedOn: ./review.md
---

# skeleton3d — Assessment

## Recommended

1. **Resolve the morph/skin deformer layering inversion.** `updateMeshDeformation` runtime-imports
   `updateMeshMorph` from `@flighthq/scene`, so the CPU-deformation composition drags a
   `skeleton3d → scene` dependency — while `updateMeshSkin`'s own comment still asserts that pairing skin
   with skeleton3d "keeps skeleton3d below scene with no cycle." That statement is now **false**:
   `updateMeshDeformation` puts skeleton3d *above* scene. Yet `updateMeshMorph` imports only
   `@flighthq/mesh` + `@flighthq/types` — it has zero scene-graph dependency, so the two symmetric
   deformer-glue functions are split across packages by charter fiat, not structure. **Fix:** move
   `updateMeshMorph` down beside `updateMeshSkin` (skeleton3d, or better both into `mesh` as pure
   deform-over-runtime-slot glue), leaving `@flighthq/scene` to only *route* `Weights` channels into
   `mesh.morph.weights`; then `updateMeshDeformation` composes two same-layer primitives and the "below
   scene" comment is true again. Also **drop the redundant `@flighthq/scene` `devDependencies` entry**
   in `packages/skeleton3d/package.json` (it is now a runtime `dependencies` entry too — packaging
   drift). _(User-approved 2026-07-22.)_
2. **Dirty-gate the per-frame bounds recompute.** `updateMeshMorph`/`updateMeshSkin` both call
   `refreshMeshGeometryBounds` unconditionally each frame — an O(vertices) second sweep on top of the
   deform pass — even though `MeshGeometry` already carries a `version` counter and nullable `bounds`.
   A GPU-skinned or upload-only mesh that never CPU-picks/culls pays this for nothing. Invalidate a
   bounds-dirty flag (or reuse `version`) in the deform and recompute lazily on the first bounds query,
   preserving the picking-agreement correctness the deform-then-bounds tests prove.

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
- [2026-07-22 · picked] Resolve the morph/skin deformer layering inversion — move `updateMeshMorph`
  down beside `updateMeshSkin` (or both into `mesh`) so `updateMeshDeformation` composes same-layer
  primitives and skeleton3d no longer imports `@flighthq/scene`, and drop the redundant `@flighthq/scene`
  `devDependencies` entry — assessment.md#recommended item 1. Blessed, not yet implemented.

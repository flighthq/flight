---
package: '@flighthq/skeleton3d'
updated: 2026-07-21
basedOn: ./review.md
---

# skeleton3d — Assessment

## Recommended

No sweep-safe items; meaningful work crosses mesh, scene preparation, animation, formats, or GL.

## Depth gaps

1. **Prove composed deformation behavior.** Add imported MD5/glTF/AWD GL captures, CPU-to-GPU
   comparisons, corrective morph-plus-skin cases, animated bounds/picking, clone independence, and a
   diagnostic preventing CPU-plus-GPU double skinning.
2. **Define clone-safe morph-plus-skin ownership.** Repeated frames and independently posed clones must
   not mutate shared geometry into one another; establish an explicit prepared deformation result or a
   fully composed GPU vertex path.
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

None.

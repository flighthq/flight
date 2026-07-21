---
package: '@flighthq/skeleton3d'
updated: 2026-07-21
basedOn: ./review.md
---

# skeleton3d — Assessment

## Recommended

No sweep-safe items from this focused depth review; the meaningful work crosses mesh, animation, scene formats, or render backends.

## Depth gaps

1. **Prove the shipped skinning path behaviorally.** Add imported MD5/glTF/AWD GL captures, CPU↔GPU deformation comparison, animated skinned bounds/culling, and a diagnostic case preventing accidental CPU+GPU double skinning.
2. **Represent deformation beyond the top-four baseline.** Add an explicit secondary/variable influence path, morph-target deltas, and a documented morph/skin execution order without inflating the common four-influence layout.
3. **Add pose composition with the animation mixer.** Pose buffers, joint masks, additive/override blending, sockets, root motion, and blend-tree consumers should reuse animation's target-free mixer rather than create another playhead.
4. **Deepen the rigging primitives.** Analytical two-bone/aim constraints, optional iterative IK, dual-quaternion skinning, and retargeting remain separable authoritative-tier additions.
5. **Commission WGPU parity only after GL evidence.** Mirror the settled palette/layout/diagnostic contracts and run cross-backend captures; do not independently redesign the skin seam.

## Backlog

- Full animation-graph authoring UI/runtime remains outside this value/deformation package.
- Physics-driven ragdoll coupling waits on the physics3d body/constraint contract.

## Approved

None.

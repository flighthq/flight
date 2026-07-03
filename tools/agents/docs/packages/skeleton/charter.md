---
package: "@flighthq/skeleton"
draft: false
lastDirection: 2026-07-03
crate: "flighthq-skeleton"
---

# skeleton — Charter

## What it is

Skeletal animation support -- joint hierarchies, inverse-bind matrices, skin palette computation for GPU upload.

## North star

- Complete skeletal animation pipeline. Joints, skins, morph targets, constraints.
- Skin palette computation is a pure CPU operation with explicit out-parameter allocation.
- The package owns the bone/joint data model; animation playback and GPU skinning live elsewhere.

## Boundaries

- In scope: Skeleton entity, joint matrices, bind pose, SkinnedMesh node type, morph targets/blend shapes, IK constraints (long-term).
- Non-goals: animation playback (that's animation), GPU skinning shaders (scene-gl/scene-wgpu).

## Decisions

- **2026-07-03 — Keep as standalone package.** Why: skeletal animation has significant room to grow (SkinnedMesh, morph targets, IK); bundling it into scene would bloat the scene graph with domain-specific state.
- **2026-07-03 — Add clone/dispose/equals for Skeleton entity.** Why: standard entity quartet pattern; Skeleton is a first-class entity that needs lifecycle and comparison support.
- **2026-07-03 — TS-leads, Rust conforms later.** Why: standard project posture.

## Open directions

- SkinnedMesh node type design: how does it compose with scene's hierarchy nodes?
- Morph target data model: per-target attribute deltas vs interleaved blend shapes.
- IK solver scope: CCD, FABRIK, or analytical two-bone? All three?

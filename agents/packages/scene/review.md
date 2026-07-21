---
package: '@flighthq/scene'
status: solid
score: 68
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene — Review

## Verdict

**Solid — 68/100.** The prior review materially under-described the live tree. Scene now realizes the
basic node/mesh graph, clone and lifecycle operations, world transforms and bounds, culling, animation
binding, morph targets, skeletal composition, scene documents, and camera-facing Billboard nodes.
Billboard is no longer an orphaned header promise, and morph data/update/animation paths are present.

The package still lacks two major semantic node families—instancing and LOD—and its preparation
responsibilities are fragmented. Rendering invokes morph/skin work, billboards require a separate
camera-facing update, culling has a parallel walk, and picking reads whichever CPU state happens to be
current. Before acceleration, the package needs one explicit prepared-scene contract that makes those
consumers agree without turning scene into a hidden dispatcher.

## What is solid

- Scene roots, transform-only nodes, Mesh leaves, structural discrimination, entity runtimes, signals,
  clone/dispose, and hierarchy composition are established.
- World transforms, world AABBs, and frustum collection are explicit queries over caller outputs.
- Scene animation binds target-free animation tracks to translation, rotation, scale, and morph weights.
- Morph targets have mesh-domain bind-pose/blend primitives and scene update composition. The GL
  functional suite includes a morph scene.
- Billboard is realized as a structurally drawable mesh with explicit full, axis-Y, and screen-aligned
  camera orientation functions and tests.
- Skin and morph coexist on Mesh without introducing a second SkinnedMesh hierarchy.

## Remaining gaps

- **InstancedMesh remains type-only.** There is no constructor, update/query family, GL instance draw,
  per-instance bounds/culling, material override policy, or picking identity.
- **LodMesh remains type-only.** There is no level selection/hysteresis policy, viewport-aware projected
  size query, loading interaction, renderer consumption, or picking identity.
- Scene culling and render preparation still perform overlapping traversal/bounds work. Shadow-caster
  collection, billboards, deformation, LOD, instances, and picking need a singular explicit preparation
  seam or immutable result, not more parallel walks.
- CPU morph and skin updates mutate shared MeshGeometry. Clones sharing geometry but using independent
  morph weights/skeleton poses can interfere; the current share-by-reference clone contract makes this
  especially important. GPU deformation or per-instance prepared geometry must define ownership.
- Bounds and picking can be stale relative to morph/skin/billboard state unless the caller manually
  sequences the right updates. The package needs behavior tests that query and render the same prepared
  frame.
- No layer mask/visibility categories, spatial acceleration, occlusion result, serialization, or scene
  resource residency integration.

## Architectural conclusion

The next bedrock primitive is a **prepared scene/query state**, not register-all rendering. It should be
created or filled explicitly from a scene plus camera/viewport/frame inputs, contain the chosen
Billboard orientation/LOD/instance/deformation/bounds facts, and be consumed by culling, shadow, draw,
and picking passes. The result must not own GPU backend objects and must let simple rigid scenes avoid
the cost of features they do not use.

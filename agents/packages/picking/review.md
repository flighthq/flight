---
package: '@flighthq/picking'
status: solid
score: 70
updated: 2026-07-21
ingested:
  - charter.md
  - source
  - tests
---

# picking — Review

## Verdict

**Solid — 70/100.** The earlier “one camera query” assessment is obsolete. The package now supplies
camera and world-ray entry points, nearest and all-hit queries, visibility pruning, predicate and
distance filters, optional backface culling, transformed-mesh correctness, non-square orthographic
coverage, triangle indices, barycentrics, world points, and geometric normals. The implementation is a
clear composition of camera unprojection, scene traversal/bounds, geometry intersections, and mesh
attribute access.

The next depth is semantic rather than another overload: picks must agree with what was actually drawn.
GPU-skinned, morphed, billboarded, instanced, and LOD-selected geometry can currently diverge from the
CPU geometry queried here. Result data also stops short of interpolated attributes and material/subset
identity. `SceneHit` now honors the repository-wide Entity constructor invariant.

## What is solid

- **pickScene** is a thin camera-ray wrapper over **pickSceneWithRay3D**; both nearest and all-hit forms
  share one narrow phase.
- Disabled subtrees are pruned, predicates filter meshes without pruning descendants, maximum distance
  is explicit, and the default remains double-sided.
- Indexed and non-indexed triangles are supported. Rays are transformed into local space without
  normalizing direction, preserving a comparable world-ray parameter across differently scaled meshes.
- Results include triangle identity, barycentrics, world-space point, and a mirroring-safe world-space
  geometric face normal.
- Caller-owned outputs are reused. Module scratch and non-reentrancy are documented instead of hidden.

## Correctness and depth gaps

- Morph targets mutate CPU geometry only when their explicit update runs. A pick before that update can
  hit stale base geometry. GPU-skinned meshes are queried against CPU vertices unless a CPU skin update
  has also run. Picking must consume the same explicit deformation preparation/evaluator as bounds and
  rendering, without triggering an implicit render update itself.
- Billboards are structurally meshes, so the ray test uses whichever orientation was last written. A
  caller that draws against one camera and picks against another can query a stale facing transform.
- **InstancedMesh** and **LodMesh** are still unrealized types. The package has no instance index,
  selected LOD, or per-instance transform in the hit contract.
- No interpolated UV, interpolated vertex normal/tangent, material/subset index, or front/back-face flag
  is returned. These are required for decal placement, texture-space tools, editor inspectors, and
  material-aware click-through.
- Alpha-masked material coverage is ignored. Transparent/cutout triangles remain pickable across their
  full geometric area, and **pickSceneAll** cannot filter using sampled coverage.
- No point/line/gizmo threshold queries, frustum/box/lasso region selection, or GPU ID-buffer backend.
  BVH acceleration remains appropriately later than semantic correctness.

## Architectural conclusion

Do not add a hidden “prepare everything” call inside picking. Establish an explicit, reusable scene
query-deformation snapshot/pass: animation changes weights/pose; morph/skin/billboard/LOD/instance
preparation makes render and query geometry coherent; render and picking then consume the same prepared
state. GPU ID picking is a backend package layered over the substrate-agnostic selection identity, not a
branch in the CPU triangle walker.

---
package: '@flighthq/mesh'
updated: 2026-07-21
basedOn: ./review.md
---

# mesh — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Make every declared vertex channel usable end to end.** Add typed access/build/edit support for `uv1`, `color0`, `joints0`, `weights0`, any secondary influence channels, and packed/normalized formats; then consume them in scene import and GL shaders with raster proof.
2. **Complete topology-editing primitives.** Weld, deindex, indexed/non-indexed conversion, subset editing, validation, and index-width selection are the bedrock operations importers and procedural tooling otherwise reimplement.
3. **Deepen normal/tangent/UV authoring.** Add angle-threshold smoothing/split normals, robust tangent generation across seams, and basic planar/box/spherical UV projection as independent functions.
4. **Realize instancing and LOD instead of leaving header-only types.** `InstancedMesh` and `LodMesh` need an owned data/update contract, render consumption, culling/selection rules, and functionals. Keep a full simplifier as later tooling rather than blocking these primitives.

## Recommended

None. The copied `getMeshGeometryVertexNormal` position/semantic comment is corrected. Logical
triangle decoding is now one allocation-free primitive shared by consumers: indexed/non-indexed
triangle lists and alternating-winding strips resolve consistently, with unsupported/out-of-range
queries leaving caller-owned output untouched. `refreshMeshGeometryBounds` is the corresponding
cached-spatial atom: it allocates an AABB once and refreshes it in place after vertex edits. Logical
triangle-to-subset identity is likewise one topology-aware primitive consumed by picking rather than
being re-derived from list-only offsets.

## Approved

None.

## Backlog

- Reserved channel accessors (uv1/color0/joints0/weights0).
- Angle-threshold smooth normals.
- Projection UV unwrapping.

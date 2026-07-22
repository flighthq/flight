---
package: '@flighthq/mesh'
updated: 2026-07-21
basedOn: ./review.md
---

# mesh — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Make every declared vertex channel usable end to end.** Typed read/edit support now covers `uv1`,
   `color0`, `joints0`, and `weights0` across float, packed integer, and normalized storage. Importers
   still need to preserve those encodings instead of eagerly expanding common data, and secondary
   influence channels plus raster proof remain.
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

- [2026-07-21 · completed] The declared `uv1`, `color0`, `joints0`, and `weights0` semantics have
  separately importable caller-owned-output getters and in-place setters. Packed uint8/uint16 and
  unorm8 values decode and encode through the same byte-accurate contract, failed queries do not
  mutate output, and successful edits advance geometry version exactly once.

## Backlog

- Angle-threshold smooth normals.
- Projection UV unwrapping.

---
package: '@flighthq/mesh'
updated: 2026-08-21
by: builder5
---

# mesh — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **Vertex accessors reach the same buffer through two access models.** Getters read by FLOAT index
  (`getVertexAttributeFloatOffset` returns `attr.byteOffset / 4`, unguarded for alignment); setters write
  by BYTE offset through a little-endian `DataView`. They agree only while every attribute is 4-byte
  aligned and the host is little-endian. NOT A BUG TODAY — misalignment is unreachable while every
  non-float format (`unorm8x4`, `uint8x4`, `uint16x4`) is a multiple of 4 — and nothing in this package
  can make it reachable, which is why it is recorded rather than fixed. Raised against
  [portability](../../portability.md) as well, since a future porter reads that and not this file.

Every item was re-checked against `packages/mesh/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **No angle-threshold smooth normals.** `computeMeshGeometryFlatNormals`
  (`meshGeometryCompute.ts:123`) writes the face normal to all three vertex slots in place with
  last-write-wins; nothing named `*SmoothNormals` exists anywhere in `packages/`. The real version
  splits vertices along the crease and remaps indices — a behavioral contract, not a sweep.
- **No projection UV generation.** `meshGeometryUvs.ts` carries only `offsetMeshGeometryUvs` (`:12`),
  and `scaleMeshGeometryUvs` (`:28`); there is no planar/spherical/box
  projection and no `computeMeshGeometryUvBounds`. The planar axis parameter and box-UV seam handling
  are the undecided part.
- **No UV atlas fold, and the next one must be FACE-AWARE.** Folding a mesh's UVs into one atlas tile
  is a legitimate operation and there is deliberately none here: `wrapMeshGeometryUvs` was removed on
  2026-08-12 rather than repaired, because `u - floor(u)` is defined at the wrong granularity for the
  property it manipulates. Which tile a face belongs to is a PER-FACE fact; folding per vertex splits
  faces whose corners land in different tiles, so the destructive case is the ordinary one and no
  parameterisation of that shape fixes it. MEASURED before removal, so the next author does not
  rediscover it: `createPlaneMeshGeometry(1, 1, 1, 1)` carries uv0 `[0,0] [1,0] [0,1] [1,1]` and
  folded to `[0,0] [0,0] [0,0] [0,0]` — four corners on one point. The atlas round trip its own doc
  described did the same: `offsetMeshGeometryUvs(tile, 1, 1)` gives u `[1,2,1,2]`, folding gave
  `[0,0,0,0]`. Every builder tops out at exactly 1.0 (plane/quad 2 vertices at u === 1, box 12, torus
  25; only the spherically mapped polyhedra pass it, dodecahedron u 0.058..1.375), so it was
  destructive for nearly every geometry in the SDK and survived only because nothing called it. The
  correct form resolves each FACE's tile once and offsets all of that face's corners by the same
  integer, which preserves continuity. Not to be built speculatively — it returns when a caller needs
  it.
- **No edge/topology analysis.** `computeMeshGeometryWireframeIndices` (`meshGeometryIndex.ts:65`) is
  the only edge-adjacent export; `computeMeshGeometryEdges` and `findMeshGeometryNonManifoldEdges` are
  absent, and their return shape (what represents an edge; how a non-manifold report reads) is
  unspecified.
- **No LOD or simplification.** No `simplifyMeshGeometry` / `generateMeshGeometryLod` in `packages/`.
  Open direction: in-package or a `@flighthq/mesh-simplify` neighbor.
- **No quantization pair.** `quantizeMeshGeometry` / `dequantizeMeshGeometry` are absent, though
  `convertMeshGeometryLayout` (`meshGeometryLayout.ts:15`) already converts between declared formats
  including normalized packed channels, so the layout half of the work is done.
- **No signals group.** There is no `enableMeshGeometrySignals`; change notification is the version
  bump through `invalidateMeshGeometry` (`meshGeometry.ts:143`) only.
- **`ensureMeshGeometryBounds` is contract-only** — it is in
  `contract.ts` but not re-exported from `index.ts`, unlike its `refreshMeshGeometryBounds` sibling.
  Confirm the lane split is deliberate.

- **Triangle strips are excluded from two mirror-related operations, deliberately and in two
  places, and the exclusion is not yet resolved.** Both exclusions exist because a strip shares each
  vertex between up to three triangles, so anything expressed as a per-triple edit does not describe
  it. (1) `computeMeshGeometryTangents` splits vertices at a mirrored-UV seam by remapping index
  ELEMENTS, which is well defined only for a triangle list, where each element belongs to exactly one
  triangle. (2) `restoreMirroredWindingAndHandedness` in `meshGeometryTransforms.ts` reverses winding
  for a negative-determinant transform by swapping two corners of each triple — list-only for the
  same reason; strips still get the per-vertex `tangent.w` flip, which is topology-independent.
  Neither invented a strip rule, because the repository has none to follow: the only winding reversal
  that exists, `reverseTriangleWinding` in `scene3d-formats/src/shared.ts:155`, steps by three, and
  `expandMeshGeometryIndices` (`meshGeometryIndex.ts:111`) preserves topology so it is not a
  strip-to-list route either.
  MEASURED FROM BOTH DIRECTIONS. An opposite-UV-handed strip stays at 4 vertices with corner
  handedness `[[+,+,+],[+,+,-]]`, where the topology-equivalent LIST splits to 6 vertices and gives
  `[[+,+,+],[-,-,-]]` — so the strip silently shares one handedness across a seam the list correctly
  separates. Three ways out, none taken: convert the strip to a list (changes `out.topology`, a
  contract decision), refuse the operation, or document the restriction as permanent. Parked with
  manager as a topology-contract question, not a defect to patch locally.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — `mesh-cone` now observes bottom-cap facing on Gl/Wgpu: correct captures agree at
  cap `#ffbb28`, side `#251a03`; locally reverting only the bottom fan to `(center,b,a)` made both
  oracles fail with cap `#0a0c10`, and restoring `(center,a,b)` returned both green.
- **2026-08-12** — the `destroyMeshGeometryGPUData` header references in
  `packages/types/src/MeshGeometry.ts` now name the two functions that exist,
  `destroyMeshGeometryGlData` and `destroyMeshGeometryWgpuData`. Closes the `Open` item.
- **2026-08-12** — `wrapMeshGeometryUvs` removed, with the guard tier built for it the same day. The
  guard measured the fold destroying an ordinary 0..1 plane, which made the operation unfixable at its
  own granularity rather than mis-documented; see the `Open` item for the face-aware form that replaces
  it when a caller needs one.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline claim of the 2026-06-25 entry
  was checked and is **false**: it recorded that "the actual package is 3 files" and that
  `meshGeometryAttributes.ts`, the layout constant, the UV helpers, and the Uv1/Color0 accessors "do
  not exist in this tree" — all sixteen `meshGeometryAttributes.ts` exports are present, as are
  `meshGeometryLayout.ts` and `meshGeometryUvs.ts`. Also dropped as landed: weld/dedup
  (`weldMeshGeometryVertices`, `indexMeshGeometryVertices`, `compactMeshGeometryVertices` in
  `meshGeometryIndex.ts`), morph targets (`morphMeshGeometry.ts`, `updateMeshMorph.ts`), and the
  mesh functional scenes (ten `functional/scenes/mesh-*` pairs). The `mesh-formats` neighbor is
  obsolete — glTF/OBJ/3DS/MD5/AWD2 import lives in `scene3d-formats`.
- **2026-06-25** — Added `expandMeshGeometryIndices`, `computeMeshGeometryWireframeIndices`, and the
  `meshGeometrySubset.ts` range-management trio.
- **2026-06-24** — Added bounding sphere, flat normals, `CANONICAL_MESH_GEOMETRY_LAYOUT` +
  `convertMeshGeometryLayout`, and the three uv0 transform helpers; bounding sphere is AABB-midpoint
  (conservative for culling), not Welzl.

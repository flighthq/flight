---
package: '@flighthq/mesh'
updated: 2026-08-08
by: principal
---

# mesh — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/mesh/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **Stale header comment naming a function that does not exist.**
  `packages/types/src/MeshGeometry.ts:54` and `:80` both say `destroyMeshGeometryGPUData`; the package
  exports `destroyMeshGeometryGlData` (`meshGeometry.ts:88`) and `destroyMeshGeometryWgpuData`
  (`meshGeometry.ts:97`). Fixing it edits `packages/types`, outside the `mesh/` gate.
- **No angle-threshold smooth normals.** `computeMeshGeometryFlatNormals`
  (`meshGeometryCompute.ts:114`) writes the face normal to all three vertex slots in place with
  last-write-wins; nothing named `*SmoothNormals` exists anywhere in `packages/`. The real version
  splits vertices along the crease and remaps indices — a behavioral contract, not a sweep.
- **No projection UV generation.** `meshGeometryUvs.ts` carries only `offsetMeshGeometryUvs` (`:12`),
  `scaleMeshGeometryUvs` (`:28`), and `wrapMeshGeometryUvs` (`:45`); there is no planar/spherical/box
  projection and no `computeMeshGeometryUvBounds`. The planar axis parameter and box-UV seam handling
  are the undecided part.
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

- **No functional scene can fail on a winding or facing error, and the fix for that is a scene
  DESIGN, not a camera tweak.** Six builders shipped inside-out (capsule, circle, cone and cylinder
  caps, 9 of 36 dodecahedron faces, torus knot) and every render baseline was unchanged by the
  remedy, because the two scenes that draw those builders cannot detect facing. Measured, not
  assumed: `DEFAULT_DOUBLE_SIDED = false` (`materials/src/surfaceMaterial.ts:48`) and
  `beginGlMeshDraw` enables `CULL_FACE`/`cullFace(BACK)` (`scene3d-gl/src/glMeshProgram.ts:34-39`),
  and NO functional scene sets `doubleSided: true` — so culling is genuinely on and double-sidedness
  is not the cause. The cause is that every cap faces away from its own camera (mesh-cone eye
  `(1.4, 0.8, 2.6)` vs base cap `-Y`, dot `-1.500`; mesh-cylinder eye `(1.6, 0.4, 2.6)` sits BELOW
  its own `+Y` top cap, dot `-0.300`), so a correctly wound cap is culled and an inverted one is
  drawn but occluded — identical pixels either way. Both scenes also use `createUnlitMaterial`, so
  orientation cannot reach shading, and their assertions sample centre, a ring, two taper points and
  the four corners: none is anywhere a cap can appear.
  THE RECIPE, so it is not re-derived later: put the cap where it is the NEAREST surface (look up at
  the base rather than down past it), use a LIGHTING-DEPENDENT material rather than unlit so a
  flipped normal changes colour rather than nothing, and assert the CAP'S OWN COLOUR rather than the
  silhouette — a silhouette assertion passes whether the cap is present, absent, inverted or culled.
  Reframing the camera alone does not fix this; the assertion has to be one only a correctly-facing
  surface can satisfy.

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

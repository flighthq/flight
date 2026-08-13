---
package: '@flighthq/mesh'
status: solid
score: 88
updated: 2026-08-12
---

# Review: @flighthq/mesh

**Evidence and population.** This is a full re-review of the current `packages/mesh/src/` export
surface, its 13 colocated test files, `packages/types/src/Mesh*.ts`, and the current functional mesh
scenes. The population is the package's public CPU geometry/data API plus the mesh deformation glue
that the package exports; this is the right population because it is what downstream callers can
actually invoke. I extracted the exports from `src/index.ts` and the implementation barrels, and
extracted tests from every `*.test.ts`; no prior review list was used as the population.

## Verdict

**solid — 88/100.** The package now supplies a broad, tested CPU mesh layer: construction and cloning,
17 primitive builders, layout conversion, typed accessors including reserved UV1/color0/joints0/weights0
channels, normals/tangents/bounds/sphere computation, index expansion/indexing/welding/wireframe
generation, subset range editing, UV offset/scale transforms, morph bind/blend/update support, transforms, merge,
validation, and deformation cloning. The score remains below authoritative because projection UVs,
angle-threshold smoothing, explicit edge/non-manifold analysis, simplification/LOD, quantization, and
signals are still open design or implementation work. The current review no longer carries the former
false claim that Silver items are complete; the remaining gaps are named below.

## Verified current surface

- `src/index.ts` exports the complete public barrel, including `cloneMeshGeometryForDeformation`,
  `compactMeshGeometryVertices`, `expandMeshGeometryIndices`, `indexMeshGeometryVertices`,
  `weldMeshGeometryVertices`, `computeMeshGeometryWireframeIndices`, subset operations, morph APIs,
  all reserved-channel accessors, canonical layouts, and the 17 builders.
- The 13 colocated test files pass 235 tests in the current Vitest run (including 52 builder cases),
  with every test file covered by the package export gate. This count is from the runner output, not a
  remembered historical total.
- `meshGeometry.ts` owns construction, cloning, counts, GPU-slot destruction, invalidation, and
  runtime initialization. Clone paths deep-copy typed arrays, subsets, bounds, and runtime state.
- `meshGeometryAttributes.ts` provides layout-driven get/set accessors for position, normal, tangent,
  UV0, UV1, color0, joints0, and weights0, with absent/out-of-range sentinels and version bumps on
  writes. Packed normalized/uint formats are handled where their layout declares them.
- `meshGeometryBuilders.ts` has the canonical box, capsule, circle, cone, cylinder, dodecahedron,
  icosahedron, icosphere, octahedron, plane, polyhedron, quad, ring, sphere, tetrahedron, torus-knot,
  and torus builders through one finalize path.
- `meshGeometryCompute.ts` provides bounds, conservative bounding sphere, smooth and flat normals,
  tangents, position groups, lazy/refresh bounds, and alias-safe out-parameter behavior. Flat normals
  explicitly document the need to expand indices first when truly per-face vertices are required.
- `meshGeometryIndex.ts` provides compact/de-index/index/weld operations and wireframe index output.
  `meshGeometrySubset.ts` provides add/set subset lists, triangle counts, and triangle-to-subset lookup.
- `meshGeometryLayout.ts` provides canonical ordinary and skinned layouts plus semantic conversion;
  `meshGeometryUvs.ts` provides working UV0 offset and scale transforms. Its exported `wrapMeshGeometryUvs`
  is present but non-functional by construction: wrapping is face-parameterized while this operation
  folds per-vertex values, so shared corners collapse mappings. It has been removed; a face-aware
  replacement remains open and is not counted as capability.
- `morphMeshGeometry.ts` captures bind poses and blends targets; `updateMeshMorph.ts` applies the
  package's mesh runtime deformation path, with tests covering weight changes and restoration.
- `meshGeometryTransforms.ts` covers matrix transforms, inverse-transpose normals/tangents, scale,
  translation, centering, singular-matrix failure, aliasing, and negative-determinant handling.
- `meshGeometryOperations.ts` covers separate-attribute construction, triangle queries, merge, and
  validation with sentinel failure behavior. `scene3d-formats` is the existing format-import neighbor;
  a separate `mesh-formats` package is not required by the current tree.

## Remaining gaps

- No angle-threshold/smoothing-group normal operation that splits vertices at creases.
- No planar, spherical, or box projection UV generation, nor UV-bounds computation. UV offset and scale
  work on existing UV0 data; the removed `wrapMeshGeometryUvs` still needs a face-aware tile-offset
  replacement.
- No dedicated non-manifold/edge analysis API beyond wireframe index generation.
- No simplification/LOD operation, vertex-cache optimization, or quantize/dequantize pipeline despite
  packed formats being modeled in the type layer.
- No mesh-specific signals group; mutation notification is the geometry version/invalidation contract.
- Builder APIs remain positional rather than options-object based; this is an API decision, not a
  correctness defect.
- A functional mesh scene population now exists and exercises the render path, but coverage should
  continue to grow as more builders and deformation combinations become visually meaningful.
- The type header still uses the generic GPU-data naming in its historical comments; the actual mesh
  exports are `destroyMeshGeometryGlData` and `destroyMeshGeometryWgpuData`. This is documentation
  drift to correct separately from the mesh implementation.

## Contract fit

The package conforms to the repository contract well: public types live in `@flighthq/types`, the barrel is
thin, source exports are colocated with tests, expected failure uses sentinels rather than throws, and
out-parameter operations are alias-safe where documented. The current score reflects a mature CPU
geometry foundation with a focused set of intentionally deferred higher-level features, not the stale
June-era gaps that previously understated the implementation.

## Open directions

1. Decide whether crease-aware normals and projection UVs belong in this package or a geometry-tooling
   neighbor, and define their topology/attribute semantics before implementation.
2. Decide the home and contract for simplification/LOD and vertex-cache optimization.
3. Define quantization behavior for the existing packed `VertexFormat` values, including normalized
   conversion and round-trip tolerances.
4. Decide whether edge/non-manifold analysis and mutation signals are part of this package's core API.
5. Expand functional mesh scenes to cover cap facing, winding, reserved attributes, morphs, and more
   builder families with lighting-dependent assertions.

---
package: '@flighthq/mesh'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - types
---

# Review: @flighthq/mesh

**Evidence and population.** Full re-review of `packages/mesh/src/` (15 source files, 15 colocated
test files), `packages/types/src/MeshGeometry.ts` and related type headers, `package.json`,
`index.ts`, and `contract.ts`. The population is the package's public and contract CPU geometry API;
exports extracted from the barrel files, claims verified against source.

## Verdict

**solid -- 89/100.** A broad, well-tested CPU mesh geometry layer that has continued to mature since
the prior review. All three assessment-recommended internal improvements have landed: the shared
`vertexFormat.ts` primitive, the cached `DataView` on the geometry runtime, and the metadata-only
clone for index-pipeline operations. Test count rose from 235 to 273 across 14 test files (up from
13). The external capability surface is unchanged -- the package carries construction, cloning,
17 primitive builders, layout conversion, typed accessors across 8 vertex semantics, smooth/flat
normals, tangents with mirrored-UV seam handling, AABB bounds, bounding sphere, index
expansion/indexing/welding/compaction/wireframe generation, subset management, UV offset/scale
transforms, morph bind/blend/update, matrix/scale/translate/center transforms with correct
inverse-transpose normals and negative-determinant winding restoration, merge, validation, and
deformation cloning. The score improves one point over the prior review to reflect the cleaner
internals. Feature gaps that separate solid from authoritative remain: projection UVs,
angle-threshold smoothing, edge/topology analysis, simplification/LOD, and quantization.

## Present capabilities

The public lane (`index.ts`) exports 83 symbols (81 functions, 2 layout constants). The contract
lane (`contract.ts`) re-exports everything via `export *` from 13 modules plus `ensureMeshGeometryBounds`
as a contract-only export. Dependencies: `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types`.
`sideEffects: false` declared. No renderer registration, no module-level state.

### Construction and lifecycle (`meshGeometry.ts`, 244 lines)

- `createMeshGeometry` -- allocates from CPU vertex/index data plus layout. Auto-promotes indices to
  Uint32 past 65535 vertices.
- `cloneMeshGeometry` -- deep-copies vertex/index arrays, subsets, bounds; fresh runtime with null
  GPU slots; version resets to 0.
- `cloneMeshGeometryMetadata` -- copies layout, topology, subsets, and bounds without duplicating
  vertex/index arrays. Used by weld/compact/expand to avoid one wasted allocation per operation.
  **New since prior review** (assessment recommended item 3).
- `getMeshGeometryVertexCount`, `getMeshGeometryIndexCount` -- layout-derived counts.
- `hasMeshGeometrySkin` -- tests for joints0 channel presence.
- `invalidateMeshGeometry` -- version bump for direct vertex-buffer writes.
- `destroyMeshGeometryGlData`, `destroyMeshGeometryWgpuData` -- clear per-backend GPU upload slots.
- `getMeshGeometryMorphBindPose`, `setMeshGeometryMorphBindPose` -- morph runtime slot accessors.
- `getMeshGeometrySkinBindPose`, `setMeshGeometrySkinBindPose` -- skin runtime slot accessors.

### Vertex format primitive (`vertexFormat.ts`, 77 lines)

**New since prior review** (assessment recommended item 1). Extracts the shared
`getVertexFormatByteLength`, `getVertexFormatComponentCount`, `readVertexFormatComponent`, and
`writeVertexFormatComponent` switches into one file imported by both `meshGeometryAttributes.ts` and
`meshGeometryLayout.ts`. Eliminates the duplicated six-member `VertexFormat` union handling and
the cosmetic drift (`/0xff` vs `/255`) the assessment identified. Internal-only: not exported from
either barrel. 4 dedicated tests in `vertexFormat.test.ts`.

### Vertex accessors (`meshGeometryAttributes.ts`, 424 lines)

- 8 typed getters: `getMeshGeometryVertexPosition`, `Normal`, `Tangent`, `Uv0`, `Uv1`, `Color0`,
  `Joints0`, `Weights0`. Float semantics resolve through `getVertexAttributeFloatOffset`; packed
  semantics (color0/joints0/weights0) resolve through the byte-accurate `getAttributeByteLocation`.
- 8 typed setters with version bump on success; packed channels clamp to the representable range.
- `getVertexAttribute`, `getVertexAttributeFloatOffset` -- layout introspection.
- `getAttributeByteLocation` now uses an out-parameter (`AttributeByteLocation`) and caches the
  `DataView` on `MeshGeometryRuntime.attributeDataView` with a validity check against the current
  `vertices` buffer. **New since prior review** (assessment recommended item 2). Per-call
  `DataView` allocation eliminated for packed-channel accessors.

### Primitive builders (`meshGeometryBuilders.ts`, 1060 lines)

17 builders through one `buildCanonicalMeshGeometry` finalize path: box, capsule, circle, cone,
cylinder, dodecahedron, icosahedron, icosphere, octahedron, plane, polyhedron, quad, ring, sphere,
tetrahedron, torus-knot, torus. Each writes outward-facing normals, UVs, computes tangents via
`computeMeshGeometryTangents`, and fills cached bounds. Cone delegates to cylinder with zero top
radius; dead (collapsed-radius) triangles are pruned. Spherical UV seam and pole handling are correct
and documented: `faceSphericalU` resolves the longitude wrap and pole degeneracy per face, and the
builders document that u > 1 values require a repeating sampler. Segment/subdivision counts are
`normalizeMeshCount`-guarded (floor, clamp, finite check). All winding is CCW from outside; cap disc
winding verified against normal direction. 74 builder tests.

### Compute (`meshGeometryCompute.ts`, 690 lines)

- `computeMeshGeometryBounds` -- AABB sweep over all vertex positions.
- `computeMeshGeometryBoundingSphere` -- AABB-midpoint center, max-distance radius (conservative, not
  Welzl minimal).
- `computeMeshGeometryNormals` -- area-weighted smooth normals with optional `positionGroups` to
  control smoothing across shared positions.
- `computeMeshGeometryFlatNormals` -- per-face normals via the shared triangle walker; last-write-wins
  on shared vertices, documented need for de-index first.
- `computeMeshGeometryTangents` -- Lengyel method with Gram-Schmidt orthogonalization, glTF `w`
  handedness, mirrored-UV seam vertex splitting for indexed triangle lists, and position-group
  canonical-frame accumulation. Correctly uses the shared triangle walker for strip topology.
  Strip topology deliberately excluded from the mirrored-UV split (documented in status.md as a
  topology-contract question).
- `computeMeshGeometryPositionGroups` -- bit-identical position grouping via FNV-1a hash.
- `refreshMeshGeometryBounds` -- explicit recompute, allocation-free in steady state.
- `ensureMeshGeometryBounds` -- lazy dirty-gated bounds via `boundsVersion` on the runtime. Contract-
  only export consumed by `scene3d` and `render`; `refreshMeshGeometryBounds` is the public-lane
  counterpart. The lane split is deliberate: internal subsystems use the lazy version, end users
  use the explicit verb.

### Index pipeline (`meshGeometryIndex.ts`, 230 lines)

- `expandMeshGeometryIndices` -- de-index to flat non-indexed stream; uses `cloneMeshGeometryMetadata`.
- `indexMeshGeometryVertices` -- sequential indexing without deduplication.
- `weldMeshGeometryVertices` -- exact byte-identical record welding via FNV-1a hash; uses
  `cloneMeshGeometryMetadata`.
- `compactMeshGeometryVertices` -- removes unreferenced vertices, remaps in first-reference order;
  uses `cloneMeshGeometryMetadata`.
- `computeMeshGeometryWireframeIndices` -- line-list index buffer from triangle topology.
- All operations choose the narrowest valid index width (Uint16 vs Uint32).

### Layout conversion (`meshGeometryLayout.ts`, 128 lines)

- `convertMeshGeometryLayout` -- attribute-semantic-matched repacking with byte-exact same-format
  copy and cross-format component conversion (float32, uint8, uint16, unorm8). Now imports shared
  `readVertexFormatComponent`/`writeVertexFormatComponent` from `vertexFormat.ts`.
- `CANONICAL_MESH_GEOMETRY_LAYOUT` -- 12-float PBR record (position + normal + tangent + uv0, 48B).
- `CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT` -- 20-float extended record (+ joints0 + weights0, 80B).

### Subset management (`meshGeometrySubset.ts`, 62 lines)

- `addMeshGeometrySubset`, `setMeshGeometrySubsets` -- replace/append subset ranges.
- `getMeshGeometrySubsetTriangleCount` -- topology-aware triangle count per subset.
- `getMeshGeometryTriangleSubsetIndex` -- triangle-to-subset lookup.

### Transforms (`meshGeometryTransforms.ts`, 353 lines)

- `transformMeshGeometry`, `transformMeshGeometryInto` -- Matrix4 applied to positions (point
  transform), inverse-transpose to normals (covector), plain upper 3x3 to tangent.xyz (true vector).
  The normal/tangent matrix distinction is documented and tested. Returns false for singular matrices.
- `scaleMeshGeometry` -- per-axis scale with correct inverse normal transform.
- `translateMeshGeometry` -- position-only shift, bounds updated in place.
- `centerMeshGeometry` -- translates AABB center to origin.
- `restoreMirroredWindingAndHandedness` -- negative-determinant winding reversal (triangle-list only)
  and tangent.w negation (topology-independent). Strip exclusion documented in status.md.

### UV transforms (`meshGeometryUvs.ts`, 51 lines)

- `offsetMeshGeometryUvs`, `scaleMeshGeometryUvs` -- uv0 offset and scale. The removed
  `wrapMeshGeometryUvs` is documented in status.md as destructive-by-design; a face-aware replacement
  remains a future item.

### Morph (`morphMeshGeometry.ts`, 135 lines; `updateMeshMorph.ts`, 80 lines)

- `captureMeshMorphBindPose` -- de-interleaves position/normal/tangent into SoA arrays plus reusable
  blend scratch. One allocation; per-frame blend is allocation-free.
- `blendMeshGeometryMorph` -- additive blend `base + sum(w_i * delta_i)` in place. Position always;
  normal and tangent when present in the bind pose. Version bumped.
- `updateMeshMorph` -- node-level glue: lazy bind-pose capture, weight-change detection
  (O(targets) per frame), and settled-morph skip. Bounds deliberately not refreshed (dirty-gated
  via `ensureMeshGeometryBounds`).

### Deformation clone (`meshGeometryDeformationClone.ts`, 53 lines)

- `cloneMeshGeometryForDeformation` -- deep clone that restores the deepest captured undeformed
  attributes (morph bind pose or skin bind pose) before handing off a fresh geometry.

### Operations (`meshGeometryOperations.ts`, 342 lines)

- `createMeshGeometryFromAttributes` -- separate-attribute construction with auto-computed normals
  and tangents.
- `getMeshGeometryTriangleCount`, `getMeshGeometryTriangleVertexIndices` -- topology-aware logical
  triangle access (list and strip, with alternating winding for strips).
- `mergeMeshGeometries` -- concatenation with layout and topology compatibility check, index
  rebasing, subset carry-over.
- `validateMeshGeometry` -- structural validation: stride alignment, index range, finite float
  channels, valid draw ranges, whole-primitive element counts per topology.

## Gaps

- **No angle-threshold smooth normals.** `computeMeshGeometryNormals` is area-weighted with optional
  position groups, but has no crease-angle split. No `*SmoothNormals` export exists.
- **No projection UV generation.** No planar, spherical, or box UV projection; no
  `computeMeshGeometryUvBounds`. UV helpers operate only on existing uv0 data.
- **No face-aware UV wrap.** `wrapMeshGeometryUvs` was removed as destructive; the face-aware
  replacement is deferred.
- **No edge/topology analysis.** `computeMeshGeometryWireframeIndices` is the only edge-adjacent
  export. No `computeMeshGeometryEdges` or non-manifold detection.
- **No LOD or simplification.** No `simplifyMeshGeometry` or level-of-detail generation.
- **No quantization pipeline.** Packed `VertexFormat` members are modeled and `convertMeshGeometryLayout`
  handles them, but no explicit `quantizeMeshGeometry`/`dequantizeMeshGeometry` exists.
- **No signals group.** Mutation notification is geometry version/invalidation only.
- **Builder APIs remain positional.** Options-object form for multi-knob builders (capsule, cylinder,
  torus-knot, polyhedron) is an open API decision.
- **Triangle strip mirrored-UV split unresolved.** `computeMeshGeometryTangents` and
  `restoreMirroredWindingAndHandedness` exclude strips; documented as a topology-contract question.
- **`ensureMeshGeometryBounds` is contract-only.** Confirmed deliberate: consumed by `scene3d` and
  `render` via `@flighthq/mesh/contract`; the public lane exposes `refreshMeshGeometryBounds`.

## Charter contradictions

None found. The package implements the charter's stated scope and boundaries faithfully:
- Types live in `@flighthq/types`. The implementation exports functions only.
- Dependencies are `entity`, `geometry`, `types` -- matching the charter's constraint.
- The `Mesh` scene-graph node is correctly in `scene3d`, not here.
- File parsers are in `scene3d-formats`, not here (matching the 2026-07-03 decision).
- `sideEffects: false` declared and no module-level side effects observed.
- Two blessed export lanes (`.` and `./contract`) with no other subpaths.

## Contract & docs fit

The package aligns well with the repository contract:
- **Export lanes** -- public barrel is a curated explicit list; contract re-exports everything.
  `ensureMeshGeometryBounds` is the only contract-only function, correctly placed.
- **Naming** -- all exported functions carry the full `MeshGeometry` type name; globally unique and
  self-identifying. `get*`/`set*`/`has*`/`is*`/`create*`/`clone*`/`compute*`/`destroy*` verbs match
  the SDK conventions.
- **Allocation** -- `create*`/`clone*` allocate; `compute*` and transforms write to `out` or in place.
  `cloneMeshGeometryMetadata` eliminates wasteful allocations in index-pipeline ops.
- **Out-parameter safety** -- all `out === source` aliasing cases are documented and tested (bounds,
  normals, tangents, transforms).
- **Sentinels** -- accessors return `false` for absent semantics or out-of-range indices. `merge`
  returns `null` on mismatch. `transformMeshGeometryInto` returns `false` for singular matrices.
  `validateMeshGeometry` returns `boolean`. No throws for expected failures.
- **Version/invalidation** -- mutating operations bump `geometry.version`. `ensureMeshGeometryBounds`
  uses `boundsVersion` for dirty-gated lazy recompute.
- **Testing** -- one test file per source file, colocated, `describe` blocks mirror exports. 273 tests
  across 14 files, all passing.
- **Source style** -- exported functions alphabetized; loose constants at bottom of files; no
  structural dividers; durable semantic comments present where needed.

## Candidate open directions

1. **Crease-aware normals and projection UVs.** The charter names these as "likely in scope, not yet
   built." Define topology semantics (vertex splitting, index remapping) before implementation.
2. **Simplification/LOD home.** Charter open direction 3: in-package or `@flighthq/mesh-simplify`.
   `types/LodMesh.ts` exists but no implementation.
3. **Quantization pair.** Packed formats are modeled; `convertMeshGeometryLayout` handles cross-format
   conversion. The explicit `quantizeMeshGeometry`/`dequantizeMeshGeometry` pipeline and round-trip
   tolerances remain open.
4. **Edge/non-manifold analysis API.** Return shape (what represents an edge, how a non-manifold
   report reads) is unspecified.
5. **Builder options-object form.** Pre-release window for settling the 4-6-knob builders on an
   extensible shape.
6. **Triangle strip topology contract.** The mirrored-UV split and winding reversal exclusions need
   resolution: convert to list, refuse the operation, or document as permanent.
7. **Vertex stream byte-native container.** Assessment depth gap 1: `MeshGeometry.vertices` is
   `Float32Array` while the declared layout describes byte-offset records with packed formats. The
   container type and the layout description agree only while all attributes are float-aligned.

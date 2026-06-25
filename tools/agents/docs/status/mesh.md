# @flighthq/mesh — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation had pruned `src/` down to `meshGeometry`, `meshGeometryBuilders`, `meshGeometryCompute`, `meshGeometryIndex`, and `meshGeometrySubset`, but the gitignored `dist/` proved five additional modules had existed and compiled. Recovered each by merging `dist/<m>.js` (implementation + verbatim `//` comments) with `dist/<m>.d.ts` (parameter, return, and generic types) — the validated "camera pattern".

### Recovered modules

- `meshGeometryAttributes.ts` (+ test) — attribute introspection and typed per-vertex read/write accessors: `getMeshGeometryVertexNormal`, `getMeshGeometryVertexPosition`, `getMeshGeometryVertexTangent`, `getMeshGeometryVertexUv0`, `getVertexAttribute`, `getVertexAttributeFloatOffset`, `setMeshGeometryVertexNormal`, `setMeshGeometryVertexPosition`, `setMeshGeometryVertexTangent`, `setMeshGeometryVertexUv0`.
- `meshGeometryLayout.ts` (+ test) — `CANONICAL_MESH_GEOMETRY_LAYOUT` constant and `convertMeshGeometryLayout` (re-pack interleaved vertex stream into a new layout).
- `meshGeometryOperations.ts` (+ test) — `createMeshGeometryFromAttributes` (+ its `MeshGeometryFromAttributesOptions` interface), `getMeshGeometryTriangleCount`, `mergeMeshGeometries`, `validateMeshGeometry`.
- `meshGeometryTransforms.ts` (+ test) — `centerMeshGeometry`, `scaleMeshGeometry`, `transformMeshGeometry`, `transformMeshGeometryInto` (alias-safe out-param), `translateMeshGeometry`.
- `meshGeometryUvs.ts` (+ test) — `offsetMeshGeometryUvs`, `scaleMeshGeometryUvs`, `wrapMeshGeometryUvs`.

Added the five `export *` lines to `src/index.ts` (kept alphabetized alongside the still-present `meshGeometryIndex` / `meshGeometrySubset` modules, which have no `dist/` counterpart — newer work post-dating the build output, left untouched).

All types these modules consume (`MeshGeometry`, `MeshSubset`, `VertexAttribute`, `VertexAttributeLayout`, `VertexSemantic`, `Matrix4Like`, `Aabb`) are already present in `@flighthq/types` (the vertex types are colocated in `MeshGeometry.ts`), so no `@flighthq/types` edit was required.

### Reconstruction notes (mechanical drift fixed)

- Re-alphabetized exported functions per file and moved module-level consts (`CANONICAL_FLOATS_PER_VERTEX`, `UINT16_INDEX_CEILING`, `CANONICAL_MESH_GEOMETRY_LAYOUT`) to the bottom, after the exported functions.
- `getFloat32ComponentCount(format)` is typed `string` (not `VertexFormat`) because it tests for `'float32'`, which is not a member of the `VertexFormat` union — a `VertexFormat` param would make that comparison a type error. Faithful to the `dist/` behavior.
- Test fixtures: typed each `CANONICAL_LAYOUT` / layout literal as `VertexAttributeLayout`; added `!` non-null assertions where strict-null flagged `merged` (`MeshGeometry | null`), `attr` (`VertexAttribute | null`), and `geo.bounds` (`Aabb | null`); cast the structural `{min,max}` bounds literals `as Aabb` (the `min`/`max` `Vector3` carry the entity runtime key, which a plain literal omits — these casts erase in JS, matching the plain literals in `dist/`).
- No vitest imports added (`describe`/`it`/`expect` are globals).

### Fossils skipped

None. All five modules are genuine mesh-geometry math/operations; none implement any of the deliberately-dropped DisplayObject/Stage/Bitmap/Video/Loader concepts.

### Parked

None.

### Verification

`npm run test --workspace=packages/mesh` — 10 files, 107 tests, all passing. `npx tsc --noEmit -p packages/mesh/tsconfig.json` — clean.

## 2026-06-25 — builder R2-4 second-pass recovery

Second pass after the parallel types-recovery run. The dist build output predates the live `src/` (dist lacks the already-recovered `meshGeometryIndex`/`meshGeometrySubset` modules), so no whole modules were missing — the remaining lost source was individual functions absent from two existing files, plus their tests and the Platonic-solid const tables.

### Recovered

- `meshGeometryCompute.ts` — `computeMeshGeometryBoundingSphere` (AABB-midpoint center + max-distance radius, empty → radius -1) and `computeMeshGeometryFlatNormals` (per-face normals fanned to corner verts, bumps `version`). `BoundingSphereLike` (now present in `@flighthq/types`) added to the type-import line. Tests for both added to `meshGeometryCompute.test.ts` (`createBoundingSphere` added to the geometry import).
- `meshGeometryBuilders.ts` — 10 builders: `createCapsuleMeshGeometry`, `createCircleMeshGeometry`, `createDodecahedronMeshGeometry`, `createIcosahedronMeshGeometry`, `createIcosphereMeshGeometry`, `createOctahedronMeshGeometry`, `createPolyhedronMeshGeometry`, `createRingMeshGeometry`, `createTetrahedronMeshGeometry`, `createTorusKnotMeshGeometry`. Added the Platonic-solid const tables (`TETRAHEDRON_*`, `OCTAHEDRON_*`, `ICOSAHEDRON_*`, `DODECAHEDRON_*`, `_phi`, `_d`) at the bottom after the existing layout const. Matching tests added to `meshGeometryBuilders.test.ts`.

### Reconstruction notes (mechanical drift fixed)

- `createCircleMeshGeometry` calls the existing `addDisc` helper; the dist `.js` named that helper `addDiscToArrays` (same signature) — kept the live `src/` name rather than re-introducing the old one. All builders funnel through the existing `buildCanonicalMeshGeometry` / `CANONICAL_VERTEX_LAYOUT` in `src/` (dist used the imported `CANONICAL_MESH_GEOMETRY_LAYOUT`); behavior is identical.
- Typed the dist's untyped `verts`/`faces`/midpoint-cache locals and const tables as `Array<[number,number,number]>` / `ReadonlyArray<readonly [number,number,number]>` and the caches as `Map<string, number>`.
- Test fixtures: used `geometry.bounds!` non-null assertions (matching the existing src tests; dist `.js` had no assertion), and typed the polyhedron test's literal `verts`/`faces` as `ReadonlyArray<readonly [number,number,number]>` to satisfy `createPolyhedronMeshGeometry`'s tuple-array params.
- No vitest imports added (`describe`/`it`/`expect` are globals). Exported functions and test `describe` blocks left alphabetized.

### Fossils skipped

None. All recovered items are genuine mesh-geometry builders / compute math; none implement any of the deliberately-dropped DisplayObject/Stage/Bitmap/Loader concepts.

### Parked

None. Every recovered function's types (`MeshGeometry`, `VertexAttributeLayout`, `BoundingSphereLike`) are present in `@flighthq/types`, so no module needed parking and no `@flighthq/types` edit was required.

### Verification

`npm run test --workspace=packages/mesh` — 10 files, 125 tests, all passing (up from 107).

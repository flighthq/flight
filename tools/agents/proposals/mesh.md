---
id: mesh
title: '@flighthq/mesh'
type: depth
target: mesh
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/mesh.md
  - tools/agents/docs/reviews/depth/mesh.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — 52/100. A correct, clean, well-documented core (data model, canonical PBR record, the seven common primitives with proper normals/tangents/bounds), but its surface is narrow against the canonical bar: no attribute accessors, no geometry transforms, no merge/index ops, and only half the canonical primitive set.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that lets a user _read, write, transform, and combine_ geometry — without which the package cannot stand alone regardless of primitive count. These are the bar-raisers the depth review flagged as table-stakes.

- **Attribute introspection in `@flighthq/types` first.** Add to `VertexAttributeLayout` no new fields, but add free functions: `getVertexAttribute(layout, semantic): VertexAttribute | null` (sentinel `null` when absent) and `getVertexAttributeFloatOffset(layout, semantic): number` (returns `-1` when absent or non-float). These replace the private hand-computed `POSITION_OFFSET`/`NORMAL_OFFSET`/`TANGENT_OFFSET`/`UV0_OFFSET` constants that every compute function currently duplicates.
- **Typed per-vertex accessors.** `getMeshGeometryVertexPosition(out, geometry, vertexIndex)`, `setMeshGeometryVertexPosition(geometry, vertexIndex, x, y, z)`, and the same `get*`/`set*` pair for `Normal`, `Tangent` (4-component), and `Uv0`. `out` is a `Vector3Like`/`Vector4Like`/`Vector2Like`. All resolve the float offset through `getVertexAttributeFloatOffset` so they work on any layout, not just the canonical record. `set*` must bump `geometry.version`.
- **`getMeshGeometryTriangleCount(geometry)`** — index/3 for triangle-list, derived correctly for `triangle-strip`; the obvious companion to the existing count helpers.
- **Geometry transform.** `transformMeshGeometry(geometry, matrix)` (in-place, bumps `version`) and `transformMeshGeometryInto(out, source, matrix)` — apply a `Matrix4` to positions, and the inverse-transpose to normals and tangent.xyz (re-normalize, preserve tangent.w). This is the single most-requested mesh op; without it baked geometry cannot be repositioned. Read inputs into locals (alias-safe with `out === source`).
- **Transform conveniences over the matrix op:** `translateMeshGeometry(geometry, x, y, z)`, `scaleMeshGeometry(geometry, x, y, z)`, `centerMeshGeometry(geometry)` (translate so cached bounds center → origin; recompute bounds). These compose a `Matrix4` and delegate to `transformMeshGeometry`.
- **`mergeMeshGeometries(geometries): MeshGeometry`** — concatenate interleaved vertex streams (requires matching layouts; return `null` on layout mismatch), offset and concatenate indices, concatenate/re-base subsets so each source stays an addressable subset, recompute bounds. Core to any asset/batch pipeline.
- **Surface the interleave helper.** Promote `buildCanonicalMeshGeometry` to a public `createMeshGeometryFromAttributes({ positions, normals?, uvs?, indices? })` that builds the canonical record from separate arrays (computing normals/tangents when omitted). Promote `addDisc` to a public `createCircleMeshGeometry(radius, segments)` — the work already exists.
- **`validateMeshGeometry(geometry): boolean`** (or a `MeshGeometryValidation` result with `null` on success) — index-range bounds check, vertex-stream length divisible by stride, NaN/Inf scan over positions. Returns sentinel, does not throw.

### Silver

Competitive with a well-regarded mesh-geometry library (three.js `BufferGeometry` + the `*Geometry` family + `BufferGeometryUtils`). Covers common professional use, important edge cases, and cross-backend consistency.

- **Index pipeline ops.** `computeMeshGeometryIndices(geometry, tolerance?)` (weld a non-indexed stream into an indexed one, dedup vertices within tolerance — i.e. three.js `mergeVertices`), and `expandMeshGeometryIndices(geometry)` (de-index / un-weld to a flat non-indexed stream, the `toNonIndexed` operation needed before flat-shading or per-face attributes).
- **Flat-normal and smoothing-group control.** Extend the normal compute with `computeMeshGeometryFlatNormals(out, geometry)` (per-face constant normals; implies de-indexing) and an angle-threshold variant `computeMeshGeometrySmoothNormals(out, geometry, maxSmoothAngleRadians)` that splits hard edges. Keep the existing area-weighted smooth path as the default.
- **Bounding sphere.** `computeMeshGeometryBoundingSphere(out, geometry)` writing a `SphereLike` (add `Sphere`/`SphereLike` to `@flighthq/types` and a `createSphere`/`getSphereFromAabb` to `@flighthq/geometry` if absent). The other standard culling primitive alongside the AABB; consider caching it on the runtime, not the entity.
- **The rest of the canonical primitive set:**
  - `createRingMeshGeometry(innerRadius, outerRadius, segments)`
  - `createCapsuleMeshGeometry(radius, height, radialSegments, capSegments)`
  - `createIcosphereMeshGeometry(radius, subdivisions)` — geodesic sphere, the standard alternative to the pole-pinching UV sphere.
  - The Platonic solids: `createTetrahedronMeshGeometry`, `createOctahedronMeshGeometry`, `createDodecahedronMeshGeometry`, `createIcosahedronMeshGeometry` (a shared `createPolyhedronMeshGeometry(vertices, faces, radius, detail)` builder underneath, exported for custom solids).
  - `createTorusKnotMeshGeometry(radius, tube, tubularSegments, radialSegments, p, q)`.
- **UV utilities.** `applyMeshGeometryPlanarUv(geometry, axis)`, `applyMeshGeometrySphericalUv(geometry)`, `applyMeshGeometryBoxUv(geometry)` for unwrapping imported/merged geometry, and `computeMeshGeometryUvBounds(out, geometry, channel)`.
- **Layout conversion.** `convertMeshGeometryLayout(out, source, targetLayout)` — re-pack an interleaved stream into a different layout (drop/add/reorder attributes, e.g. strip tangents for a depth pre-pass, or interleave from a non-canonical importer layout). Underpins the `-formats` neighbor package and cross-backend attribute matching.
- **Second UV / vertex-color generation.** `setMeshGeometryVertexUv1`/`getMeshGeometryVertexUv1` and `setMeshGeometryVertexColor0`/`getMeshGeometryVertexColor0` once the layout carries those attributes — the reserved `uv1`/`color0` semantics become usable. Color packed as RGBA8 per Flight convention.
- **Subset editing.** `addMeshGeometrySubset`, `setMeshGeometrySubsets`, `getMeshGeometrySubsetTriangleCount` — explicit multi-material range management beyond the default single subset.

### Gold

Authoritative / AAA: nothing a domain expert finds missing, with performance, exhaustive edge handling, full tests/docs, and 1:1 Rust-port parity.

- **`@flighthq/mesh-formats` neighbor package** (the `-formats` importer/parser pattern). Houses pure CPU parsers that _produce_ `MeshGeometry` without any GPU or loader coupling: `parseObjMesh`, `parseStlMesh`, `parsePlyMesh`, and a `parseGltfPrimitiveMesh` that maps a glTF accessor set onto a `VertexAttributeLayout`. Keeps the core package free of format weight; loaders/resources wire these in. (Decision to surface: where the glTF _document_ parse lives vs. the per-primitive geometry mapping.)
- **Procedural / advanced builders to round out the generator set:** `createLatheMeshGeometry(profilePoints, segments)` (surface of revolution), `createTubeMeshGeometry(pathPoints, radius, radialSegments, closed)` (sweep along a path), `createExtrudeMeshGeometry(shapePoints, depth, options)` (2D shape → 3D), and `createPolyhedronMeshGeometry` detail-subdivision for arbitrary inputs.
- **Mesh optimization pass.** `optimizeMeshGeometryVertexCache(geometry)` (Forsyth/Tom-Forsyth reorder for post-transform cache), `optimizeMeshGeometryOverdraw`, and `optimizeMeshGeometryVertexFetch` (reorder + remap vertices to index order). These are what a production engine ships (meshoptimizer-class). `simplifyMeshGeometry(geometry, targetRatio)` (quadric-error LOD decimation) as the headline frontier feature — design-decision item, sizable.
- **Compression / quantization seam.** `quantizeMeshGeometry(geometry, spec)` → narrowed attribute formats (`unorm8x4` normals/tangents via octahedral encoding, `uint16` UVs) using the already-present non-float `VertexFormat` members, with a matching dequantize path. The layout already models these formats; Gold makes them first-class.
- **Morph targets & skinning data (CPU side only).** A `MeshMorphTarget` type in `@flighthq/types` (delta position/normal/tangent buffers + weight) and `applyMeshGeometryMorphTargets(out, base, targets, weights)`; `setMeshGeometryVertexJoints`/`Weights` accessors activating the reserved `joints0`/`weights0` semantics. Runtime deformation stays out of scope; the _data model and bake helpers_ live here.
- **Edge/adjacency analysis.** `computeMeshGeometryEdges`, `computeMeshGeometryWireframeIndices` (line-list index buffer for wireframe draw), and a `findMeshGeometryNonManifoldEdges` diagnostic. Wireframe indices in particular unblock a debug-render path in the scene backends.
- **Optional signals group.** `enableMeshGeometrySignals(geometry)` exposing an `onMeshGeometryChange` signal (fired on `version` bump) for editors/inspectors that need to react to mutation — opt-in via `enable*`, off by default, tree-shaken when unused.
- **Exhaustive tests & docs.** Every builder verified for: correct triangle winding (CCW front-face), watertightness where expected, normalized normals, glTF tangent.w handedness, UV ranges, and degenerate inputs (zero radius, 1 segment, empty arrays → sentinels not throws). Aliased-`out` cases for every compute/transform function (per CLAUDE.md). Snapshot vertex/index counts per primitive.
- **1:1 Rust parity in `flighthq-mesh`.** Every Bronze/Silver/Gold function ported (snake*case, full type word: `transform_mesh_geometry`, `merge_mesh_geometries`, `compute_mesh_geometry_bounding_sphere`, `create_icosphere_mesh_geometry`), out-params as `&mut`, conformance-checked against the TS reference. The builders are pure math and are an ideal \_mixable* (value-in/value-out) conformance target — record any intentional TS↔Rust divergence (e.g. float-rounding tolerances in weld/dedup) in the conformance divergence map.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze attribute layer first (small, unblocks everything).** `getVertexAttribute` / `getVertexAttributeFloatOffset` in `@flighthq/types`, then the typed `get*/set*` vertex accessors, then refactor the three existing compute functions and `buildCanonicalMeshGeometry` to consume the shared offset lookup (removes the duplicated private offset constants). Low effort, high leverage; do before any other tier work.
2. **Bronze geometry ops.** `transformMeshGeometry` (+ translate/scale/center), `mergeMeshGeometries`, `createMeshGeometryFromAttributes`, `createCircleMeshGeometry`, `validateMeshGeometry`. `transform*` depends on `Matrix4` from `@flighthq/geometry` — confirm a 3D-transform + inverse-transpose helper exists there (if only `Matrix` 2D is present, that is a cross-package addition to surface). Medium effort.
3. **Silver index pipeline + normal modes.** `computeMeshGeometryIndices`/`expandMeshGeometryIndices` first (flat-shading depends on de-index), then flat/smoothing-group normals. Self-contained in this package. Medium.
4. **Silver primitives + bounding sphere + UV/layout utils.** Primitives are parallelizable and independent; bounding sphere needs a `Sphere`/`SphereLike` type added to `@flighthq/types` and a `@flighthq/geometry` constructor — surface this small cross-package addition. `convertMeshGeometryLayout` underpins the later `-formats` package. Medium, breadth-heavy.
5. **Gold.** Start with `mesh-formats` (clear value, isolated, follows the established neighbor-package pattern) and wireframe/edge helpers (unblock debug rendering). Defer `simplifyMeshGeometry` (quadric decimation) and the meshopt-class optimization passes — these are large, algorithm-heavy, and warrant a design discussion on scope and whether decimation belongs here or in its own neighbor. Quantization/octahedral encoding pairs naturally with the `convertMeshGeometryLayout` work from Silver. Morph/skinning data model is a design-decision item (coordinate with whichever package owns runtime deformation so the data shapes agree).

**Cross-package / design-decision items to surface:**

- `Matrix4` 3D transform + inverse-transpose support in `@flighthq/geometry` (needed for Bronze step 2).
- `Sphere` / `SphereLike` type in `@flighthq/types` + constructor in `@flighthq/geometry` (Silver bounding sphere).
- Ownership boundary for glTF: document parsing vs. per-primitive geometry mapping — confirm `mesh-formats` only does the latter and the loader/resources layer owns the document.
- Morph-target / skinning data shapes must be agreed with the runtime-deformation owner before baking them into `@flighthq/types`.
- Whether mesh **simplification/LOD** is in-scope for `@flighthq/mesh` or a dedicated neighbor (`@flighthq/mesh-simplify`).
- Positional-args vs. options-object for builders with 4–5 knobs (the depth review's open question): if changing, do it as one sweep across all builders during Bronze, before more builders land in Silver — pre-release latitude makes this the moment.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/mesh` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).

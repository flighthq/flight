# Depth Review: @flighthq/mesh

**Domain:** 3D mesh geometry — interleaved vertex/index buffers, vertex attribute layouts, parametric primitive builders, and per-vertex attribute computation (normals, tangents, bounds). This is the CPU-side geometry layer that feeds the GPU mesh renderers (`scene-gl`/`scene-wgpu`); it is the analogue of three.js `BufferGeometry` + its `*Geometry` primitive family, or a `mesh`/`geometry-utils` crate in an engine.

**Verdict:** partial — **52/100**

The package is correct, well-documented, and architecturally clean for what it ships, but its surface is narrow against the canonical bar for a mesh-geometry library. It nails the data model (layout/subset/topology/bounds/version), the canonical PBR interleaved record, and the most common primitives with proper normals/tangents/UVs. But it is missing the bulk of what a mature mesh library provides: most of the canonical primitive set, attribute introspection/read-write accessors, geometry transforms, merge/index/de-index operations, and any modification utilities. It is a solid foundation, not yet an exhaustive library.

## Present capabilities

Core data model and construction:

- `createMeshGeometry(options)` — builds geometry from interleaved vertices + layout; auto-promotes Uint16→Uint32 indices past the 65535 vertex ceiling (`promoteIndices`), defaults topology to `triangle-list`, defaults a single full-range subset.
- `cloneMeshGeometry` — deep copy with fresh typed arrays, cloned bounds, fresh runtime (GPU slots not shared), `version` reset to 0.
- `getMeshGeometryVertexCount` / `getMeshGeometryIndexCount` — derived counts via layout stride.
- `destroyMeshGeometryGlData` / `destroyMeshGeometryWgpuData` — clear the per-backend GPU upload slot on the runtime (correct `destroy*` verb usage; GL/GPU objects owned by the renderer crates).
- Strong type layer in `@flighthq/types`: `VertexSemantic` (incl. reserved `joints0`/`weights0`/`color0`/`uv1`), `VertexFormat`, `PrimitiveTopology` (point/line/line-strip/triangle/triangle-strip), `VertexAttribute`, `VertexAttributeLayout`, `MeshSubset`, `MeshGeometry` (with cached `bounds`, `version` re-upload counter), branded GPU data slots, and `MeshGeometryRuntime`.

Primitive builders (7), each writing the canonical 12-float PBR record (position+normal+tangent.w+uv0), outward normals, generated UVs, computed tangents, and cached bounds, with pinned RH/CCW/glTF conventions:

- `createBoxMeshGeometry` (per-face independent UVs), `createPlaneMeshGeometry` (subdivided XZ grid), `createQuadMeshGeometry` (XY unit quad), `createSphereMeshGeometry` (UV sphere), `createCylinderMeshGeometry` (independent top/bottom radii + caps), `createConeMeshGeometry` (delegates to cylinder with zero top radius), `createTorusMeshGeometry`.

Per-vertex compute:

- `computeMeshGeometryBounds` — tight AABB over positions, empty-stream sentinel (min=+Inf/max=-Inf), alias-safe with `geometry.bounds`.
- `computeMeshGeometryNormals` — area-weighted smooth face-normal accumulation, in-place safe.
- `computeMeshGeometryTangents` — Lengyel method with Gram-Schmidt orthogonalization and correct glTF `w` handedness sign, degenerate-UV fallback, in-place safe.

These three are genuinely well-implemented and are the high points of the package.

## Gaps vs an authoritative mesh-geometry library

Missing-by-omission (canonical features a mature library is expected to have):

- **Primitive coverage is thin.** Present: box, plane, quad, sphere, cylinder, cone, torus. A canonical primitive set (three.js/Godot/Babylon) also includes: **circle/disc** (only an internal `addDisc` helper, not exported), **ring**, **capsule**, **icosphere/geodesic sphere** (the UV sphere has pole pinching; an icosphere is the standard alternative), the **Platonic solids** (tetrahedron/octahedron/dodecahedron/icosahedron), **torus knot**, **tube/extrude-along-path**, **lathe/revolution**, **polyhedron**, and **text/3D-extruded shapes**. Roughly half the canonical generators are absent.
- **No attribute accessors.** There is no `getMeshGeometryAttribute` / `setMeshVertexPosition` / per-semantic read-write helper, and no `getVertexAttribute(layout, semantic)` lookup. Callers must hand-compute float offsets from the layout (exactly what the internal compute functions do privately). For a library whose central type is an interleaved buffer described by a flexible layout, attribute introspection and typed get/set are table-stakes and entirely missing from the public surface.
- **No geometry transforms.** No `transformMeshGeometry(out, geo, matrix)`, `translate`, `scale`, `rotate`, or `center`/`normalize`-to-unit-bounds. Applying a matrix to baked vertices (with the correct normal/tangent inverse-transpose handling) is a standard mesh operation.
- **No topology/index operations.** No `mergeMeshGeometries` (combine + offset indices), no `computeMeshGeometryIndices` (weld/index a non-indexed stream), no de-index/unweld (`toNonIndexed`), no `mergeVertices` (dedup by tolerance). These are core to asset pipelines.
- **No interleave/deinterleave or layout conversion.** No helper to build the interleaved buffer from separate position/normal/uv arrays (the builders do this privately via `buildCanonicalMeshGeometry`, but it is not exported), and no conversion between layouts/formats.
- **No flat-normal / face-normal mode.** `computeMeshGeometryNormals` only does smooth (area-weighted) normals; there is no flat-shading path and no angle-threshold/smoothing-group splitting.
- **No bounding sphere.** Only an AABB is cached/computed; a bounding sphere (`computeMeshGeometryBoundingSphere`) is the other standard culling primitive.
- **No UV utilities.** No second UV channel generation, no planar/box/spherical UV projection, no UV-bounds.
- **No validation/inspection.** No `validateMeshGeometry` (index range checks, NaN checks), no triangle/primitive count helper beyond raw index count.

Missing-by-design (correctly out of scope — not counted against the score):

- GPU upload, draw, materials, lighting, cameras live in `scene-gl`/`scene-wgpu`/`materials`/`lighting`/`camera` — the package correctly only models CPU data and exposes the runtime slots those crates fill.
- Mesh **loading/parsing** (glTF/OBJ) belongs to a resources/loader layer, not here.
- Skinning/morph-target _runtime_ deformation belongs elsewhere, though the `joints0`/`weights0` semantics are reserved here (appropriate).

## Naming / API-shape notes

- Naming is exemplary and on-convention: every function carries the full unabbreviated `MeshGeometry` type word, the `create*`/`clone*`/`compute*`/`get*`/`destroy*` verbs are used precisely (note the deliberate `destroy*` for the GPU-slot clears vs `dispose*`), and out-parameter compute functions are documented alias-safe with inputs read into locals first. Exports are alphabetized and tests are colocated.
- The canonical PBR layout, RH/CCW/glTF-w conventions, and the auto-promotion rule are all clearly documented in source and in the `@flighthq/types` header — good design-surface discipline.
- The internal `buildCanonicalMeshGeometry(positions, normals, uvs, indices)` and `addDisc` helpers are exactly the kind of utilities (interleave-from-arrays, circle generator) that an authoritative library exposes publicly. They are doing real work privately; promoting them (with proper naming) would close two gaps at once.
- Primitive builders take positional numeric arguments (e.g. `createTorusMeshGeometry(radius, tube, radialSegments, tubularSegments)`). This is consistent within the package and matches three.js, but for builders with 4–5 knobs an options object would be more self-documenting and extensible; worth considering given the pre-release latitude.

## Recommendation

Treat this as a **partial** package with a strong core that needs breadth to reach AAA. Prioritize, in roughly this order:

1. **Attribute accessors** — `getMeshGeometryAttribute(layout, semantic)` plus typed per-vertex get/set helpers. This is the most conspicuous omission for an interleaved-buffer library and unblocks everything else.
2. **Geometry operations** — `transformMeshGeometry` (with normal/tangent inverse-transpose), `mergeMeshGeometries`, index/de-index (`computeMeshGeometryIndices` / `toNonIndexed`), `mergeVertices` (weld), and `centerMeshGeometry`.
3. **Primitive coverage** — export a `createCircleMeshGeometry` (the `addDisc` work already exists), then add ring, capsule, icosphere, the Platonic solids, torus knot, and a tube/lathe/extrude pair to match the canonical generator set.
4. **Compute additions** — flat-normal mode (or angle-threshold splitting) and `computeMeshGeometryBoundingSphere`.
5. **Validation** — a `validateMeshGeometry` for index-range/NaN checks.

Items 1–2 are the bar-raisers; without attribute access and geometry ops the package cannot stand alone as an authoritative mesh library regardless of how many primitives it ships.

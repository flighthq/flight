---
package: '@flighthq/mesh'
crate: flighthq-mesh
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# mesh — Charter

## What it is

3D mesh **geometry** — the CPU-side data layer: interleaved vertex/index buffers, vertex attribute layouts, parametric primitive builders, and per-vertex attribute computation (normals, tangents, bounds, bounding sphere). It is the analogue of three.js `BufferGeometry` plus its `*Geometry` primitive family — a value-in/value-out math library that produces `MeshGeometry` values consumed downstream by the GPU mesh renderers.

Where it ends vs a neighbor:

- The renderable **`Mesh` node** (`MeshKind`, geometry + per-subset materials, scene-graph participation) lives in `scene`, not here. `mesh` owns the source data; `scene` owns the node's graph participation — the clean side of structural-forks fork A, which this package already respects (`types/Mesh.ts` is separate from `types/MeshGeometry.ts`).
- Generic vector/matrix/AABB/bounding-sphere math lives in `geometry`; `mesh` consumes `Matrix4`/`Aabb`/`BoundingSphere` from there rather than redefining them.
- File parsers that _produce_ `MeshGeometry` (OBJ/STL/PLY/glTF-primitive) belong in a prospective `mesh-formats` neighbor (the subject-triad `-formats` layer), not in this package.
- All public types live in `@flighthq/types` (`MeshGeometry.ts`); this package is the implementation against that header.

## North star (proposed)

_Inferred from the design and the forks; edit or promote into Decisions once blessed._

1. **A pure value-in/value-out geometry library.** `MeshGeometry` is plain data (typed vertex/index arrays + a layout + subsets + cached bounds); operations are free functions with explicit allocation (`create*`/`clone*`/`merge*`/`convert*` allocate; `compute*`/`transform*Into` write into `out`). No hidden runtime behavior, no graph coupling — this is what makes `mesh` the ideal first **Wasm-mixable** conformance leaf (structural-forks fork D).
2. **AAA CPU geometry completeness, mirroring three.js `BufferGeometry`.** The primitive family, the index pipeline (weld/de-index), normal/tangent/bounds computation, UV unwrapping, subset management, and layout conversion are the canonical surface a mesh-geometry library is expected to carry. A gap here is unfinished work, not a design choice.
3. **Correct, pinned 3D conventions.** RH/CCW winding, glTF tangent-`w` handedness, inverse-transpose normal/tangent transforms, Uint16→Uint32 index auto-promotion — the correctness invariants are fixed and tested, not per-builder folklore.
4. **Alias-safe, out-parameter math.** Compute/transform functions read all inputs into locals before writing, so `out` may alias an input. This discipline is real and tested today and is load-bearing for the C/C++ port and hot-loop reuse.
5. **Types-first, single-root, side-effect-free.** The full shape is navigable from `@flighthq/types` alone; the barrel is a thin re-export; the package declares `sideEffects: false` and depends only on `types` + `geometry`.

## Boundaries (proposed)

_Drawn from the review and neighbors; edit before blessing._

**In scope**

- The `MeshGeometry` data model, construction, cloning, and per-backend GPU-slot teardown (`destroy*` for the non-GC upload slot).
- The full canonical primitive builder set (box, sphere, icosphere, torus, capsule, the Platonic solids, …) and the shared polyhedron backer.
- Per-vertex attribute accessors over the layout (position, normal, tangent, uv0 today; the reserved `uv1`/`color0`/skinning channels are candidates — see Open directions).
- Normals (smooth/flat), tangents, AABB bounds, bounding sphere, merge, validate, from-attributes, layout conversion, and UV atlas transforms (offset/scale/wrap).
- Geometry transforms (matrix, translate, scale, center) with correct normal/tangent handling.

**Likely in scope, not yet built** (candidates — sequencing is the assessor's job)

- The index pipeline (weld/de-index), projection UV unwrapping, angle-threshold smooth normals, subset editing, and procedural/advanced builders (lathe/tube/extrude).

**Non-goals**

- The renderable `Mesh` scene-graph node and its rendering → `scene` / `scene-gl` / `scene-wgpu`.
- File-format parsing → a prospective `mesh-formats` neighbor.
- Generic vector/matrix/AABB/sphere math → `geometry`.
- Materials, lighting, textures → their own 3D-family packages.
- GPU upload/draw — `mesh` only provides the buffers and the branded upload slots.

## Decisions

None blessed yet.

## Open directions

Every question below is unsettled — an agent **asks** here rather than assuming. The charter is a seed stub, so the review fell back to the codebase-map AAA standard; each silence is surfaced for you to settle.

1. **Builder argument shape (deferred API fork).** All 17 builders take positional numeric args (matching three.js). For 4–6-knob builders (capsule, cylinder, torus-knot, polyhedron) an options object is more self-documenting and extensible. Pre-release is the moment to settle this in one sweep — but it is a deliberate API fork, not a sweep-safe cleanup.
2. **Index-pipeline ownership & flat-shading correctness.** Are `computeMeshGeometryIndices` (weld) and `expandMeshGeometryIndices` (de-index) in-package? The current `computeMeshGeometryFlatNormals` is last-write-wins on shared vertices and explicitly defers true per-face shading to the missing de-index — is that an acceptable interim or a correctness debt to close before scene-backend use?
3. **Mesh simplification / LOD home.** In-package (`simplifyMeshGeometry`) or a dedicated neighbor (`@flighthq/mesh-simplify`)? Fork G's 3D build-out makes this live, and `types/LodMesh.ts` already exists — implying a decision was gestured at but not recorded.
4. **`mesh-formats` triad split (structural-forks B / the subject triad).** Spawn `@flighthq/mesh-formats` (OBJ/STL/PLY/glTF-primitive → geometry)? Multiple formats clear the plurality guard; the sub-question is the glTF document-parse vs. per-primitive-mapping boundary (loader/resources owns the document). `convertMeshGeometryLayout` was built to underpin this, but no consumer exists yet.
5. **Reserved-channel activation & skinning data home (structural-forks fork A).** `uv1`, `color0`, `joints0`, `weights0` are declared semantics in `@flighthq/types` but have no accessors — the header advertises capability the package does not expose. When accessors land, the morph-target / skinning _data model_ must be agreed with whatever owns runtime deformation before baking shapes into `@flighthq/types`.
6. **Quantization seam.** The non-float `VertexFormat` members (`unorm8x4`/`uint8x4`/`uint16x4`) are modeled but `convertMeshGeometryLayout` only copies float32. Is octahedral-encoded quantization (Gold) in scope here, paired with the conversion path?
7. **Rust `flighthq-mesh` as a first mixable conformance target (structural-forks fork D).** The builders are pure math and an ideal value-in/value-out fingerprint target — is porting `mesh` an early conformance priority, and how are weld/dedup float-rounding tolerances recorded in the divergence map?
8. **Package Map first-class entry (admin-doc drift).** With fork G's _"full 3D is in scope"_ decision (2026-06-24), should `@flighthq/mesh` get a first-class Package Map entry in `tools/agents/docs/index.md` next to `geometry`/`materials`, rather than only appearing in the Rust map's 3D-pipeline section?
9. **3D-family type ownership tracking.** `@flighthq/types` already carries `Mesh`, `InstancedMesh`, `LodMesh`, `PathMesh`, `VertexColorMaterial`, and GL/Wgpu mesh-material renderer types — design surface for a 3D family larger than this package. Which package realizes each (e.g. `InstancedMesh` → `instancing`, `LodMesh` → a simplification owner TBD)?

---
package: '@flighthq/mesh'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/mesh.md
  - reviews/maturation/depth/mesh.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/mesh

**Evidence:** incoming bundle `builder-67dc46d64` (`head/packages/mesh/`, src + tests; the package is new vs. merge-base so the entire tree is added in this delta — Pass 1 + Pass 2 combined). Cross-package type/geometry checks against `head/packages/types/` and `head/packages/geometry/`.

## Verdict

**solid — 80/100.** The CPU geometry layer is now broad and correct: a clean data model, the full canonical primitive set (17 builders), typed per-vertex attribute accessors over an offset lookup, geometry transforms with correct inverse-transpose normal/tangent handling, merge/validate/from-attributes operations, bounding sphere, flat normals, layout conversion, and UV offset/scale/wrap. Naming is exemplary and the alias-safety discipline is real and tested. This is a large, well-built jump from the prior depth review's 52/100. It is held back from `authoritative` by genuine remaining gaps — the index pipeline (weld/de-index), projection UV unwrapping, the reserved `uv1`/`color0`/skinning channels, subset editing, and no `mesh-formats` neighbor or Rust crate yet — and by one over-claim in the status doc that the survey must correct (see below).

## Verified against the diff

The Pass-2 status claims hold up against source:

- **7 new exports across 3 files.** `computeMeshGeometryBoundingSphere` + `computeMeshGeometryFlatNormals` in `meshGeometryCompute.ts`; `CANONICAL_MESH_GEOMETRY_LAYOUT` + `convertMeshGeometryLayout` in the new `meshGeometryLayout.ts`; `offsetMeshGeometryUvs` / `scaleMeshGeometryUvs` / `wrapMeshGeometryUvs` in the new `meshGeometryUvs.ts`. All present and exported through the barrel (`index.ts`).
- **115 tests across 8 files** — confirmed by count (14/18/17/16/9/17/13/11).
- **Dedup refactor confirmed.** `meshGeometryOperations.ts` imports `getMeshGeometryVertexCount` from `meshGeometry.ts` (no private re-definition), and both builders and operations import the single `CANONICAL_MESH_GEOMETRY_LAYOUT` from `meshGeometryLayout.ts` — the previously duplicated private `CANONICAL_VERTEX_LAYOUT` is gone.
- **Alias-safety is real.** `computeMeshGeometryFlatNormals`, `computeMeshGeometryNormals`, `computeMeshGeometryTangents`, `computeMeshGeometryBounds`, `computeMeshGeometryBoundingSphere`, and `transformMeshGeometryInto` all read inputs into locals (or a scratch accumulator) before writing — inspected, not just asserted.
- **Cross-package deps the roadmap flagged as risks now exist:** `Matrix4`/`matrix4.ts`, `BoundingSphere`/`boundingSphere.ts` (+ `BoundingSphereLike`), and `Aabb`/`createAabb` are all present in `@flighthq/types`/`@flighthq/geometry`. The Bronze-step-2 and Silver-bounding-sphere cross-package blockers are resolved, so this work did not strand.

One over-claim to correct: see **Status doc over-claim** under Charter contradictions.

## Present capabilities

**Data model & construction (`meshGeometry.ts`).** `createMeshGeometry` (Uint16→Uint32 auto-promotion past the 65535 ceiling, default `triangle-list`, default single full-range subset), `cloneMeshGeometry` (fresh typed arrays + bounds, fresh runtime so GPU slots are not shared, `version` reset), `getMeshGeometryVertexCount`/`getMeshGeometryIndexCount`, and `destroyMeshGeometryGlData`/`...WgpuData` (clear the per-backend runtime upload slot — correct `destroy*` verb for a non-GC GPU resource). The single construction point `createMeshGeometryRuntime` keeps the runtime shape uniform.

**Attribute layer (`meshGeometryAttributes.ts`).** `getVertexAttribute` (sentinel `null`) and `getVertexAttributeFloatOffset` (sentinel `-1`, float32-only) are the shared offset lookup the depth review demanded; the duplicated private offset constants are now resolved through them. Typed `get*`/`set*` per-vertex accessors for Position, Normal, Tangent (4-component), and Uv0, all layout-driven (work on any layout, not just the canonical record), `set*` bumps `version`, out-of-range returns `false`/no-write.

**Primitive builders (17, `meshGeometryBuilders.ts`).** The full canonical set: box, capsule, circle, cone, cylinder, dodecahedron, icosahedron, icosphere, octahedron, plane, polyhedron, quad, ring, sphere, tetrahedron, torus-knot, torus. A shared `createPolyhedronMeshGeometry` backs the Platonic solids and is exported for custom solids. All funnel through one private `buildCanonicalMeshGeometry` finalize path (interleave → allocate → compute tangents → cache bounds), with pinned RH/CCW/glTF-`w` conventions.

**Compute (`meshGeometryCompute.ts`).** `computeMeshGeometryBounds` (tight AABB, empty-stream sentinel), `computeMeshGeometryNormals` (area-weighted smooth), `computeMeshGeometryTangents` (Lengyel + Gram-Schmidt + glTF handedness, degenerate-UV fallback), `computeMeshGeometryFlatNormals` (in-place last-write-wins face normals), `computeMeshGeometryBoundingSphere` (AABB-midpoint center + max-distance radius, negative-radius empty convention).

**Operations (`meshGeometryOperations.ts`).** `createMeshGeometryFromAttributes` (public counterpart to the private interleave helper; computes normals when omitted, always tangents), `getMeshGeometryTriangleCount` (correct for triangle-list and triangle-strip; 0 otherwise), `mergeMeshGeometries` (layout-match gate → `null`, index re-base, subset re-base, bounds recompute, empty → `null`), `validateMeshGeometry` (index-range, stride-divisibility, position NaN/Inf scan; sentinel `false`, never throws).

**Transforms (`meshGeometryTransforms.ts`).** `transformMeshGeometry`/`transformMeshGeometryInto` (Matrix4 to positions, inverse-transpose 3×3 to normals/tangent.xyz, tangent.w preserved, singular → `false`, bounds recompute), `translateMeshGeometry` (bounds shifted directly, not recomputed — nice), `scaleMeshGeometry` (inverse-scale normals), `centerMeshGeometry` (lazy bounds, origin-center).

**Layout & UV (`meshGeometryLayout.ts`, `meshGeometryUvs.ts`).** `CANONICAL_MESH_GEOMETRY_LAYOUT` (the one shared PBR layout constant), `convertMeshGeometryLayout` (semantic-matched float32 re-pack, drop absent source attrs, zero-fill absent target attrs, version reset, bounds null), and uv0 `offset`/`scale`/`wrap` (no-op + no version bump when uv0 absent).

**Type header (`@flighthq/types/MeshGeometry.ts`).** `VertexSemantic` (incl. reserved `joints0`/`weights0`/`color0`/`uv1`), `VertexFormat` (incl. non-float `unorm8x4`/`uint8x4`/`uint16x4`), `PrimitiveTopology`, `VertexAttribute`/`VertexAttributeLayout`, `MeshSubset`, `MeshGeometry` (cached `bounds`, `version`), branded `MeshGeometryGlData`/`...WgpuData` slots, and `MeshGeometryRuntime`. The renderable `Mesh` node (`MeshKind`, geometry + per-subset materials) lives separately in `types/Mesh.ts` and belongs to `scene`, not here — a clean source-data-vs-graph-participation boundary (structural-forks fork A) that this package respects.

## Gaps vs an authoritative mesh-geometry library

Named concretely (sequencing is the assessor's job, not stated here):

- **Index pipeline absent.** No `computeMeshGeometryIndices` (weld/dedup a non-indexed stream — three.js `mergeVertices`) and no `expandMeshGeometryIndices` (de-index / `toNonIndexed`). The flat-normals function explicitly defers truly-per-face shading to this missing `expandMeshGeometryIndices`, so the gap is load-bearing — flat shading on shared-vertex geometry is last-write-wins until de-index exists. Both were named Silver in the roadmap.
- **Projection UV unwrapping absent.** The shipped UV helpers are atlas transforms (offset/scale/wrap), not the roadmap's Silver projection set: `applyMeshGeometryPlanarUv`, `applyMeshGeometrySphericalUv`, `applyMeshGeometryBoxUv`, and `computeMeshGeometryUvBounds`. Imported/merged geometry still cannot be unwrapped.
- **Reserved channels unusable.** `uv1`, `color0`, `joints0`, `weights0` are declared semantics in `@flighthq/types` but have no accessors (`get/setMeshGeometryVertexUv1`, `...Color0`, `...Joints`/`...Weights`). The header advertises capability the package does not yet expose.
- **No angle-threshold normals.** `computeMeshGeometrySmoothNormals(out, geometry, maxSmoothAngleRadians)` (smoothing-group / hard-edge splitting) is absent; only the all-smooth and all-flat extremes exist.
- **No subset editing.** `addMeshGeometrySubset`/`setMeshGeometrySubsets`/`getMeshGeometrySubsetTriangleCount` — multi-material range management beyond the default single subset and what `mergeMeshGeometries` produces — is absent.
- **No `mesh-formats` neighbor.** glTF-primitive / OBJ / STL / PLY parsers that _produce_ `MeshGeometry` (the `-formats` triad layer, structural-forks B/the subject triad) do not exist. `convertMeshGeometryLayout` was built to underpin this but no consumer exists yet.
- **No advanced/procedural builders.** Lathe, tube/sweep, extrude — the path-driven generators — are Gold-tier and absent (correctly deferred, noted for completeness).
- **No optimization / quantization / morph / edge tiers.** Vertex-cache optimization, quadric LOD simplification, octahedral quantization (the non-float `VertexFormat` members are modeled but unused), morph-target bake, and wireframe/edge analysis are all Gold and absent. Wireframe-index generation in particular would unblock a scene-backend debug path.
- **No functional test, no Rust crate.** No `mesh-primitives` render scene proving the builders draw lit across backends; no `flighthq-mesh` crate. The builders are pure value-in/value-out math — the ideal first _mixable_ conformance target per the Rust map — so the absence of the crate is the largest single conformance gap.

## Charter contradictions

The charter is a **seed stub**: "What it is" is filled (transcribed from the depth review), but North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore no blessed principle or boundary for the code to contradict — the rubric falls back to the codebase-map AAA standard, against which the package is strong-but-incomplete as scored. Every silence is surfaced as a candidate Open direction below.

**Status doc over-claim (correct the record, not a code defect).** The Pass-2 status asserts _"All Silver items from the maturation roadmap are now done — none remaining."_ This is **false against the roadmap**. The roadmap's Silver tier names ~14 functions that are not implemented: `computeMeshGeometryIndices`, `expandMeshGeometryIndices`, `computeMeshGeometrySmoothNormals`, `applyMeshGeometryPlanarUv`, `applyMeshGeometrySphericalUv`, `applyMeshGeometryBoxUv`, `computeMeshGeometryUvBounds`, `get/setMeshGeometryVertexUv1`, `get/setMeshGeometryVertexColor0`, `addMeshGeometrySubset`, `setMeshGeometrySubsets`, `getMeshGeometrySubsetTriangleCount`. The worker shipped a real and valuable _subset_ of Silver (bounding sphere, flat normals, the full primitive set, layout conversion) plus useful non-roadmap additions (uv0 offset/scale/wrap), and its own Deferred-Items section even lists the index pipeline — so the summary line contradicts the body. The estimated 90/100 is over-stated for the same reason; this review lands at 80.

## Contract & docs fit

**Lives up to the contract — strongly.**

- **Types-first:** all public types in `@flighthq/types`; no cross-package types defined inline. The header is navigable on its own.
- **Naming:** every function carries the full unabbreviated `MeshGeometry` type word; verbs are precise (`create*`/`clone*`/`compute*`/`get*`/`set*`/`merge*`/`validate*`/`convert*`, and the deliberate `destroy*` for the GPU-slot clears vs. `dispose*`). Exports alphabetized in every file; tests colocated and counted by `exports:check`-style 1:1 pairing.
- **Out-params & alias-safety:** compute/transform functions use `out` and are documented + implemented alias-safe; verified by reading. Allocation is explicit (`create*`/`clone*`/`convert*`/`merge*` allocate; `compute*`/`transform*Into` write into `out`).
- **Sentinels not throws:** `mergeMeshGeometries`→`null`, `validateMeshGeometry`→`false`, `transformMeshGeometryInto`→`false` on singular, `getVertexAttribute*`→`null`/`-1`, UV/accessor no-ops on absent attribute. No throws on expected-failure paths.
- **Single root export, `sideEffects: false`, no top-level side effects.** Barrel is a thin re-export; manifest declares `sideEffects: false`; deps are only `@flighthq/types` + `@flighthq/geometry`.

**Minor code-hygiene nits (within-package, sweep-safe):**

- **Copy-paste doc comments in `meshGeometryAttributes.ts`.** `getMeshGeometryVertexNormal` (line 9) and `getMeshGeometryVertexUv0` (lines 48–49) both describe themselves as _"Reads the position (x, y, z)"_ / reference the wrong semantic. The code is correct; the comments were not updated from the position template.
- **Type-header comment drift:** `types/MeshGeometry.ts` references `destroyMeshGeometryGPUData` (lines 51, 79–80) but the actual functions are `destroyMeshGeometryGlData` / `destroyMeshGeometryWgpuData`. The header names a function that does not exist.

**Where the admin docs are stale against the work (candidate revisions — user's gate):**

- **Package Map line is thin.** `tools/agents/docs/index.md` does not list `@flighthq/mesh` in the main Package Map at all (the 3D family — `mesh`/`scene`/`lighting`/`texture`/`camera` — is described only in the Rust map's 3D-pipeline section). With fork G's _"full 3D is in scope"_ decision (2026-06-24), `mesh` warrants a first-class Package Map entry next to `geometry`/`materials`.
- **`@flighthq/types` reaches past `mesh`'s implementation.** The header carries `Mesh`, `InstancedMesh`, `LodMesh`, `PathMesh`, `VertexColorMaterial`, and GL/Wgpu mesh-material renderer types — design surface for a 3D family larger than this package. That is consistent with the header-first rule, but it means the `register.md`/charter system should track which package realizes each (e.g. `InstancedMesh` → `instancing`, accepted under fork G; `LodMesh` → simplification owner TBD).

## Candidate open directions

The charter is silent on all of these; each is a question for the user, not an assumption to act on:

1. **Builder argument shape (the depth review's deferred fork).** All 17 builders take positional numeric args (matching three.js). For 4–6-knob builders (capsule, cylinder, torus-knot, polyhedron) an options object is more self-documenting and extensible. Pre-release is the moment to settle this as one sweep before more builders land — but it is a deliberate API fork, not a sweep-safe cleanup.
2. **Index-pipeline ownership & flat-shading correctness.** Is `computeMeshGeometryIndices` / `expandMeshGeometryIndices` in-package (it underpins correct flat shading and welding), and is the current last-write-wins `computeMeshGeometryFlatNormals` an acceptable interim or a correctness debt to close before scene-backend use?
3. **Mesh simplification / LOD home.** In-package (`simplifyMeshGeometry`) or a dedicated neighbor (`@flighthq/mesh-simplify`)? The roadmap flags this as a sizable design-decision item; fork G's 3D build-out makes it live (and `types/LodMesh.ts` already exists, implying a decision was gestured at).
4. **`mesh-formats` triad split.** Spawn `@flighthq/mesh-formats` (OBJ/STL/PLY/glTF-primitive → geometry) per the subject-triad/plurality guard? Multiple formats clear the plurality bar; the open sub-question is the glTF document-parse vs. per-primitive-mapping boundary (loader/resources owns the document).
5. **Reserved-channel activation & skinning data home.** When `uv1`/`color0`/`joints0`/`weights0` accessors land, the morph-target / skinning _data model_ (`MeshMorphTarget`, joints/weights bake) must be agreed with whatever owns runtime deformation (fork A) before baking shapes into `@flighthq/types`.
6. **Quantization seam.** The non-float `VertexFormat` members (`unorm8x4`/`uint8x4`/`uint16x4`) are modeled but `convertMeshGeometryLayout` only copies float32. Is octahedral-encoded quantization (Gold) in scope here, paired with the conversion path?
7. **Rust `flighthq-mesh` as a first mixable conformance target.** The builders are pure math and an ideal value-in/value-out fingerprint target — is porting `mesh` an early conformance priority, and how are weld/dedup float-rounding tolerances recorded in the divergence map?

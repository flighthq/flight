---
package: '@flighthq/mesh'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/mesh

Sorts the review's gaps and the absorbed maturation roadmap (`reviews/maturation/depth/mesh.md`) into sweep-safe **Recommended** work and parked **Backlog**. The charter is a seed stub (North star / Boundaries / Decisions / Open directions all `TODO`), so the rubric falls back to the codebase-map AAA standard and every design/cross-package fork is surfaced to the charter's Open directions rather than acted on. `Approved` is empty — approval is the user's verbal gate.

The roadmap (`reviews/maturation/depth/mesh.md`) is one-time seed; it is fully absorbed here and can be removed.

## Recommended

Strictly sweep-safe: within `@flighthq/mesh`, no cross-package coupling, no new package, no breaking change, no open design decision. A blanket "do all recommended" can safely bless this set.

### Code-hygiene (in-package)

- **Fix the copy-paste doc comments in `meshGeometryAttributes.ts`.** `getMeshGeometryVertexNormal` (line 9) and `getMeshGeometryVertexUv0` (lines 48–49) both say _"Reads the position (x, y, z)"_ / reference the wrong semantic. Code is correct; only the comments drifted from the position template. Pure within-package cleanup. — review.md#contract--docs-fit

### Index pipeline (self-contained within-package)

- **`expandMeshGeometryIndices(geometry)`** — de-index / un-weld a stream to a flat non-indexed one (three.js `toNonIndexed`). Purely mechanical, no design decision; the prerequisite for truly per-face flat shading and per-face attributes. The shipped `computeMeshGeometryFlatNormals` explicitly defers to this. — review.md#gaps (roadmap Silver)
- **`computeMeshGeometryIndices(geometry, tolerance?)`** — weld/dedup a non-indexed stream into an indexed one (three.js `mergeVertices`). Self-contained in this package; the tolerance is a standard numeric knob, not an API fork. (The Rust-port float-rounding-tolerance recording is an Open direction, not a blocker for the TS function.) — review.md#gaps (roadmap Silver)

### Normals

- **`computeMeshGeometrySmoothNormals(out, geometry, maxSmoothAngleRadians)`** — angle-threshold normals that split hard edges, the missing middle between the shipped all-smooth and all-flat extremes. Composes on `expandMeshGeometryIndices` above; standard algorithm, no design decision, alias-safe `out`. — review.md#gaps (roadmap Silver)

### Projection UV unwrapping

- **`applyMeshGeometryPlanarUv(geometry, axis)`, `applyMeshGeometrySphericalUv(geometry)`, `applyMeshGeometryBoxUv(geometry)`, `computeMeshGeometryUvBounds(out, geometry, channel)`** — the roadmap's Silver projection set. The shipped uv0 offset/scale/wrap helpers are atlas transforms, not unwrapping; imported/merged geometry still cannot be unwrapped. Self-contained value-in/value-out, no cross-package type. — review.md#gaps (roadmap Silver)

### Reserved-channel accessors (non-skinning)

- **`get/setMeshGeometryVertexUv1` and `get/setMeshGeometryVertexColor0`.** The `uv1`/`color0` semantics already exist in `@flighthq/types`; these are layout-driven accessors exactly like the shipped Position/Normal/Tangent/Uv0 pairs, `set*` bumps `version`, out-of-range no-writes. Closes the header-advertises-but-package-doesn't-expose gap for the two non-skinning reserved channels. Color packed RGBA8 per Flight convention. (`joints0`/`weights0` are **not** here — they wait on the skinning data-model fork; see Backlog.) — review.md#gaps (roadmap Silver)

### Subset editing

- **`addMeshGeometrySubset`, `setMeshGeometrySubsets`, `getMeshGeometrySubsetTriangleCount`** — multi-material range management beyond the default single subset and what `mergeMeshGeometries` produces. Operates on the existing `MeshSubset` type; within-package, sentinel-returning. — review.md#gaps (roadmap Silver)

### Edge / wireframe analysis

- **`computeMeshGeometryWireframeIndices(geometry)`** (line-list index buffer from triangle indices), **`computeMeshGeometryEdges(geometry)`**, and **`findMeshGeometryNonManifoldEdges(geometry)`** (diagnostic). All pure value-in/value-out over the existing index stream — within-package, no design decision, sentinels not throws. The function ships no coupling even though its eventual _consumer_ is a scene-backend debug-render path. — review.md#gaps (roadmap Gold)

### Header comment drift (correction only; note the cross-file edit)

- **Correct the type-header comment drift in `@flighthq/types/MeshGeometry.ts`** — it references `destroyMeshGeometryGPUData` (lines 51, 79–80) but the real functions are `destroyMeshGeometryGlData` / `destroyMeshGeometryWgpuData`. A comment-only correction naming this package's own exports; non-breaking, no coupling. (Touches the `types` header file rather than `mesh/` source — included as sweep-safe because it is a zero-logic doc fix of this package's surface; move to Backlog if the gate is read as files-strictly-under-`mesh/`.) — review.md#contract--docs-fit

## Backlog

Parked: cross-package coordination, a new package, larger/algorithm-heavy scope, or waiting on an Open direction. Each carries its reason.

- **`get/setMeshGeometryVertexJoints` / `...Weights` (skinning accessors).** _Parked on an Open direction._ The `joints0`/`weights0` semantics exist in the header, but activating them is entangled with the morph-target / skinning _data model_ that must be agreed with whatever owns runtime deformation (structural-forks fork A; Open direction #5). Not sweep-safe until that boundary is set.
- **`@flighthq/mesh-formats` neighbor (OBJ / STL / PLY / glTF-primitive → `MeshGeometry`).** _New package + design fork._ The subject-triad `-formats` layer (fork B / the triad). It clears the plurality guard (≥2 formats) and the bedrock test (mature upstream parsers exist, well-homed, honest name), so it is a real **register candidate** — but a new package and the glTF document-parse vs. per-primitive-mapping boundary is an open decision (Open direction #4). `convertMeshGeometryLayout` was built to underpin it; no consumer exists yet.
- **Advanced / procedural builders — `createLatheMeshGeometry`, `createTubeMeshGeometry`, `createExtrudeMeshGeometry`, polyhedron detail-subdivision.** _Large Gold scope._ Lathe/tube are pure math but algorithm-heavy and roadmap-deferred; `createExtrudeMeshGeometry` couples to 2D shape/path input (a `path`/shape-source dependency), so it is not within-package-only.
- **Mesh optimization passes — `optimizeMeshGeometryVertexCache` (Forsyth), `...Overdraw`, `...VertexFetch`.** _Large, algorithm-heavy Gold (meshoptimizer-class)._ Roadmap-deferred; substantial enough to warrant its own pass.
- **`simplifyMeshGeometry` (quadric-error LOD decimation).** _Design fork + sizable._ Open direction #3 asks whether decimation is in-package or a dedicated `@flighthq/mesh-simplify` neighbor; `types/LodMesh.ts` already exists, implying a gesture at a decision. Not sweep-safe until the home is set.
- **`quantizeMeshGeometry` + dequantize (octahedral / `unorm8x4`·`uint16` encoding).** _Design fork._ The non-float `VertexFormat` members are modeled but `convertMeshGeometryLayout` only copies float32; whether quantization lives here and pairs with the conversion path is Open direction #6.
- **Morph-target data model — `MeshMorphTarget` type + `applyMeshGeometryMorphTargets`.** _Cross-package type decision._ The `@flighthq/types` shape must be agreed with the runtime-deformation owner before baking (fork A; Open direction #5).
- **`enableMeshGeometrySignals` / `onMeshGeometryChange` (opt-in signals group).** _Dependency + API-surface decision._ Adds a `@flighthq/signals` dependency to a package whose deps are currently only `types` + `geometry`, and the `enable*`/opt-in shape is a deliberate surface choice — better made knowingly than swept.
- **`mesh-primitives` functional test (builders draw lit across backends).** _Cross-package._ Needs the `scene-gl` / `scene-wgpu` render backends and the functional-test harness; cannot be authored from within `mesh` alone.
- **Rust `flighthq-mesh` crate (1:1 port; first mixable conformance target).** _Cross-repo / conformance decision._ The builders are pure value-in/value-out math and the ideal first fingerprint target, but porting priority and how weld/dedup float-rounding tolerances are recorded in the divergence map is Open direction #7.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## Notes for the charter (Open directions — do not act, surface to the user)

These came up while assessing; they are design/cross-package questions for the charter, not Recommended work. Listed so a direction session can absorb them. (This skill does not edit the charter.)

1. **Builder argument shape** — positional numeric args (three.js-style) vs. an options object for the 4–6-knob builders (capsule, cylinder, torus-knot, polyhedron). The review calls this _a deliberate API fork, not a sweep-safe cleanup_; pre-release is the moment to settle it as one sweep before more builders land. (review Open direction #1)
2. **Index-pipeline ownership & flat-shading correctness** — is the current last-write-wins `computeMeshGeometryFlatNormals` an acceptable interim, or a correctness debt to close (rewrite over `expandMeshGeometryIndices`) before scene-backend use? (review Open direction #2)
3. **Mesh simplification / LOD home** — in-package `simplifyMeshGeometry` vs. a dedicated `@flighthq/mesh-simplify`; `types/LodMesh.ts` already exists. (review Open direction #3)
4. **`mesh-formats` triad split** — spawn the `-formats` neighbor; settle the glTF document-parse vs. per-primitive-mapping boundary (loader/resources owns the document). (review Open direction #4)
5. **Reserved-channel activation & skinning data home** — when `uv1`/`color0` accessors land (Recommended) vs. `joints0`/`weights0` + morph/skinning data model, which must be agreed with the runtime-deformation owner (fork A). (review Open direction #5)
6. **Quantization seam** — is octahedral-encoded quantization in scope here, paired with an extended `convertMeshGeometryLayout`? (review Open direction #6)
7. **Rust `flighthq-mesh` as a first mixable conformance target** — porting priority and divergence-map tolerance recording. (review Open direction #7)

Admin / register items the review flagged (route to the user, not into Recommended):

- **Package Map entry for `@flighthq/mesh`.** `tools/agents/docs/index.md` does not list it; with fork G (_full 3D is in scope_, 2026-06-24) it warrants a first-class entry next to `geometry`/`materials`.
- **Register ownership of the header-advertised 3D types.** `@flighthq/types` carries `Mesh`, `InstancedMesh`, `LodMesh`, `PathMesh`, `VertexColorMaterial`, and GL/Wgpu mesh-material renderer types — `register.md`/charters should track which package realizes each (`InstancedMesh` → `instancing` under fork G; `LodMesh` → simplification owner TBD, tied to Open direction #3).

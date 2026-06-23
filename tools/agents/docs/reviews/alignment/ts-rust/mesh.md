# TS↔Rust Alignment: @flighthq/mesh

**Verdict:** Source names, files, and conventions are in lockstep — all 16 TS exports map 1:1 to `flighthq-mesh` with correct snake_case and full type words; the `npm run rust:conformance` "0 covered / gap 16" is a script blind spot (it matches only the leaf Rust test name and drops the function-named parent `mod`), not a real defect.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| (16 exports, see "In sync") | (16 `pub fn`, see "In sync") | None — exact snake_case mapping, full type words preserved. |
| — | `get_mesh_kind` / `mesh_geometry.rs` | Rust-only extra. No `@flighthq/mesh` TS export named this; the TS `MeshKind` lives as a string const in `@flighthq/types` (`Mesh.ts`), consumed by `@flighthq/scene`. This is the documented `*Kind` string → `KindId::of::<T>()` model (rust/index.md), so it is acceptable port glue, but it is an undocumented per-crate extra — consider a one-line note in the divergence map that mesh exposes a `get_*_kind` accessor with no TS-mesh counterpart. |
| `destroyMeshGeometryGlData(geometry: Readonly<MeshGeometry>)` | `destroy_mesh_geometry_gl_data(runtime: &mut MeshGeometryRuntime)` | Signature-shape divergence (also applies to `…WgpuData`). TS reads the runtime off the entity via `EntityRuntimeKey` and takes the entity read-only; Rust takes the runtime by `&mut`. Semantically equivalent (entity/runtime split expressed per-language: TS runtime-slot vs Rust explicit runtime borrow). `destroy_*` verb correctly preserved. Not a naming defect; an expected entity/runtime expression difference. Not currently called out in the divergence map. |
| conformance metric `mesh \| 16 \| 0 \| 29 \| 16 ⚠️` | n/a | False gap. 29 real `#[test]`s exist, organized in function-named `mod` blocks (`mod clone_mesh_geometry { … }`) with BDD leaf names. `isCovered` in `scripts/rust-conformance.ts` matches `path.split('::').pop()` only, discarding the function-bearing parent module, so coverage reads 0. Tooling issue to track, not a mesh defect. |

## In sync

All 16 TS exports map 1:1 (camelCase → snake_case, full type word preserved):

- `cloneMeshGeometry` → `clone_mesh_geometry`
- `computeMeshGeometryBounds` → `compute_mesh_geometry_bounds`
- `computeMeshGeometryNormals` → `compute_mesh_geometry_normals`
- `computeMeshGeometryTangents` → `compute_mesh_geometry_tangents`
- `createBoxMeshGeometry` → `create_box_mesh_geometry`
- `createConeMeshGeometry` → `create_cone_mesh_geometry`
- `createCylinderMeshGeometry` → `create_cylinder_mesh_geometry`
- `createMeshGeometry` → `create_mesh_geometry`
- `createPlaneMeshGeometry` → `create_plane_mesh_geometry`
- `createQuadMeshGeometry` → `create_quad_mesh_geometry`
- `createSphereMeshGeometry` → `create_sphere_mesh_geometry`
- `createTorusMeshGeometry` → `create_torus_mesh_geometry`
- `destroyMeshGeometryGlData` → `destroy_mesh_geometry_gl_data`
- `destroyMeshGeometryWgpuData` → `destroy_mesh_geometry_wgpu_data`
- `getMeshGeometryIndexCount` → `get_mesh_geometry_index_count`
- `getMeshGeometryVertexCount` → `get_mesh_geometry_vertex_count`

File-name tracking is exact:

- `meshGeometry.ts` ↔ `mesh_geometry.rs`
- `meshGeometryBuilders.ts` ↔ `mesh_geometry_builders.rs`
- `meshGeometryCompute.ts` ↔ `mesh_geometry_compute.rs`

Convention carry-across is correct: package→crate name is identity (`@flighthq/mesh` → `flighthq-mesh`); `out` → `&mut out` on the compute/bounds functions (`compute_mesh_geometry_bounds(out: &mut Aabb, …)`, normals/tangents `out: &mut MeshGeometry`), with alias-safety tests present (`is_safe_when_out_aliases_geometry_bounds`); `get_*` accessor verb and `create_*` allocation verb preserved; `destroy_*` teardown verb preserved. Dependency edges match (`flighthq-geometry`, `flighthq-types`).

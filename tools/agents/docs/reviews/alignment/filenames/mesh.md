# Filename Alignment: @flighthq/mesh

**Verdict:** Clean. This is a single-implementation domain package (vertex layouts, primitive builders, normals/tangents/bounds) — not a backend-variant package, so plain `meshGeometry*` domain/object names are correct and no `gl`/`wgpu` backend prefix is required. The GPU mesh renderers live in the separate `scene-gl` / `scene-wgpu` packages. Every source file names the object (`MeshGeometry`) plus a coherent sub-domain and passes the "remove the folder" test.

## Findings

| File   | Issue | Suggested rename |
| ------ | ----- | ---------------- |
| _none_ | —     | —                |

## Clean

- `index.ts` — barrel re-export of the three source modules; expected.
- `meshGeometry.ts` — core `MeshGeometry` object: `createMeshGeometry`, `cloneMeshGeometry`, `destroyMeshGeometryGlData`/`destroyMeshGeometryWgpuData`, `getMeshGeometryIndexCount`/`getMeshGeometryVertexCount`, plus the `MeshGeometryOptions` interface. Names the object, covers its lifecycle/accessors — not a single function.
- `meshGeometryBuilders.ts` — primitive builder domain over `MeshGeometry`: box, cone, cylinder, plane, quad, sphere, torus. "Builders" is a real, recognizable domain term spanning seven functions, not a one-function name.
- `meshGeometryCompute.ts` — derived-attribute compute domain over `MeshGeometry`: `computeMeshGeometryBounds`, `computeMeshGeometryNormals`, `computeMeshGeometryTangents`. Names the object plus its computed-attribute sub-domain (three functions); passes the not-one-function test.
- `meshGeometry.test.ts`, `meshGeometryBuilders.test.ts`, `meshGeometryCompute.test.ts` — tests colocated and mirror their source filenames exactly.

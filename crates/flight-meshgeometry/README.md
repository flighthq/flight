# flight-meshgeometry

Mesh data, attribute access, primitive builders, index/layout operations, normals,
tangents, bounds, transforms, and CPU morphing. The Rust package is named for its
geometry API. Its reference remains the exported TypeScript `mesh` package at
`a62784923f3be814463286c9fb28edfe6ab15789`; the existing conformance resolver maps
this one crate to that source package.

The crate root mirrors the curated TypeScript `index.ts`. `contract` also exports
construction initialization, cached bounds queries, vertex-format operations,
and exact enum string tables. Rust sugar delegates to the public free functions;
every method has a separate inline comparison. Foreign geometry output types and
slice receivers cannot acquire inherent methods in this crate.

## Buffers and identity

Stored typed arrays use fixed-length `Box<[T]>` storage. Builders may grow a local
`Vec`, then convert before storing it. Layout records use `Ref<VertexAttributeLayout>`.
Both geometry clone functions share the source layout. The full clone copies
vertex/index buffers; the metadata clone shares index-buffer handles and has an
empty vertex buffer. Bounds and subset lists are copied by both clone functions,
and construction trusts supplied bounds at their supplied version.

Bind poses are shared `Ref` records in the private geometry cache. Attribute and
bounds queries borrow the actual stored records. Refresh reuses the cached AABB;
tangent computation reuses vertex/index objects unless seam splitting needs new
storage. Tests check pointer identity and changes observed through shared handles.

Attribute-index inputs preserve the complete source union: numeric values,
16-bit typed data, or 32-bit typed data. The output conversion copies the input
and selects its index width from the vertex count.

Default arguments use `Option` in their source positions. Segment/detail counts
use signed `i32`, retain negative clamping, and normalize into integer loop indices.
Fractional and non-finite count inputs cannot be represented; their source tests,
including the non-finite `RangeError`, are recorded as omissions. Invalid byte-view
ranges retain `RangeError` classification and fail before writing any bytes.

## Precision

Geometry, attributes, builder arithmetic, and stored vertex data use `f32`.
Exactly five functions retain `f64` for source-declared `Float64Array` accumulator
storage, with an item-level reason next to each function:

| Function | Source evidence in `meshGeometryCompute.ts` |
| --- | --- |
| `compute_mesh_geometry_normals` | line 203: normal accumulator |
| `accumulate_normal` | line 295: accumulator writer |
| `compute_mesh_geometry_tangents` | lines 432–433: tangent/bitangent accumulators |
| `write_accumulated_tangent` | lines 543–544: accumulator reader |
| `accumulate_tangent` | lines 624–625: accumulator writer |

These declarations preserve the existing accumulator algorithms. They do not
widen other calculations or change test tolerances.

## Placement and renderer contracts

`Mesh` and `update_mesh_morph` remain temporarily here because their scene3d owner
has not been ported. The temporary Mesh has an Entity slot, but the remaining
scene-node fields and factory belong to scene3d. This package does not implement scene-node inheritance or
native rendering. GPU upload slots remain placeholders until render-gl and
render-wgpu own their branded data. Byte attribute access uses live borrowed byte
views rather than storing a JavaScript `DataView` cache object.

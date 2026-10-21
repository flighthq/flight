# flight-spatial

Uniform-grid and BVH broadphase indexing with reusable output buffers.

`create_spatial_index_2d(None)` and `create_spatial_index_3d(None)` select the
standard uniform grid. Pass `Some(backend)` to select a grid with another cell
size, a BVH, or a custom callback record. Each index keeps its backend in private
runtime state. Backend callbacks share the state they capture.

Pair queries return borrowed slices of reusable index storage. Pair addresses
remain stable across queries with steady topology. Other queries clear and fill
the caller's output vector. A frustum contains exactly 24 coordinates; its
optional slice count defaults to eight. Object IDs are signed 32-bit integers.
Cell coordinates use signed 32-bit floors; values outside that integer range are
unrepresentable. Oversized extents still use the bounded overflow path.

`set_spatial_indexing_guard` installs one optional diagnostic callback for all
indices and both dimensions. It reports declines, overflow, and missing IDs
without changing query results. The default is no guard.

The crate root mirrors the TypeScript public index plus its public types. The
`contract` module also exposes construction initializers and grid records.

## Precision

Bounds, coordinates, margins, and cell sizes use `f32`. Cell-span calculations
retain `f64` so large extents can be routed to the bounded overflow path before
any cell traversal. Counts above 2^24 need double precision to retain inclusive
endpoint increments; three-dimensional span products need the wider range too.

| Items | Reason |
| --- | --- |
| `spanned_cell_count_2d`, `spanned_cell_count_3d` | Preserve inclusive cell spans and their two- or three-axis products. |
| `insert_into_grid`, `insert_into_grid_3d`, `update_grid_object`, `update_grid_3d_object` | Compare those double spans to the existing per-object cell budget without narrowing. |
| `query_grid_region`, `query_grid_3d_region` | Choose a bounded object scan for a query wider than the populated grid. |
| `report_grid_indexing`, `report_grid_3d_indexing` | Carry the refused span into diagnostic notices without narrowing. |
| `SpatialIndexingExplanation`, `SpatialIndexingNotice` | Expose the same double bucket-count diagnostics as the TypeScript reference. |

Each item has an individual `allow(f64)` declaration. The existing oversized
extent and region-query tests exercise these overflow and bounded-scan paths.

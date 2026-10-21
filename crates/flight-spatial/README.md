# flight-spatial

Uniform-grid and BVH broadphase indexing with reusable output buffers.

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

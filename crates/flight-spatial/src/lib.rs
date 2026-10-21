mod bvh_3d;
mod explain_spatial_indexing_2d;
mod explain_spatial_indexing_3d;
mod format_spatial_indexing_notice;
mod spatial_index;
mod spatial_index_3d;
mod spatial_indexing_guard;
mod sugar;
mod uniform_grid;
mod uniform_grid_3d;

pub mod contract;

pub use bvh_3d::create_bvh_spatial_backend_3d;
pub use explain_spatial_indexing_2d::explain_spatial_indexing_2d;
pub use explain_spatial_indexing_3d::explain_spatial_indexing_3d;
pub use format_spatial_indexing_notice::format_spatial_indexing_notice;
pub use spatial_index::{
    SpatialAabb2D, SpatialIndex2D, SpatialIndexBackend2D, SpatialPair, clear_spatial_index_2d,
    create_spatial_index_2d, insert_spatial_object_2d, query_spatial_pairs_2d,
    query_spatial_point_2d, query_spatial_ray_2d, query_spatial_region_2d,
    remove_spatial_object_2d, update_spatial_object_2d,
};
pub use spatial_index_3d::{
    SpatialFrustum3D, SpatialIndex3D, SpatialIndexBackend3D, clear_spatial_index_3d,
    create_spatial_index_3d, insert_spatial_object_3d, query_spatial_frustum_3d,
    query_spatial_pairs_3d, query_spatial_point_3d, query_spatial_ray_3d, query_spatial_region_3d,
    query_spatial_sphere_3d, remove_spatial_object_3d, update_spatial_object_3d,
};
pub use spatial_indexing_guard::{
    SpatialDeclineReason, SpatialIndexingExplanation, SpatialIndexingGuard, SpatialIndexingMode,
    SpatialIndexingNotice, SpatialIndexingOperation, SpatialIndexingReason, SpatialObjectId,
    report_spatial_indexing, set_spatial_indexing_guard,
};
pub use uniform_grid::{MAX_INDEXED_CELLS_PER_OBJECT, create_uniform_grid_spatial_backend_2d};
pub use uniform_grid_3d::{SpatialAabb3D, create_uniform_grid_spatial_backend_3d};

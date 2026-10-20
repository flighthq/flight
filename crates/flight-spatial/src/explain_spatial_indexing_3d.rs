use crate::{
    SpatialIndexingExplanation, SpatialObjectId,
    spatial_index_3d::{SpatialIndex3D, explain_spatial_indexing_3d_impl},
};

/// Reports how the 3D index is currently holding `id`, as plain data. Pure read-only diagnostic.
pub fn explain_spatial_indexing_3d(
    index: &SpatialIndex3D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    return explain_spatial_indexing_3d_impl(index, id);
}

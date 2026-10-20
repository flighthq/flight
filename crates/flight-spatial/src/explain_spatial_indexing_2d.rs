use crate::{SpatialIndex2D, SpatialIndexingExplanation, SpatialObjectId, spatial_index::explain_grid_indexing};

/// Reports how the 2D index is currently holding `id`, as plain data. Pure read-only diagnostic.
pub fn explain_spatial_indexing_2d(
    index: &SpatialIndex2D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    return explain_grid_indexing(index, id);
}

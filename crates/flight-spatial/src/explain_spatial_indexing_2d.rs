use crate::{
    SpatialIndex2D, SpatialIndexingExplanation, SpatialObjectId, spatial_index::explain_index_2d,
};

/// Reports how the 2D index is currently holding `id`, as plain data. Pure read-only diagnostic.
pub fn explain_spatial_indexing_2d(
    index: &SpatialIndex2D,
    id: SpatialObjectId,
) -> SpatialIndexingExplanation {
    return explain_index_2d(index, id);
}

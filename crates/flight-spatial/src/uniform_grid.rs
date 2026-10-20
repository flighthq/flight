use crate::{SpatialIndex2D, create_spatial_index_2d, initialize_spatial_index_2d};

// Re-export the constant from spatial_index where it is defined.
pub use crate::spatial_index::MAX_INDEXED_CELLS_PER_OBJECT;

/// Creates a 2D uniform-grid spatial backend with the given cell size. Since the uniform grid is
/// the only 2D backend, this returns a SpatialIndex2D directly.
pub fn create_uniform_grid_spatial_backend_2d(cell_size: f32) -> SpatialIndex2D {
    return create_spatial_index_2d(cell_size);
}

/// Initializes a 2D uniform-grid spatial backend in place.
pub fn initialize_uniform_grid_spatial_backend_2d(out: &mut SpatialIndex2D, cell_size: f32) {
    initialize_spatial_index_2d(out, cell_size);
}

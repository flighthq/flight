use flight_entity::allocate_entity;
use flight_texture::contract::*;

mod invalidate_voxel_grid {
    use super::*;

    #[test]
    fn wraps_the_shared_source_revision_and_preserves_payload() {
        let mut grid: VoxelGrid = allocate_entity();
        assert_eq!(grid.kind, VOXEL_GRID_TEXTURE_SOURCE_KIND);
        grid.version = u32::MAX;
        grid.depth = 7;
        invalidate_voxel_grid(&mut grid);
        assert_eq!(grid.version, 0);
        assert_eq!(grid.depth, 7);
    }
}

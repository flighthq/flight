use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
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

mod texture_source {
    use super::*;

    #[test]
    fn recovers_the_same_voxel_grid_and_mutates_its_payload() {
        let mut grid: VoxelGrid = allocate_entity();
        grid.data = vec![3].into_boxed_slice();
        let shared: Ref<VoxelGrid> = Arc::new(RwLock::new(grid));
        let source: TextureSourceRef = shared.clone();
        assert_eq!(
            Arc::as_ptr(&shared) as *const (),
            Arc::as_ptr(&source) as *const ()
        );
        {
            let guard = source.read().unwrap();
            let any: &dyn Any = &*guard;
            let grid = any.downcast_ref::<VoxelGrid>().unwrap();
            assert_eq!(grid.data.as_ptr(), shared.read().unwrap().data.as_ptr());
        }
        {
            let mut guard = source.write().unwrap();
            let any: &mut dyn Any = &mut *guard;
            any.downcast_mut::<VoxelGrid>().unwrap().data[0] = 29;
        }
        assert_eq!(shared.read().unwrap().data[0], 29);
    }
}

use crate::types::VoxelGrid;

pub fn invalidate_voxel_grid(voxel_grid: &mut VoxelGrid) {
    voxel_grid.version = voxel_grid.version.wrapping_add(1);
}

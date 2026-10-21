mod cube_texture_test;
mod enums_test;
mod sampler_test;
mod texture_color_space_test;
mod texture_test;
mod voxel_grid_test;

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_texture::contract::*;

fn source(kind: &str, width: u32, height: u32) -> TextureSourceRef {
    let mut value: VoxelGrid = allocate_entity();
    value.kind = kind.to_string();
    value.width = width;
    value.height = height;
    return Arc::new(RwLock::new(value));
}

fn voxel_grid(width: u32, height: u32, depth: u32) -> Ref<VoxelGrid> {
    let mut value: VoxelGrid = allocate_entity();
    value.width = width;
    value.height = height;
    value.depth = depth;
    return Arc::new(RwLock::new(value));
}

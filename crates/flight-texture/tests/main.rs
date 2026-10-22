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

#[path = "cube_texture_test.rs"]
mod flight_texture_cube_texture_test;
#[path = "enums_test.rs"]
mod flight_texture_enums_test;
#[path = "sampler_test.rs"]
mod flight_texture_sampler_test;
#[path = "texture_color_space_test.rs"]
mod flight_texture_texture_color_space_test;
#[path = "texture_test.rs"]
mod flight_texture_texture_test;
#[path = "voxel_grid_test.rs"]
mod flight_texture_voxel_grid_test;

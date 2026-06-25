//! `flighthq-textureatlas` — texture atlases: regions, UVs, and constructors over image resources.

pub mod texture_atlas;
pub mod texture_atlas_region;

pub use texture_atlas::{
    create_texture_atlas, create_texture_atlas_from_image_resource,
    load_texture_atlas_from_array_buffer, load_texture_atlas_from_bytes,
    load_texture_atlas_from_path, load_texture_atlas_from_url,
};
pub use texture_atlas_region::{
    add_texture_atlas_region, add_texture_atlas_region_rectangle,
    add_texture_atlas_region_rectangle_xy, add_texture_atlas_region_vector2,
    create_texture_atlas_region, set_texture_atlas_region,
};

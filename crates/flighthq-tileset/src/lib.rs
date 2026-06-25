//! `flighthq-tileset` — tilesets: uniform-grid texture atlases and constructors from images.

pub mod tileset;

pub use tileset::{
    build_tileset_regions, create_tileset, create_tileset_from_atlas,
    create_tileset_from_image_resource, load_tileset_from_array_buffer, load_tileset_from_bytes,
    load_tileset_from_path, load_tileset_from_url,
};

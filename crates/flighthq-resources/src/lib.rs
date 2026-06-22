//! `flighthq-resources` — resource primitives and loading.
//!
//! Provides types and free functions for image resources, audio resources,
//! video resources, font resources, texture atlases, tilesets, and fonts.
//! All loading is explicit and side-effect-free at module load time.

pub mod audio_resource;
pub mod font;
pub mod font_resource;
pub mod image_resource;
pub mod texture_atlas;
pub mod texture_atlas_region;
pub mod tileset;
pub mod video_resource;

pub use audio_resource::{
    create_audio_resource, create_audio_resource_from_url, create_audio_resource_from_urls,
    dispose_audio_resource, has_audio_resource_data, load_audio_resource_from_bytes,
    load_audio_resource_from_path, load_audio_resource_from_url, load_audio_resource_from_urls,
};
pub use font::{
    create_font, load_font_from_array_buffer, load_font_from_bytes, load_font_from_path,
    load_font_from_url, load_font_from_urls,
};
pub use font_resource::{
    create_font_resource, dispose_font_resource, has_font_resource_face,
    load_font_resource_from_array_buffer, load_font_resource_from_bytes,
    load_font_resource_from_path, load_font_resource_from_url, load_font_resource_from_urls,
};
pub use image_resource::{
    clone_image_resource, create_image_resource, detect_image_mime_type, dispose_image_resource,
    has_image_resource_data, invalidate_image_resource, is_image_resource_empty,
    load_image_resource_from_array_buffer, load_image_resource_from_bytes,
    load_image_resource_from_path, load_image_resource_from_url, set_image_resource_data,
};
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
pub use tileset::{
    build_tileset_regions, create_tileset, create_tileset_from_atlas,
    create_tileset_from_image_resource, load_tileset_from_array_buffer, load_tileset_from_bytes,
    load_tileset_from_path, load_tileset_from_url,
};
pub use video_resource::{
    create_video_resource, create_video_resource_from_url, create_video_resource_from_urls,
    dispose_video_resource, has_video_resource_data, load_video_resource_from_path,
    load_video_resource_from_url, load_video_resource_from_urls,
};

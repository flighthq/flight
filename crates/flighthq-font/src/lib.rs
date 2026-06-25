//! `flighthq-font` — font and font-resource types and constructors.

pub mod font;
pub mod font_resource;

pub use font::{
    create_font, load_font_from_array_buffer, load_font_from_bytes, load_font_from_path,
    load_font_from_url, load_font_from_urls,
};
pub use font_resource::{
    create_font_resource, dispose_font_resource, has_font_resource_face,
    load_font_resource_from_array_buffer, load_font_resource_from_bytes,
    load_font_resource_from_path, load_font_resource_from_url, load_font_resource_from_urls,
};

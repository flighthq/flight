//! `flighthq-image` — image resources: pixel sources, MIME detection, and constructors.

pub mod image_resource;

pub use image_resource::{
    clone_image_resource, create_image_resource, detect_image_mime_type, dispose_image_resource,
    get_image_resource_byte_size, has_image_resource_data, invalidate_image_resource,
    is_image_resource_empty, load_image_resource_from_array_buffer, load_image_resource_from_bytes,
    load_image_resource_from_path, load_image_resource_from_url, set_image_resource_data,
};

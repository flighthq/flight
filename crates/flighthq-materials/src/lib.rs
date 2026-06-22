//! `flighthq-materials` — color transform and material utilities.
//!
//! Provides [`ColorTransform`] free functions, material constructors, and
//! structural equality helpers. Color transform and shader-related utilities
//! that cross the boundary between the scene graph and the renderer.

pub mod color;
pub mod color_transform;
pub mod color_transform_material;
pub mod material;

// Re-export the complete public surface at the crate root.

// color
pub use color::compute_rgb_hex_string;

// color_transform
pub use color_transform::{
    clone_color_transform, concat_color_transform, copy_color_transform,
    copy_color_transform_to_arrays, create_color_transform, create_color_transform_from,
    equals_color_transform, equals_color_transform_multipliers, equals_color_transform_offsets,
    get_color_transform_offset_rgb, get_color_transform_offset_rgba, invert_color_transform,
    is_identity_color_transform, set_color_transform, set_color_transform_identity,
    set_color_transform_offset_rgb, set_color_transform_offset_rgba,
};

// color_transform_material
pub use color_transform_material::{
    color_transform_material_kind, create_color_transform_material,
    create_uniform_color_transform_material, uniform_color_transform_material_kind,
};

// material
pub use material::{
    create_material, equals_material_by_kind, equals_uniform_color_transform_material,
};

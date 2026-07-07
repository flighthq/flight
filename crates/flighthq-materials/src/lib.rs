//! `flighthq-materials` — color transform and material utilities.
//!
//! Provides [`ColorTransform`] free functions, material constructors, and
//! structural equality helpers. Color transform and shader-related utilities
//! that cross the boundary between the scene graph and the renderer.

pub mod classic_materials;
pub mod color;
pub mod color_transform;
pub mod color_transform_material;
pub mod material;
pub mod material_presets;
pub mod material_validation;
pub mod pbr_extension_materials;
pub mod pbr_materials;
pub mod surface_material;
pub mod unlit_materials;

// Re-export the complete public surface at the crate root.

// classic_materials
pub use classic_materials::{
    blinn_phong_material_kind, create_blinn_phong_material, create_lambert_material,
    create_phong_material, lambert_material_kind, phong_material_kind,
};

// color
pub use color::{
    LinearColor, compute_rgb_hex_string, create_linear_color, pack_linear_to_color,
    unpack_color_to_linear,
};

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

// material_presets
pub use material_presets::{
    create_aluminum_standard_pbr_material, create_carbon_standard_pbr_material,
    create_glass_transmission_volume_pbr_material, create_gold_standard_pbr_material,
    create_iron_standard_pbr_material, create_marble_standard_pbr_material,
    create_plastic_standard_pbr_material, create_rubber_standard_pbr_material,
    create_silver_standard_pbr_material, create_skin_standard_pbr_material,
    create_wood_standard_pbr_material,
};

// material_validation
pub use material_validation::{
    MAX_MATERIAL_IOR, MIN_MATERIAL_IOR, clamp_standard_pbr_material_properties,
    is_valid_material_clearcoat, is_valid_material_ior, is_valid_material_iridescence_thickness,
    is_valid_material_weight,
};

// pbr_extension_materials
pub use pbr_extension_materials::{
    anisotropy_pbr_material_kind, clearcoat_pbr_material_kind, create_anisotropy_pbr_material,
    create_clearcoat_pbr_material, create_iridescence_pbr_material, create_sheen_pbr_material,
    create_specular_pbr_material, create_subsurface_pbr_material,
    create_transmission_volume_pbr_material, iridescence_pbr_material_kind,
    sheen_pbr_material_kind, specular_pbr_material_kind, subsurface_pbr_material_kind,
    transmission_volume_pbr_material_kind,
};

// pbr_materials
pub use pbr_materials::{
    convert_specular_glossiness_to_standard_pbr, create_specular_glossiness_pbr_material,
    create_standard_pbr_material, create_standard_pbr_material_properties,
    specular_glossiness_pbr_material_kind,
};

// surface_material
pub use surface_material::{
    create_surface_material, get_material_alpha_mode, is_material_blended, is_material_masked,
    is_material_opaque,
};

// unlit_materials
pub use unlit_materials::{
    create_depth_material, create_emissive_material, create_matcap_material,
    create_normal_material, create_toon_material, create_unlit_material,
    create_vertex_color_material, create_wireframe_material, depth_material_kind,
    emissive_material_kind, matcap_material_kind, normal_material_kind, toon_material_kind,
    unlit_material_kind, vertex_color_material_kind, wireframe_material_kind,
};

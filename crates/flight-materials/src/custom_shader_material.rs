use flight_entity::allocate_entity;

use crate::{
    CustomShaderMaterial, CUSTOM_SHADER_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
};

pub fn create_custom_shader_material() -> CustomShaderMaterial {
    let mut m: CustomShaderMaterial = allocate_entity();
    m.kind = CUSTOM_SHADER_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.shader_key = String::new();
    m.textures = None;
    m.uniforms = None;
    return m;
}

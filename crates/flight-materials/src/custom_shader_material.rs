use flight_entity::allocate_entity;

use crate::{
    CustomShaderMaterial, CustomShaderMaterialOptions,
    CUSTOM_SHADER_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
};

pub fn create_custom_shader_material(opts: Option<&CustomShaderMaterialOptions>) -> CustomShaderMaterial {
    let mut m: CustomShaderMaterial = allocate_entity();
    m.kind = CUSTOM_SHADER_MATERIAL_KIND.to_string();
    m.name = opts.and_then(|o| o.name.clone());
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts.and_then(|o| o.blend_mode.clone()).unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.shader_key = opts.and_then(|o| o.shader_key.clone()).unwrap_or_default();
    m.textures = opts.and_then(|o| o.textures.clone());
    m.uniforms = opts.and_then(|o| o.uniforms.clone());
    return m;
}

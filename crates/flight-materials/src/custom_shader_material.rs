use flight_entity::allocate_entity;

use crate::{
    CustomShaderMaterial, CUSTOM_SHADER_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_custom_shader_material() -> CustomShaderMaterial {
    let mut out: CustomShaderMaterial = allocate_entity();
    initialize_custom_shader_material(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_custom_shader_material(out: &mut CustomShaderMaterial) {
    out.kind = CUSTOM_SHADER_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.shader_key = Default::default();
    out.textures = None;
    out.uniforms = None;
}

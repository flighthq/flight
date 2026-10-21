use flight_entity::allocate_entity;

use crate::{
    BlinnPhongMaterial, BlinnPhongMaterialOptions, LambertMaterial, LambertMaterialOptions,
    PhongMaterial, PhongMaterialOptions,
    BLINN_PHONG_MATERIAL_KIND, BLEND_MODE_NORMAL, LAMBERT_MATERIAL_KIND, PHONG_MATERIAL_KIND,
    MaterialAlphaMode,
};

pub fn create_blinn_phong_material(opts: Option<&BlinnPhongMaterialOptions>) -> BlinnPhongMaterial {
    let mut m: BlinnPhongMaterial = allocate_entity();
    m.kind = BLINN_PHONG_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.alpha_map = opts.and_then(|o| o.alpha_map.clone());
    m.diffuse = opts.and_then(|o| o.diffuse).unwrap_or(0xffffffff);
    m.diffuse_map = opts.and_then(|o| o.diffuse_map.clone());
    m.normal_map = opts.and_then(|o| o.normal_map.clone());
    m.normal_scale = opts.and_then(|o| o.normal_scale).unwrap_or(1.0);
    m.shininess = opts.and_then(|o| o.shininess).unwrap_or(32.0);
    m.specular = opts.and_then(|o| o.specular).unwrap_or(0xffffffff);
    m.specular_map = opts.and_then(|o| o.specular_map.clone());
    return m;
}

pub fn create_lambert_material(opts: Option<&LambertMaterialOptions>) -> LambertMaterial {
    let mut m: LambertMaterial = allocate_entity();
    m.kind = LAMBERT_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.diffuse = opts.and_then(|o| o.diffuse).unwrap_or(0xffffffff);
    m.diffuse_map = opts.and_then(|o| o.diffuse_map.clone());
    m.emissive = opts.and_then(|o| o.emissive).unwrap_or(0x000000ff);
    m.emissive_map = opts.and_then(|o| o.emissive_map.clone());
    return m;
}

pub fn create_phong_material(opts: Option<&PhongMaterialOptions>) -> PhongMaterial {
    let mut m: PhongMaterial = allocate_entity();
    m.kind = PHONG_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.diffuse = opts.and_then(|o| o.diffuse).unwrap_or(0xffffffff);
    m.diffuse_map = opts.and_then(|o| o.diffuse_map.clone());
    m.normal_map = opts.and_then(|o| o.normal_map.clone());
    m.normal_scale = opts.and_then(|o| o.normal_scale).unwrap_or(1.0);
    m.shininess = opts.and_then(|o| o.shininess).unwrap_or(32.0);
    m.specular = opts.and_then(|o| o.specular).unwrap_or(0xffffffff);
    m.specular_map = opts.and_then(|o| o.specular_map.clone());
    return m;
}

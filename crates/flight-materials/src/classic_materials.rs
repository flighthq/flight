use flight_entity::allocate_entity;

use crate::{
    BlinnPhongMaterial, LambertMaterial, PhongMaterial,
    BLINN_PHONG_MATERIAL_KIND, BLEND_MODE_NORMAL, LAMBERT_MATERIAL_KIND, PHONG_MATERIAL_KIND,
    MaterialAlphaMode,
};

pub fn create_blinn_phong_material() -> BlinnPhongMaterial {
    let mut m: BlinnPhongMaterial = allocate_entity();
    m.kind = BLINN_PHONG_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.alpha_map = None;
    m.diffuse = 0xffffffff;
    m.diffuse_map = None;
    m.normal_map = None;
    m.normal_scale = 1.0;
    m.shininess = 32.0;
    m.specular = 0xffffffff;
    m.specular_map = None;
    return m;
}

pub fn create_lambert_material() -> LambertMaterial {
    let mut m: LambertMaterial = allocate_entity();
    m.kind = LAMBERT_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.diffuse = 0xffffffff;
    m.diffuse_map = None;
    m.emissive = 0x000000ff;
    m.emissive_map = None;
    return m;
}

pub fn create_phong_material() -> PhongMaterial {
    let mut m: PhongMaterial = allocate_entity();
    m.kind = PHONG_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.diffuse = 0xffffffff;
    m.diffuse_map = None;
    m.normal_map = None;
    m.normal_scale = 1.0;
    m.shininess = 32.0;
    m.specular = 0xffffffff;
    m.specular_map = None;
    return m;
}

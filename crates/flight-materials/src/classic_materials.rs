use flight_entity::allocate_entity;

use crate::{
    BLEND_MODE_NORMAL, BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial, LAMBERT_MATERIAL_KIND,
    LambertMaterial, MaterialAlphaMode, PHONG_MATERIAL_KIND, PhongMaterial,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_blinn_phong_material() -> BlinnPhongMaterial {
    let mut out: BlinnPhongMaterial = allocate_entity();
    initialize_blinn_phong_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_lambert_material() -> LambertMaterial {
    let mut out: LambertMaterial = allocate_entity();
    initialize_lambert_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_phong_material() -> PhongMaterial {
    let mut out: PhongMaterial = allocate_entity();
    initialize_phong_material(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_blinn_phong_material(out: &mut BlinnPhongMaterial) {
    out.kind = BLINN_PHONG_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.alpha_map = None;
    out.diffuse = 0xffffffff;
    out.diffuse_map = None;
    out.normal_map = None;
    out.normal_scale = 1.0;
    out.shininess = 32.0;
    out.specular = 0xffffffff;
    out.specular_map = None;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_lambert_material(out: &mut LambertMaterial) {
    out.kind = LAMBERT_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.diffuse = 0xffffffff;
    out.diffuse_map = None;
    out.emissive = 0x000000ff;
    out.emissive_map = None;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_phong_material(out: &mut PhongMaterial) {
    out.kind = PHONG_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.diffuse = 0xffffffff;
    out.diffuse_map = None;
    out.normal_map = None;
    out.normal_scale = 1.0;
    out.shininess = 32.0;
    out.specular = 0xffffffff;
    out.specular_map = None;
}

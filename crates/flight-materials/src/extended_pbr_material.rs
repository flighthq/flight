use flight_entity::allocate_entity;

use crate::{
    ExtendedPbrMaterial, EXTENDED_PBR_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
    pbr_materials::create_standard_pbr_material_properties,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_extended_pbr_material() -> ExtendedPbrMaterial {
    let mut out: ExtendedPbrMaterial = allocate_entity();
    initialize_extended_pbr_material(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_extended_pbr_material(out: &mut ExtendedPbrMaterial) {
    out.kind = EXTENDED_PBR_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.extensions = Default::default();
    out.standard = create_standard_pbr_material_properties(None);
}

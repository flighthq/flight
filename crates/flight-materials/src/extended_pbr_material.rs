use flight_entity::allocate_entity;

use crate::{
    ExtendedPbrMaterial, ExtendedPbrMaterialOptions,
    EXTENDED_PBR_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
    pbr_materials::create_standard_pbr_material_properties,
};

pub fn create_extended_pbr_material(
    opts: Option<&ExtendedPbrMaterialOptions>,
) -> ExtendedPbrMaterial {
    let mut m: ExtendedPbrMaterial = allocate_entity();
    m.kind = EXTENDED_PBR_MATERIAL_KIND.to_string();
    m.name = opts.and_then(|o| o.name.clone());
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts.and_then(|o| o.blend_mode.clone()).unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.extensions = opts.and_then(|o| o.extensions.clone()).unwrap_or_default();
    m.standard = opts.and_then(|o| o.standard.clone()).unwrap_or_else(|| create_standard_pbr_material_properties(None));
    return m;
}

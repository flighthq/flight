use flight_entity::allocate_entity;

use crate::{
    ExtendedPbrMaterial, PbrExtension, StandardPbrMaterialProperties,
    EXTENDED_PBR_MATERIAL_KIND, MaterialAlphaMode, BLEND_MODE_NORMAL,
    pbr_materials::create_standard_pbr_material_properties,
};

pub fn create_extended_pbr_material(
    extensions: Option<Vec<PbrExtension>>,
    standard: Option<StandardPbrMaterialProperties>,
) -> ExtendedPbrMaterial {
    let mut m: ExtendedPbrMaterial = allocate_entity();
    m.kind = EXTENDED_PBR_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.extensions = extensions.unwrap_or_default();
    m.standard = standard.unwrap_or_else(create_standard_pbr_material_properties);
    return m;
}

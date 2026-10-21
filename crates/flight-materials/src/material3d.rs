use flight_entity::{Kind, allocate_entity};

use crate::{
    BlendMode, Material3D, MaterialAlphaMode, BLEND_MODE_NORMAL,
};

pub struct Material3DOptions {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub name: Option<String>,
}

pub fn create_material3d(kind: Kind, opts: Option<&Material3DOptions>) -> Material3D {
    let mut material: Material3D = allocate_entity();
    initialize_material3d(&mut material, kind, opts);
    return material;
}

// flight-lint: allow(conform-extra) D12: Rust exposes initializer separately for reuse; TS only has createMaterial3D
pub fn initialize_material3d(
    material: &mut Material3D,
    kind: Kind,
    opts: Option<&Material3DOptions>,
) {
    material.kind = kind;
    material.name = opts.and_then(|o| o.name.clone());
    material.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    material.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    material.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    material.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
}

pub fn get_material3d_alpha_mode(source: &Material3D) -> MaterialAlphaMode {
    return source.alpha_mode;
}

pub fn is_material3d_blended(source: &Material3D) -> bool {
    return source.alpha_mode == MaterialAlphaMode::Blend;
}

pub fn is_material3d_masked(source: &Material3D) -> bool {
    return source.alpha_mode == MaterialAlphaMode::Mask;
}

pub fn is_material3d_opaque(source: &Material3D) -> bool {
    return source.alpha_mode == MaterialAlphaMode::Opaque;
}

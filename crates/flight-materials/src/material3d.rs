use flight_entity::{Kind, allocate_entity};

use crate::{
    BlendMode, Material3D, Material3DFields, MaterialAlphaMode, BLEND_MODE_NORMAL,
};

pub struct Material3DOptions {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub name: Option<String>,
}

pub fn create_material3d(kind: Kind, opts: Option<&Material3DOptions>) -> Material3DFields {
    let mut material: Material3DFields = allocate_entity();
    initialize_material3d(&mut material, kind, opts);
    return material;
}

// flight-lint: allow(conform-extra) D12: Rust exposes initializer separately for reuse; TS only has createMaterial3D
pub fn initialize_material3d(
    material: &mut Material3DFields,
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

// flight-lint: allow(contract-vocabulary) D16 open Material3D family: generic readers take any kind (TS `Readonly<Material3D>`)
pub fn get_material3d_alpha_mode(source: &dyn Material3D) -> MaterialAlphaMode {
    return source.material3d_fields().alpha_mode;
}

// flight-lint: allow(contract-vocabulary) D16 open Material3D family: generic readers take any kind (TS `Readonly<Material3D>`)
pub fn is_material3d_blended(source: &dyn Material3D) -> bool {
    return source.material3d_fields().alpha_mode == MaterialAlphaMode::Blend;
}

// flight-lint: allow(contract-vocabulary) D16 open Material3D family: generic readers take any kind (TS `Readonly<Material3D>`)
pub fn is_material3d_masked(source: &dyn Material3D) -> bool {
    return source.material3d_fields().alpha_mode == MaterialAlphaMode::Mask;
}

// flight-lint: allow(contract-vocabulary) D16 open Material3D family: generic readers take any kind (TS `Readonly<Material3D>`)
pub fn is_material3d_opaque(source: &dyn Material3D) -> bool {
    return source.material3d_fields().alpha_mode == MaterialAlphaMode::Opaque;
}

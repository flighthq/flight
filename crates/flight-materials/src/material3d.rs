use flight_entity::{Kind, allocate_entity};

use crate::{BLEND_MODE_NORMAL, Material3D, Material3DFields, MaterialAlphaMode};

// flight-lint: allow(conform-params) D23 (B): the approved generic kind stays positional; the options blob is removed (Principal 3139d09f)
pub fn create_material3d(kind: Kind) -> Material3DFields {
    let mut material: Material3DFields = allocate_entity();
    initialize_material3d(&mut material, kind);
    return material;
}

// flight-lint: allow(conform-extra) D12: Rust exposes initializer separately for reuse; TS only has createMaterial3D
pub fn initialize_material3d(material: &mut Material3DFields, kind: Kind) {
    material.kind = kind;
    material.name = None;
    material.alpha_cutoff = 0.5;
    material.alpha_mode = MaterialAlphaMode::Opaque;
    material.blend_mode = BLEND_MODE_NORMAL.to_string();
    material.double_sided = false;
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

use flight_entity::{Kind, allocate_entity};

use crate::{Material, MaterialFields};

pub fn create_material(kind: Kind) -> MaterialFields {
    let mut material: MaterialFields = allocate_entity();
    initialize_material(&mut material, kind);
    return material;
}

pub fn initialize_material(material: &mut MaterialFields, kind: Kind) {
    material.kind = kind;
    material.name = None;
}

// flight-lint: allow(contract-vocabulary) D16 open Material family: the base reader copies any kind's base fields (TS `Readonly<Material>`)
pub fn clone_material(source: &dyn Material) -> MaterialFields {
    let source = source.material_fields();
    let mut out: MaterialFields = allocate_entity();
    initialize_material(&mut out, source.kind.clone());
    out.name = source.name.clone();
    return out;
}

// flight-lint: allow(contract-vocabulary) D16 open Material family: copies base fields between any kinds (TS `Material`)
pub fn copy_material(out: &mut dyn Material, source: &dyn Material) {
    if std::ptr::addr_eq(out as *const dyn Material, source as *const dyn Material) {
        return;
    }
    let source = source.material_fields();
    let out = out.material_fields_mut();
    out.kind = source.kind.clone();
    out.name = source.name.clone();
}

// flight-lint: allow(contract-vocabulary) D16 open Material family: compares any kinds' base fields (TS `Readonly<Material>`)
pub fn equals_material(a: &dyn Material, b: &dyn Material) -> bool {
    if std::ptr::addr_eq(a as *const dyn Material, b as *const dyn Material) {
        return true;
    }
    let (a, b) = (a.material_fields(), b.material_fields());
    return a.kind == b.kind && a.name == b.name;
}

// flight-lint: allow(contract-vocabulary) D16 open Material family: narrows any kind by its open kind name (TS `Material | null`)
pub fn get_material_of_kind<'a>(material: Option<&'a dyn Material>, kind: &str) -> Option<&'a dyn Material> {
    return match material {
        Some(m) if m.material_fields().kind == kind => Some(m),
        _ => None,
    };
}

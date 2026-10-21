use flight_entity::{Kind, allocate_entity};

use crate::Material;

pub fn create_material(kind: Kind) -> Material {
    let mut material: Material = allocate_entity();
    initialize_material(&mut material, kind);
    return material;
}

pub fn initialize_material(material: &mut Material, kind: Kind) {
    material.kind = kind;
    material.name = None;
}

pub fn clone_material(source: &Material) -> Material {
    let mut out: Material = allocate_entity();
    initialize_material(&mut out, source.kind.clone());
    out.name = source.name.clone();
    return out;
}

pub fn copy_material(out: &mut Material, source: &Material) {
    if std::ptr::eq(out, source) {
        return;
    }
    out.kind = source.kind.clone();
    out.name = source.name.clone();
}

pub fn equals_material(a: &Material, b: &Material) -> bool {
    if std::ptr::eq(a, b) {
        return true;
    }
    return a.kind == b.kind && a.name == b.name;
}

pub fn get_material_of_kind<'a>(material: Option<&'a Material>, kind: &str) -> Option<&'a Material> {
    return match material {
        Some(m) if m.kind == kind => Some(m),
        _ => None,
    };
}

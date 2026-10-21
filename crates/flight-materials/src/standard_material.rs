use flight_entity::allocate_entity;

use crate::{StandardMaterial, STANDARD_MATERIAL_KIND};

pub fn create_standard_material(name: Option<String>) -> StandardMaterial {
    let mut out: StandardMaterial = allocate_entity();
    initialize_standard_material(&mut out, name);
    return out;
}

pub fn initialize_standard_material(out: &mut StandardMaterial, name: Option<String>) {
    out.kind = STANDARD_MATERIAL_KIND.to_string();
    out.name = name;
}

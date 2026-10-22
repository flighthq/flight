use flight_entity::allocate_entity;

use crate::{StandardMaterial, STANDARD_MATERIAL_KIND};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_standard_material() -> StandardMaterial {
    let mut out: StandardMaterial = allocate_entity();
    initialize_standard_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_standard_material(out: &mut StandardMaterial) {
    out.kind = STANDARD_MATERIAL_KIND.to_string();
    out.name = None;
}

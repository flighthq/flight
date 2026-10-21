use flight_entity::allocate_entity;

use crate::{StandardMaterial, StandardMaterialOptions, STANDARD_MATERIAL_KIND};

pub fn create_standard_material(opts: Option<&StandardMaterialOptions>) -> StandardMaterial {
    let mut out: StandardMaterial = allocate_entity();
    initialize_standard_material(&mut out, opts);
    return out;
}

pub fn initialize_standard_material(out: &mut StandardMaterial, opts: Option<&StandardMaterialOptions>) {
    out.kind = STANDARD_MATERIAL_KIND.to_string();
    out.name = opts.and_then(|o| o.name.clone());
}

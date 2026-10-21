use flight_entity::allocate_entity;

use crate::{StandardMaterial, StandardMaterialOptions, STANDARD_MATERIAL_KIND};

pub fn create_standard_material(options: Option<&StandardMaterialOptions>) -> StandardMaterial {
    let mut out: StandardMaterial = allocate_entity();
    initialize_standard_material(&mut out, options);
    return out;
}

pub fn initialize_standard_material(out: &mut StandardMaterial, options: Option<&StandardMaterialOptions>) {
    out.kind = STANDARD_MATERIAL_KIND.to_string();
    out.name = options.and_then(|o| o.name.clone());
}

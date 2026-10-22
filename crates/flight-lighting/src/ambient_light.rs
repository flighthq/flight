use flight_entity::allocate_entity;

use crate::types::*;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored light fields after construction
pub fn create_ambient_light() -> AmbientLight {
    let mut out: AmbientLight = allocate_entity();
    initialize_ambient_light(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_ambient_light(out: &mut AmbientLight) {
    out.color = 0xffff_ffff;
    out.enabled = true;
    out.intensity = 1.0;
    out.intensity_unit = UNITLESS_LIGHT_UNIT;
    out.kind = AMBIENT_LIGHT_KIND.to_string();
}

pub fn clone_ambient_light(source: &AmbientLight) -> AmbientLight {
    let mut out: AmbientLight = allocate_entity();
    out.color = source.color;
    out.enabled = source.enabled;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.kind = AMBIENT_LIGHT_KIND.to_string();
    return out;
}

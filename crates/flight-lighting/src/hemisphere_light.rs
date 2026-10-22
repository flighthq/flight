use flight_entity::allocate_entity;

use crate::types::*;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored light fields after construction
pub fn create_hemisphere_light() -> HemisphereLight {
    let mut out: HemisphereLight = allocate_entity();
    initialize_hemisphere_light(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_hemisphere_light(out: &mut HemisphereLight) {
    out.enabled = true;
    out.ground_color = 0xffff_ffff;
    out.intensity = 1.0;
    out.intensity_unit = UNITLESS_LIGHT_UNIT;
    out.kind = HEMISPHERE_LIGHT_KIND.to_string();
    out.sky_color = 0xffff_ffff;
}

pub fn clone_hemisphere_light(source: &HemisphereLight) -> HemisphereLight {
    let mut out: HemisphereLight = allocate_entity();
    out.enabled = source.enabled;
    out.ground_color = source.ground_color;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.kind = HEMISPHERE_LIGHT_KIND.to_string();
    out.sky_color = source.sky_color;
    return out;
}

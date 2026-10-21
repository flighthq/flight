use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_hemisphere_light(options: Option<&HemisphereLightOptions>) -> HemisphereLight {
    let mut out: HemisphereLight = allocate_entity();
    initialize_hemisphere_light(&mut out, options);
    return out;
}

pub fn initialize_hemisphere_light(
    out: &mut HemisphereLight,
    options: Option<&HemisphereLightOptions>,
) {
    out.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    out.ground_color = options
        .and_then(|value| value.ground_color)
        .unwrap_or(0xffff_ffff);
    out.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    out.intensity_unit = options
        .and_then(|value| value.intensity_unit)
        .unwrap_or(UNITLESS_LIGHT_UNIT);
    out.kind = HEMISPHERE_LIGHT_KIND.to_string();
    out.sky_color = options
        .and_then(|value| value.sky_color)
        .unwrap_or(0xffff_ffff);
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

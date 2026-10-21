use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_ambient_light(options: Option<&AmbientLightOptions>) -> AmbientLight {
    let mut out: AmbientLight = allocate_entity();
    initialize_ambient_light(&mut out, options);
    return out;
}

pub fn initialize_ambient_light(out: &mut AmbientLight, options: Option<&AmbientLightOptions>) {
    out.color = options.and_then(|value| value.color).unwrap_or(0xffff_ffff);
    out.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    out.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    out.intensity_unit = options
        .and_then(|value| value.intensity_unit)
        .unwrap_or(UNITLESS_LIGHT_UNIT);
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

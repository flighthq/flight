use flight_entity::allocate_entity;
use flight_geometry::{clone_vector3, create_vector3};

use crate::types::*;

pub fn create_point_light(options: Option<&PointLightOptions>) -> PointLight {
    let mut out: PointLight = allocate_entity();
    initialize_point_light(&mut out, options);
    return out;
}

pub fn initialize_point_light(out: &mut PointLight, options: Option<&PointLightOptions>) {
    out.casts_shadow = options
        .and_then(|value| value.casts_shadow)
        .unwrap_or(false);
    out.color = options.and_then(|value| value.color).unwrap_or(0xffff_ffff);
    out.decay = options.and_then(|value| value.decay).unwrap_or(2.0);
    out.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    out.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    out.intensity_unit = options
        .and_then(|value| value.intensity_unit)
        .unwrap_or(UNITLESS_LIGHT_UNIT);
    out.layer_mask = options
        .and_then(|value| value.layer_mask)
        .unwrap_or(ALL_LIGHT_LAYERS);
    out.priority = options.and_then(|value| value.priority).unwrap_or(0.0);
    out.kind = POINT_LIGHT_KIND.to_string();
    out.normal_bias = options.and_then(|value| value.normal_bias).unwrap_or(0.0);
    out.pcf_radius = options.and_then(|value| value.pcf_radius).unwrap_or(0.0);
    out.position = options
        .and_then(|value| value.position.as_ref())
        .map(clone_vector3)
        .unwrap_or_else(|| create_vector3(0.0, 0.0, 0.0));
    out.range = options.and_then(|value| value.range).unwrap_or(-1.0);
    out.shadow_bias = options.and_then(|value| value.shadow_bias).unwrap_or(0.0);
    out.shadow_far = options.and_then(|value| value.shadow_far).unwrap_or(500.0);
    out.shadow_map_size = options
        .and_then(|value| value.shadow_map_size)
        .unwrap_or(1024);
    out.shadow_near = options.and_then(|value| value.shadow_near).unwrap_or(0.5);
    out.shadow_strength = options
        .and_then(|value| value.shadow_strength)
        .unwrap_or(1.0);
}

pub fn clone_point_light(source: &PointLight) -> PointLight {
    let mut out: PointLight = allocate_entity();
    out.casts_shadow = source.casts_shadow;
    out.color = source.color;
    out.decay = source.decay;
    out.enabled = source.enabled;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.layer_mask = source.layer_mask;
    out.priority = source.priority;
    out.kind = POINT_LIGHT_KIND.to_string();
    out.normal_bias = source.normal_bias;
    out.pcf_radius = source.pcf_radius;
    out.position = clone_vector3(&source.position);
    out.range = source.range;
    out.shadow_bias = source.shadow_bias;
    out.shadow_far = source.shadow_far;
    out.shadow_map_size = source.shadow_map_size;
    out.shadow_near = source.shadow_near;
    out.shadow_strength = source.shadow_strength;
    return out;
}

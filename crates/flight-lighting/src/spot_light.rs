use flight_entity::allocate_entity;
use flight_geometry::{clone_vector3, create_vector3, set_vector3};

use crate::types::*;

pub fn create_spot_light(options: Option<&SpotLightOptions>) -> SpotLight {
    let mut light: SpotLight = allocate_entity();
    initialize_spot_light(&mut light, options);
    return light;
}

pub fn initialize_spot_light(light: &mut SpotLight, options: Option<&SpotLightOptions>) {
    light.casts_shadow = options
        .and_then(|value| value.casts_shadow)
        .unwrap_or(false);
    light.color = options.and_then(|value| value.color).unwrap_or(0xffff_ffff);
    light.decay = options.and_then(|value| value.decay).unwrap_or(2.0);
    light.direction = options
        .and_then(|value| value.direction.as_ref())
        .map(clone_vector3)
        .unwrap_or_else(|| create_vector3(0.0, -1.0, 0.0));
    light.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    light.inner_cone_cos = 1.0;
    light.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    light.intensity_unit = options
        .and_then(|value| value.intensity_unit)
        .unwrap_or(UNITLESS_LIGHT_UNIT);
    light.layer_mask = options
        .and_then(|value| value.layer_mask)
        .unwrap_or(ALL_LIGHT_LAYERS);
    light.priority = options.and_then(|value| value.priority).unwrap_or(0.0);
    light.kind = SPOT_LIGHT_KIND.to_string();
    light.normal_bias = options.and_then(|value| value.normal_bias).unwrap_or(0.0);
    light.outer_cone_cos = 1.0;
    light.pcf_radius = options.and_then(|value| value.pcf_radius).unwrap_or(0.0);
    light.position = options
        .and_then(|value| value.position.as_ref())
        .map(clone_vector3)
        .unwrap_or_else(|| create_vector3(0.0, 0.0, 0.0));
    light.range = options.and_then(|value| value.range).unwrap_or(-1.0);
    light.shadow_bias = options.and_then(|value| value.shadow_bias).unwrap_or(0.0);
    light.shadow_far = options.and_then(|value| value.shadow_far).unwrap_or(500.0);
    light.shadow_map_size = options
        .and_then(|value| value.shadow_map_size)
        .unwrap_or(1024);
    light.shadow_near = options.and_then(|value| value.shadow_near).unwrap_or(0.5);
    light.shadow_strength = options
        .and_then(|value| value.shadow_strength)
        .unwrap_or(1.0);
    light.spot_blend = 0.0;
    set_spot_light_cone(
        light,
        options
            .and_then(|value| value.inner_cone_degrees)
            .unwrap_or(0.0),
        options
            .and_then(|value| value.outer_cone_degrees)
            .unwrap_or(45.0),
    );
    set_spot_light_blend(
        light,
        options.and_then(|value| value.spot_blend).unwrap_or(0.0),
    );
}

pub fn clone_spot_light(source: &SpotLight) -> SpotLight {
    let mut out: SpotLight = allocate_entity();
    out.casts_shadow = source.casts_shadow;
    out.color = source.color;
    out.decay = source.decay;
    out.direction = clone_vector3(&source.direction);
    out.enabled = source.enabled;
    out.inner_cone_cos = source.inner_cone_cos;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.layer_mask = source.layer_mask;
    out.priority = source.priority;
    out.kind = SPOT_LIGHT_KIND.to_string();
    out.normal_bias = source.normal_bias;
    out.outer_cone_cos = source.outer_cone_cos;
    out.pcf_radius = source.pcf_radius;
    out.position = clone_vector3(&source.position);
    out.range = source.range;
    out.shadow_bias = source.shadow_bias;
    out.shadow_far = source.shadow_far;
    out.shadow_map_size = source.shadow_map_size;
    out.shadow_near = source.shadow_near;
    out.shadow_strength = source.shadow_strength;
    out.spot_blend = source.spot_blend;
    return out;
}

pub fn get_spot_light_cone_degrees(out: &mut SpotLightConeAngles, source: &SpotLight) {
    out.inner_degrees = source.inner_cone_cos.acos().to_degrees();
    out.outer_degrees = source.outer_cone_cos.acos().to_degrees();
}

pub fn set_spot_light_blend(out: &mut SpotLight, blend: f32) {
    out.spot_blend = if blend.is_nan() {
        f32::NAN
    } else if blend < 0.0 {
        0.0
    } else if blend > 1.0 {
        1.0
    } else {
        blend
    };
}

pub fn set_spot_light_cone(out: &mut SpotLight, inner_degrees: f32, outer_degrees: f32) {
    out.inner_cone_cos = inner_degrees.to_radians().cos();
    out.outer_cone_cos = outer_degrees.to_radians().cos();
}

pub fn set_spot_light_direction(out: &mut SpotLight, x: f32, y: f32, z: f32) {
    let length = (x * x + y * y + z * z).sqrt();
    if length > 0.0 {
        set_vector3(&mut out.direction, x / length, y / length, z / length);
    }
}

pub fn set_spot_light_target(out: &mut SpotLight, target_x: f32, target_y: f32, target_z: f32) {
    let position_x = out.position.x;
    let position_y = out.position.y;
    let position_z = out.position.z;
    let dx = target_x - position_x;
    let dy = target_y - position_y;
    let dz = target_z - position_z;
    let length = (dx * dx + dy * dy + dz * dz).sqrt();
    if length > 0.0 {
        set_vector3(&mut out.direction, dx / length, dy / length, dz / length);
    }
}

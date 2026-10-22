use flight_entity::allocate_entity;
use flight_geometry::{clone_vector3, create_vector3, set_vector3};

use crate::types::*;

// D23 (KEEP; Principal c0f9227c): construction normalizes direction and owns cascade splits.
pub fn create_directional_light(options: Option<&DirectionalLightOptions>) -> DirectionalLight {
    let mut light: DirectionalLight = allocate_entity();
    initialize_directional_light(&mut light, options);
    return light;
}

// D23 (KEEP; Principal c0f9227c): initialization derives normalized direction and copied splits.
pub fn initialize_directional_light(
    light: &mut DirectionalLight,
    options: Option<&DirectionalLightOptions>,
) {
    let direction = options.and_then(|value| value.direction.as_ref());
    light.cascade_count = options.and_then(|value| value.cascade_count).unwrap_or(1);
    light.cascade_splits = options
        .and_then(|value| value.cascade_splits.clone())
        .unwrap_or_else(|| vec![1.0]);
    light.casts_shadow = options
        .and_then(|value| value.casts_shadow)
        .unwrap_or(false);
    light.color = options.and_then(|value| value.color).unwrap_or(0xffff_ffff);
    light.direction = create_vector3(0.0, -1.0, 0.0);
    light.enabled = options.and_then(|value| value.enabled).unwrap_or(true);
    light.intensity = options.and_then(|value| value.intensity).unwrap_or(1.0);
    light.intensity_unit = options
        .and_then(|value| value.intensity_unit)
        .unwrap_or(UNITLESS_LIGHT_UNIT);
    light.kind = DIRECTIONAL_LIGHT_KIND.to_string();
    light.normal_bias = options.and_then(|value| value.normal_bias).unwrap_or(0.0);
    light.pcf_radius = options.and_then(|value| value.pcf_radius).unwrap_or(0.0);
    light.shadow_bias = options.and_then(|value| value.shadow_bias).unwrap_or(0.0);
    light.shadow_far = options.and_then(|value| value.shadow_far).unwrap_or(500.0);
    light.shadow_map_size = options
        .and_then(|value| value.shadow_map_size)
        .unwrap_or(DIRECTIONAL_SHADOW_MAP_SIZE);
    light.shadow_near = options.and_then(|value| value.shadow_near).unwrap_or(0.5);
    light.shadow_strength = options
        .and_then(|value| value.shadow_strength)
        .unwrap_or(1.0);
    if let Some(direction) = direction {
        set_directional_light_direction(light, direction.x, direction.y, direction.z);
    }
}

pub fn clone_directional_light(source: &DirectionalLight) -> DirectionalLight {
    let mut out: DirectionalLight = allocate_entity();
    out.cascade_count = source.cascade_count;
    out.cascade_splits = source.cascade_splits.clone();
    out.casts_shadow = source.casts_shadow;
    out.color = source.color;
    out.direction = clone_vector3(&source.direction);
    out.enabled = source.enabled;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.kind = DIRECTIONAL_LIGHT_KIND.to_string();
    out.normal_bias = source.normal_bias;
    out.pcf_radius = source.pcf_radius;
    out.shadow_bias = source.shadow_bias;
    out.shadow_far = source.shadow_far;
    out.shadow_map_size = source.shadow_map_size;
    out.shadow_near = source.shadow_near;
    out.shadow_strength = source.shadow_strength;
    return out;
}

pub fn set_directional_light_direction(out: &mut DirectionalLight, x: f32, y: f32, z: f32) {
    let length = (x * x + y * y + z * z).sqrt();
    if length > 0.0 {
        set_vector3(&mut out.direction, x / length, y / length, z / length);
    }
}

pub fn set_directional_light_target(
    out: &mut DirectionalLight,
    from_x: f32,
    from_y: f32,
    from_z: f32,
    to_x: f32,
    to_y: f32,
    to_z: f32,
) {
    let dx = to_x - from_x;
    let dy = to_y - from_y;
    let dz = to_z - from_z;
    let length = (dx * dx + dy * dy + dz * dz).sqrt();
    if length > 0.0 {
        set_vector3(&mut out.direction, dx / length, dy / length, dz / length);
    }
}

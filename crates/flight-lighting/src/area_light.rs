use flight_entity::allocate_entity;
use flight_geometry::{Vector3, clone_vector3, create_vector3, set_vector3};

use crate::types::*;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored light fields after construction
pub fn create_area_light() -> AreaLight {
    let mut out: AreaLight = allocate_entity();
    initialize_area_light(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_area_light(out: &mut AreaLight) {
    out.casts_shadow = false;
    out.color = 0xffff_ffff;
    out.decay = 2.0;
    out.direction = create_vector3(0.0, -1.0, 0.0);
    out.enabled = true;
    out.intensity = 1.0;
    out.intensity_unit = UNITLESS_LIGHT_UNIT;
    out.kind = AREA_LIGHT_KIND.to_string();
    out.normal_bias = 0.0;
    out.pcf_radius = 0.0;
    out.position = create_vector3(0.0, 0.0, 0.0);
    out.range = -1.0;
    out.right = create_vector3(1.0, 0.0, 0.0);
    out.shadow_bias = 0.0;
    out.shadow_far = 500.0;
    out.shadow_map_size = 1024;
    out.shadow_near = 0.5;
    out.shadow_strength = 1.0;
    out.up = create_vector3(0.0, 0.0, 1.0);
}

pub fn clone_area_light(source: &AreaLight) -> AreaLight {
    let mut out: AreaLight = allocate_entity();
    out.casts_shadow = source.casts_shadow;
    out.color = source.color;
    out.decay = source.decay;
    out.direction = clone_vector3(&source.direction);
    out.enabled = source.enabled;
    out.intensity = source.intensity;
    out.intensity_unit = source.intensity_unit;
    out.kind = AREA_LIGHT_KIND.to_string();
    out.normal_bias = source.normal_bias;
    out.pcf_radius = source.pcf_radius;
    out.position = clone_vector3(&source.position);
    out.range = source.range;
    out.right = clone_vector3(&source.right);
    out.shadow_bias = source.shadow_bias;
    out.shadow_far = source.shadow_far;
    out.shadow_map_size = source.shadow_map_size;
    out.shadow_near = source.shadow_near;
    out.shadow_strength = source.shadow_strength;
    out.up = clone_vector3(&source.up);
    return out;
}

pub fn set_area_light_orientation(
    out: &mut AreaLight,
    direction: &Vector3,
    right: &Vector3,
    up: &Vector3,
) {
    let direction_x = direction.x;
    let direction_y = direction.y;
    let direction_z = direction.z;
    let right_x = right.x;
    let right_y = right.y;
    let right_z = right.z;
    let up_x = up.x;
    let up_y = up.y;
    let up_z = up.z;
    let direction_length =
        (direction_x * direction_x + direction_y * direction_y + direction_z * direction_z).sqrt();
    let right_length = (right_x * right_x + right_y * right_y + right_z * right_z).sqrt();
    let up_length = (up_x * up_x + up_y * up_y + up_z * up_z).sqrt();
    let existing_right_length =
        (out.right.x * out.right.x + out.right.y * out.right.y + out.right.z * out.right.z).sqrt();
    let existing_up_length =
        (out.up.x * out.up.x + out.up.y * out.up.y + out.up.z * out.up.z).sqrt();

    if direction_length > 0.0 {
        set_vector3(
            &mut out.direction,
            direction_x / direction_length,
            direction_y / direction_length,
            direction_z / direction_length,
        );
    }
    if right_length > 0.0 {
        set_vector3(
            &mut out.right,
            right_x / right_length,
            right_y / right_length,
            right_z / right_length,
        );
        if existing_right_length > 0.0 {
            let x = out.right.x * existing_right_length;
            let y = out.right.y * existing_right_length;
            let z = out.right.z * existing_right_length;
            set_vector3(&mut out.right, x, y, z);
        }
    }
    if up_length > 0.0 {
        set_vector3(
            &mut out.up,
            up_x / up_length,
            up_y / up_length,
            up_z / up_length,
        );
        if existing_up_length > 0.0 {
            let x = out.up.x * existing_up_length;
            let y = out.up.y * existing_up_length;
            let z = out.up.z * existing_up_length;
            set_vector3(&mut out.up, x, y, z);
        }
    }
}

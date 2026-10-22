use flight_entity::allocate_entity;
use flight_geometry::{clone_vector3, create_vector3};

use crate::types::*;

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored light fields after construction
pub fn create_point_light() -> PointLight {
    let mut out: PointLight = allocate_entity();
    initialize_point_light(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_point_light(out: &mut PointLight) {
    out.casts_shadow = false;
    out.color = 0xffff_ffff;
    out.decay = 2.0;
    out.enabled = true;
    out.intensity = 1.0;
    out.intensity_unit = UNITLESS_LIGHT_UNIT;
    out.layer_mask = ALL_LIGHT_LAYERS;
    out.priority = 0.0;
    out.kind = POINT_LIGHT_KIND.to_string();
    out.normal_bias = 0.0;
    out.pcf_radius = 0.0;
    out.position = create_vector3(0.0, 0.0, 0.0);
    out.range = -1.0;
    out.shadow_bias = 0.0;
    out.shadow_far = 500.0;
    out.shadow_map_size = 1024;
    out.shadow_near = 0.5;
    out.shadow_strength = 1.0;
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

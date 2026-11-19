//! flight-compiler: rust-only

// Large-coordinate coverage for the f64 lighting lane. Each case places a light one billion units
// from the origin, where single precision spaces values 64 apart, so the asserted direction, influence
// or interpolation exists only because positions and distances stay f64 end to end.

use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{create_aabb, create_bounding_sphere, create_vector3};
use flight_lighting::contract::*;

fn tagged_probe(value: f32) -> Ref<LightProbe> {
    let mut probe = create_light_probe(&create_vector3(0.0, 0.0, 0.0), None);
    probe.sh_coefficients[0] = value;
    return Arc::new(RwLock::new(probe));
}

#[test]
fn directional_target_resolves_a_three_four_five_offset_at_one_billion() {
    let origin = 1e9;
    let mut light = create_directional_light(None);
    set_directional_light_target(
        &mut light,
        origin,
        origin,
        0.0,
        origin + 3.0,
        origin + 4.0,
        0.0,
    );
    assert_eq!(
        (light.direction.x, light.direction.y, light.direction.z),
        (0.6, 0.8, 0.0)
    );
}

#[test]
fn point_influence_separates_bounds_a_fraction_apart_at_one_billion() {
    let origin = 1e9;
    let mut light = create_point_light();
    light.position = create_vector3(origin, 0.0, 0.0);
    light.range = 1.0;
    let near = create_bounding_sphere(origin + 1.2, 0.0, 0.0, 0.25);
    let far = create_bounding_sphere(origin + 1.5, 0.0, 0.0, 0.25);
    assert!(has_light_influence_on_bounds(&light, &near));
    assert!(!has_light_influence_on_bounds(&light, &far));
}

#[test]
fn probe_grid_interpolates_a_quarter_cell_at_one_billion() {
    let origin = 1e9;
    let probes: Vec<_> = (0..8)
        .map(|index| tagged_probe((index & 1) as f32))
        .collect();
    let grid = create_light_probe_grid(
        &probes,
        &create_aabb(origin, 0.0, 0.0, origin + 1.0, 1.0, 1.0),
        &create_vector3(2.0, 2.0, 2.0),
    );
    let mut out = [0.0_f32; LIGHT_PROBE_SH_FLOATS];
    assert!(sample_light_probe_grid(
        &mut out,
        &create_vector3(origin + 0.25, 0.0, 0.0),
        &grid
    ));
    assert_eq!(out[0], 0.25);
}

#[test]
fn spot_target_resolves_a_three_four_five_offset_at_one_billion() {
    let origin = 1e9;
    let mut light = create_spot_light(None);
    light.position = create_vector3(origin, 0.0, -origin);
    set_spot_light_target(&mut light, origin + 3.0, 0.0, -origin + 4.0);
    assert_eq!(
        (light.direction.x, light.direction.y, light.direction.z),
        (0.6, 0.0, 0.8)
    );
}

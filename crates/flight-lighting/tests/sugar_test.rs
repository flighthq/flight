use std::sync::{Arc, RwLock};

use flight_geometry::{create_aabb, create_vector3};

use flight_lighting::contract::*;

#[test]
fn light_unit_parse_matches_free_function() {
    assert_eq!(LightUnit::parse("Lux"), parse_light_unit("Lux"));
}

#[test]
fn light_unit_to_str_matches_free_function() {
    assert_eq!(
        LightUnit::Lumen.to_str(),
        get_light_unit_string(LightUnit::Lumen)
    );
}

#[test]
fn selection_reason_parse_matches_free_function() {
    assert_eq!(
        Scene3DForwardLightSelectionReason::parse("selection-required"),
        parse_scene_3d_forward_light_selection_reason("selection-required")
    );
}

#[test]
fn selection_reason_to_str_matches_free_function() {
    assert_eq!(
        Scene3DForwardLightSelectionReason::WithinBudget.to_str(),
        get_scene_3d_forward_light_selection_reason_string(
            Scene3DForwardLightSelectionReason::WithinBudget
        )
    );
}

macro_rules! new_test {
    ($name:ident, $type:ty, $create:ident, $field:ident) => {
        #[test]
        fn $name() {
            assert_eq!(<$type>::new(None).$field, $create(None).$field);
        }
    };
}

new_test!(
    ambient_new_matches_free_function,
    AmbientLight,
    create_ambient_light,
    color
);
new_test!(
    area_new_matches_free_function,
    AreaLight,
    create_area_light,
    right
);
new_test!(
    directional_new_matches_free_function,
    DirectionalLight,
    create_directional_light,
    direction
);
new_test!(
    environment_new_matches_free_function,
    Environment,
    create_environment,
    intensity
);
new_test!(
    hemisphere_new_matches_free_function,
    HemisphereLight,
    create_hemisphere_light,
    sky_color
);
new_test!(
    point_new_matches_free_function,
    PointLight,
    create_point_light,
    position
);
new_test!(
    spot_new_matches_free_function,
    SpotLight,
    create_spot_light,
    outer_cone_cos
);

#[test]
fn ambient_clone_matches_free_function() {
    let source = create_ambient_light(None);
    assert_eq!(
        source.clone_ambient_light().color,
        clone_ambient_light(&source).color
    );
}

#[test]
fn area_clone_matches_free_function() {
    let source = create_area_light(None);
    assert_eq!(source.clone_area_light().up, clone_area_light(&source).up);
}

#[test]
fn directional_clone_matches_free_function() {
    let source = create_directional_light(None);
    assert_eq!(
        source.clone_directional_light().cascade_splits,
        clone_directional_light(&source).cascade_splits
    );
}

#[test]
fn environment_clone_matches_free_function() {
    let source = create_environment(None);
    assert_eq!(
        source.clone_environment().intensity,
        clone_environment(&source).intensity
    );
}

#[test]
fn hemisphere_clone_matches_free_function() {
    let source = create_hemisphere_light(None);
    assert_eq!(
        source.clone_hemisphere_light().ground_color,
        clone_hemisphere_light(&source).ground_color
    );
}

#[test]
fn point_clone_matches_free_function() {
    let source = create_point_light(None);
    assert_eq!(
        source.clone_point_light().range,
        clone_point_light(&source).range
    );
}

#[test]
fn spot_clone_matches_free_function() {
    let source = create_spot_light(None);
    assert_eq!(
        source.clone_spot_light().direction,
        clone_spot_light(&source).direction
    );
}

#[test]
fn directional_set_direction_matches_free_function() {
    let mut method = create_directional_light(None);
    let mut free = create_directional_light(None);
    method.set_direction(0.0, 3.0, 4.0);
    set_directional_light_direction(&mut free, 0.0, 3.0, 4.0);
    assert_eq!(method.direction, free.direction);
}

#[test]
fn directional_set_target_matches_free_function() {
    let mut method = create_directional_light(None);
    let mut free = create_directional_light(None);
    method.set_target(1.0, 2.0, 3.0, 4.0, 2.0, 3.0);
    set_directional_light_target(&mut free, 1.0, 2.0, 3.0, 4.0, 2.0, 3.0);
    assert_eq!(method.direction, free.direction);
}

#[test]
fn area_set_orientation_matches_free_function() {
    let direction = create_vector3(0.0, 0.0, -1.0);
    let right = create_vector3(0.0, 1.0, 0.0);
    let up = create_vector3(1.0, 0.0, 0.0);
    let mut method = create_area_light(None);
    let mut free = create_area_light(None);
    method.set_orientation(&direction, &right, &up);
    set_area_light_orientation(&mut free, &direction, &right, &up);
    assert_eq!(
        (method.direction, method.right, method.up),
        (free.direction, free.right, free.up)
    );
}

#[test]
fn spot_cone_degrees_matches_free_function() {
    let source = create_spot_light(None);
    let mut method = SpotLightConeAngles {
        inner_degrees: -1.0,
        outer_degrees: -1.0,
    };
    let mut free = method;
    source.cone_degrees(&mut method);
    get_spot_light_cone_degrees(&mut free, &source);
    assert_eq!(method, free);
}

#[test]
fn spot_set_blend_matches_free_function() {
    let mut method = create_spot_light(None);
    let mut free = create_spot_light(None);
    method.set_blend(0.4);
    set_spot_light_blend(&mut free, 0.4);
    assert_eq!(method.spot_blend, free.spot_blend);
}

#[test]
fn spot_set_cone_matches_free_function() {
    let mut method = create_spot_light(None);
    let mut free = create_spot_light(None);
    method.set_cone(15.0, 35.0);
    set_spot_light_cone(&mut free, 15.0, 35.0);
    assert_eq!(
        (method.inner_cone_cos, method.outer_cone_cos),
        (free.inner_cone_cos, free.outer_cone_cos)
    );
}

#[test]
fn spot_set_direction_matches_free_function() {
    let mut method = create_spot_light(None);
    let mut free = create_spot_light(None);
    method.set_direction(0.0, 0.0, 5.0);
    set_spot_light_direction(&mut free, 0.0, 0.0, 5.0);
    assert_eq!(method.direction, free.direction);
}

#[test]
fn spot_set_target_matches_free_function() {
    let mut method = create_spot_light(None);
    let mut free = create_spot_light(None);
    method.set_target(4.0, 0.0, 0.0);
    set_spot_light_target(&mut free, 4.0, 0.0, 0.0);
    assert_eq!(method.direction, free.direction);
}

#[test]
fn light_probe_new_matches_free_function() {
    let position = create_vector3(1.0, 2.0, 3.0);
    assert_eq!(
        LightProbe::new(&position, None).sh_coefficients,
        create_light_probe(&position, None).sh_coefficients
    );
}

#[test]
fn light_probe_evaluate_matches_free_function() {
    let position = create_vector3(0.0, 0.0, 0.0);
    let probe = create_light_probe(&position, None);
    let normal = create_vector3(1.0, 0.0, 0.0);
    let mut method = [1.0; 3];
    let mut free = [1.0; 3];
    probe.evaluate(&mut method, &normal);
    evaluate_light_probe_sh(&mut free, &normal, &probe.sh_coefficients);
    assert_eq!(method, free);
}

#[test]
fn light_probe_set_sh_matches_free_function() {
    let position = create_vector3(0.0, 0.0, 0.0);
    let mut method = create_light_probe(&position, None);
    let mut free = create_light_probe(&position, None);
    let colors = [1.0, 2.0, 3.0];
    let directions = [1.0, 0.0, 0.0];
    method.set_sh_from_colors(&colors, &directions);
    set_light_probe_sh_from_colors(&mut free, &colors, &directions);
    assert_eq!(method.sh_coefficients, free.sh_coefficients);
}

#[test]
fn light_probe_grid_new_matches_free_function() {
    let probes = vec![Arc::new(RwLock::new(create_light_probe(
        &create_vector3(0.0, 0.0, 0.0),
        None,
    )))];
    let bounds = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
    let resolution = create_vector3(1.0, 1.0, 1.0);
    assert_eq!(
        LightProbeGrid::new(&probes, &bounds, &resolution)
            .probes
            .len(),
        create_light_probe_grid(&probes, &bounds, &resolution)
            .probes
            .len()
    );
}

#[test]
fn light_probe_grid_sample_matches_free_function() {
    let probes = vec![Arc::new(RwLock::new(create_light_probe(
        &create_vector3(0.0, 0.0, 0.0),
        None,
    )))];
    let grid = create_light_probe_grid(
        &probes,
        &create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
        &create_vector3(1.0, 1.0, 1.0),
    );
    let position = create_vector3(0.5, 0.5, 0.5);
    let mut method = [1.0; LIGHT_PROBE_SH_FLOATS];
    let mut free = [1.0; LIGHT_PROBE_SH_FLOATS];
    assert_eq!(
        grid.sample(&mut method, &position),
        sample_light_probe_grid(&mut free, &position, &grid)
    );
    assert_eq!(method, free);
}

#[test]
fn scene_lights_new_matches_free_function() {
    assert_eq!(
        Scene3DLights::new(None).point.len(),
        create_scene_3d_lights(None).point.len()
    );
}

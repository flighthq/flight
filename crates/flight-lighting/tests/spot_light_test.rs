use flight_geometry::create_vector3;
use flight_lighting::contract::*;

fn close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 0.000_01,
        "{actual} != {expected}"
    );
}

mod clone_spot_light {
    use super::*;

    #[test]
    fn copies_vectors_cones_layers_priority_and_shadow_fields() {
        let source = create_spot_light(Some(&SpotLightOptions {
            casts_shadow: Some(true),
            direction: Some(create_vector3(1.0, 0.0, 0.0)),
            inner_cone_degrees: Some(10.0),
            layer_mask: Some(5),
            outer_cone_degrees: Some(30.0),
            position: Some(create_vector3(3.0, 4.0, 5.0)),
            priority: Some(2.0),
            spot_blend: Some(0.6),
            ..crate::spot_options()
        }));
        let copy = clone_spot_light(&source);
        assert_eq!(copy.direction, source.direction);
        assert_eq!(copy.position, source.position);
        assert_eq!(copy.inner_cone_cos, source.inner_cone_cos);
        assert_eq!(copy.outer_cone_cos, source.outer_cone_cos);
        assert_eq!((copy.layer_mask, copy.priority), (5, 2.0));
        assert_eq!(copy.spot_blend, 0.6);
        assert_eq!(copy.kind, SPOT_LIGHT_KIND);
    }
}

mod create_spot_light {
    use super::*;

    #[test]
    fn applies_source_defaults_and_clamps_blend() {
        let light = create_spot_light(None);
        assert_eq!(light.direction, create_vector3(0.0, -1.0, 0.0));
        assert_eq!(light.inner_cone_cos, 1.0);
        close(light.outer_cone_cos, 45.0_f32.to_radians().cos());
        assert_eq!(light.range, -1.0);
        assert_eq!(light.spot_blend, 0.0);
        assert_eq!(
            create_spot_light(Some(&SpotLightOptions {
                spot_blend: Some(2.0),
                ..crate::spot_options()
            }))
            .spot_blend,
            1.0
        );
    }
}

mod get_spot_light_cone_degrees {
    use super::*;

    #[test]
    fn round_trips_authored_half_angles() {
        let light = create_spot_light(Some(&SpotLightOptions {
            inner_cone_degrees: Some(15.0),
            outer_cone_degrees: Some(35.0),
            ..crate::spot_options()
        }));
        let mut out = SpotLightConeAngles {
            inner_degrees: 0.0,
            outer_degrees: 0.0,
        };
        get_spot_light_cone_degrees(&mut out, &light);
        close(out.inner_degrees, 15.0);
        close(out.outer_degrees, 35.0);
    }
}

mod initialize_spot_light {
    use super::*;

    #[test]
    fn overwrites_a_previous_descriptor() {
        let mut light = create_spot_light(None);
        light.range = 12.0;
        initialize_spot_light(&mut light, None);
        assert_eq!(light.range, -1.0);
        assert_eq!(light.kind, SPOT_LIGHT_KIND);
    }
}

mod set_spot_light_blend {
    use super::*;

    #[test]
    fn clamps_finite_values_and_preserves_nan() {
        let mut light = create_spot_light(None);
        set_spot_light_blend(&mut light, -1.0);
        assert_eq!(light.spot_blend, 0.0);
        set_spot_light_blend(&mut light, 2.0);
        assert_eq!(light.spot_blend, 1.0);
        set_spot_light_blend(&mut light, f32::NAN);
        assert!(light.spot_blend.is_nan());
    }
}

mod set_spot_light_cone {
    use super::*;

    #[test]
    fn stores_cosines_without_reordering_or_validation() {
        let mut light = create_spot_light(None);
        set_spot_light_cone(&mut light, 60.0, 10.0);
        close(light.inner_cone_cos, 60.0_f32.to_radians().cos());
        close(light.outer_cone_cos, 10.0_f32.to_radians().cos());
        assert!(light.inner_cone_cos < light.outer_cone_cos);
    }
}

mod set_spot_light_direction {
    use super::*;

    #[test]
    fn normalizes_nonzero_input_and_ignores_zero() {
        let mut light = create_spot_light(None);
        set_spot_light_direction(&mut light, 0.0, 2.0, 0.0);
        assert_eq!(light.direction, create_vector3(0.0, 1.0, 0.0));
        set_spot_light_direction(&mut light, 0.0, 0.0, 0.0);
        assert_eq!(light.direction, create_vector3(0.0, 1.0, 0.0));
    }
}

mod set_spot_light_target {
    use super::*;

    #[test]
    fn aims_from_captured_position_and_ignores_equal_target() {
        let mut light = create_spot_light(Some(&SpotLightOptions {
            position: Some(create_vector3(1.0, 2.0, 3.0)),
            ..crate::spot_options()
        }));
        set_spot_light_target(&mut light, 1.0, 2.0, 8.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
        set_spot_light_target(&mut light, 1.0, 2.0, 3.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
    }
}

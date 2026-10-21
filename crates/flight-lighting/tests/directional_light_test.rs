use flight_geometry::create_vector3;
use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 options are plain partial records and intentionally have no create factory

fn close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 0.000_01,
        "{actual} != {expected}"
    );
}

mod clone_directional_light {
    use super::*;

    #[test]
    fn copies_every_field_and_owns_the_split_list() {
        let source = create_directional_light(Some(&DirectionalLightOptions {
            cascade_count: Some(2),
            cascade_splits: Some(vec![0.25, 1.0]),
            casts_shadow: Some(true),
            color: Some(0x1122_33ff),
            direction: Some(create_vector3(1.0, 0.0, 0.0)),
            enabled: Some(false),
            intensity: Some(0.5),
            intensity_unit: Some(LUX_LIGHT_UNIT),
            normal_bias: Some(0.1),
            pcf_radius: Some(2.0),
            shadow_bias: Some(0.01),
            shadow_far: Some(300.0),
            shadow_map_size: Some(2048),
            shadow_near: Some(0.25),
            shadow_strength: Some(0.75),
        }));
        let copy = clone_directional_light(&source);
        assert_eq!(copy.cascade_splits, vec![0.25, 1.0]);
        assert_ne!(copy.cascade_splits.as_ptr(), source.cascade_splits.as_ptr());
        assert_eq!(copy.direction, source.direction);
        assert!(copy.casts_shadow);
        assert_eq!(copy.shadow_map_size, 2048);
        assert_eq!(copy.kind, DIRECTIONAL_LIGHT_KIND);
    }
}

mod create_directional_light {
    use super::*;

    #[test]
    fn applies_defaults_and_normalizes_a_supplied_direction() {
        let default = create_directional_light(None);
        assert_eq!(default.cascade_splits, vec![1.0]);
        assert_eq!(default.direction, create_vector3(0.0, -1.0, 0.0));
        assert!(!default.casts_shadow);
        assert_eq!(default.shadow_map_size, DIRECTIONAL_SHADOW_MAP_SIZE);
        let light = create_directional_light(Some(&DirectionalLightOptions {
            direction: Some(create_vector3(0.0, 3.0, 4.0)),
            ..crate::directional_options()
        }));
        close(light.direction.y, 0.6);
        close(light.direction.z, 0.8);
    }

    #[test]
    fn keeps_the_downward_default_for_zero_direction() {
        let light = create_directional_light(Some(&DirectionalLightOptions {
            direction: Some(create_vector3(0.0, 0.0, 0.0)),
            ..crate::directional_options()
        }));
        assert_eq!(light.direction, create_vector3(0.0, -1.0, 0.0));
    }
}

mod initialize_directional_light {
    use super::*;

    #[test]
    fn resets_existing_values_to_source_defaults() {
        let mut light = create_directional_light(Some(&DirectionalLightOptions {
            casts_shadow: Some(true),
            ..crate::directional_options()
        }));
        initialize_directional_light(&mut light, None);
        assert!(!light.casts_shadow);
        assert_eq!(light.shadow_far, 500.0);
    }
}

mod set_directional_light_direction {
    use super::*;

    #[test]
    fn normalizes_and_ignores_zero_or_nan_lengths() {
        let mut light = create_directional_light(None);
        set_directional_light_direction(&mut light, 0.0, 0.0, 3.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
        set_directional_light_direction(&mut light, 0.0, 0.0, 0.0);
        set_directional_light_direction(&mut light, f32::NAN, 0.0, 0.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
    }
}

mod set_directional_light_target {
    use super::*;

    #[test]
    fn aims_from_source_to_target_and_keeps_zero_delta() {
        let mut light = create_directional_light(None);
        set_directional_light_target(&mut light, 0.0, 0.0, 0.0, 0.0, 0.0, 5.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
        set_directional_light_target(&mut light, 1.0, 2.0, 3.0, 1.0, 2.0, 3.0);
        assert_eq!(light.direction, create_vector3(0.0, 0.0, 1.0));
    }
}

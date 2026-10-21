use flight_geometry::create_vector3;
use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 options are plain partial records and intentionally have no create factory

fn length(vector: &flight_geometry::Vector3) -> f32 {
    return (vector.x * vector.x + vector.y * vector.y + vector.z * vector.z).sqrt();
}

mod clone_area_light {
    use super::*;

    #[test]
    fn copies_all_vectors_and_shadow_intent() {
        let source = create_area_light(Some(&AreaLightOptions {
            casts_shadow: Some(true),
            color: Some(0x1122_33ff),
            decay: Some(1.5),
            direction: Some(create_vector3(0.0, 0.0, -1.0)),
            enabled: Some(false),
            intensity: Some(0.5),
            intensity_unit: Some(LUMEN_LIGHT_UNIT),
            normal_bias: Some(0.1),
            pcf_radius: Some(2.0),
            position: Some(create_vector3(1.0, 2.0, 3.0)),
            range: Some(8.0),
            right: Some(create_vector3(2.0, 0.0, 0.0)),
            shadow_bias: Some(0.01),
            shadow_far: Some(300.0),
            shadow_map_size: Some(2048),
            shadow_near: Some(0.25),
            shadow_strength: Some(0.75),
            up: Some(create_vector3(0.0, 3.0, 0.0)),
        }));
        let copy = clone_area_light(&source);
        assert_eq!(copy.position, source.position);
        assert_eq!(copy.direction, source.direction);
        assert_eq!(copy.right, source.right);
        assert_eq!(copy.up, source.up);
        assert!(copy.casts_shadow);
        assert_eq!(copy.shadow_map_size, 2048);
        assert_eq!(copy.kind, AREA_LIGHT_KIND);
    }
}

mod create_area_light {
    use super::*;

    #[test]
    fn applies_rectangular_light_defaults() {
        let light = create_area_light(None);
        assert_eq!(light.direction, create_vector3(0.0, -1.0, 0.0));
        assert_eq!(light.position, create_vector3(0.0, 0.0, 0.0));
        assert_eq!(light.right, create_vector3(1.0, 0.0, 0.0));
        assert_eq!(light.up, create_vector3(0.0, 0.0, 1.0));
        assert_eq!(light.range, -1.0);
        assert!(!light.casts_shadow);
    }
}

mod initialize_area_light {
    use super::*;

    #[test]
    fn copies_supplied_vectors() {
        let direction = create_vector3(1.0, 2.0, 3.0);
        let mut light = create_area_light(None);
        initialize_area_light(
            &mut light,
            Some(&AreaLightOptions {
                direction: Some(direction.clone()),
                ..crate::area_options()
            }),
        );
        assert_eq!(light.direction, direction);
        assert!(!std::ptr::eq(&light.direction, &direction));
    }
}

mod set_area_light_orientation {
    use super::*;

    #[test]
    fn normalizes_axes_while_preserving_existing_half_extents() {
        let mut light = create_area_light(Some(&AreaLightOptions {
            right: Some(create_vector3(3.0, 0.0, 0.0)),
            up: Some(create_vector3(0.0, 0.0, 4.0)),
            ..crate::area_options()
        }));
        set_area_light_orientation(
            &mut light,
            &create_vector3(0.0, 0.0, -2.0),
            &create_vector3(0.0, 5.0, 0.0),
            &create_vector3(6.0, 0.0, 0.0),
        );
        assert_eq!(light.direction, create_vector3(0.0, 0.0, -1.0));
        assert!((length(&light.right) - 3.0).abs() < 0.000_01);
        assert!((length(&light.up) - 4.0).abs() < 0.000_01);
    }

    #[test]
    fn ignores_zero_and_nan_inputs_without_partial_writes() {
        let mut light = create_area_light(None);
        let original = (
            light.direction.clone(),
            light.right.clone(),
            light.up.clone(),
        );
        set_area_light_orientation(
            &mut light,
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(f32::NAN, 0.0, 0.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        assert_eq!(light.direction, original.0);
        assert_eq!(light.right, original.1);
        assert_eq!(light.up, original.2);
    }
}

use flight_geometry::create_vector3;
use flight_lighting::contract::*;

fn length(vector: &flight_geometry::Vector3) -> f32 {
    return (vector.x * vector.x + vector.y * vector.y + vector.z * vector.z).sqrt();
}

mod clone_area_light {
    use super::*;

    #[test]
    fn copies_all_vectors_and_shadow_intent() {
        let mut source = create_area_light();
        source.casts_shadow = true;
        source.color = 0x1122_33ff;
        source.decay = 1.5;
        source.direction = create_vector3(0.0, 0.0, -1.0);
        source.enabled = false;
        source.intensity = 0.5;
        source.intensity_unit = LUMEN_LIGHT_UNIT;
        source.normal_bias = 0.1;
        source.pcf_radius = 2.0;
        source.position = create_vector3(1.0, 2.0, 3.0);
        source.range = 8.0;
        source.right = create_vector3(2.0, 0.0, 0.0);
        source.shadow_bias = 0.01;
        source.shadow_far = 300.0;
        source.shadow_map_size = 2048;
        source.shadow_near = 0.25;
        source.shadow_strength = 0.75;
        source.up = create_vector3(0.0, 3.0, 0.0);
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
        let light = create_area_light();
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
    fn restores_default_vectors_and_authored_fields() {
        let mut light = create_area_light();
        light.casts_shadow = true;
        light.direction = create_vector3(1.0, 2.0, 3.0);
        light.right = create_vector3(2.0, 0.0, 0.0);
        light.up = create_vector3(0.0, 3.0, 0.0);
        initialize_area_light(&mut light);
        assert!(!light.casts_shadow);
        assert_eq!(light.direction, create_vector3(0.0, -1.0, 0.0));
        assert_eq!(light.right, create_vector3(1.0, 0.0, 0.0));
        assert_eq!(light.up, create_vector3(0.0, 0.0, 1.0));
    }
}

mod set_area_light_orientation {
    use super::*;

    #[test]
    fn normalizes_axes_while_preserving_existing_half_extents() {
        let mut light = create_area_light();
        light.right = create_vector3(3.0, 0.0, 0.0);
        light.up = create_vector3(0.0, 0.0, 4.0);
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
        let mut light = create_area_light();
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

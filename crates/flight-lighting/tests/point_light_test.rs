use flight_geometry::create_vector3;
use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 options are plain partial records and intentionally have no create factory

mod clone_point_light {
    use super::*;

    #[test]
    fn copies_all_authoring_fields() {
        let source = create_point_light(Some(&PointLightOptions {
            casts_shadow: Some(true),
            color: Some(0x1122_33ff),
            decay: Some(1.5),
            enabled: Some(false),
            intensity: Some(0.5),
            intensity_unit: Some(CANDELA_LIGHT_UNIT),
            layer_mask: Some(3),
            priority: Some(7.0),
            normal_bias: Some(0.1),
            pcf_radius: Some(2.0),
            position: Some(create_vector3(3.0, 4.0, 5.0)),
            range: Some(10.0),
            shadow_bias: Some(0.01),
            shadow_far: Some(300.0),
            shadow_map_size: Some(2048),
            shadow_near: Some(0.25),
            shadow_strength: Some(0.75),
        }));
        let copy = clone_point_light(&source);
        assert_eq!(copy.position, source.position);
        assert_eq!(copy.layer_mask, 3);
        assert_eq!(copy.priority, 7.0);
        assert!(copy.casts_shadow);
        assert_eq!(copy.kind, POINT_LIGHT_KIND);
    }
}

mod create_point_light {
    use super::*;

    #[test]
    fn applies_punctual_defaults_and_copies_position() {
        let light = create_point_light(None);
        assert_eq!(light.color, 0xffff_ffff);
        assert_eq!(light.decay, 2.0);
        assert_eq!(light.layer_mask, ALL_LIGHT_LAYERS);
        assert_eq!(light.priority, 0.0);
        assert_eq!(light.position, create_vector3(0.0, 0.0, 0.0));
        assert_eq!(light.range, -1.0);
        assert_eq!(light.shadow_near, 0.5);
    }
}

mod initialize_point_light {
    use super::*;

    #[test]
    fn writes_options_without_runtime_on_the_options_value() {
        let mut light = create_point_light(None);
        initialize_point_light(
            &mut light,
            Some(&PointLightOptions {
                enabled: Some(false),
                range: Some(8.0),
                ..crate::point_options()
            }),
        );
        assert!(!light.enabled);
        assert_eq!(light.range, 8.0);
    }
}

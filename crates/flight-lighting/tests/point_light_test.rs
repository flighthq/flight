use flight_geometry::create_vector3;
use flight_lighting::contract::*;

mod clone_point_light {
    use super::*;

    #[test]
    fn copies_all_authoring_fields() {
        let mut source = create_point_light();
        source.casts_shadow = true;
        source.color = 0x1122_33ff;
        source.decay = 1.5;
        source.enabled = false;
        source.intensity = 0.5;
        source.intensity_unit = CANDELA_LIGHT_UNIT;
        source.layer_mask = 3;
        source.priority = 7.0;
        source.normal_bias = 0.1;
        source.pcf_radius = 2.0;
        source.position = create_vector3(3.0, 4.0, 5.0);
        source.range = 10.0;
        source.shadow_bias = 0.01;
        source.shadow_far = 300.0;
        source.shadow_map_size = 2048;
        source.shadow_near = 0.25;
        source.shadow_strength = 0.75;
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
        let light = create_point_light();
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
    fn restores_punctual_defaults() {
        let mut light = create_point_light();
        light.enabled = false;
        light.position = create_vector3(1.0, 2.0, 3.0);
        light.range = 8.0;
        initialize_point_light(&mut light);
        assert!(light.enabled);
        assert_eq!(light.position, create_vector3(0.0, 0.0, 0.0));
        assert_eq!(light.range, -1.0);
    }
}

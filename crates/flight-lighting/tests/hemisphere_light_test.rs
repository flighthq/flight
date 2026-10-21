use flight_lighting::contract::*;

mod clone_hemisphere_light {
    use super::*;

    #[test]
    fn copies_both_colors_and_intensity() {
        let source = create_hemisphere_light(Some(&HemisphereLightOptions {
            enabled: Some(false),
            ground_color: Some(0x2233_44ff),
            intensity: Some(0.5),
            intensity_unit: Some(LUX_LIGHT_UNIT),
            sky_color: Some(0x8899_aaff),
        }));
        let copy = clone_hemisphere_light(&source);
        assert_eq!(copy.ground_color, 0x2233_44ff);
        assert_eq!(copy.sky_color, 0x8899_aaff);
        assert_eq!(copy.kind, HEMISPHERE_LIGHT_KIND);
    }
}

mod create_hemisphere_light {
    use super::*;

    #[test]
    fn defaults_both_colors_to_opaque_white() {
        let light = create_hemisphere_light(None);
        assert_eq!(light.ground_color, 0xffff_ffff);
        assert_eq!(light.sky_color, 0xffff_ffff);
        assert_eq!(light.intensity, 1.0);
        assert!(light.enabled);
    }
}

mod initialize_hemisphere_light {
    use super::*;

    #[test]
    fn overwrites_previous_colors() {
        let mut light = create_hemisphere_light(None);
        initialize_hemisphere_light(
            &mut light,
            Some(&HemisphereLightOptions {
                ground_color: Some(1),
                sky_color: Some(2),
                ..crate::hemisphere_options()
            }),
        );
        assert_eq!((light.ground_color, light.sky_color), (1, 2));
    }
}

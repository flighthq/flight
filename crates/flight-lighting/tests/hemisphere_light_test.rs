use flight_lighting::contract::*;

mod clone_hemisphere_light {
    use super::*;

    #[test]
    fn copies_both_colors_and_intensity() {
        let mut source = create_hemisphere_light();
        source.enabled = false;
        source.ground_color = 0x2233_44ff;
        source.intensity = 0.5;
        source.intensity_unit = LUX_LIGHT_UNIT;
        source.sky_color = 0x8899_aaff;
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
        let light = create_hemisphere_light();
        assert_eq!(light.ground_color, 0xffff_ffff);
        assert_eq!(light.sky_color, 0xffff_ffff);
        assert_eq!(light.intensity, 1.0);
        assert!(light.enabled);
    }
}

mod initialize_hemisphere_light {
    use super::*;

    #[test]
    fn restores_default_colors_and_intensity() {
        let mut light = create_hemisphere_light();
        light.enabled = false;
        light.ground_color = 1;
        light.intensity = 2.0;
        light.sky_color = 2;
        initialize_hemisphere_light(&mut light);
        assert!(light.enabled);
        assert_eq!(light.intensity, 1.0);
        assert_eq!(
            (light.ground_color, light.sky_color),
            (0xffff_ffff, 0xffff_ffff)
        );
    }
}

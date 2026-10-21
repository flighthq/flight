use flight_materials::transmission_volume_pbr_extension::*;
use flight_materials::*;

mod create_transmission_volume_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_transmission_volume_pbr_extension();
        assert_eq!(ext.kind, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND);
        assert_eq!(ext.attenuation_color, 0xffffffff);
        assert_eq!(ext.attenuation_distance, f32::INFINITY);
        assert_eq!(ext.ior, 1.5);
        assert_eq!(ext.transmission, 0.0);
        assert_eq!(ext.thickness, 0.0);
    }
}

mod initialize_transmission_volume_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_transmission_volume_pbr_extension();
        ext.transmission = 1.0;
        initialize_transmission_volume_pbr_extension(&mut ext);
        assert_eq!(ext.kind, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND);
        assert_eq!(ext.transmission, 0.0);
    }
}

mod is_valid_transmission_volume_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_transmission_volume_pbr_extension(
            &create_transmission_volume_pbr_extension()
        ));
    }

    #[test]
    fn invalid_when_attenuation_distance_is_negative() {
        let mut ext = create_transmission_volume_pbr_extension();
        ext.attenuation_distance = -1.0;
        assert!(!is_valid_transmission_volume_pbr_extension(&ext));
    }
}

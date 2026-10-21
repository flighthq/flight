use flight_materials::*;
use flight_materials::anisotropy_pbr_extension::*;
use flight_materials::clearcoat_pbr_extension::*;
use flight_materials::iridescence_pbr_extension::*;
use flight_materials::sheen_pbr_extension::*;
use flight_materials::specular_pbr_extension::*;
use flight_materials::transmission_volume_pbr_extension::*;
use flight_materials::wrapped_diffuse_pbr_extension::*;
use flight_materials::pbr_extension::*;

mod is_valid_pbr_uv_set_tests {
    use super::*;

    #[test]
    fn valid_values() {
        assert!(is_valid_pbr_uv_set(0));
        assert!(is_valid_pbr_uv_set(1));
    }

    #[test]
    fn invalid_values() {
        assert!(!is_valid_pbr_uv_set(2));
        assert!(!is_valid_pbr_uv_set(99));
    }
}

mod anisotropy_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_anisotropy_pbr_extension();
        assert_eq!(ext.kind, ANISOTROPY_PBR_EXTENSION_KIND);
        assert_eq!(ext.anisotropy_strength, 0.0);
        assert_eq!(ext.anisotropy_rotation, 0.0);
        assert!(ext.anisotropy_map.is_none());
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_anisotropy_pbr_extension(&create_anisotropy_pbr_extension()));
    }
}

mod clearcoat_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_clearcoat_pbr_extension();
        assert_eq!(ext.kind, CLEARCOAT_PBR_EXTENSION_KIND);
        assert_eq!(ext.clearcoat, 0.0);
        assert_eq!(ext.clearcoat_roughness, 0.0);
        assert_eq!(ext.clearcoat_normal_scale, 1.0);
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_clearcoat_pbr_extension(&create_clearcoat_pbr_extension()));
    }
}

mod iridescence_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_iridescence_pbr_extension();
        assert_eq!(ext.kind, IRIDESCENCE_PBR_EXTENSION_KIND);
        assert_eq!(ext.iridescence, 0.0);
        assert_eq!(ext.iridescence_ior, 1.3);
        assert_eq!(ext.iridescence_thickness_min, 100.0);
        assert_eq!(ext.iridescence_thickness_max, 400.0);
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_iridescence_pbr_extension(&create_iridescence_pbr_extension()));
    }

    #[test]
    fn invalid_when_min_exceeds_max() {
        let mut ext = create_iridescence_pbr_extension();
        ext.iridescence_thickness_min = 500.0;
        ext.iridescence_thickness_max = 100.0;
        assert!(!is_valid_iridescence_pbr_extension(&ext));
    }
}

mod sheen_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_sheen_pbr_extension();
        assert_eq!(ext.kind, SHEEN_PBR_EXTENSION_KIND);
        assert_eq!(ext.sheen_color, 0x000000ff);
        assert_eq!(ext.sheen_roughness, 0.0);
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_sheen_pbr_extension(&create_sheen_pbr_extension()));
    }
}

mod specular_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_specular_pbr_extension();
        assert_eq!(ext.kind, SPECULAR_PBR_EXTENSION_KIND);
        assert_eq!(ext.specular, 1.0);
        assert_eq!(ext.specular_color, 0xffffffff);
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_specular_pbr_extension(&create_specular_pbr_extension()));
    }
}

mod transmission_volume_tests {
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

mod wrapped_diffuse_tests {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_wrapped_diffuse_pbr_extension();
        assert_eq!(ext.kind, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND);
        assert_eq!(ext.wrapped_diffuse_color, 0xffffffff);
        assert_eq!(ext.wrapped_diffuse_strength, 0.0);
        assert_eq!(ext.thickness, 0.0);
    }

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_wrapped_diffuse_pbr_extension(&create_wrapped_diffuse_pbr_extension()));
    }
}

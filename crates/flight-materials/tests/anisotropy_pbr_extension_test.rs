use flight_materials::anisotropy_pbr_extension::*;
use flight_materials::*;

mod create_anisotropy_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_anisotropy_pbr_extension(None);
        assert_eq!(ext.kind, ANISOTROPY_PBR_EXTENSION_KIND);
        assert_eq!(ext.anisotropy_strength, 0.0);
        assert_eq!(ext.anisotropy_rotation, 0.0);
        assert!(ext.anisotropy_map.is_none());
    }
}

mod initialize_anisotropy_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_anisotropy_pbr_extension(None);
        ext.anisotropy_strength = 0.5;
        initialize_anisotropy_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, ANISOTROPY_PBR_EXTENSION_KIND);
        assert_eq!(ext.anisotropy_strength, 0.0);
    }
}

mod is_valid_anisotropy_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_anisotropy_pbr_extension(
            &create_anisotropy_pbr_extension(None)
        ));
    }
}

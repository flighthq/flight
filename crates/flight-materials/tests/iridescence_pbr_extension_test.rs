use flight_materials::iridescence_pbr_extension::*;
use flight_materials::*;

mod create_iridescence_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_iridescence_pbr_extension(None);
        assert_eq!(ext.kind, IRIDESCENCE_PBR_EXTENSION_KIND);
        assert_eq!(ext.iridescence, 0.0);
        assert_eq!(ext.iridescence_ior, 1.3);
        assert_eq!(ext.iridescence_thickness_min, 100.0);
        assert_eq!(ext.iridescence_thickness_max, 400.0);
    }
}

mod initialize_iridescence_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_iridescence_pbr_extension(None);
        ext.iridescence = 0.5;
        initialize_iridescence_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, IRIDESCENCE_PBR_EXTENSION_KIND);
        assert_eq!(ext.iridescence, 0.0);
    }
}

mod is_valid_iridescence_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_iridescence_pbr_extension(
            &create_iridescence_pbr_extension(None)
        ));
    }

    #[test]
    fn invalid_when_min_exceeds_max() {
        let mut ext = create_iridescence_pbr_extension(None);
        ext.iridescence_thickness_min = 500.0;
        ext.iridescence_thickness_max = 100.0;
        assert!(!is_valid_iridescence_pbr_extension(&ext));
    }
}

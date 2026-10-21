use flight_materials::specular_pbr_extension::*;
use flight_materials::*;

mod create_specular_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_specular_pbr_extension(None);
        assert_eq!(ext.kind, SPECULAR_PBR_EXTENSION_KIND);
        assert_eq!(ext.specular, 1.0);
        assert_eq!(ext.specular_color, 0xffffffff);
    }
}

mod initialize_specular_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_specular_pbr_extension(None);
        ext.specular = 0.5;
        initialize_specular_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, SPECULAR_PBR_EXTENSION_KIND);
        assert_eq!(ext.specular, 1.0);
    }
}

mod is_valid_specular_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_specular_pbr_extension(&create_specular_pbr_extension(None)));
    }
}

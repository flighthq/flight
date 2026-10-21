use flight_materials::wrapped_diffuse_pbr_extension::*;
use flight_materials::*;

mod create_wrapped_diffuse_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_wrapped_diffuse_pbr_extension(None);
        assert_eq!(ext.kind, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND);
        assert_eq!(ext.wrapped_diffuse_color, 0xffffffff);
        assert_eq!(ext.wrapped_diffuse_strength, 0.0);
        assert_eq!(ext.thickness, 0.0);
    }
}

mod initialize_wrapped_diffuse_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_wrapped_diffuse_pbr_extension(None);
        ext.wrapped_diffuse_strength = 0.5;
        initialize_wrapped_diffuse_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND);
        assert_eq!(ext.wrapped_diffuse_strength, 0.0);
    }
}

mod is_valid_wrapped_diffuse_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_wrapped_diffuse_pbr_extension(&create_wrapped_diffuse_pbr_extension(None)));
    }
}

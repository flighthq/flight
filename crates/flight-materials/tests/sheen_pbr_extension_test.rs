use flight_materials::sheen_pbr_extension::*;
use flight_materials::*;

mod create_sheen_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_sheen_pbr_extension(None);
        assert_eq!(ext.kind, SHEEN_PBR_EXTENSION_KIND);
        assert_eq!(ext.sheen_color, 0x000000ff);
        assert_eq!(ext.sheen_roughness, 0.0);
    }
}

mod initialize_sheen_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_sheen_pbr_extension(None);
        ext.sheen_roughness = 0.5;
        initialize_sheen_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, SHEEN_PBR_EXTENSION_KIND);
        assert_eq!(ext.sheen_roughness, 0.0);
    }
}

mod is_valid_sheen_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_sheen_pbr_extension(&create_sheen_pbr_extension(None)));
    }
}

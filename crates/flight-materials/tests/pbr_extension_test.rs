use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_materials::pbr_extension::*;
use flight_materials::*;

mod is_valid_pbr_uv_set {
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

mod pbr_extension_kind {
    use super::*;

    #[test]
    fn returns_the_kind_of_the_wrapped_extension() {
        let ext = PbrExtension::Anisotropy(create_anisotropy_pbr_extension(None));
        assert_eq!(ext.kind(), ANISOTROPY_PBR_EXTENSION_KIND);
    }
}

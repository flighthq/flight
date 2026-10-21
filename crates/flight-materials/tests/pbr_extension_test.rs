use flight_materials::pbr_extension::*;

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

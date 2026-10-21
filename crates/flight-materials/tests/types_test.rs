use flight_materials::*;

mod material_alpha_mode {
    use super::*;

    #[test]
    fn defaults_to_opaque() {
        assert_eq!(MaterialAlphaMode::default(), MaterialAlphaMode::Opaque);
    }
}

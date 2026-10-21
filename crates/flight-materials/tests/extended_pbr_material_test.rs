use flight_materials::extended_pbr_material::*;
use flight_materials::*;

mod create_extended_pbr_material {
    use super::*;

    #[test]
    fn creates_with_standard_pbr_base() {
        let m = create_extended_pbr_material(None);
        assert_eq!(m.kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(m.standard.base_color, 0xffffffff);
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 1.0);
        assert!(m.extensions.is_empty());
    }
}

mod sugar {
    use super::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_extended_pbr_material(None);
        let sugar = ExtendedPbrMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.standard.base_color, sugar.standard.base_color);
        assert_eq!(free.standard.roughness, sugar.standard.roughness);
    }
}

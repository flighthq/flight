use flight_materials::*;
use flight_materials::classic_materials::*;

mod create_blinn_phong_material {
    use super::*;

    #[test]
    fn creates_white_blinn_phong_with_shininess_32() {
        let m = create_blinn_phong_material(None);
        assert_eq!(m.kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert!(m.normal_map.is_none());
        assert!(m.alpha_map.is_none());
    }
}

mod create_lambert_material {
    use super::*;

    #[test]
    fn creates_white_diffuse_with_no_emission() {
        let m = create_lambert_material(None);
        assert_eq!(m.kind, LAMBERT_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.emissive, 0x000000ff);
        assert!(m.diffuse_map.is_none());
        assert!(m.emissive_map.is_none());
    }
}

mod create_phong_material {
    use super::*;

    #[test]
    fn creates_white_phong_with_shininess_32() {
        let m = create_phong_material(None);
        assert_eq!(m.kind, PHONG_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert_eq!(m.normal_scale, 1.0);
    }
}

mod sugar_constructors {
    use super::*;

    #[test]
    fn blinn_phong_sugar_new_matches_free_function() {
        let free = create_blinn_phong_material(None);
        let sugar = BlinnPhongMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.diffuse, sugar.diffuse);
        assert_eq!(free.shininess, sugar.shininess);
    }

    #[test]
    fn lambert_sugar_new_matches_free_function() {
        let free = create_lambert_material(None);
        let sugar = LambertMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.diffuse, sugar.diffuse);
        assert_eq!(free.emissive, sugar.emissive);
    }

    #[test]
    fn phong_sugar_new_matches_free_function() {
        let free = create_phong_material(None);
        let sugar = PhongMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.diffuse, sugar.diffuse);
        assert_eq!(free.shininess, sugar.shininess);
    }
}

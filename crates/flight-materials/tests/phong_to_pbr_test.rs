use flight_materials::classic_materials::create_phong_material;
use flight_materials::phong_to_pbr::*;
use flight_materials::*;

mod convert_phong_to_standard_pbr_material {
    use super::*;

    #[test]
    fn maps_neutral_phong_to_plausible_pbr() {
        let phong = create_phong_material();
        let pbr = convert_phong_to_standard_pbr_material(&phong, None, None);
        assert_eq!(pbr.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(pbr.base_color, phong.diffuse);
        assert!(pbr.roughness > 0.0);
        assert!(pbr.roughness < 1.0);
        assert_eq!(pbr.metallic, 0.0);
    }

    #[test]
    fn preserves_normal_scale() {
        let mut phong = create_phong_material();
        phong.normal_scale = 0.5;
        let pbr = convert_phong_to_standard_pbr_material(&phong, None, None);
        assert_eq!(pbr.normal_scale, 0.5);
    }
}

mod get_pbr_metallic_from_phong_specular {
    use super::*;

    #[test]
    fn bright_specular_over_near_black_is_metallic() {
        assert_eq!(
            get_pbr_metallic_from_phong_specular(0xffffffff, 0x000000ff),
            1.0
        );
    }

    #[test]
    fn white_specular_over_lit_diffuse_is_dielectric() {
        assert_eq!(
            get_pbr_metallic_from_phong_specular(0xffffffff, 0xffffffff),
            0.0
        );
        assert_eq!(
            get_pbr_metallic_from_phong_specular(0x808080ff, 0x333333ff),
            0.0
        );
    }
}

mod get_pbr_roughness_from_phong_shininess {
    use super::*;

    #[test]
    fn maps_default_shininess_32() {
        let r = get_pbr_roughness_from_phong_shininess(32.0);
        assert!((r - 0.2425).abs() < 0.001);
    }

    #[test]
    fn monotonic_decreasing() {
        assert!(
            get_pbr_roughness_from_phong_shininess(2.0)
                > get_pbr_roughness_from_phong_shininess(200.0)
        );
    }

    #[test]
    fn clamps_to_0_1() {
        let r = get_pbr_roughness_from_phong_shininess(0.0);
        assert!(r <= 1.0);
        assert!(r >= 0.0);
    }
}

mod get_phong_to_pbr_light_exposure {
    use super::*;

    #[test]
    fn returns_log2_pi() {
        let exposure = get_phong_to_pbr_light_exposure();
        assert!((exposure - std::f32::consts::PI.log2()).abs() < 1e-6);
        assert!((2.0f32.powf(exposure) - std::f32::consts::PI).abs() < 1e-4);
    }
}

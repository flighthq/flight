use flight_materials::material_validation::*;
use flight_materials::pbr_materials::create_standard_pbr_material_properties;

mod clamp_standard_pbr_material_properties {
    use super::*;

    #[test]
    fn clamps_metallic_to_0_1() {
        let mut props = create_standard_pbr_material_properties();
        props.metallic = 1.5;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.metallic, 1.0);
        props.metallic = -0.5;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.metallic, 0.0);
    }

    #[test]
    fn clamps_roughness_to_0_1() {
        let mut props = create_standard_pbr_material_properties();
        props.roughness = 2.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.roughness, 1.0);
        props.roughness = -1.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.roughness, 0.0);
    }

    #[test]
    fn clamps_occlusion_strength_to_0_1() {
        let mut props = create_standard_pbr_material_properties();
        props.occlusion_strength = 3.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.occlusion_strength, 1.0);
    }

    #[test]
    fn clamps_emissive_strength_floor_only() {
        let mut props = create_standard_pbr_material_properties();
        props.emissive_strength = -1.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.emissive_strength, 0.0);
        props.emissive_strength = 10.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.emissive_strength, 10.0);
    }

    #[test]
    fn clamps_normal_scale_floor_only() {
        let mut props = create_standard_pbr_material_properties();
        props.normal_scale = -2.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.normal_scale, 0.0);
        props.normal_scale = 5.0;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.normal_scale, 5.0);
    }

    #[test]
    fn leaves_valid_block_unchanged() {
        let mut props = create_standard_pbr_material_properties();
        props.metallic = 0.5;
        props.roughness = 0.3;
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.metallic, 0.5);
        assert_eq!(props.roughness, 0.3);
    }
}

mod is_valid_material_clearcoat {
    use super::*;

    #[test]
    fn valid_range() {
        assert!(is_valid_material_clearcoat(0.0));
        assert!(is_valid_material_clearcoat(0.5));
        assert!(is_valid_material_clearcoat(1.0));
    }

    #[test]
    fn invalid_range() {
        assert!(!is_valid_material_clearcoat(-0.1));
        assert!(!is_valid_material_clearcoat(1.1));
    }

    #[test]
    fn non_finite() {
        assert!(!is_valid_material_clearcoat(f32::NAN));
        assert!(!is_valid_material_clearcoat(f32::INFINITY));
    }
}

mod is_valid_material_ior {
    use super::*;

    #[test]
    fn valid_range() {
        assert!(is_valid_material_ior(1.0));
        assert!(is_valid_material_ior(1.5));
        assert!(is_valid_material_ior(2.4));
        assert!(is_valid_material_ior(5.0));
    }

    #[test]
    fn below_1() {
        assert!(!is_valid_material_ior(0.9));
        assert!(!is_valid_material_ior(0.0));
    }

    #[test]
    fn above_5() {
        assert!(!is_valid_material_ior(5.1));
        assert!(!is_valid_material_ior(100.0));
    }

    #[test]
    fn non_finite() {
        assert!(!is_valid_material_ior(f32::NAN));
        assert!(!is_valid_material_ior(f32::INFINITY));
    }
}

mod is_valid_material_iridescence_thickness {
    use super::*;

    #[test]
    fn valid() {
        assert!(is_valid_material_iridescence_thickness(0.0));
        assert!(is_valid_material_iridescence_thickness(100.0));
        assert!(is_valid_material_iridescence_thickness(400.0));
        assert!(is_valid_material_iridescence_thickness(2000.0));
    }

    #[test]
    fn negative() {
        assert!(!is_valid_material_iridescence_thickness(-1.0));
    }

    #[test]
    fn non_finite() {
        assert!(!is_valid_material_iridescence_thickness(f32::NAN));
        assert!(!is_valid_material_iridescence_thickness(f32::INFINITY));
    }
}

mod is_valid_material_weight {
    use super::*;

    #[test]
    fn valid_range() {
        assert!(is_valid_material_weight(0.0));
        assert!(is_valid_material_weight(0.5));
        assert!(is_valid_material_weight(1.0));
    }

    #[test]
    fn invalid_range() {
        assert!(!is_valid_material_weight(-0.001));
        assert!(!is_valid_material_weight(1.001));
    }

    #[test]
    fn non_finite() {
        assert!(!is_valid_material_weight(f32::NAN));
        assert!(!is_valid_material_weight(f32::INFINITY));
    }
}

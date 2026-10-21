use flight_materials::*;
use flight_materials::pbr_materials::*;

mod create_standard_pbr_material_tests {
    use super::*;

    #[test]
    fn creates_white_fully_rough_dielectric() {
        let m = create_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.base_color, 0xffffffff);
        assert_eq!(m.metallic, 0.0);
        assert_eq!(m.roughness, 1.0);
        assert_eq!(m.emissive, 0x000000ff);
        assert_eq!(m.emissive_strength, 1.0);
        assert_eq!(m.normal_scale, 1.0);
        assert_eq!(m.occlusion_strength, 1.0);
        assert!(m.alpha_map.is_none());
        assert!(m.base_color_map.is_none());
        assert!(m.emissive_map.is_none());
        assert!(m.metallic_roughness_map.is_none());
        assert!(m.normal_map.is_none());
        assert!(m.occlusion_map.is_none());
    }
}

mod create_specular_glossiness_pbr_material_tests {
    use super::*;

    #[test]
    fn creates_with_correct_defaults() {
        let m = create_specular_glossiness_pbr_material();
        assert_eq!(m.kind, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.glossiness, 1.0);
        assert_eq!(m.emissive, 0x000000ff);
    }
}

mod create_standard_pbr_material_properties_tests {
    use super::*;

    #[test]
    fn creates_property_block_with_defaults() {
        let p = create_standard_pbr_material_properties();
        assert_eq!(p.base_color, 0xffffffff);
        assert_eq!(p.metallic, 0.0);
        assert_eq!(p.roughness, 1.0);
        assert_eq!(p.emissive, 0x000000ff);
        assert_eq!(p.emissive_strength, 1.0);
        assert_eq!(p.normal_scale, 1.0);
        assert_eq!(p.occlusion_strength, 1.0);
    }
}

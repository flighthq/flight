use flight_materials::*;
use flight_materials::material_presets::*;

mod create_aluminum_standard_pbr_material {
    use super::*;
    #[test]
    fn fully_metallic_moderately_rough() {
        let m = create_aluminum_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 1.0);
        assert!((m.roughness - 0.35).abs() < 1e-6);
    }
}

mod create_carbon_standard_pbr_material {
    use super::*;
    #[test]
    fn dielectric_very_rough_dark() {
        let m = create_carbon_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.95).abs() < 1e-6);
    }
}

mod create_glass_extended_pbr_material {
    use super::*;
    #[test]
    fn composes_clear_glass() {
        let m = create_glass_extended_pbr_material();
        assert_eq!(m.kind, EXTENDED_PBR_MATERIAL_KIND);
        assert_eq!(m.standard.base_color, 0xffffffff);
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 0.0);
        assert_eq!(m.extensions.len(), 1);
        assert_eq!(m.extensions[0].kind(), TRANSMISSION_VOLUME_PBR_EXTENSION_KIND);
    }
}

mod create_gold_standard_pbr_material {
    use super::*;
    #[test]
    fn fully_metallic_gold_base() {
        let m = create_gold_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 1.0);
        assert_eq!(m.base_color, 0xffd700ff);
        assert!((m.roughness - 0.25).abs() < 1e-6);
    }
}

mod create_iron_standard_pbr_material {
    use super::*;
    #[test]
    fn fully_metallic_rough_dark() {
        let m = create_iron_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 1.0);
        assert!((m.roughness - 0.7).abs() < 1e-6);
    }
}

mod create_marble_standard_pbr_material {
    use super::*;
    #[test]
    fn very_smooth_dielectric() {
        let m = create_marble_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.05).abs() < 1e-6);
    }
}

mod create_plastic_standard_pbr_material {
    use super::*;
    #[test]
    fn glossy_dielectric_white() {
        let m = create_plastic_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.05).abs() < 1e-6);
        assert_eq!(m.base_color, 0xffffffff);
    }
}

mod create_rubber_standard_pbr_material {
    use super::*;
    #[test]
    fn very_rough_dielectric() {
        let m = create_rubber_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.9).abs() < 1e-6);
    }
}

mod create_silver_standard_pbr_material {
    use super::*;
    #[test]
    fn highly_polished_metallic() {
        let m = create_silver_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 1.0);
        assert!((m.roughness - 0.1).abs() < 1e-6);
        assert_eq!(m.base_color, 0xc0c0c0ff);
    }
}

mod create_skin_standard_pbr_material {
    use super::*;
    #[test]
    fn warm_toned_dielectric() {
        let m = create_skin_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.4).abs() < 1e-6);
    }
}

mod create_wood_standard_pbr_material {
    use super::*;
    #[test]
    fn rough_dielectric_wood() {
        let m = create_wood_standard_pbr_material();
        assert_eq!(m.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(m.metallic, 0.0);
        assert!((m.roughness - 0.8).abs() < 1e-6);
    }
}

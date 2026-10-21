use flight_materials::*;
use flight_materials::pbr_materials::*;

mod convert_specular_glossiness_to_standard_pbr {
    use super::*;

    #[test]
    fn converts_default_specular_glossiness_to_standard() {
        let source = create_specular_glossiness_pbr_material(None);
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert!(out.roughness >= 0.0 && out.roughness <= 1.0);
        assert!(out.metallic >= 0.0 && out.metallic <= 1.0);
    }

    #[test]
    fn maps_glossiness_to_roughness() {
        let mut source = create_specular_glossiness_pbr_material(None);
        source.glossiness = 0.75;
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert!((out.roughness - 0.25).abs() < 1e-6);
    }

    #[test]
    fn preserves_emissive_and_occlusion() {
        let mut source = create_specular_glossiness_pbr_material(None);
        source.emissive = 0xff0000ff;
        source.emissive_strength = 2.0;
        source.normal_scale = 0.5;
        source.occlusion_strength = 0.8;
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert_eq!(out.emissive, 0xff0000ff);
        assert_eq!(out.emissive_strength, 2.0);
        assert_eq!(out.normal_scale, 0.5);
        assert_eq!(out.occlusion_strength, 0.8);
    }
}

mod create_specular_glossiness_pbr_material {
    use super::*;

    #[test]
    fn creates_with_correct_defaults() {
        let m = create_specular_glossiness_pbr_material(None);
        assert_eq!(m.kind, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.glossiness, 1.0);
        assert_eq!(m.emissive, 0x000000ff);
    }
}

mod create_standard_pbr_material {
    use super::*;

    #[test]
    fn creates_white_fully_rough_dielectric() {
        let m = create_standard_pbr_material(None);
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

mod create_standard_pbr_material_properties {
    use super::*;

    #[test]
    fn creates_property_block_with_defaults() {
        let p = create_standard_pbr_material_properties(None);
        assert_eq!(p.base_color, 0xffffffff);
        assert_eq!(p.metallic, 0.0);
        assert_eq!(p.roughness, 1.0);
        assert_eq!(p.emissive, 0x000000ff);
        assert_eq!(p.emissive_strength, 1.0);
        assert_eq!(p.normal_scale, 1.0);
        assert_eq!(p.occlusion_strength, 1.0);
    }
}

mod report_material_conversion_drop {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn invokes_the_guard_when_set() {
        let called = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        let guard: MaterialConversionGuard = Box::new(move |_explanation, _conversion| {
            *called_clone.lock().unwrap() = true;
        });
        set_material_conversion_guard(Some(guard));
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["test_map".to_string()],
            reason: Some(MaterialConversionDropReason::UnsupportedByTargetModel),
        };
        report_material_conversion_drop(&explanation, "test_conversion");
        assert!(*called.lock().unwrap());
        set_material_conversion_guard(None);
    }

    #[test]
    fn does_nothing_when_no_guard() {
        set_material_conversion_guard(None);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec![],
            reason: None,
        };
        report_material_conversion_drop(&explanation, "test_conversion");
    }
}

mod set_material_conversion_guard {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn sets_and_clears_guard() {
        let called = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        let guard: MaterialConversionGuard = Box::new(move |_explanation, _conversion| {
            *called_clone.lock().unwrap() = true;
        });
        set_material_conversion_guard(Some(guard));

        let explanation = MaterialConversionExplanation {
            dropped_maps: vec![],
            reason: None,
        };
        report_material_conversion_drop(&explanation, "test");
        assert!(*called.lock().unwrap());

        set_material_conversion_guard(None);
        *called.lock().unwrap() = false;
        report_material_conversion_drop(&explanation, "test");
        assert!(!*called.lock().unwrap());
    }
}

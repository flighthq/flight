use flight_materials::pbr_materials::*;
use flight_materials::*;

mod convert_specular_glossiness_to_standard_pbr {
    use super::*;

    #[test]
    fn converts_default_specular_glossiness_to_standard() {
        let source = create_specular_glossiness_pbr_material();
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source, None);
        assert!(out.roughness >= 0.0 && out.roughness <= 1.0);
        assert!(out.metallic >= 0.0 && out.metallic <= 1.0);
    }

    #[test]
    fn maps_glossiness_to_roughness() {
        let mut source = create_specular_glossiness_pbr_material();
        source.glossiness = 0.75;
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source, None);
        assert!((out.roughness - 0.25).abs() < 1e-6);
    }

    #[test]
    fn preserves_emissive_and_occlusion() {
        let mut source = create_specular_glossiness_pbr_material();
        source.emissive = 0xff0000ff;
        source.emissive_strength = 2.0;
        source.normal_scale = 0.5;
        source.occlusion_strength = 0.8;
        let mut out = create_standard_pbr_material_properties(None);
        convert_specular_glossiness_to_standard_pbr(&mut out, &source, None);
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
        let m = create_specular_glossiness_pbr_material();
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

mod initialize_specular_glossiness_pbr_material {
    use super::*;

    // D23 (I): the public construction seam of create_specular_glossiness_pbr_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_specular_glossiness_pbr_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_specular_glossiness_pbr_material(&mut out);
        let fresh = create_specular_glossiness_pbr_material();
        assert_eq!(out.kind, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_standard_pbr_material {
    use super::*;

    // D23 (I): the public construction seam of create_standard_pbr_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_standard_pbr_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_standard_pbr_material(&mut out);
        let fresh = create_standard_pbr_material();
        assert_eq!(out.kind, STANDARD_PBR_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod material_conversion_context {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn independent_contexts_track_separately() {
        let calls_a = Arc::new(Mutex::new(Vec::<String>::new()));
        let calls_b = Arc::new(Mutex::new(Vec::<String>::new()));
        let ca = calls_a.clone();
        let cb = calls_b.clone();
        let ctx_a = create_material_conversion_context(Arc::new(move |_, conversion| {
            ca.lock().unwrap().push(conversion.to_string());
        }));
        let ctx_b = create_material_conversion_context(Arc::new(move |_, conversion| {
            cb.lock().unwrap().push(conversion.to_string());
        }));
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx_a), &explanation, "conv_a");
        report_material_conversion_drop(Some(&ctx_b), &explanation, "conv_b");
        assert_eq!(*calls_a.lock().unwrap(), vec!["conv_a"]);
        assert_eq!(*calls_b.lock().unwrap(), vec!["conv_b"]);
    }

    #[test]
    fn replacement_is_a_new_context() {
        let calls = Arc::new(Mutex::new(0u32));
        let c1 = calls.clone();
        let ctx1 = create_material_conversion_context(Arc::new(move |_, _| {
            *c1.lock().unwrap() += 1;
        }));
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["m".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx1), &explanation, "t");
        assert_eq!(*calls.lock().unwrap(), 1);
        let c2 = calls.clone();
        let ctx2 = create_material_conversion_context(Arc::new(move |_, _| {
            *c2.lock().unwrap() += 10;
        }));
        report_material_conversion_drop(Some(&ctx2), &explanation, "t");
        assert_eq!(*calls.lock().unwrap(), 11);
    }

    #[test]
    fn disabled_default_is_none_context() {
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["m".to_string()],
            reason: None,
        };
        report_material_conversion_drop(None, &explanation, "test");
    }
}

mod report_material_conversion_drop {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn invokes_the_guard_when_context_provided() {
        let called = Arc::new(Mutex::new(false));
        let called_clone = called.clone();
        let guard: MaterialConversionGuard = Arc::new(move |_explanation, _conversion| {
            *called_clone.lock().unwrap() = true;
        });
        let ctx = create_material_conversion_context(guard);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["test_map".to_string()],
            reason: Some(MaterialConversionDropReason::UnsupportedByTargetModel),
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test_conversion");
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn does_nothing_when_no_context() {
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec![],
            reason: None,
        };
        report_material_conversion_drop(None, &explanation, "test_conversion");
    }
}

mod set_material_conversion_guard {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn wraps_custom_guard_in_context() {
        let called = Arc::new(Mutex::new(false));
        let c = called.clone();
        let guard: MaterialConversionGuard = Arc::new(move |_, _| {
            *c.lock().unwrap() = true;
        });
        let ctx = set_material_conversion_guard(Some(guard));
        assert!(ctx.is_some());
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["m".to_string()],
            reason: None,
        };
        report_material_conversion_drop(ctx.as_ref(), &explanation, "test");
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn returns_none_for_none() {
        let ctx = set_material_conversion_guard(None);
        assert!(ctx.is_none());
    }
}

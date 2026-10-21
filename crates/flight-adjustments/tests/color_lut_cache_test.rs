use std::sync::{Arc, RwLock};

use flight_adjustments::contract::*;
use flight_entity::Ref;
use flight_entity::allocate_entity;

fn to_adjustment_ref<T: Adjustment + 'static>(adjustment: T) -> Ref<dyn Adjustment> {
    return Arc::new(RwLock::new(adjustment));
}

mod bake_color_lut_for_run {
    use super::*;

    #[test]
    fn reuses_the_same_lut_for_a_content_identical_run() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(30.0), saturation: Some(0.5), lightness: Some(0.0) })))];
        let first = bake_color_lut_for_run(&mut cache, &run1, Some(8));
        assert!(cache.lut.is_some());
        assert_eq!(cache.lut.as_ref().unwrap().samples, first.samples);
        let run2: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(30.0), saturation: Some(0.5), lightness: Some(0.0) })))];
        let second = bake_color_lut_for_run(&mut cache, &run2, Some(8));
        assert_eq!(second.samples, first.samples);
        assert_eq!(cache.lut.as_ref().unwrap().samples, second.samples);
        assert!(cache.signature.is_some());
    }

    #[test]
    fn re_bakes_into_a_new_lut_when_an_op_param_changes() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(0.4), lightness: Some(0.0) })))];
        let first = bake_color_lut_for_run(&mut cache, &run1, Some(8));
        let run2: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(0.8), lightness: Some(0.0) })))];
        let changed = bake_color_lut_for_run(&mut cache, &run2, Some(8));
        assert_ne!(changed.samples, first.samples);
    }

    #[test]
    fn re_keys_when_the_lut_size_changes() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(0.4), lightness: Some(0.0) })))];
        let small = bake_color_lut_for_run(&mut cache, &run1, Some(8));
        let run2: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(0.0), saturation: Some(0.4), lightness: Some(0.0) })))];
        let large = bake_color_lut_for_run(&mut cache, &run2, Some(16));
        assert_ne!(large.samples.len(), small.samples.len());
        assert_eq!(large.size, 16);
    }

    #[test]
    fn bakes_byte_for_byte_the_same_samples_as_uncached() {
        let mut cache = create_color_lut_cache();
        let run: Vec<Ref<dyn Adjustment>> = vec![
            to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(45.0), saturation: Some(1.0), lightness: Some(0.0) }))),
            to_adjustment_ref(create_color_grade_adjustment(Some(&ColorGradeAdjustmentOptions { exposure: Some(0.0), brightness: Some(0.0), contrast: Some(1.2), saturation: Some(1.0), temperature: Some(0.0), tint: Some(0.0), lift: Some(0x000000ff), gamma: Some(0x808080ff), gain: Some(0xffffffff) }))),
        ];
        let cached = bake_color_lut_for_run(&mut cache, &run, Some(8));
        let transforms: Vec<ColorTransformFunction> = run.iter().map(|a| get_adjustment_color_transform(&*a.read().unwrap()).unwrap()).collect();
        let uncached = bake_color_lut(&transforms, Some(8));
        assert_eq!(cached.size, uncached.size);
        assert_eq!(cached.samples, uncached.samples);
    }

    #[test]
    fn bakes_an_empty_run_into_an_identity_lut_and_caches_it() {
        let mut cache = create_color_lut_cache();
        let lut = bake_color_lut_for_run(&mut cache, &[], Some(4));
        assert_eq!(lut.size, 4);
        let lut2 = bake_color_lut_for_run(&mut cache, &[], Some(4));
        assert_eq!(lut2.samples, lut.samples);
    }

    #[test]
    fn re_bakes_after_an_in_place_mutation_of_a_color_matrix() {
        let mut cache = create_color_lut_cache();
        let adjustment = std::sync::Arc::new(std::sync::RwLock::new(create_color_matrix_adjustment(create_identity_color_matrix())));
        let run: Vec<Ref<dyn Adjustment>> = vec![adjustment.clone()];
        let before = bake_color_lut_for_run(&mut cache, &run, Some(4));
        adjustment.write().unwrap().color_matrix = Some(create_invert_color_matrix());
        let after = bake_color_lut_for_run(&mut cache, &run, Some(4));
        assert_ne!(after.samples, before.samples);
    }

    #[test]
    fn re_keys_when_a_kind_field_is_mutated_but_keeps_the_captured_transform() {
        // TS: the LUT-tier transform closes over its options at initialize time; JSON.stringify(run)
        // still observes the mutated field, so the cache re-keys and re-bakes the same transform.
        let mut cache = create_color_lut_cache();
        let adjustment = std::sync::Arc::new(std::sync::RwLock::new(create_hue_saturation_adjustment(None)));
        let run: Vec<Ref<dyn Adjustment>> = vec![adjustment.clone()];
        let before = bake_color_lut_for_run(&mut cache, &run, Some(4));
        let first_signature = cache.signature.clone();
        adjustment.write().unwrap().hue = 90.0;
        let after = bake_color_lut_for_run(&mut cache, &run, Some(4));
        assert_ne!(cache.signature, first_signature);
        assert_eq!(after.samples, before.samples);
    }

    #[test]
    fn keys_on_size_and_the_json_content_of_the_run() {
        let mut cache = create_color_lut_cache();
        let run: Vec<Ref<dyn Adjustment>> = vec![to_adjustment_ref(create_hue_saturation_adjustment(Some(&HueSaturationAdjustmentOptions { hue: Some(45.0), saturation: None, lightness: None })))];
        bake_color_lut_for_run(&mut cache, &run, Some(4));
        assert_eq!(cache.signature.as_deref(), Some("4\n[{\"kind\":\"HueSaturationAdjustment\",\"hue\":45,\"saturation\":1,\"lightness\":0}]"));
    }
}

mod create_color_lut_cache {
    use super::*;

    #[test]
    fn starts_empty() {
        let cache = create_color_lut_cache();
        assert!(cache.signature.is_none());
        assert!(cache.lut.is_none());
    }
}

mod initialize_color_lut_cache {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_color_lut_cache() {
        let mut cache: ColorLutCache = allocate_entity();
        initialize_color_lut_cache(&mut cache);
        assert!(cache.signature.is_none());
        assert!(cache.lut.is_none());
    }
}

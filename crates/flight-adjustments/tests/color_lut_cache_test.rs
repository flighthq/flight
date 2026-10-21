use flight_adjustments::contract::*;
use flight_entity::allocate_entity;

mod bake_color_lut_for_run {
    use super::*;

    #[test]
    fn reuses_the_same_lut_for_a_content_identical_run() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(30.0, 0.5, 0.0))];
        let first = bake_color_lut_for_run(&mut cache, &run1, 8);
        let run2: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(30.0, 0.5, 0.0))];
        let second = bake_color_lut_for_run(&mut cache, &run2, 8);
        assert_eq!(second.samples, first.samples);
        assert!(cache.lut.is_some());
        assert!(cache.signature.is_some());
    }

    #[test]
    fn re_bakes_into_a_new_lut_when_an_op_param_changes() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 0.4, 0.0))];
        let first = bake_color_lut_for_run(&mut cache, &run1, 8);
        let run2: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 0.8, 0.0))];
        let changed = bake_color_lut_for_run(&mut cache, &run2, 8);
        assert_ne!(changed.samples, first.samples);
    }

    #[test]
    fn re_keys_when_the_lut_size_changes() {
        let mut cache = create_color_lut_cache();
        let run1: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 0.4, 0.0))];
        let small = bake_color_lut_for_run(&mut cache, &run1, 8);
        let run2: Vec<Adjustment> = vec![Adjustment::HueSaturation(create_hue_saturation_adjustment(0.0, 0.4, 0.0))];
        let large = bake_color_lut_for_run(&mut cache, &run2, 16);
        assert_ne!(large.samples.len(), small.samples.len());
        assert_eq!(large.size, 16);
    }

    #[test]
    fn bakes_byte_for_byte_the_same_samples_as_uncached() {
        let mut cache = create_color_lut_cache();
        let run: Vec<Adjustment> = vec![
            Adjustment::HueSaturation(create_hue_saturation_adjustment(45.0, 1.0, 0.0)),
            Adjustment::ColorGrade(create_color_grade_adjustment(0.0, 0.0, 1.2, 1.0, 0.0, 0.0, 0x000000ff, 0x808080ff, 0xffffffff)),
        ];
        let cached = bake_color_lut_for_run(&mut cache, &run, 8);
        let uncached = bake_color_lut(&run, 8);
        assert_eq!(cached.size, uncached.size);
        assert_eq!(cached.samples, uncached.samples);
    }

    #[test]
    fn bakes_an_empty_run_into_an_identity_lut_and_caches_it() {
        let mut cache = create_color_lut_cache();
        let lut = bake_color_lut_for_run(&mut cache, &[], 4);
        assert_eq!(lut.size, 4);
        let lut2 = bake_color_lut_for_run(&mut cache, &[], 4);
        assert_eq!(lut2.samples, lut.samples);
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

use super::*;

mod compute_bloom_blur_radius {
    use super::*;

    #[test]
    fn defaults_to_eight_when_radius_is_unset() {
        assert_eq!(
            compute_bloom_blur_radius(&create_bloom_effect().read().unwrap()),
            8.0
        );
    }

    #[test]
    fn clamps_negative_radius_to_zero() {
        let effect = create_bloom_effect();
        effect.write().unwrap().radius = Some(-4.0);
        assert_eq!(compute_bloom_blur_radius(&effect.read().unwrap()), 0.0);
    }
}

mod compute_bloom_intensity {
    use super::*;

    #[test]
    fn defaults_to_one_when_intensity_is_unset() {
        assert_eq!(
            compute_bloom_intensity(&create_bloom_effect().read().unwrap()),
            1.0
        );
    }

    #[test]
    fn passes_through_an_explicit_intensity() {
        let effect = create_bloom_effect();
        effect.write().unwrap().intensity = Some(2.5);
        assert_eq!(compute_bloom_intensity(&effect.read().unwrap()), 2.5);
    }
}

mod compute_bloom_threshold {
    use super::*;

    #[test]
    fn defaults_to_point_eight_when_threshold_is_unset() {
        assert_eq!(
            compute_bloom_threshold(&create_bloom_effect().read().unwrap()),
            0.8
        );
    }

    #[test]
    fn passes_through_an_explicit_threshold() {
        let effect = create_bloom_effect();
        effect.write().unwrap().threshold = Some(0.25);
        assert_eq!(compute_bloom_threshold(&effect.read().unwrap()), 0.25);
    }
}

mod create_bloom_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_bloom_effect();
        let mut guard = effect.write().unwrap();
        guard.threshold = Some(0.5);
        guard.intensity = Some(2.0);
        assert_eq!(guard.threshold, Some(0.5));
        assert_eq!(guard.intensity, Some(2.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_bloom_effect(), "BloomEffect");
    }
}

mod get_bloom_effect_padding {
    use super::*;

    #[test]
    fn uses_a_three_sigma_footprint_for_the_blurred_bright_branch() {
        let effect = create_bloom_effect();
        effect.write().unwrap().radius = Some(2.0);
        let mut out = zero_padding();
        get_bloom_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 6.0,
                left: 6.0,
                right: 6.0,
                top: 6.0
            }
        );
    }
}

mod initialize_bloom_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_bloom_effect() {
        let mut effect: BloomEffect = flight_entity::allocate_entity();
        initialize_bloom_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BloomEffect");
    }
}

mod register_bloom_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_bloom_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_bloom_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "BloomEffect"));
        assert!(!has_padding_resolver(&other, "BloomEffect"));
    }
}

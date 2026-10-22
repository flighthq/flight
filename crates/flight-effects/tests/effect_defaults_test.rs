use super::*;

#[derive(Default)]
struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

fn number(defaults: &EffectDefaults, key: &str) -> f32 {
    let Some(EffectValue::Number(value)) = defaults.get(key) else {
        panic!("missing numeric default {key}");
    };
    return *value;
}

fn text(defaults: &EffectDefaults, key: &str) -> String {
    let Some(EffectValue::Text(value)) = defaults.get(key) else {
        panic!("missing text default {key}");
    };
    return value.clone();
}

mod get_effect_defaults {
    use super::*;

    #[test]
    fn returns_documented_defaults_for_bloom_effect() {
        let mut defaults = EffectDefaults::new();
        get_effect_defaults(&mut defaults, "BloomEffect");
        assert_eq!(number(&defaults, "brightness"), 1.0);
        assert_eq!(number(&defaults, "threshold"), 0.8);
        assert_eq!(number(&defaults, "thresholdKnee"), 0.5);
        assert_eq!(number(&defaults, "radius"), 8.0);
        assert_eq!(number(&defaults, "passes"), 1.0);
    }

    #[test]
    fn returns_documented_defaults_for_tone_map_effect() {
        let mut defaults = EffectDefaults::new();
        get_effect_defaults(&mut defaults, "ToneMapEffect");
        assert_eq!(text(&defaults, "operator"), "aces");
        assert_eq!(number(&defaults, "exposure"), 0.0);
    }

    #[test]
    fn returns_empty_map_for_unknown_kind() {
        let mut defaults = EffectDefaults::new();
        get_effect_defaults(&mut defaults, "acme.UnknownEffect");
        assert!(defaults.is_empty());
    }

    #[test]
    fn returns_fresh_values_each_call() {
        let mut first = EffectDefaults::new();
        let mut second = EffectDefaults::new();
        get_effect_defaults(&mut first, "BloomEffect");
        get_effect_defaults(&mut second, "BloomEffect");
        first.insert("threshold".to_string(), EffectValue::Number(99.0));
        assert_eq!(number(&second, "threshold"), 0.8);
    }

    #[test]
    fn returns_source_mode_draw_for_composite_source_mode_effects() {
        for kind in [
            "DropShadowEffect",
            "OuterGlowEffect",
            "InnerGlowEffect",
            "InnerShadowEffect",
            "BevelEffect",
            "GradientGlowEffect",
            "GradientBevelEffect",
        ] {
            let mut defaults = EffectDefaults::new();
            get_effect_defaults(&mut defaults, kind);
            assert_eq!(text(&defaults, "sourceMode"), "draw");
        }
    }
}

mod normalize_effect {
    use super::*;

    #[test]
    fn carries_over_fields_not_in_the_defaults_table() {
        let effect = create_vignette_effect();
        effect.write().unwrap().intensity = Some(0.3);
        let out = create_vignette_effect();
        assert!(normalize_effect(
            &effect_ref(effect),
            &effect_ref(out.clone())
        ));
        let guard = out.read().unwrap();
        assert_eq!(guard.intensity, Some(0.3));
        assert_eq!(guard.radius, Some(1.0));
        assert_eq!(guard.softness, Some(0.5));
    }

    #[test]
    fn fills_missing_fields_from_defaults() {
        let effect = create_bloom_effect();
        effect.write().unwrap().threshold = Some(0.9);
        let out = create_bloom_effect();
        assert!(normalize_effect(
            &effect_ref(effect),
            &effect_ref(out.clone())
        ));
        let guard = out.read().unwrap();
        assert_eq!(guard.threshold, Some(0.9));
        assert_eq!(guard.radius, Some(8.0));
        assert_eq!(
            guard.get_effect_field("brightness"),
            Some(EffectValue::Number(1.0))
        );
    }

    #[test]
    fn is_alias_safe_when_out_is_effect() {
        let effect = create_tone_map_effect();
        effect.write().unwrap().exposure = Some(1.0);
        let erased = effect_ref(effect.clone());
        assert!(normalize_effect(&erased, &erased));
        let guard = effect.read().unwrap();
        assert_eq!(guard.exposure, Some(1.0));
        assert_eq!(guard.operator, Some(ToneMapOperator::Aces));
    }

    #[test]
    fn preserves_explicitly_set_zero() {
        let effect = create_bloom_effect();
        effect.write().unwrap().threshold = Some(0.0);
        let out = create_bloom_effect();
        normalize_effect(&effect_ref(effect), &effect_ref(out.clone()));
        assert_eq!(out.read().unwrap().threshold, Some(0.0));
    }

    #[test]
    fn returns_false_for_unknown_kind() {
        let mut source: TestEffect = flight_entity::allocate_entity();
        let mut target: TestEffect = flight_entity::allocate_entity();
        initialize_effect(&mut source, "acme.UnknownEffect");
        initialize_effect(&mut target, "acme.UnknownEffect");
        assert!(!normalize_effect(
            &owned_effect(source),
            &owned_effect(target)
        ));
    }
}

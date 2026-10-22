use super::*;

mod create_median_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_median_effect();
        assert_effect_kind(&effect, "MedianEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_median_effect();
        let mut guard = effect.write().unwrap();
        guard.radius = Some(2.0);
        assert_eq!(guard.radius, Some(2.0));
    }
}

mod get_median_effect_padding {
    use super::*;

    #[test]
    fn uses_the_rounded_neighborhood_radius_on_every_side() {
        let effect = create_median_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.radius = Some(1.6);
        }
        let mut out = zero_padding();
        get_median_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 2.0,
                left: 2.0,
                right: 2.0,
                top: 2.0
            }
        );
    }
}

mod initialize_median_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_median_effect() {
        let mut effect: MedianEffect = flight_entity::allocate_entity();
        initialize_median_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "MedianEffect");
    }
}

mod register_median_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_median_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "MedianEffect"));
        assert!(!has_padding_resolver(&other, "MedianEffect"));
    }
}

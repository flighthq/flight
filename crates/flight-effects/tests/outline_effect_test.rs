use super::*;

mod create_outline_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_outline_effect();
        assert_effect_kind(&effect, "OutlineEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_outline_effect();
        let mut guard = effect.write().unwrap();
        guard.threshold = Some(0.2);
        guard.thickness = Some(1.5);
        guard.color = Some(0x000000ff);
        assert_eq!(guard.threshold, Some(0.2));
        assert_eq!(guard.thickness, Some(1.5));
        assert_eq!(guard.color, Some(0x000000ff));
    }
}

mod get_outline_effect_padding {
    use super::*;

    #[test]
    fn uses_the_sobel_sampling_thickness_on_every_side() {
        let effect = create_outline_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.thickness = Some(1.5);
        }
        let mut out = zero_padding();
        get_outline_effect_padding(&mut out, &effect.read().unwrap());
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

mod initialize_outline_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_outline_effect() {
        let mut effect: OutlineEffect = flight_entity::allocate_entity();
        initialize_outline_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "OutlineEffect");
    }
}

mod register_outline_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_outline_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "OutlineEffect"));
        assert!(!has_padding_resolver(&other, "OutlineEffect"));
    }
}

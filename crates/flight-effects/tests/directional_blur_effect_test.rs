use super::*;

mod create_directional_blur_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_directional_blur_effect();
        assert_effect_kind(&effect, "DirectionalBlurEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_directional_blur_effect();
        let mut guard = effect.write().unwrap();
        guard.angle = Some(1.0);
        guard.length = Some(8.0);
        assert_eq!(guard.angle, Some(1.0));
        assert_eq!(guard.length, Some(8.0));
    }
}

mod get_directional_blur_effect_padding {
    use super::*;

    #[test]
    fn projects_the_centered_half_length_onto_both_axes() {
        let effect = create_directional_blur_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.angle = Some(90.0);
            guard.length = Some(9.0);
        }
        let mut out = zero_padding();
        get_directional_blur_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 5.0,
                left: 0.0,
                right: 0.0,
                top: 5.0
            }
        );
    }
}

mod initialize_directional_blur_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_directional_blur_effect() {
        let mut effect: DirectionalBlurEffect = flight_entity::allocate_entity();
        initialize_directional_blur_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "DirectionalBlurEffect");
    }
}

mod register_directional_blur_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_directional_blur_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "DirectionalBlurEffect"));
        assert!(!has_padding_resolver(&other, "DirectionalBlurEffect"));
    }
}

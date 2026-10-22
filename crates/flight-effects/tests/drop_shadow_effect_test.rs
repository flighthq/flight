use super::*;

mod create_drop_shadow_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_drop_shadow_effect();
        assert_effect_kind(&effect, "DropShadowEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_drop_shadow_effect();
        let mut guard = effect.write().unwrap();
        guard.source_mode = Some(EffectSourceMode::Knockout);
        guard.strength = Some(2.0);
        assert_eq!(guard.source_mode, Some(EffectSourceMode::Knockout));
        assert_eq!(guard.strength, Some(2.0));
    }
}

mod get_drop_shadow_effect_padding {
    use super::*;

    #[test]
    fn adds_the_offset_only_to_the_reached_side_of_the_gaussian_footprint() {
        let effect = create_drop_shadow_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.angle = Some(0.0);
            guard.blur_x = Some(2.0);
            guard.blur_y = Some(3.0);
            guard.distance = Some(5.0);
        }
        let mut out = zero_padding();
        get_drop_shadow_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 9.0,
                left: 6.0,
                right: 11.0,
                top: 9.0
            }
        );
    }
}

mod initialize_drop_shadow_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_drop_shadow_effect() {
        let mut effect: DropShadowEffect = flight_entity::allocate_entity();
        initialize_drop_shadow_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "DropShadowEffect");
    }
}

mod register_drop_shadow_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_drop_shadow_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "DropShadowEffect"));
        assert!(!has_padding_resolver(&other, "DropShadowEffect"));
    }
}

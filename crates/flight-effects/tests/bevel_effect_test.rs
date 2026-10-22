use super::*;

mod create_bevel_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_bevel_effect();
        assert_effect_kind(&effect, "BevelEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_bevel_effect();
        let mut guard = effect.write().unwrap();
        guard.source_mode = Some(EffectSourceMode::Knockout);
        guard.strength = Some(2.0);
        assert_eq!(guard.source_mode, Some(EffectSourceMode::Knockout));
        assert_eq!(guard.strength, Some(2.0));
    }
}

mod get_bevel_effect_padding {
    use super::*;

    #[test]
    fn adds_the_directional_offset_only_to_the_reached_sides_of_the_gaussian_footprint() {
        let effect = create_bevel_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.angle = Some(180.0);
            guard.blur_x = Some(2.0);
            guard.blur_y = Some(3.0);
            guard.distance = Some(5.0);
        }
        let mut out = zero_padding();
        get_bevel_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 9.0,
                left: 11.0,
                right: 6.0,
                top: 9.0
            }
        );
    }
}

mod initialize_bevel_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_bevel_effect() {
        let mut effect: BevelEffect = flight_entity::allocate_entity();
        initialize_bevel_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BevelEffect");
    }
}

mod register_bevel_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_bevel_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "BevelEffect"));
        assert!(!has_padding_resolver(&other, "BevelEffect"));
    }
}

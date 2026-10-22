use super::*;

mod create_contact_shadows_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_contact_shadows_effect();
        let mut guard = effect.write().unwrap();
        guard.opacity = Some(0.8);
        guard.samples = Some(32.0);
        assert_eq!(guard.opacity, Some(0.8));
        assert_eq!(guard.samples, Some(32.0));
    }

    #[test]
    fn tags_the_intent_type() {
        let effect = create_contact_shadows_effect();
        assert_effect_kind(&effect, "ContactShadowsEffect");
    }
}

mod get_contact_shadows_effect_padding {
    use super::*;

    #[test]
    fn keeps_the_screen_space_depth_treatment_inside_the_current_target() {
        let effect = create_contact_shadows_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.distance = Some(8.0);
        }
        let mut out = zero_padding();
        get_contact_shadows_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 0.0,
                left: 0.0,
                right: 0.0,
                top: 0.0
            }
        );
    }
}

mod initialize_contact_shadows_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_contact_shadows_effect() {
        let mut effect: ContactShadowsEffect = flight_entity::allocate_entity();
        initialize_contact_shadows_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ContactShadowsEffect");
    }
}

mod register_contact_shadows_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_contact_shadows_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "ContactShadowsEffect"));
        assert!(!has_padding_resolver(&other, "ContactShadowsEffect"));
    }
}

use super::*;

mod create_blend_effect {
    use super::*;

    #[test]
    fn builds_a_blend_effect_carrying_the_requested_mode() {
        let effect = create_blend_effect();
        effect.write().unwrap().mode = ADVANCED_BLEND_MODE_OVERLAY.to_string();
        assert_effect_kind(&effect, "BlendEffect");
        assert_eq!(effect.read().unwrap().mode, ADVANCED_BLEND_MODE_OVERLAY);
    }

    #[test]
    fn spreads_backdrop_key_and_opacity_options() {
        let effect = create_blend_effect();
        let mut guard = effect.write().unwrap();
        guard.backdrop_key = Some("scene.backdrop".to_string());
        guard.opacity = Some(0.5);
        drop(guard);
        assert_eq!(
            effect.read().unwrap().backdrop_key.as_deref(),
            Some("scene.backdrop")
        );
        assert_eq!(effect.read().unwrap().opacity, Some(0.5));
    }

    #[test]
    fn leaves_optional_fields_unset_when_omitted() {
        let effect = create_blend_effect();
        assert_eq!(effect.read().unwrap().backdrop_key, None);
        assert_eq!(effect.read().unwrap().opacity, None);
    }
}

mod initialize_blend_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_blend_effect() {
        let mut effect: BlendEffect = flight_entity::allocate_entity();
        initialize_blend_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BlendEffect");
    }
}

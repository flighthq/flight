use super::*;

mod create_vignette_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_vignette_effect();
        effect.write().unwrap().color = Some(0x000000ff);
        assert_eq!(effect.read().unwrap().color, Some(0x000000ff));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_vignette_effect(), "VignetteEffect");
    }
}

mod initialize_vignette_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_vignette_effect() {
        let mut effect: VignetteEffect = flight_entity::allocate_entity();
        initialize_vignette_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "VignetteEffect");
    }
}

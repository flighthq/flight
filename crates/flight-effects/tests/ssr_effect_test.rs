use super::*;

mod create_ssr_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_ssr_effect();
        effect.write().unwrap().steps = Some(32.0);
        assert_eq!(effect.read().unwrap().steps, Some(32.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_ssr_effect(), "SsrEffect");
    }
}

mod initialize_ssr_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_ssr_effect() {
        let mut effect: SsrEffect = flight_entity::allocate_entity();
        initialize_ssr_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "SsrEffect");
    }
}

use super::*;

mod create_scanlines_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_scanlines_effect();
        effect.write().unwrap().count = Some(240.0);
        assert_eq!(effect.read().unwrap().count, Some(240.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_scanlines_effect(), "ScanlinesEffect");
    }
}

mod initialize_scanlines_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scanlines_effect() {
        let mut effect: ScanlinesEffect = flight_entity::allocate_entity();
        initialize_scanlines_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ScanlinesEffect");
    }
}

use super::*;

mod create_lens_dirt_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_lens_dirt_effect();
        effect.write().unwrap().threshold = Some(0.45);
        assert_eq!(effect.read().unwrap().threshold, Some(0.45));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_lens_dirt_effect(), "LensDirtEffect");
    }
}

mod initialize_lens_dirt_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_lens_dirt_effect() {
        let mut effect: LensDirtEffect = flight_entity::allocate_entity();
        initialize_lens_dirt_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "LensDirtEffect");
    }
}

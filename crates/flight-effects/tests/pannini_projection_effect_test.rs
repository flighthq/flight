use super::*;

mod create_pannini_projection_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_pannini_projection_effect();
        effect.write().unwrap().compression = Some(0.7);
        assert_eq!(effect.read().unwrap().compression, Some(0.7));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(
            &create_pannini_projection_effect(),
            "PanniniProjectionEffect",
        );
    }
}

mod initialize_pannini_projection_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_pannini_projection_effect() {
        let mut effect: PanniniProjectionEffect = flight_entity::allocate_entity();
        initialize_pannini_projection_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "PanniniProjectionEffect");
    }
}

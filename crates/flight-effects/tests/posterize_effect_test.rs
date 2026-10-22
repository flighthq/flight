use super::*;

mod create_posterize_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_posterize_effect();
        effect.write().unwrap().levels = Some(4.0);
        assert_eq!(effect.read().unwrap().levels, Some(4.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_posterize_effect(), "PosterizeEffect");
    }
}

mod initialize_posterize_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_posterize_effect() {
        let mut effect: PosterizeEffect = flight_entity::allocate_entity();
        initialize_posterize_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "PosterizeEffect");
    }
}

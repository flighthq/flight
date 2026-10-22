use super::*;

mod create_film_grain_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_film_grain_effect();
        effect.write().unwrap().seed = Some(7.0);
        assert_eq!(effect.read().unwrap().seed, Some(7.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_film_grain_effect(), "FilmGrainEffect");
    }
}

mod initialize_film_grain_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_film_grain_effect() {
        let mut effect: FilmGrainEffect = flight_entity::allocate_entity();
        initialize_film_grain_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "FilmGrainEffect");
    }
}

use super::*;

mod create_film_emulation_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_film_emulation_effect();
        effect.write().unwrap().grain_intensity = Some(0.2);
        assert_eq!(effect.read().unwrap().grain_intensity, Some(0.2));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_film_emulation_effect(), "FilmEmulationEffect");
    }
}

mod initialize_film_emulation_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_film_emulation_effect() {
        let mut effect: FilmEmulationEffect = flight_entity::allocate_entity();
        initialize_film_emulation_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "FilmEmulationEffect");
    }
}

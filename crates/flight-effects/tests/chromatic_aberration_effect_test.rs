use super::*;

mod create_chromatic_aberration_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_chromatic_aberration_effect();
        effect.write().unwrap().radial = Some(false);
        assert_eq!(effect.read().unwrap().radial, Some(false));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(
            &create_chromatic_aberration_effect(),
            "ChromaticAberrationEffect",
        );
    }
}

mod initialize_chromatic_aberration_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_chromatic_aberration_effect() {
        let mut effect: ChromaticAberrationEffect = flight_entity::allocate_entity();
        initialize_chromatic_aberration_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ChromaticAberrationEffect");
    }
}

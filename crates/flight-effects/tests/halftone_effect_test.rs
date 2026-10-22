use super::*;

mod create_halftone_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_halftone_effect();
        effect.write().unwrap().angle = Some(30.0);
        assert_eq!(effect.read().unwrap().angle, Some(30.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_halftone_effect(), "HalftoneEffect");
    }
}

mod initialize_halftone_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_halftone_effect() {
        let mut effect: HalftoneEffect = flight_entity::allocate_entity();
        initialize_halftone_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "HalftoneEffect");
    }
}

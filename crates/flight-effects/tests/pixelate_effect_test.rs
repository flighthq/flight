use super::*;

mod create_pixelate_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_pixelate_effect();
        effect.write().unwrap().size = Some(8.0);
        assert_eq!(effect.read().unwrap().size, Some(8.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_pixelate_effect(), "PixelateEffect");
    }
}

mod initialize_pixelate_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_pixelate_effect() {
        let mut effect: PixelateEffect = flight_entity::allocate_entity();
        initialize_pixelate_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "PixelateEffect");
    }
}

use super::*;

mod create_sharpen_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_sharpen_effect();
        effect.write().unwrap().amount = Some(0.6);
        assert_eq!(effect.read().unwrap().amount, Some(0.6));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_sharpen_effect(), "SharpenEffect");
    }
}

mod initialize_sharpen_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_sharpen_effect() {
        let mut effect: SharpenEffect = flight_entity::allocate_entity();
        initialize_sharpen_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "SharpenEffect");
    }
}

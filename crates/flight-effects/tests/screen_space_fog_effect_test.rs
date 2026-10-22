use super::*;

mod create_screen_space_fog_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_screen_space_fog_effect();
        effect.write().unwrap().color = Some(0xaabbccff);
        assert_eq!(effect.read().unwrap().color, Some(0xaabbccff));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_screen_space_fog_effect(), "ScreenSpaceFogEffect");
    }
}

mod initialize_screen_space_fog_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_screen_space_fog_effect() {
        let mut effect: ScreenSpaceFogEffect = flight_entity::allocate_entity();
        initialize_screen_space_fog_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ScreenSpaceFogEffect");
    }
}

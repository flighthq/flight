use super::*;

mod create_lens_flare_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_lens_flare_effect();
        effect.write().unwrap().ghosts = Some(4.0);
        assert_eq!(effect.read().unwrap().ghosts, Some(4.0));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_lens_flare_effect(), "LensFlareEffect");
    }
}

mod initialize_lens_flare_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_lens_flare_effect() {
        let mut effect: LensFlareEffect = flight_entity::allocate_entity();
        initialize_lens_flare_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "LensFlareEffect");
    }
}

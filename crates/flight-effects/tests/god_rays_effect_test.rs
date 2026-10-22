use super::*;

mod create_god_rays_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_god_rays_effect();
        effect.write().unwrap().center_y = Some(0.25);
        assert_eq!(effect.read().unwrap().center_y, Some(0.25));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_god_rays_effect(), "GodRaysEffect");
    }
}

mod initialize_god_rays_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_god_rays_effect() {
        let mut effect: GodRaysEffect = flight_entity::allocate_entity();
        initialize_god_rays_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "GodRaysEffect");
    }
}

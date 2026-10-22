use super::*;

mod create_motion_blur_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_motion_blur_effect();
        effect.write().unwrap().intensity = Some(0.8);
        assert_eq!(effect.read().unwrap().intensity, Some(0.8));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_motion_blur_effect(), "MotionBlurEffect");
    }
}

mod initialize_motion_blur_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_motion_blur_effect() {
        let mut effect: MotionBlurEffect = flight_entity::allocate_entity();
        initialize_motion_blur_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "MotionBlurEffect");
    }
}

use super::*;

mod create_camera_motion_blur_effect {
    use super::*;

    #[test]
    fn carries_options() {
        let effect = create_camera_motion_blur_effect();
        effect.write().unwrap().intensity = Some(0.5);
        assert_eq!(effect.read().unwrap().intensity, Some(0.5));
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(
            &create_camera_motion_blur_effect(),
            "CameraMotionBlurEffect",
        );
    }
}

mod initialize_camera_motion_blur_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_camera_motion_blur_effect() {
        let mut effect: CameraMotionBlurEffect = flight_entity::allocate_entity();
        initialize_camera_motion_blur_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "CameraMotionBlurEffect");
    }
}

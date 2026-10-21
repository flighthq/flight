use flight_camera_controls::contract::*;

mod option_defaults {
    use super::*;

    #[test]
    fn shake_options_keep_every_override_optional() {
        let options = CameraShakeOptions {
            decay: None,
            frequency: None,
            rotation_amplitude: None,
            translation_amplitude: None,
        };
        assert!(options.decay.is_none());
        assert!(options.frequency.is_none());
    }

    #[test]
    fn fly_options_keep_every_override_optional() {
        let options = FlyCameraControllerOptions {
            max_pitch: None,
            min_pitch: None,
            pitch: None,
            position: None,
            smooth_time: None,
            yaw: None,
        };
        assert!(options.position.is_none());
        assert!(options.smooth_time.is_none());
    }

    #[test]
    fn orbit_options_keep_every_override_optional() {
        let options = OrbitCameraControllerOptions {
            azimuth: None,
            distance: None,
            max_distance: None,
            max_polar: None,
            min_distance: None,
            min_polar: None,
            polar: None,
            smooth_time: None,
            target: None,
        };
        assert!(options.target.is_none());
        assert!(options.min_distance.is_none());
    }

    #[test]
    fn controller_types_are_entities() {
        fn assert_entity<T: flight_entity::Entity>() {}
        assert_entity::<CameraShake>();
        assert_entity::<CameraShakeOffset>();
        assert_entity::<FlyCameraController>();
        assert_entity::<OrbitCameraController>();
    }
}

use flight_camera_controls::contract::*;

use crate::test_support::*;

mod add_camera_shake_trauma {
    use super::*;

    #[test]
    fn accumulates_trauma_clamped_to_one() {
        let mut shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut shake, 0.3);
        assert_eq!(shake.trauma, 0.3);
        add_camera_shake_trauma(&mut shake, 0.5);
        assert_close(shake.trauma, 0.8);
        add_camera_shake_trauma(&mut shake, 0.5);
        assert_eq!(shake.trauma, 1.0);
    }

    #[test]
    fn does_not_go_below_zero() {
        let mut shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut shake, -1.0);
        assert_eq!(shake.trauma, 0.0);
    }
}

mod create_camera_shake {
    use super::*;

    #[test]
    fn creates_with_default_values() {
        let shake = create_camera_shake(None);
        assert_eq!(shake.trauma, 0.0);
        assert_eq!(shake.decay, 1.5);
        assert_eq!(shake.frequency, 15.0);
        assert_eq!(shake.translation_amplitude, 0.5);
        assert_eq!(shake.rotation_amplitude, 3.0);
        assert_eq!(shake.time, 0.0);
    }

    #[test]
    fn accepts_custom_options() {
        let options = CameraShakeOptions {
            decay: Some(2.0),
            frequency: Some(20.0),
            rotation_amplitude: Some(5.0),
            translation_amplitude: Some(1.0),
        };
        let shake = create_camera_shake(Some(&options));
        assert_eq!(shake.decay, 2.0);
        assert_eq!(shake.frequency, 20.0);
        assert_eq!(shake.translation_amplitude, 1.0);
        assert_eq!(shake.rotation_amplitude, 5.0);
    }
}

mod create_camera_shake_offset {
    use super::*;

    #[test]
    fn creates_a_zeroed_offset() {
        let out = create_camera_shake_offset();
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.rotation_x, 0.0);
        assert_eq!(out.rotation_y, 0.0);
        assert_eq!(out.rotation_z, 0.0);
    }
}

mod initialize_camera_shake {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_camera_shake() {
        let mut shake = flight_entity::allocate_entity::<CameraShake>();
        initialize_camera_shake(&mut shake, None);
        assert_eq!(shake.decay, 1.5);
        assert_eq!(shake.time, 0.0);
    }
}

mod initialize_camera_shake_offset {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_camera_shake_offset() {
        let mut out = flight_entity::allocate_entity::<CameraShakeOffset>();
        initialize_camera_shake_offset(&mut out);
        assert_eq!(out.rotation_x, 0.0);
    }
}

mod reset_camera_shake {
    use super::*;

    #[test]
    fn zeros_trauma_and_time() {
        let mut shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut shake, 0.8);
        let mut out = create_camera_shake_offset();
        update_camera_shake(&mut shake, 0.1, &mut out);
        assert!(shake.trauma > 0.0);
        assert!(shake.time > 0.0);
        reset_camera_shake(&mut shake);
        assert_eq!(shake.trauma, 0.0);
        assert_eq!(shake.time, 0.0);
    }
}

mod update_camera_shake {
    use super::*;

    #[test]
    fn produces_zero_offset_when_trauma_is_zero() {
        let mut shake = create_camera_shake(None);
        let mut out = create_camera_shake_offset();
        update_camera_shake(&mut shake, 1.0 / 60.0, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.rotation_x, 0.0);
        assert_eq!(out.rotation_y, 0.0);
        assert_eq!(out.rotation_z, 0.0);
    }

    #[test]
    fn produces_non_zero_offset_when_trauma_is_active() {
        let mut shake = create_camera_shake(None);
        add_camera_shake_trauma(&mut shake, 1.0);
        let mut out = create_camera_shake_offset();
        update_camera_shake(&mut shake, 0.05, &mut out);
        let magnitude = out.x.hypot(out.y).hypot(out.z);
        assert!(magnitude > 0.0);
    }

    #[test]
    fn decays_trauma_over_time() {
        let options = CameraShakeOptions {
            decay: Some(2.0),
            frequency: None,
            rotation_amplitude: None,
            translation_amplitude: None,
        };
        let mut shake = create_camera_shake(Some(&options));
        add_camera_shake_trauma(&mut shake, 1.0);
        let mut out = create_camera_shake_offset();
        update_camera_shake(&mut shake, 0.25, &mut out);
        assert_close(shake.trauma, 0.5);
        update_camera_shake(&mut shake, 0.25, &mut out);
        assert_eq!(shake.trauma, 0.0);
    }

    #[test]
    fn scales_offset_quadratically_with_trauma() {
        let options = CameraShakeOptions {
            decay: Some(0.0),
            frequency: None,
            rotation_amplitude: None,
            translation_amplitude: None,
        };
        let mut shake = create_camera_shake(Some(&options));
        let mut out = create_camera_shake_offset();
        shake.trauma = 1.0;
        shake.time = 0.0;
        update_camera_shake(&mut shake, 0.1, &mut out);
        let full_x = out.x;
        shake.trauma = 0.5;
        shake.time = 0.0;
        update_camera_shake(&mut shake, 0.1, &mut out);
        let half_x = out.x;
        assert_close_within((half_x / full_x).abs(), 0.25, 0.05);
    }

    #[test]
    fn advances_time_deterministically() {
        let options = CameraShakeOptions {
            decay: Some(0.0),
            frequency: None,
            rotation_amplitude: None,
            translation_amplitude: None,
        };
        let mut shake_a = create_camera_shake(Some(&options));
        let mut shake_b = create_camera_shake(Some(&options));
        add_camera_shake_trauma(&mut shake_a, 0.7);
        add_camera_shake_trauma(&mut shake_b, 0.7);
        let mut out_a = create_camera_shake_offset();
        let mut out_b = create_camera_shake_offset();
        update_camera_shake(&mut shake_a, 0.016, &mut out_a);
        update_camera_shake(&mut shake_a, 0.016, &mut out_a);
        update_camera_shake(&mut shake_b, 0.016, &mut out_b);
        update_camera_shake(&mut shake_b, 0.016, &mut out_b);
        assert_eq!(out_a.x, out_b.x);
        assert_eq!(out_a.y, out_b.y);
        assert_eq!(out_a.rotation_z, out_b.rotation_z);
    }

    #[test]
    fn keeps_offsets_within_amplitude_bounds() {
        let options = CameraShakeOptions {
            decay: Some(0.0),
            frequency: None,
            rotation_amplitude: Some(5.0),
            translation_amplitude: Some(1.0),
        };
        let mut shake = create_camera_shake(Some(&options));
        add_camera_shake_trauma(&mut shake, 1.0);
        let mut out = create_camera_shake_offset();
        let mut step = 0;
        while step < 100 {
            update_camera_shake(&mut shake, 0.01, &mut out);
            assert!(out.x.abs() <= 1.0);
            assert!(out.y.abs() <= 1.0);
            assert!(out.z.abs() <= 1.0);
            assert!(out.rotation_x.abs() <= 5.0);
            assert!(out.rotation_y.abs() <= 5.0);
            assert!(out.rotation_z.abs() <= 5.0);
            step += 1;
        }
    }
}

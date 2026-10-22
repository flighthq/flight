use std::sync::Arc;

use flight_animation::contract::*;
use flight_animation::*;

mod clone_animation_track {
    use super::*;

    #[test]
    fn deep_copies_times_and_values_so_the_clone_shares_no_buffers() {
        let track = {
            let mut track = create_animation_track();
            track.components = 2;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 2.0, 4.0];
            track
        };
        let mut cloned = clone_animation_track(&track);
        assert_ne!(cloned.times.as_ptr(), track.times.as_ptr());
        assert_ne!(cloned.values.as_ptr(), track.values.as_ptr());
        assert_eq!(cloned.times, vec![0.0, 1.0]);
        assert_eq!(cloned.values, vec![0.0, 0.0, 2.0, 4.0]);
        cloned.values[0] = 99.0;
        assert_eq!(track.values[0], 0.0);
    }

    #[test]
    fn carries_scalar_fields_and_the_easing_reference() {
        fn my_easing(a: f32) -> f32 {
            return a;
        }
        let easing: EasingFn = Arc::new(my_easing);
        let track = {
            let mut track = create_animation_track();
            track.components = 3;
            track.easing = Some(easing.clone());
            track.interpolation = AnimationInterpolation::Step;
            track.quaternion = false;
            track.times = vec![0.0];
            track.values = vec![0.0, 0.0, 0.0];
            track
        };
        let cloned = clone_animation_track(&track);
        assert_eq!(cloned.components, 3);
        assert_eq!(cloned.interpolation, AnimationInterpolation::Step);
        assert!(Arc::ptr_eq(cloned.easing.as_ref().unwrap(), &easing));
        assert!(cloned.segment_easings.is_none());
    }
}

mod create_animation_track {
    use super::*;

    #[test]
    fn fills_defaults_linear_1_component_non_quaternion_no_easing() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 1.0];
            track
        };
        assert_eq!(track.interpolation, ANIMATION_INTERPOLATION_LINEAR);
        assert_eq!(track.components, 1);
        assert_eq!(track.quaternion, false);
        assert!(track.easing.is_none());
        assert!(track.segment_easings.is_none());
    }
}

mod initialize_animation_track {
    use super::*;

    // D23 B: construction only. The initializer writes the source defaults over an existing
    // allocation and keeps its entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut track = create_animation_track();
        let id = flight_entity::get_entity_id(&track);
        track.components = 3;
        track.interpolation = ANIMATION_INTERPOLATION_CUBIC;
        track.quaternion = true;
        track.times = vec![0.0, 1.0];
        track.values = vec![0.0; 6];
        initialize_animation_track(&mut track);
        assert_eq!(track.components, 1);
        assert_eq!(track.interpolation, ANIMATION_INTERPOLATION_LINEAR);
        assert!(!track.quaternion);
        assert!(track.times.is_empty());
        assert!(track.values.is_empty());
        assert!(track.easing.is_none());
        assert!(track.segment_easings.is_none());
        assert_eq!(flight_entity::get_entity_id(&track), id);
    }
}

mod sample_animation_track {
    use super::*;

    #[test]
    fn linearly_interpolates_a_scalar_mid_segment() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 10.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.5);
        assert!((out[0] - 5.0).abs() < 1e-5);
    }

    #[test]
    fn locates_the_correct_segment_on_a_multi_key_track() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
            track.values = vec![0.0, 10.0, 20.0, 30.0, 40.0, 50.0];
            track
        };
        let mut out = [0.0];
        for t in [0.25, 0.99, 1.0, 1.5, 2.5, 3.75, 4.999] {
            sample_animation_track(&mut out, &track, t);
            assert!(
                (out[0] - t * 10.0).abs() < 5e-7, // D1 f32 bound (TS: 5e-7)
                "at t={}, expected {} got {}",
                t,
                t * 10.0,
                out[0]
            );
        }
    }

    #[test]
    fn clamps_before_the_first_and_after_the_last_keyframe() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![1.0, 2.0];
            track.values = vec![3.0, 9.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, -5.0);
        assert_eq!(out[0], 3.0);
        sample_animation_track(&mut out, &track, 99.0);
        assert_eq!(out[0], 9.0);
    }

    #[test]
    fn holds_the_previous_keyframe_for_step_interpolation() {
        let track = {
            let mut track = create_animation_track();
            track.interpolation = ANIMATION_INTERPOLATION_STEP;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 10.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.9);
        assert_eq!(out[0], 0.0);
    }

    #[test]
    fn interpolates_a_vector3_component_wise() {
        let track = {
            let mut track = create_animation_track();
            track.components = 3;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 2.0, 4.0, 6.0];
            track
        };
        let mut out = [0.0, 0.0, 0.0];
        sample_animation_track(&mut out, &track, 0.5);
        assert_eq!(out, [1.0, 2.0, 3.0]);
    }

    #[test]
    fn slerps_a_quaternion_track_to_the_half_angle() {
        let s = (std::f32::consts::PI / 4.0).sin();
        let c = (std::f32::consts::PI / 4.0).cos();
        let track = {
            let mut track = create_animation_track();
            track.components = 4;
            track.quaternion = true;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, s, c];
            track
        };
        let mut out = [0.0, 0.0, 0.0, 0.0];
        sample_animation_track(&mut out, &track, 0.5);
        assert!((out[2] - (std::f32::consts::PI / 8.0).sin()).abs() < 5e-6); // D1 f32 bound (TS: 5e-6)
        assert!((out[3] - (std::f32::consts::PI / 8.0).cos()).abs() < 5e-6); // D1 f32 bound (TS: 5e-6)
        let len = (out[0] * out[0] + out[1] * out[1] + out[2] * out[2] + out[3] * out[3]).sqrt();
        assert!((len - 1.0).abs() < 1e-4);
    }

    #[test]
    fn cubic_splines_to_the_midpoint_with_zero_tangents() {
        let track = {
            let mut track = create_animation_track();
            track.interpolation = ANIMATION_INTERPOLATION_CUBIC;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 0.0, 10.0, 0.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.5);
        assert!((out[0] - 5.0).abs() < 1e-4);
    }

    #[test]
    fn applies_a_non_null_easing_to_the_segment_alpha() {
        fn zero_easing(_: f32) -> f32 {
            return 0.0;
        }
        let track = {
            let mut track = create_animation_track();
            track.easing = Some(Arc::new(zero_easing));
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 10.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.75);
        assert_eq!(out[0], 0.0);
    }

    #[test]
    fn applies_a_segment_local_easing_before_the_track_wide_fallback() {
        fn quarter_easing(_: f32) -> f32 {
            return 0.25;
        }
        fn zero_easing(_: f32) -> f32 {
            return 0.0;
        }
        let track = {
            let mut track = create_animation_track();
            track.easing = Some(Arc::new(quarter_easing));
            track.segment_easings = Some(vec![Some(Arc::new(zero_easing)), None]);
            track.times = vec![0.0, 1.0, 2.0];
            track.values = vec![0.0, 10.0, 20.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.75);
        assert_eq!(out[0], 0.0);
        sample_animation_track(&mut out, &track, 1.75);
        assert!((out[0] - 12.5).abs() < 1e-5);
    }

    #[test]
    fn returns_the_first_value_when_t_is_exactly_on_the_first_keyframe() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![2.0, 5.0];
            track.values = vec![7.0, 42.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 2.0);
        assert_eq!(out[0], 7.0);
    }

    #[test]
    fn returns_the_last_value_when_t_is_exactly_on_the_last_keyframe() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![2.0, 5.0];
            track.values = vec![7.0, 42.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 5.0);
        assert_eq!(out[0], 42.0);
    }

    #[test]
    fn returns_zeros_for_all_components_when_the_track_is_empty() {
        let track = {
            let mut track = create_animation_track();
            track.components = 3;
            track.times = vec![];
            track.values = vec![];
            track
        };
        let mut out = [9.0, 9.0, 9.0];
        sample_animation_track(&mut out, &track, 0.0);
        assert_eq!(out, [0.0, 0.0, 0.0]);
    }

    #[test]
    fn returns_the_only_keyframe_value_for_a_single_keyframe_track() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![5.0];
            track.values = vec![99.0];
            track
        };
        let mut out = [0.0];
        sample_animation_track(&mut out, &track, 0.0);
        assert_eq!(out[0], 99.0);
        sample_animation_track(&mut out, &track, 5.0);
        assert_eq!(out[0], 99.0);
        sample_animation_track(&mut out, &track, 1000.0);
        assert_eq!(out[0], 99.0);
    }
}

mod sample_animation_track_ref {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock, RwLock};

    use flight_entity::Ref;

    use super::*;

    static EASING_ACQUIRED_WRITE: AtomicBool = AtomicBool::new(false);
    static EASING_TRACK: OnceLock<Mutex<Option<Ref<AnimationTrack>>>> = OnceLock::new();

    fn mutating_easing(alpha: f32) -> f32 {
        let track = EASING_TRACK
            .get()
            .unwrap()
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .clone();
        if let Ok(mut track) = track.try_write() {
            track.values[0] = 2.0;
            EASING_ACQUIRED_WRITE.store(true, Ordering::SeqCst);
        }
        return alpha;
    }

    #[test]
    fn releases_the_track_guard_across_easing_then_samples_the_live_buffer() {
        let track = Arc::new(RwLock::new({
            let mut track = create_animation_track();
            track.easing = Some(Arc::new(mutating_easing));
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 10.0];
            track
        }));
        *EASING_TRACK
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap() = Some(track.clone());
        EASING_ACQUIRED_WRITE.store(false, Ordering::SeqCst);
        let mut out = [0.0];
        sample_animation_track_ref(&mut out, &track, 0.5);
        assert!(EASING_ACQUIRED_WRITE.load(Ordering::SeqCst));
        assert_eq!(out[0], 6.0);
        *EASING_TRACK.get().unwrap().lock().unwrap() = None;
    }
}

mod trim_animation_track {
    use super::*;

    #[test]
    fn keeps_in_range_keyframes_and_rebases_times_to_start_at_zero() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0, 2.0, 3.0, 4.0];
            track.values = vec![0.0, 10.0, 20.0, 30.0, 40.0];
            track
        };
        let sub = trim_animation_track(&track, 1.0, 3.0);
        assert_eq!(sub.times, vec![0.0, 1.0, 2.0]);
        assert_eq!(sub.values, vec![10.0, 20.0, 30.0]);
    }

    #[test]
    fn deep_copies_value_blocks_for_multi_component_tracks() {
        let track = {
            let mut track = create_animation_track();
            track.components = 2;
            track.times = vec![0.0, 1.0, 2.0];
            track.values = vec![0.0, 0.0, 2.0, 4.0, 8.0, 16.0];
            track
        };
        let sub = trim_animation_track(&track, 1.0, 2.0);
        assert_eq!(sub.times, vec![0.0, 1.0]);
        assert_eq!(sub.values, vec![2.0, 4.0, 8.0, 16.0]);
        assert_ne!(sub.values.as_ptr(), track.values.as_ptr());
    }

    #[test]
    fn keeps_the_segment_easings_between_retained_keyframes() {
        fn e0(_: f32) -> f32 {
            return 0.0;
        }
        fn e1(_: f32) -> f32 {
            return 0.25;
        }
        fn e2(_: f32) -> f32 {
            return 0.5;
        }
        let easing: EasingFn = Arc::new(e1);
        let e0: EasingFn = Arc::new(e0);
        let e1: EasingFn = Arc::new(e1);
        let e2: EasingFn = Arc::new(e2);
        let track = {
            let mut track = create_animation_track();
            track.segment_easings = Some(vec![Some(e0), Some(e1.clone()), Some(e2.clone())]);
            track.times = vec![0.0, 1.0, 2.0, 3.0];
            track.values = vec![0.0, 10.0, 20.0, 30.0];
            track.easing = Some(easing.clone());
            track
        };
        let sub = trim_animation_track(&track, 1.0, 3.0);
        let se = sub.segment_easings.unwrap();
        assert_eq!(se.len(), 2);
        assert!(Arc::ptr_eq(se[0].as_ref().unwrap(), &e1));
        assert!(Arc::ptr_eq(se[1].as_ref().unwrap(), &e2));
        assert!(Arc::ptr_eq(sub.easing.as_ref().unwrap(), &easing));
    }

    #[test]
    fn copies_the_3x_cubic_keyframe_stride() {
        let track = {
            let mut track = create_animation_track();
            track.interpolation = ANIMATION_INTERPOLATION_CUBIC;
            track.times = vec![0.0, 1.0, 2.0];
            track.values = vec![0.0, 0.0, 0.0, 1.0, 10.0, 1.0, 2.0, 20.0, 2.0];
            track
        };
        let sub = trim_animation_track(&track, 1.0, 2.0);
        assert_eq!(sub.times, vec![0.0, 1.0]);
        assert_eq!(sub.values, vec![1.0, 10.0, 1.0, 2.0, 20.0, 2.0]);
    }

    #[test]
    fn returns_an_empty_track_when_no_keyframe_falls_in_range() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0, 2.0];
            track.values = vec![0.0, 10.0, 20.0];
            track
        };
        let sub = trim_animation_track(&track, 5.0, 6.0);
        assert_eq!(sub.times.len(), 0);
        assert_eq!(sub.values.len(), 0);
    }
}

mod validate_animation_track {
    use super::*;

    #[test]
    fn returns_none_for_a_well_formed_track() {
        let track = {
            let mut track = create_animation_track();
            track.components = 3;
            track.times = vec![0.0, 1.0, 2.0];
            track.values = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 2.0, 2.0, 2.0];
            track
        };
        let mut out = Vec::new();
        assert!(!validate_animation_track(&mut out, &track));
        assert!(out.is_empty());
    }

    #[test]
    fn flags_non_ascending_times_with_the_offending_index() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 2.0, 1.0];
            track.values = vec![0.0, 1.0, 2.0];
            track
        };
        let mut diagnostics = Vec::new();
        assert!(validate_animation_track(&mut diagnostics, &track));
        assert_eq!(diagnostics[0].code, "nonAscendingTimes");
        assert_eq!(diagnostics[0].index, Some(2));
    }

    #[test]
    fn flags_a_values_length_mismatch() {
        let track = {
            let mut track = create_animation_track();
            track.components = 2;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 2.0];
            track
        };
        let mut diagnostics = Vec::new();
        assert!(validate_animation_track(&mut diagnostics, &track));
        assert!(diagnostics.iter().any(|d| d.code == "valuesLengthMismatch"));
    }

    #[test]
    fn flags_a_segment_easing_count_that_does_not_match_the_intervals() {
        let track = {
            let mut track = create_animation_track();
            track.segment_easings = Some(vec![]);
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 1.0];
            track
        };
        let mut diagnostics = Vec::new();
        assert!(validate_animation_track(&mut diagnostics, &track));
        assert!(
            diagnostics
                .iter()
                .any(|d| d.code == "segmentEasingsLengthMismatch")
        );
    }

    #[test]
    fn accounts_for_the_3x_cubic_stride_in_the_length_check() {
        let ok = {
            let mut track = create_animation_track();
            track.interpolation = ANIMATION_INTERPOLATION_CUBIC;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 0.0, 10.0, 0.0];
            track
        };
        let mut out = Vec::new();
        assert!(!validate_animation_track(&mut out, &ok));
        assert!(out.is_empty());
        let bad = {
            let mut track = create_animation_track();
            track.interpolation = ANIMATION_INTERPOLATION_CUBIC;
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 0.0, 0.0, 0.0];
            track
        };
        let mut out = Vec::new();
        assert!(validate_animation_track(&mut out, &bad));
        assert!(!out.is_empty());
    }

    #[test]
    fn does_not_throw_on_a_duplicate_time() {
        let track = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 0.0];
            track.values = vec![0.0, 1.0];
            track
        };
        let mut diagnostics = Vec::new();
        assert!(validate_animation_track(&mut diagnostics, &track));
        assert_eq!(diagnostics[0].code, "nonAscendingTimes");
    }

    // D24: the caller-owned diagnostics buffer is cleared on every call and its allocation reused.
    #[test]
    fn clears_and_refills_the_caller_owned_diagnostics_reusing_its_capacity() {
        let bad = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 2.0, 1.0];
            track.values = vec![0.0, 1.0];
            track
        };
        let good = {
            let mut track = create_animation_track();
            track.times = vec![0.0, 1.0];
            track.values = vec![0.0, 1.0];
            track
        };
        let mut out = Vec::with_capacity(8);
        let capacity = out.capacity();
        assert!(validate_animation_track(&mut out, &bad));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].code, "nonAscendingTimes");
        assert_eq!(out[1].code, "valuesLengthMismatch");
        assert!(!validate_animation_track(&mut out, &good));
        assert!(out.is_empty());
        assert_eq!(out.capacity(), capacity);
    }
}

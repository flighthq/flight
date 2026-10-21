use std::sync::{Arc, RwLock};

use flight_animation::*;

mod create_animation_root_motion_extractor {
    use super::*;

    #[test]
    fn creates_reusable_scratch_for_one_explicit_channel() {
        let clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    times: vec![0.0, 1.0],
                    values: vec![2.0, 6.0],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let extractor = create_animation_root_motion_extractor(&clip, 0);
        assert!(Arc::ptr_eq(&extractor.clip, &clip));
        assert_eq!(extractor.channel_index, 0);
        assert_eq!(extractor.cycle_delta[0], 4.0);
    }

    #[test]
    fn rejects_missing_channel_indices_and_malformed_quaternion_channels() {
        let empty_clip = Arc::new(RwLock::new(create_animation_clip(vec![], None, &[])));
        let result = std::panic::catch_unwind(|| {
            create_animation_root_motion_extractor(&empty_clip, 0);
        });
        assert!(result.is_err());

        let malformed_clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(3),
                    quaternion: Some(true),
                    times: vec![0.0],
                    values: vec![0.0, 0.0, 1.0],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let result = std::panic::catch_unwind(|| {
            create_animation_root_motion_extractor(&malformed_clip, 0);
        });
        assert!(result.is_err());
    }
}

mod extract_animation_root_motion {
    use super::*;

    #[test]
    fn extracts_forward_reverse_and_multi_loop_vector_displacement() {
        let clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(3),
                    times: vec![0.0, 1.0],
                    values: vec![0.0, 0.0, 0.0, 10.0, 2.0, -4.0],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let mut extractor = create_animation_root_motion_extractor(&clip, 0);
        let mut out = [0.0, 0.0, 0.0];

        assert!(extract_animation_root_motion(
            &mut out,
            &mut extractor,
            0.75,
            1.25
        ));
        assert_eq!(out, [5.0, 1.0, -2.0]);

        assert!(extract_animation_root_motion(
            &mut out,
            &mut extractor,
            1.25,
            0.75
        ));
        assert_eq!(out, [-5.0, -1.0, 2.0]);

        assert!(extract_animation_root_motion(
            &mut out,
            &mut extractor,
            0.0,
            2.5
        ));
        assert_eq!(out, [25.0, 5.0, -10.0]);
    }

    #[test]
    fn composes_quaternion_rotation_across_loop_boundaries() {
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(4),
                    quaternion: Some(true),
                    times: vec![0.0, 1.0],
                    values: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, sqrt1_2, sqrt1_2],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let mut extractor = create_animation_root_motion_extractor(&clip, 0);
        let mut out = [0.0, 0.0, 0.0, 0.0];

        extract_animation_root_motion(&mut out, &mut extractor, 0.0, 2.0);
        assert!(out[2].abs() - 1.0 < 1e-5);
        assert!(out[3].abs() < 1e-5);

        extract_animation_root_motion(&mut out, &mut extractor, 1.5, 0.5);
        assert!((out[2] - (-sqrt1_2)).abs() < 1e-5);
        assert!((out[3] - sqrt1_2).abs() < 1e-5);
    }

    #[test]
    fn writes_identity_for_a_zero_duration_clip_and_preserves_undersized_output() {
        let clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(2),
                    times: vec![0.0],
                    values: vec![4.0, 8.0],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let mut extractor = create_animation_root_motion_extractor(&clip, 0);
        let mut out = [9.0, 9.0];
        assert!(extract_animation_root_motion(
            &mut out,
            &mut extractor,
            0.0,
            3.0
        ));
        assert_eq!(out, [0.0, 0.0]);
        let mut short = [7.0];
        assert!(!extract_animation_root_motion(
            &mut short,
            &mut extractor,
            0.0,
            1.0
        ));
        assert_eq!(short, [7.0]);
    }

    #[test]
    fn rejects_non_finite_ranges_before_mutating_output() {
        let sqrt1_2 = std::f32::consts::FRAC_1_SQRT_2;
        let clip = Arc::new(RwLock::new(create_animation_clip(
            vec![create_animation_channel(
                create_animation_track(CreateAnimationTrackOpts {
                    components: Some(4),
                    quaternion: Some(true),
                    times: vec![0.0, 1.0],
                    values: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, sqrt1_2, sqrt1_2],
                    ..Default::default()
                }),
                1,
            )],
            None,
            &[],
        )));
        let mut extractor = create_animation_root_motion_extractor(&clip, 0);
        let mut out = [1.0, 2.0, 3.0, 4.0];
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            extract_animation_root_motion(&mut out, &mut extractor, 0.0, f32::INFINITY);
        }));
        assert!(result.is_err());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            extract_animation_root_motion(&mut out, &mut extractor, f32::NEG_INFINITY, 0.0);
        }));
        assert!(result.is_err());
    }
}

mod initialize_animation_root_motion_extractor {
    use super::*;
    use flight_entity::Ref;

    #[test]
    fn is_the_construction_initializer_of_create_animation_root_motion_extractor() {
        let _ = initialize_animation_root_motion_extractor
            as fn(&mut AnimationRootMotionExtractor, &Ref<AnimationClip>, usize);
    }
}

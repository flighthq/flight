use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_clip, create_animation_track,
};
use flight_entity::{Ref, Unknown};
use flight_skeleton2d::contract::*;

use crate::support::*;

fn track(
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
) -> Ref<flight_animation::contract::AnimationTrack> {
    return Arc::new(RwLock::new(create_animation_track(
        CreateAnimationTrackOpts {
            times,
            values,
            components: Some(components),
            interpolation: Some(interpolation),
            quaternion: None,
            easing: None,
            segment_easings: None,
        },
    )));
}

fn target_channel(
    kind: &str,
    target: Unknown,
    channel_track: Ref<flight_animation::contract::AnimationTrack>,
) -> AnimationChannel {
    let handle = create_skeleton_2d_animation_target_handle(kind, target);
    return create_animation_channel(&channel_track, Some(Arc::new(handle)));
}

fn bone_channel(
    path: &str,
    bone_index: i32,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
) -> AnimationChannel {
    let target: Unknown = Some(Arc::new(create_skeleton_2d_bone_animation_target(
        bone_index, path,
    )));
    return target_channel(
        SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        target,
        track(times, values, components, interpolation),
    );
}

fn slot_channel(
    path: &str,
    slot_index: i32,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
) -> AnimationChannel {
    let target: Unknown = Some(Arc::new(create_skeleton_2d_slot_animation_target(
        slot_index, path, None,
    )));
    return target_channel(
        SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
        target,
        track(times, values, components, interpolation),
    );
}

fn apply(
    clip: &flight_animation::contract::AnimationClip,
    setup: &Skeleton2D,
    pose: &mut Skeleton2D,
    time: f32,
) {
    let registry = create_skeleton_2d_animation_target_registry();
    apply_animation_clip_to_skeleton_2d(clip, setup, pose, time, &registry, &empty_guards());
}

fn bone_with(
    rotation: f32,
    x: f32,
    y: f32,
    scale_x: f32,
    scale_y: f32,
    shear_x: f32,
    shear_y: f32,
) -> Bone2D {
    let mut out = bone();
    out.rotation = rotation;
    out.x = x;
    out.y = y;
    out.scale_x = scale_x;
    out.scale_y = scale_y;
    out.shear_x = shear_x;
    out.shear_y = shear_y;
    return out;
}

fn field(bone: &Bone2D, name: &str) -> f32 {
    return match name {
        "x" => bone.x,
        "y" => bone.y,
        "scaleX" => bone.scale_x,
        "scaleY" => bone.scale_y,
        "shearX" => bone.shear_x,
        "shearY" => bone.shear_y,
        _ => bone.rotation,
    };
}

mod apply_animation_clip_to_skeleton_2d {
    use super::*;

    #[test]
    fn composes_a_rotation_delta_onto_the_setup_pose_leaving_setup_untouched() {
        let setup = create_skeleton_2d(vec![bone_with(10.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![bone_channel(
                SKELETON_2D_ANIMATION_PATH_ROTATION,
                0,
                vec![0.0, 1.0],
                vec![0.0, 90.0],
                1,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.5);
        assert!((pose.bones[0].rotation - 55.0).abs() <= 1e-4);
        assert_eq!(setup.bones[0].rotation, 10.0);
    }

    #[test]
    fn adds_translation_and_shear_deltas_and_multiplies_scale_deltas_onto_setup() {
        let setup = create_skeleton_2d(vec![bone_with(0.0, 5.0, -2.0, 2.0, 3.0, 1.0, 4.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![
                bone_channel(
                    SKELETON_2D_ANIMATION_PATH_TRANSLATION,
                    0,
                    vec![0.0, 1.0],
                    vec![0.0, 0.0, 10.0, 20.0],
                    2,
                    AnimationInterpolation::Linear,
                ),
                bone_channel(
                    SKELETON_2D_ANIMATION_PATH_SCALE,
                    0,
                    vec![0.0, 1.0],
                    vec![1.0, 1.0, 3.0, 0.5],
                    2,
                    AnimationInterpolation::Linear,
                ),
                bone_channel(
                    SKELETON_2D_ANIMATION_PATH_SHEAR,
                    0,
                    vec![0.0, 1.0],
                    vec![0.0, 0.0, 5.0, 6.0],
                    2,
                    AnimationInterpolation::Linear,
                ),
            ],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 1.0);
        assert!((pose.bones[0].x - 15.0).abs() <= 1e-4);
        assert!((pose.bones[0].y - 18.0).abs() <= 1e-4);
        assert!((pose.bones[0].scale_x - 6.0).abs() <= 1e-4);
        assert!((pose.bones[0].scale_y - 1.5).abs() <= 1e-4);
        assert!((pose.bones[0].shear_x - 6.0).abs() <= 1e-4);
        assert!((pose.bones[0].shear_y - 10.0).abs() <= 1e-4);
    }

    #[test]
    fn poses_each_per_axis_path_from_a_one_component_track_touching_only_its_own_axis() {
        let cases: [(&str, f32, &str, f32, &str, f32); 6] = [
            (
                SKELETON_2D_ANIMATION_PATH_TRANSLATION_X,
                10.0,
                "x",
                13.0,
                "y",
                5.0,
            ),
            (
                SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y,
                10.0,
                "y",
                15.0,
                "x",
                3.0,
            ),
            (
                SKELETON_2D_ANIMATION_PATH_SCALE_X,
                3.0,
                "scaleX",
                6.0,
                "scaleY",
                4.0,
            ),
            (
                SKELETON_2D_ANIMATION_PATH_SCALE_Y,
                3.0,
                "scaleY",
                12.0,
                "scaleX",
                2.0,
            ),
            (
                SKELETON_2D_ANIMATION_PATH_SHEAR_X,
                10.0,
                "shearX",
                17.0,
                "shearY",
                9.0,
            ),
            (
                SKELETON_2D_ANIMATION_PATH_SHEAR_Y,
                10.0,
                "shearY",
                19.0,
                "shearX",
                7.0,
            ),
        ];
        for (path, sample, expected_field, expected, sibling, sibling_value) in cases {
            let setup =
                create_skeleton_2d(vec![bone_with(0.0, 3.0, 5.0, 2.0, 4.0, 7.0, 9.0)], None);
            let mut pose = clone_skeleton_2d(&setup);
            let clip = create_animation_clip(
                vec![bone_channel(
                    path,
                    0,
                    vec![0.0, 1.0],
                    vec![sample, sample],
                    1,
                    AnimationInterpolation::Linear,
                )],
                None,
                &[],
            );
            apply(&clip, &setup, &mut pose, 1.0);
            assert!(
                (field(&pose.bones[0], expected_field) - expected).abs() <= 1e-4,
                "{path}"
            );
            assert!(
                (field(&pose.bones[0], sibling) - sibling_value).abs() <= 1e-4,
                "{path}"
            );
        }
    }

    #[test]
    fn re_applies_from_setup_each_frame_with_no_accumulation() {
        let setup = create_skeleton_2d(vec![bone_with(10.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![bone_channel(
                SKELETON_2D_ANIMATION_PATH_ROTATION,
                0,
                vec![0.0, 1.0],
                vec![0.0, 90.0],
                1,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 1.0);
        apply(&clip, &setup, &mut pose, 1.0);
        assert!((pose.bones[0].rotation - 100.0).abs() <= 1e-4);
    }

    #[test]
    fn skips_a_channel_with_a_foreign_target_or_an_out_of_range_bone_without_mutation() {
        let setup = create_skeleton_2d(vec![bone_with(7.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![
                target_channel(
                    "acme.Unclaimed",
                    Some(Arc::new(String::from("foreign"))),
                    track(
                        vec![0.0, 1.0],
                        vec![0.0, 90.0],
                        1,
                        AnimationInterpolation::Linear,
                    ),
                ),
                bone_channel(
                    SKELETON_2D_ANIMATION_PATH_ROTATION,
                    9,
                    vec![0.0, 1.0],
                    vec![0.0, 90.0],
                    1,
                    AnimationInterpolation::Linear,
                ),
            ],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 1.0);
        assert_eq!(pose.bones[0].rotation, 7.0);
    }

    #[test]
    fn keeps_both_axes_when_a_bone_carries_independently_timed_axis_channels() {
        let setup = create_skeleton_2d(vec![bone()], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![
                target_channel(
                    SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                    Some(Arc::new(create_skeleton_2d_bone_animation_target(
                        0,
                        SKELETON_2D_ANIMATION_PATH_TRANSLATION_X,
                    ))),
                    track(vec![0.0], vec![7.0], 1, AnimationInterpolation::Linear),
                ),
                target_channel(
                    SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                    Some(Arc::new(create_skeleton_2d_bone_animation_target(
                        0,
                        SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y,
                    ))),
                    track(vec![0.0], vec![5.0], 1, AnimationInterpolation::Linear),
                ),
            ],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert!((pose.bones[0].x - 7.0).abs() <= 1e-4);
        assert!((pose.bones[0].y - 5.0).abs() <= 1e-4);
    }

    #[test]
    fn leaves_the_untouched_axis_at_its_setup_value() {
        let setup = create_skeleton_2d(vec![bone_with(0.0, 3.0, 11.0, 1.0, 1.0, 0.0, 0.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![target_channel(
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                Some(Arc::new(create_skeleton_2d_bone_animation_target(
                    0,
                    SKELETON_2D_ANIMATION_PATH_TRANSLATION_X,
                ))),
                track(vec![0.0], vec![4.0], 1, AnimationInterpolation::Linear),
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert!((pose.bones[0].x - 7.0).abs() <= 1e-4);
        assert_eq!(pose.bones[0].y, 11.0);
    }

    #[test]
    fn composes_scale_per_axis_by_multiplying() {
        let setup = create_skeleton_2d(vec![bone_with(0.0, 0.0, 0.0, 2.0, 3.0, 0.0, 0.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![target_channel(
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                Some(Arc::new(create_skeleton_2d_bone_animation_target(
                    0,
                    SKELETON_2D_ANIMATION_PATH_SCALE_Y,
                ))),
                track(vec![0.0], vec![4.0], 1, AnimationInterpolation::Linear),
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert_eq!(pose.bones[0].scale_x, 2.0);
        assert!((pose.bones[0].scale_y - 12.0).abs() <= 1e-4);
    }

    #[test]
    fn composes_shear_per_axis_by_adding() {
        let setup = create_skeleton_2d(vec![bone_with(0.0, 0.0, 0.0, 1.0, 1.0, 5.0, 6.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![target_channel(
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                Some(Arc::new(create_skeleton_2d_bone_animation_target(
                    0,
                    SKELETON_2D_ANIMATION_PATH_SHEAR_X,
                ))),
                track(vec![0.0], vec![10.0], 1, AnimationInterpolation::Linear),
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert!((pose.bones[0].shear_x - 15.0).abs() <= 1e-4);
        assert_eq!(pose.bones[0].shear_y, 6.0);
    }

    #[test]
    fn writes_an_absolute_slot_colour_rather_than_composing_it_onto_setup() {
        let setup = create_skeleton_2d(
            vec![bone()],
            Some(vec![Slot2D {
                attachment: None,
                deform: None,
                bone_index: 0,
                color: Some(0x112233ff),
                name: Some(String::from("s")),
            }]),
        );
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![slot_channel(
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                0,
                vec![0.0, 1.0],
                vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0],
                4,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0xff0000ff)
        );
        apply(&clip, &setup, &mut pose, 1.0);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0x0000ffff)
        );
        assert_eq!(
            setup.slots.as_ref().expect("slots")[0].color,
            Some(0x112233ff)
        );
    }

    #[test]
    fn interpolates_colour_channels_between_keyframes() {
        let setup = create_skeleton_2d(
            vec![bone()],
            Some(vec![Slot2D {
                attachment: None,
                deform: None,
                bone_index: 0,
                color: Some(0),
                name: Some(String::from("s")),
            }]),
        );
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![slot_channel(
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                0,
                vec![0.0, 1.0],
                vec![0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0],
                4,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.5);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0x80808080)
        );
    }

    #[test]
    fn clamps_an_overshooting_sample_instead_of_wrapping_the_packed_colour() {
        let setup = create_skeleton_2d(
            vec![bone()],
            Some(vec![Slot2D {
                attachment: None,
                deform: None,
                bone_index: 0,
                color: Some(0),
                name: Some(String::from("s")),
            }]),
        );
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![slot_channel(
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                0,
                vec![0.0],
                vec![1.4, -0.2, 1.0, 1.0],
                4,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0xff00ffff)
        );
    }

    #[test]
    fn ignores_a_slot_channel_whose_index_is_out_of_range_or_a_skeleton_with_no_slots() {
        let setup = create_skeleton_2d(
            vec![bone()],
            Some(vec![Slot2D {
                attachment: None,
                deform: None,
                bone_index: 0,
                color: Some(0x010203ff),
                name: Some(String::from("s")),
            }]),
        );
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![slot_channel(
                SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                9,
                vec![0.0],
                vec![1.0, 1.0, 1.0, 1.0],
                4,
                AnimationInterpolation::Linear,
            )],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0x010203ff)
        );
        let bone_only = create_skeleton_2d(vec![bone()], None);
        let mut bone_pose = clone_skeleton_2d(&bone_only);
        apply(&clip, &bone_only, &mut bone_pose, 0.0);
    }

    #[test]
    fn drives_bone_and_slot_channels_from_one_clip_dispatching_on_target_kind() {
        let setup = create_skeleton_2d(
            vec![bone_with(10.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0)],
            Some(vec![Slot2D {
                attachment: None,
                deform: None,
                bone_index: 0,
                color: Some(0),
                name: Some(String::from("s")),
            }]),
        );
        let mut pose = clone_skeleton_2d(&setup);
        let clip = create_animation_clip(
            vec![
                target_channel(
                    SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                    Some(Arc::new(create_skeleton_2d_bone_animation_target(
                        0,
                        SKELETON_2D_ANIMATION_PATH_ROTATION,
                    ))),
                    track(vec![0.0], vec![90.0], 1, AnimationInterpolation::Linear),
                ),
                slot_channel(
                    SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
                    0,
                    vec![0.0],
                    vec![1.0, 1.0, 1.0, 1.0],
                    4,
                    AnimationInterpolation::Linear,
                ),
            ],
            None,
            &[],
        );
        apply(&clip, &setup, &mut pose, 0.0);
        assert!((pose.bones[0].rotation - 100.0).abs() <= 1e-4);
        assert_eq!(
            pose.slots.as_ref().expect("slots")[0].color,
            Some(0xffffffff)
        );
    }
}

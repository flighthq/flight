use std::sync::{Arc, Mutex, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, create_animation_channel, create_animation_clip,
    create_animation_track,
};
use flight_entity::{Unknown, allocate_entity};
use flight_skeleton2d::contract::*;

use crate::support::*;

fn handle_channel(
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
    interpolation: AnimationInterpolation,
    kind: &str,
    target: Unknown,
) -> AnimationChannel {
    let track = {
        let mut track = create_animation_track();
        track.times = times;
        track.values = values;
        track.components = components;
        track.interpolation = interpolation;
        track
    };
    let handle = create_skeleton_2d_animation_target_handle(kind, target);
    let track = Arc::new(RwLock::new(track));
    return create_animation_channel(&track, Some(Arc::new(handle)));
}

fn rig() -> (Skeleton2D, Skeleton2D) {
    let setup = skeleton(vec![bone()], Some(vec![slot(0)]));
    let pose = clone_skeleton_2d(&setup);
    return (setup, pose);
}

mod create_skeleton_2d_animation_target_handle {
    use super::*;

    #[test]
    fn keeps_the_target_arc_identity_and_kind() {
        let target = Arc::new(create_skeleton_2d_bone_animation_target(
            0,
            SKELETON_2D_ANIMATION_PATH_ROTATION,
        ));
        let handle = create_skeleton_2d_animation_target_handle(
            SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
            Some(target.clone()),
        );
        assert_eq!(handle.kind, SKELETON_2D_ANIMATION_TARGET_KIND_BONE);
        let stored: &Arc<dyn std::any::Any + Send + Sync> = handle.target.as_ref().expect("target");
        assert!(Arc::ptr_eq(
            stored,
            &(target as Arc<dyn std::any::Any + Send + Sync>)
        ));
    }
}

mod create_skeleton_2d_animation_target_registry {
    use super::*;

    #[test]
    fn resolves_bone_and_slot_binders_without_a_caller_opting_in() {
        let registry = create_skeleton_2d_animation_target_registry();
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE
            )
            .is_some()
        );
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_SLOT
            )
            .is_some()
        );
        assert!(get_skeleton_2d_animation_target_binder(&registry, "acme.RopeTarget").is_none());
    }
}

mod create_skeleton_2d_bone_animation_target {
    use super::*;

    #[test]
    fn stamps_the_bone_kind_and_path() {
        let target =
            create_skeleton_2d_bone_animation_target(3, SKELETON_2D_ANIMATION_PATH_ROTATION);
        assert_eq!(target.bone_index, 3);
        assert_eq!(target.kind, SKELETON_2D_ANIMATION_TARGET_KIND_BONE);
        assert_eq!(target.path, SKELETON_2D_ANIMATION_PATH_ROTATION);
    }
}

mod create_skeleton_2d_slot_animation_target {
    use super::*;

    #[test]
    fn stamps_the_slot_kind_and_leaves_the_table_null_for_a_colour_channel() {
        let target = create_skeleton_2d_slot_animation_target(
            2,
            SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
            None,
        );
        assert!(target.attachments.is_none());
        assert_eq!(target.kind, SKELETON_2D_ANIMATION_TARGET_KIND_SLOT);
        assert_eq!(target.path, SKELETON_2D_SLOT_ANIMATION_PATH_COLOR);
        assert_eq!(target.slot_index, 2);
    }

    #[test]
    fn carries_the_lookup_table_an_attachment_channel_resolves_indices_through() {
        let art = region(1.0, 1.0);
        let art_ref = region_ref(art);
        let table = Arc::new(vec![Some(art_ref.clone())]);
        let target = create_skeleton_2d_slot_animation_target(
            0,
            SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT,
            Some(table.clone()),
        );
        let stored = target.attachments.expect("attachments");
        assert!(Arc::ptr_eq(&stored, &table));
        assert!(Arc::ptr_eq(stored[0].as_ref().expect("entry"), &art_ref));
    }
}

mod find_skeleton_2d_step_keyframe {
    use super::*;

    #[test]
    fn returns_the_last_keyframe_at_or_before_the_time() {
        assert_eq!(find_skeleton_2d_step_keyframe(&[0.0, 1.0, 2.0], 1.9), 1);
        assert_eq!(find_skeleton_2d_step_keyframe(&[0.0, 1.0, 2.0], 2.0), 2);
    }

    #[test]
    fn holds_the_first_keyframe_before_the_track_starts() {
        assert_eq!(find_skeleton_2d_step_keyframe(&[5.0, 9.0], 0.0), 0);
    }

    #[test]
    fn returns_minus_one_for_a_track_with_no_keyframes() {
        assert_eq!(find_skeleton_2d_step_keyframe(&[], 0.0), -1);
    }
}

mod get_skeleton_2d_animation_target_binder {
    use super::*;

    #[test]
    fn resolves_registered_kinds_and_returns_none_for_an_unclaimed_one() {
        let registry = create_skeleton_2d_animation_target_registry();
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE
            )
            .is_some()
        );
        assert!(get_skeleton_2d_animation_target_binder(&registry, "acme.RopeTarget").is_none());
    }
}

mod get_skeleton_2d_animation_target_binder_kinds {
    use super::*;

    #[test]
    fn enumerates_sorted_bound_kinds_and_stops_naming_an_unregistered_one() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_animation_target_binder(
            &mut registry,
            "acme.RopeTarget",
            Arc::new(|_channel, _setup, _pose, _target, _time, _guards| {}),
        );
        assert_eq!(
            get_skeleton_2d_animation_target_binder_kinds(&registry),
            vec![
                String::from(SKELETON_2D_ANIMATION_TARGET_KIND_BONE),
                String::from(SKELETON_2D_ANIMATION_TARGET_KIND_SLOT),
                String::from("acme.RopeTarget"),
            ]
        );
        unregister_skeleton_2d_animation_target_binder(&mut registry, "acme.RopeTarget");
        assert_eq!(
            get_skeleton_2d_animation_target_binder_kinds(&registry),
            vec![
                String::from(SKELETON_2D_ANIMATION_TARGET_KIND_BONE),
                String::from(SKELETON_2D_ANIMATION_TARGET_KIND_SLOT),
            ]
        );
    }
}

mod initialize_skeleton_2d_bone_animation_target {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_bone_constructor() {
        let mut out: Skeleton2DAnimationTarget = allocate_entity();
        initialize_skeleton_2d_bone_animation_target(
            &mut out,
            3,
            SKELETON_2D_ANIMATION_PATH_ROTATION,
        );
        let created =
            create_skeleton_2d_bone_animation_target(3, SKELETON_2D_ANIMATION_PATH_ROTATION);
        assert_eq!(
            (out.bone_index, out.kind.as_str(), out.path.as_str()),
            (
                created.bone_index,
                created.kind.as_str(),
                created.path.as_str()
            )
        );
    }
}

mod initialize_skeleton_2d_slot_animation_target {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_the_slot_constructor() {
        let mut out: Skeleton2DSlotAnimationTarget = allocate_entity();
        initialize_skeleton_2d_slot_animation_target(
            &mut out,
            2,
            SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
            None,
        );
        let created = create_skeleton_2d_slot_animation_target(
            2,
            SKELETON_2D_SLOT_ANIMATION_PATH_COLOR,
            None,
        );
        assert_eq!(
            (out.slot_index, out.kind.as_str(), out.path.as_str()),
            (
                created.slot_index,
                created.kind.as_str(),
                created.path.as_str()
            )
        );
        assert!(out.attachments.is_none());
    }
}

mod register_skeleton_2d_animation_target_binder {
    use super::*;

    #[test]
    fn binds_a_foreign_family_from_the_same_single_pass_as_bones() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_animation_target_binder(
            &mut registry,
            "acme.RopeTarget",
            Arc::new(move |channel, _setup, _pose, target, time, _guards| {
                let slack = target
                    .as_ref()
                    .and_then(|target| target.downcast_ref::<SlackTarget>())
                    .expect("slack target")
                    .slack;
                sink.lock()
                    .unwrap()
                    .push((channel.track.read().unwrap().times.len(), slack, time));
            }),
        );
        let (setup, mut pose) = rig();
        let bone_target: Unknown = Some(Arc::new(create_skeleton_2d_bone_animation_target(
            0,
            SKELETON_2D_ANIMATION_PATH_ROTATION,
        )));
        let slack_target: Unknown = Some(Arc::new(SlackTarget { slack: 7 }));
        let clip = create_animation_clip(
            vec![
                handle_channel(
                    vec![0.0, 1.0],
                    vec![0.0, 90.0],
                    1,
                    AnimationInterpolation::Linear,
                    SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                    bone_target,
                ),
                handle_channel(
                    vec![0.0],
                    vec![0.0],
                    1,
                    AnimationInterpolation::Step,
                    "acme.RopeTarget",
                    slack_target,
                ),
            ],
            None,
            &[],
        );
        apply_animation_clip_to_skeleton_2d(
            &clip,
            &setup,
            &mut pose,
            1.0,
            &registry,
            &empty_guards(),
        );
        assert!((pose.bones[0].rotation - 90.0).abs() <= 1e-4);
        assert_eq!(*seen.lock().unwrap(), vec![(1, 7, 1.0)]);
    }

    #[test]
    fn takes_the_last_registration_for_a_kind() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        let original = get_skeleton_2d_animation_target_binder(
            &registry,
            SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        )
        .expect("bone binder");
        let called = Arc::new(Mutex::new(0u32));
        let counter = called.clone();
        register_skeleton_2d_animation_target_binder(
            &mut registry,
            SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
            Arc::new(move |_channel, _setup, _pose, _target, _time, _guards| {
                *counter.lock().unwrap() += 1;
            }),
        );
        let (setup, mut pose) = rig();
        let target: Unknown = Some(Arc::new(create_skeleton_2d_bone_animation_target(
            0,
            SKELETON_2D_ANIMATION_PATH_ROTATION,
        )));
        let clip = create_animation_clip(
            vec![handle_channel(
                vec![0.0, 1.0],
                vec![0.0, 90.0],
                1,
                AnimationInterpolation::Linear,
                SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
                target,
            )],
            None,
            &[],
        );
        apply_animation_clip_to_skeleton_2d(
            &clip,
            &setup,
            &mut pose,
            1.0,
            &registry,
            &empty_guards(),
        );
        register_skeleton_2d_animation_target_binder(
            &mut registry,
            SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
            original,
        );
        assert_eq!(*called.lock().unwrap(), 1);
        assert_eq!(pose.bones[0].rotation, 0.0);
    }
}

mod unregister_skeleton_2d_animation_target_binder {
    use super::*;

    #[test]
    fn releases_a_kind_after_which_its_channels_are_skipped() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_animation_target_binder(
            &mut registry,
            "acme.RopeTarget",
            Arc::new(|_channel, _setup, _pose, _target, _time, _guards| {}),
        );
        unregister_skeleton_2d_animation_target_binder(&mut registry, "acme.RopeTarget");
        let (setup, mut pose) = rig();
        let target: Unknown = Some(Arc::new(SlackTarget { slack: 0 }));
        let clip = create_animation_clip(
            vec![handle_channel(
                vec![0.0],
                vec![0.0],
                1,
                AnimationInterpolation::Step,
                "acme.RopeTarget",
                target,
            )],
            None,
            &[],
        );
        apply_animation_clip_to_skeleton_2d(
            &clip,
            &setup,
            &mut pose,
            0.0,
            &registry,
            &empty_guards(),
        );
        assert!(get_skeleton_2d_animation_target_binder(&registry, "acme.RopeTarget").is_none());
    }
}

struct SlackTarget {
    slack: i32,
}

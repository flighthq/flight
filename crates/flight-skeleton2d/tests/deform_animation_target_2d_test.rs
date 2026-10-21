use std::sync::Arc;

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, CreateAnimationTrackOpts, create_animation_channel,
    create_animation_clip, create_animation_track,
};
use flight_skeleton2d::contract::*;

use crate::support::*;

fn slot_with(attachment: Option<Attachment2DRef>) -> Slot2D {
    return Slot2D {
        attachment,
        deform: None,
        bone_index: 0,
        color: Some(0xffffffff),
        name: Some(String::from("s")),
    };
}

fn rig(attachment: Option<Attachment2DRef>) -> (Skeleton2D, Skeleton2D) {
    let setup = create_skeleton_2d(vec![bone()], Some(vec![slot_with(attachment)]));
    let pose = clone_skeleton_2d(&setup);
    return (setup, pose);
}

fn deform_channel(
    attachment: Option<Attachment2DRef>,
    slot_index: i32,
    times: Vec<f32>,
    values: Vec<f32>,
    components: usize,
) -> AnimationChannel {
    let target = Skeleton2DDeformAnimationTarget {
        attachment,
        kind: String::from(SKELETON_2D_ANIMATION_TARGET_KIND_DEFORM),
        slot_index,
    };
    let handle = create_skeleton_2d_animation_target_handle(
        SKELETON_2D_ANIMATION_TARGET_KIND_DEFORM,
        Some(Arc::new(target)),
    );
    let track = create_animation_track(CreateAnimationTrackOpts {
        times,
        values,
        components: Some(components),
        interpolation: Some(AnimationInterpolation::Linear),
        quaternion: None,
        easing: None,
        segment_easings: None,
    });
    return create_animation_channel(track, Some(Arc::new(handle)));
}

mod register_skeleton_2d_deform_animation_target {
    use super::*;

    #[test]
    fn claims_the_deform_kind_which_nothing_does_until_a_caller_opts_in() {
        let mut registry = create_skeleton_2d_animation_target_registry();
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_DEFORM
            )
            .is_none()
        );
        register_skeleton_2d_deform_animation_target(&mut registry);
        assert!(
            get_skeleton_2d_animation_target_binder(
                &registry,
                SKELETON_2D_ANIMATION_TARGET_KIND_DEFORM
            )
            .is_some()
        );
    }

    #[test]
    fn samples_a_whole_offset_stream_onto_the_slot_stamped_with_its_attachment() {
        let art = region_ref(region(2.0, 2.0));
        let (setup, mut pose) = rig(Some(art.clone()));
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_deform_animation_target(&mut registry);
        let clip = create_animation_clip(
            vec![deform_channel(
                Some(art),
                0,
                vec![0.0, 1.0],
                vec![0.0, 0.0, 0.0, 0.0, 4.0, 8.0, 12.0, 16.0],
                4,
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
        let offsets = get_skeleton_2d_slot_deform_offsets(&pose.slots.as_ref().expect("slots")[0])
            .expect("offsets");
        assert_eq!(offsets, &[4.0, 8.0, 12.0, 16.0]);
    }

    #[test]
    fn interpolates_between_keys_so_a_morph_moves_rather_than_snaps() {
        let art = region_ref(region(1.0, 1.0));
        let (setup, mut pose) = rig(Some(art.clone()));
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_deform_animation_target(&mut registry);
        let clip = create_animation_clip(
            vec![deform_channel(
                Some(art),
                0,
                vec![0.0, 1.0],
                vec![0.0, 0.0, 10.0, 20.0],
                2,
            )],
            None,
            &[],
        );
        apply_animation_clip_to_skeleton_2d(
            &clip,
            &setup,
            &mut pose,
            0.5,
            &registry,
            &empty_guards(),
        );
        let offsets = get_skeleton_2d_slot_deform_offsets(&pose.slots.as_ref().expect("slots")[0])
            .expect("offsets");
        assert!((offsets[0] - 5.0).abs() <= 1e-4);
        assert!((offsets[1] - 10.0).abs() <= 1e-4);
    }

    #[test]
    fn stops_being_read_once_the_slot_swaps_to_different_art() {
        let art = region_ref(region(2.0, 2.0));
        let other = region_ref(region(2.0, 2.0));
        let (setup, mut pose) = rig(Some(art.clone()));
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_deform_animation_target(&mut registry);
        let clip = create_animation_clip(
            vec![deform_channel(
                Some(art),
                0,
                vec![0.0],
                vec![1.0, 2.0, 3.0, 4.0],
                4,
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
        assert!(
            get_skeleton_2d_slot_deform_offsets(&pose.slots.as_ref().expect("slots")[0]).is_some()
        );
        pose.slots.as_mut().expect("slots")[0].attachment = Some(other);
        assert!(
            get_skeleton_2d_slot_deform_offsets(&pose.slots.as_ref().expect("slots")[0]).is_none()
        );
    }

    #[test]
    fn writes_nothing_for_a_slot_index_the_skeleton_does_not_have() {
        let art = region_ref(region(1.0, 1.0));
        let (setup, mut pose) = rig(Some(art.clone()));
        let mut registry = create_skeleton_2d_animation_target_registry();
        register_skeleton_2d_deform_animation_target(&mut registry);
        let clip = create_animation_clip(
            vec![deform_channel(Some(art), 9, vec![0.0], vec![1.0, 1.0], 2)],
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
        assert!(
            get_skeleton_2d_slot_deform_offsets(&pose.slots.as_ref().expect("slots")[0]).is_none()
        );
    }
}

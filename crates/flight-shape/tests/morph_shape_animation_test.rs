use std::sync::{Arc, RwLock};

use flight_animation::{
    create_animation_channel, create_animation_clip,
    create_animation_track,
};
use flight_entity::allocate_entity;
use flight_shape::contract::*;

use crate::support::*;

fn channel_for(shape: &flight_entity::Ref<MorphShape>) -> flight_animation::AnimationChannel {
    let mut target: MorphShapeAnimationTarget = allocate_entity();
    initialize_morph_shape_animation_target(&mut target, shape);
    let track = { let mut track = create_animation_track(); track.times = vec![0.0]; track.values = vec![0.25]; track };
    return create_animation_channel(&Arc::new(RwLock::new(track)), Some(Arc::new(target)));
}

mod animation_source_parity {
    use super::*;
    use flight_animation::{
        AnimationPlayerRef, create_animation_blend_tree,
        create_animation_blend_tree_input, create_animation_player, sample_animation_blend_tree,
    };
    use flight_node::contract::get_node_local_content_revision;
    use std::sync::RwLock;

    fn test_morph_shape() -> flight_entity::Ref<MorphShape> {
        return test_morph_shape_for_animation();
    }

    fn channel_with(
        shape: &flight_entity::Ref<MorphShape>,
        values: Vec<f32>,
        easing: Option<flight_animation::EasingFn>,
    ) -> flight_animation::AnimationChannel {
        let mut target: MorphShapeAnimationTarget = allocate_entity();
        initialize_morph_shape_animation_target(&mut target, shape);
        return channel_for_target(Arc::new(target), values, easing);
    }

    fn channel_for_target(
        target: Arc<MorphShapeAnimationTarget>,
        values: Vec<f32>,
        easing: Option<flight_animation::EasingFn>,
    ) -> flight_animation::AnimationChannel {
        let track = { let mut track = create_animation_track(); track.times = vec![0.0, 1.0]; track.values = values; track.easing = easing; track };
        return create_animation_channel(&Arc::new(RwLock::new(track)), Some(target));
    }

    #[test]
    fn samples_scalar_progress_while_preserving_easing_overshoot() {
        let shape = test_morph_shape();
        let channel = channel_with(&shape, vec![0.0, 1.0], Some(std::sync::Arc::new(|progress: f32| progress * 2.0)));
        let clip = create_animation_clip(vec![channel], Some(1.0), &[]);
        apply_animation_clip_to_morph_shape(&clip, 0.75);
        assert_eq!(shape.read().unwrap().data.progress, 1.5);
        assert_eq!(
            &shape.read().unwrap().data.path.read().unwrap().data[..2],
            &[30.0, 45.0]
        );
    }

    #[test]
    fn applies_one_clip_sample_atomically_to_compound_geometry_and_paint() {
        let shape = test_morph_shape();
        let second_morph = test_animation_path_morph(100.0);
        append_morph_shape_begin_fill(
            &shape,
            &MorphShapeColorEndpoint {
                color: 0xff0000ff,
                alpha: None,
            },
            &MorphShapeColorEndpoint {
                color: 0x0000ffff,
                alpha: None,
            },
        );
        let morph_ref = shape.read().unwrap().data.morph.clone();
        append_morph_shape_path(&shape, &morph_ref);
        let second_path = append_morph_shape_path(&shape, &second_morph);
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        let channel = channel_with(&shape, vec![0.0, 1.0], None);
        let clip = create_animation_clip(vec![channel], Some(1.0), &[]);
        apply_animation_clip_to_morph_shape(&clip, 0.5);
        assert_eq!(
            &shape.read().unwrap().data.path.read().unwrap().data[..2],
            &[10.0, 15.0]
        );
        assert_eq!(&second_path.read().unwrap().data[..2], &[110.0, 115.0]);
        assert!(
            matches!(&shape.read().unwrap().data.commands[2], ShapeCommandToken::Number(value) if *value == 0x800080ffu32 as f64)
        );
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn ignores_foreign_channels_in_a_composed_clip() {
        let shape = test_morph_shape();
        let track = { let mut track = create_animation_track(); track.times = vec![0.0, 1.0]; track.values = vec![0.0, 100.0]; track };
        let foreign = create_animation_channel(
            &Arc::new(RwLock::new(track)),
            Some(Arc::new(String::from("foreign"))),
        );
        let clip = create_animation_clip(
            vec![foreign, channel_with(&shape, vec![0.0, 1.0], None)],
            Some(1.0),
            &[],
        );
        apply_animation_clip_to_morph_shape(&clip, 0.25);
        assert_eq!(shape.read().unwrap().data.progress, 0.25);
    }

    #[test]
    fn sample_mutates_stable_buffers_and_invalidates_retained_content() {
        let shape = test_morph_shape();
        let path = shape.read().unwrap().data.path.clone();
        let commands = path.read().unwrap().commands.clone();
        let revision = get_node_local_content_revision(&*shape.read().unwrap());
        let channel = channel_with(&shape, vec![0.0, 1.0], None);
        assert!(apply_morph_shape_animation_sample(&[0.5], &channel));
        assert_eq!(shape.read().unwrap().data.progress, 0.5);
        assert!(Arc::ptr_eq(&shape.read().unwrap().data.path, &path));
        assert_eq!(path.read().unwrap().commands, commands);
        assert_eq!(
            get_node_local_content_revision(&*shape.read().unwrap()),
            revision + 1
        );
    }

    #[test]
    fn serves_as_the_sink_for_composed_animation_samples() {
        let shape = test_morph_shape();
        let mut shared_target: MorphShapeAnimationTarget = allocate_entity();
        initialize_morph_shape_animation_target(&mut shared_target, &shape);
        let shared = Arc::new(shared_target);
        let first = { let mut created = create_animation_player(create_animation_clip(
                vec![channel_for_target(shared.clone(), vec![0.0, 1.0], None)],
                Some(1.0),
                &[],
            )); created.time = 0.5; created };
        let second = { let mut created = create_animation_player(create_animation_clip(
                vec![channel_for_target(shared.clone(), vec![0.0, 0.2], None)],
                Some(1.0),
                &[],
            )); created.time = 0.5; created };
        let first_ref: AnimationPlayerRef = Arc::new(RwLock::new(first));
        let second_ref: AnimationPlayerRef = Arc::new(RwLock::new(second));
        let mut tree = create_animation_blend_tree(&[
            create_animation_blend_tree_input(first_ref),
            create_animation_blend_tree_input(second_ref),
        ]);
        assert_eq!(tree.channels.len(), 1, "channels {}", tree.channels.len());
        assert_eq!(
            tree.channels[0].sources.len(),
            2,
            "sources {}",
            tree.channels[0].sources.len()
        );
        let mut scratch = [0.0f32];
        sample_animation_blend_tree(&mut scratch, &mut tree, &mut |sampled, channel, _index| {
            apply_morph_shape_animation_sample(sampled, channel);
        });
        assert!(
            (shape.read().unwrap().data.progress - 0.3).abs() < 1e-5,
            "progress was {}",
            shape.read().unwrap().data.progress
        );
    }

    #[test]
    fn returns_false_for_foreign_targets_without_changing_the_shape() {
        let shape = test_morph_shape();
        let track = { let mut track = create_animation_track(); track.times = vec![0.0, 1.0]; track.values = vec![0.0, 1.0]; track };
        let foreign = create_animation_channel(
            &Arc::new(RwLock::new(track)),
            Some(Arc::new(String::from("foreign"))),
        );
        assert!(!apply_morph_shape_animation_sample(&[1.0], &foreign));
        assert_eq!(shape.read().unwrap().data.progress, 0.0);
    }

    #[test]
    fn create_allocates_a_reusable_target_descriptor_for_one_morph_shape() {
        let shape = test_morph_shape();
        let target = create_morph_shape_animation_target(&shape);
        assert!(Arc::ptr_eq(&target.read().unwrap().shape, &shape));
    }
}

mod apply_animation_clip_to_morph_shape {
    use super::*;

    #[test]
    fn samples_and_applies_every_progress_channel() {
        let shape = morph();
        let channel = channel_for(&shape);
        let clip = create_animation_clip(vec![channel], Some(1.0), &[]);
        apply_animation_clip_to_morph_shape(&clip, 0.0);
        assert_eq!(shape.read().unwrap().data.progress, 0.25);
    }
}

mod apply_morph_shape_animation_sample {
    use super::*;

    #[test]
    fn applies_a_sampled_progress_to_the_target_shape() {
        let shape = morph();
        let channel = channel_for(&shape);
        assert!(apply_morph_shape_animation_sample(&[0.75], &channel));
        assert_eq!(shape.read().unwrap().data.progress, 0.75);
    }
}

mod create_morph_shape_animation_target {
    use super::*;

    #[test]
    fn keeps_the_shape_handle() {
        let shape = morph();
        let target = create_morph_shape_animation_target(&shape);
        assert!(Arc::ptr_eq(&target.read().unwrap().shape, &shape));
    }
}

mod initialize_morph_shape_animation_target {
    use super::*;

    #[test]
    fn stores_the_shape_handle_on_the_target() {
        let shape = morph();
        let mut target: MorphShapeAnimationTarget = allocate_entity();
        initialize_morph_shape_animation_target(&mut target, &shape);
        assert!(Arc::ptr_eq(&target.shape, &shape));
    }
}

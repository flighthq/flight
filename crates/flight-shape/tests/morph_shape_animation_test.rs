use std::sync::Arc;

use flight_animation::{
    CreateAnimationTrackOpts, create_animation_channel, create_animation_clip,
    create_animation_track,
};
use flight_entity::allocate_entity;
use flight_shape::contract::*;

use crate::support::*;

fn channel_for(shape: &flight_entity::Ref<MorphShape>) -> flight_animation::AnimationChannel {
    let mut target: MorphShapeAnimationTarget = allocate_entity();
    initialize_morph_shape_animation_target(&mut target, shape);
    let track = create_animation_track(CreateAnimationTrackOpts {
        times: vec![0.0],
        values: vec![0.25],
        components: None,
        interpolation: None,
        quaternion: None,
        easing: None,
        segment_easings: None,
    });
    return create_animation_channel(track, Some(Arc::new(target)));
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

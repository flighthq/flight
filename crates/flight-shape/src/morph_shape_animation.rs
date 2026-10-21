//! Morph shape progress animation targets (TS `morphShapeAnimation.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::Arc;

use flight_animation::{AnimationChannel, AnimationClip, sample_animation_clip};
use flight_entity::{Ref, allocate_entity};

use crate::morph_shape::set_morph_shape_progress;
use crate::types::*;

/// Allocates a stable morph shape animation target (TS `createMorphShapeAnimationTarget`).
pub fn create_morph_shape_animation_target(
    shape: &Ref<MorphShape>,
) -> Ref<MorphShapeAnimationTarget> {
    let mut out: MorphShapeAnimationTarget = allocate_entity();
    initialize_morph_shape_animation_target(&mut out, shape);
    return Arc::new(std::sync::RwLock::new(out));
}

/// The construction initializer of the animation target.
pub fn initialize_morph_shape_animation_target(
    out: &mut MorphShapeAnimationTarget,
    shape: &Ref<MorphShape>,
) {
    out.shape = shape.clone();
}

/// Samples a clip and applies every MorphShape progress channel (TS
/// `applyAnimationClipToMorphShape`).
// flight-lint: allow(f64) D1: the clip time is the canonical animation number lane
pub fn apply_animation_clip_to_morph_shape(clip: &AnimationClip, time: f32) {
    let mut scratch: Vec<f32> = vec![0.0];
    sample_animation_clip(&mut scratch, clip, time, &mut |sampled, channel, _index| {
        apply_morph_shape_animation_sample(sampled, channel);
    });
}

/// Applies one sampled channel to its MorphShape target, returning whether it was recognised (TS
/// `applyMorphShapeAnimationSample`).
pub fn apply_morph_shape_animation_sample(sampled: &[f32], channel: &AnimationChannel) -> bool {
    let Some(value) = channel.target_ref.as_ref() else {
        return false;
    };
    let Some(target) = value.downcast_ref::<MorphShapeAnimationTarget>() else {
        return false;
    };
    let shape = target.shape.clone();
    if shape.read().unwrap().data.progress == f64::NAN {
        return false;
    }
    set_morph_shape_progress(&shape, sampled[0] as f64);
    return true;
}

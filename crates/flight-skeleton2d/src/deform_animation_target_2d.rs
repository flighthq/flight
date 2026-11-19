//! flight-compiler: target-native

//! Deform animation target registration and binding (TS `deformAnimationTarget2D.ts`).

use std::sync::Arc;

use flight_animation::contract::{AnimationChannel, clone_animation_track, sample_animation_track};
use flight_entity::Unknown;

use crate::skeleton2d_animation_target::register_skeleton_2d_animation_target_binder;
use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::slot_deform2d::set_skeleton_2d_slot_deform;
use crate::types::*;

// flight-lint: allow(f32) reads or writes the TS Float32Array buffer lane; scalar math is f64 and narrows once at each store
fn bind_skeleton_2d_deform_channel(
    channel: &AnimationChannel,
    _setup: &Skeleton2D,
    pose: &mut Skeleton2D,
    target: &Unknown,
    time: f64,
    _guards: &Skeleton2DGuardState,
) {
    let Some(target) = target
        .as_ref()
        .and_then(|target| target.downcast_ref::<Skeleton2DDeformAnimationTarget>())
    else {
        return;
    };
    let Some(slots) = pose.slots.as_mut() else {
        return;
    };
    let slot_index = target.slot_index;
    if slot_index < 0 || slot_index as usize >= slots.len() {
        return;
    }
    let components = channel.track.read().unwrap().components;
    if components == 0 {
        return;
    }
    let mut scratch = vec![0.0f64; components];
    let track = clone_animation_track(&channel.track.read().unwrap());
    sample_animation_track(&mut scratch, &track, time);
    // Deform offsets are the f32 vertex-offset lane: each f64 sample narrows once.
    let offsets: Vec<f32> = scratch.iter().map(|value| *value as f32).collect();
    set_skeleton_2d_slot_deform(
        &mut slots[slot_index as usize],
        target.attachment.clone(),
        Some(&offsets[..components]),
    );
}

/// Opts a bundle into deform channels; a rig with no deform timeline does not carry this
/// (TS `registerSkeleton2DDeformAnimationTarget`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn register_skeleton_2d_deform_animation_target(
    registry: &mut Skeleton2DAnimationTargetBinderRegistry,
) {
    register_skeleton_2d_animation_target_binder(
        registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_DEFORM,
        Arc::new(bind_skeleton_2d_deform_channel),
    );
}
